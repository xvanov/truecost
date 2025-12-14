"""Location Agent for TrueCost.

Analyzes location-based cost factors for construction estimates.
Uses LLM to interpret location data and generate insights.
"""

from typing import Dict, Any, Optional
import json
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.cost_data_service import CostDataService
from models.location_factors import LocationFactors

logger = structlog.get_logger()


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

LOCATION_AGENT_SYSTEM_PROMPT = """You are an expert construction cost analyst specializing in location-based cost factors.

Your role is to analyze location data and provide insights about how the location will impact construction costs for a project.

## Your Expertise Includes:
- Regional labor market conditions and union presence
- Local permit requirements and fees
- Weather and seasonal impacts on construction schedules
- Material cost variations by region
- Local building codes and requirements

## Input You Will Receive:
1. Project location (city, state, ZIP code)
2. Location factors data including:
   - Labor rates by trade
   - Permit costs
   - Weather factors
   - Material cost adjustments
   - Union market status
   - Overall location cost factor

## Your Output Must Include:
1. **analysis**: Detailed analysis of location factors (2-4 paragraphs)
2. **key_findings**: List of 3-5 key findings that impact the estimate
3. **recommendations**: List of 2-3 recommendations for the project
4. **risk_factors**: List of location-specific risks
5. **confidence_assessment**: Your assessment of data quality and confidence

## Response Format:
You MUST respond with valid JSON only. No markdown, no explanation.

{
    "analysis": "Your detailed analysis...",
    "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
    "recommendations": ["Recommendation 1", "Recommendation 2"],
    "risk_factors": ["Risk 1", "Risk 2"],
    "confidence_assessment": "Your confidence assessment..."
}

## Guidelines:
- Be specific about how each factor impacts costs
- Consider seasonal timing for the project
- Highlight any unusual factors for the location
- Provide actionable recommendations
- Be concise but thorough
"""


# =============================================================================
# LOCATION AGENT CLASS
# =============================================================================


class LocationAgent(BaseA2AAgent):
    """Location Agent - analyzes location factors for construction estimates.
    
    This agent:
    1. Extracts location from ClarificationOutput
    2. Retrieves location factors from CostDataService
    3. Uses LLM to analyze and generate insights
    4. Saves results to Firestore
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        cost_data_service: Optional[CostDataService] = None
    ):
        """Initialize LocationAgent.
        
        Args:
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
            cost_data_service: Optional cost data service instance.
        """
        super().__init__(
            name="location",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
        self.cost_data_service = cost_data_service or CostDataService()
    
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run location analysis.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing clarification_output.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Location factors dict with analysis.
        """
        # Track duration consistently with other agents (e.g., RiskAgent)
        self._start_time = time.time()

        logger.info(
            "location_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Step 1: Extract location from clarification output
        location_info = self._extract_location(input_data)
        zip_code = location_info.get("zipCode", "00000")
        city = location_info.get("city", "Unknown")
        state = location_info.get("state", "XX")
        
        logger.info(
            "location_extracted",
            estimate_id=estimate_id,
            zip_code=zip_code,
            city=city,
            state=state
        )
        
        # Step 2: Get location factors from cost data service
        location_factors = await self.cost_data_service.get_location_factors(zip_code)
        
        # Update city/state if we have better data from clarification
        if city != "Unknown":
            location_factors = LocationFactors(
                **{**location_factors.model_dump(), "city": city, "state": state}
            )
        
        logger.info(
            "location_factors_retrieved",
            estimate_id=estimate_id,
            location_factor=location_factors.location_factor,
            union_status=location_factors.union_status.value,
            confidence=location_factors.confidence
        )
        
        # Step 3: Use LLM to analyze location factors
        llm_analysis = await self._analyze_with_llm(
            estimate_id=estimate_id,
            location_info=location_info,
            location_factors=location_factors,
            feedback=feedback
        )
        
        # Step 4: Build output
        output = self._build_output(
            location_factors=location_factors,
            llm_analysis=llm_analysis,
            location_info=location_info
        )
        
        # Step 5: Save output to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=output["summary"],
            confidence=output["confidence"],
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "location_agent_completed",
            estimate_id=estimate_id,
            location_factor=output["locationFactor"],
            confidence=output["confidence"],
            duration_ms=self.duration_ms
        )
        
        return output
    
    def _extract_location(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract location information from input data.
        
        Args:
            input_data: Input containing clarification_output.
            
        Returns:
            Location information dict.
        """
        clarification = input_data.get("clarification_output", {})
        project_brief = clarification.get("projectBrief", {})
        location = project_brief.get("location", {})
        
        return {
            "zipCode": location.get("zipCode", "00000"),
            "city": location.get("city", "Unknown"),
            "state": location.get("state", "XX"),
            "fullAddress": location.get("fullAddress", ""),
            "county": location.get("county"),
            "coordinates": location.get("coordinates")
        }
    
    async def _analyze_with_llm(
        self,
        estimate_id: str,
        location_info: Dict[str, Any],
        location_factors: LocationFactors,
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Use LLM to analyze location factors.
        
        Args:
            estimate_id: The estimate document ID.
            location_info: Extracted location information.
            location_factors: Retrieved location factors.
            feedback: Optional critic feedback for retry.
            
        Returns:
            LLM analysis results.
        """
        # Build the system prompt with feedback if this is a retry
        system_prompt = self.build_system_prompt(
            LOCATION_AGENT_SYSTEM_PROMPT,
            feedback
        )
        
        # Build user message with all location data
        user_message = self._build_llm_user_message(
            location_info=location_info,
            location_factors=location_factors
        )
        
        try:
            from services.deep_agent_factory import deep_agent_generate_json

            result = await deep_agent_generate_json(
                estimate_id=estimate_id,
                agent_name=self.name,
                system_prompt=system_prompt,
                user_message=user_message,
                firestore_service=self.firestore,
            )
            
            # Track tokens
            self._tokens_used = result.get("tokens_used", 0)
            
            analysis = result.get("content", {})
            
            logger.info(
                "llm_analysis_completed",
                estimate_id=estimate_id,
                tokens_used=self._tokens_used,
                has_key_findings=bool(analysis.get("key_findings"))
            )
            
            return analysis
            
        except Exception as e:
            logger.warning(
                "llm_analysis_fallback",
                estimate_id=estimate_id,
                error=str(e)
            )
            
            # Return fallback analysis if LLM fails
            return self._generate_fallback_analysis(location_factors)
    
    def _build_llm_user_message(
        self,
        location_info: Dict[str, Any],
        location_factors: LocationFactors
    ) -> str:
        """Build the user message for LLM analysis.
        
        Args:
            location_info: Extracted location information.
            location_factors: Retrieved location factors.
            
        Returns:
            Formatted user message string.
        """
        # Convert location factors to agent output format for the prompt
        factors_dict = location_factors.to_agent_output()
        
        return f"""## Project Location
City: {location_info.get('city', 'Unknown')}
State: {location_info.get('state', 'XX')}
ZIP Code: {location_info.get('zipCode', '00000')}
Full Address: {location_info.get('fullAddress', 'Not provided')}

## Location Factors Data
```json
{json.dumps(factors_dict, indent=2)}
```

Please analyze these location factors and provide your insights in the required JSON format."""
    
    def _generate_fallback_analysis(
        self,
        location_factors: LocationFactors
    ) -> Dict[str, Any]:
        """Generate fallback analysis when LLM is unavailable.
        
        Args:
            location_factors: Retrieved location factors.
            
        Returns:
            Basic analysis dict.
        """
        is_high_cost = location_factors.location_factor > 1.1
        is_union = location_factors.union_status.value == "union"
        has_weather_impact = location_factors.weather_factors.winter_impact.value in ["moderate", "severe"]
        
        key_findings = []
        if is_high_cost:
            key_findings.append(f"High-cost area with {location_factors.location_factor:.0%} location factor adjustment")
        if is_union:
            key_findings.append("Strong union market - labor costs will be higher but quality standards enforced")
        if has_weather_impact:
            key_findings.append(f"Weather impact: {location_factors.weather_factors.winter_impact.value} - may affect scheduling")
        
        if not key_findings:
            key_findings = [
                "Standard cost area with average labor rates",
                "No significant weather impact on construction",
                "Mixed or non-union market conditions"
            ]
        
        recommendations = [
            "Verify permit requirements with local building department",
            "Consider seasonal timing for optimal construction conditions"
        ]
        
        risk_factors = []
        if location_factors.weather_factors.seasonal_adjustment > 1.05:
            risk_factors.append("Seasonal weather may impact construction timeline")
        if location_factors.location_factor > 1.2:
            risk_factors.append("High labor costs may impact budget")
        if not risk_factors:
            risk_factors = ["No significant location-specific risks identified"]
        
        return {
            "analysis": f"Location analysis for {location_factors.city}, {location_factors.state}. "
                       f"This is in the {location_factors.region.value} region with a "
                       f"location cost factor of {location_factors.location_factor:.2f}. "
                       f"The market is {location_factors.union_status.value}.",
            "key_findings": key_findings,
            "recommendations": recommendations,
            "risk_factors": risk_factors,
            "confidence_assessment": f"Data confidence: {location_factors.confidence:.0%}. "
                                    "Analysis based on regional data."
        }
    
    def _build_output(
        self,
        location_factors: LocationFactors,
        llm_analysis: Dict[str, Any],
        location_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Build the final output dict.
        
        Args:
            location_factors: Retrieved location factors.
            llm_analysis: LLM analysis results.
            location_info: Original location info.
            
        Returns:
            Complete output dict for the agent.
        """
        # Start with the location factors in agent output format
        output = location_factors.to_agent_output()
        
        # Add LLM analysis
        output["analysis"] = llm_analysis.get("analysis", "")
        output["keyFindings"] = llm_analysis.get("key_findings", [])
        output["recommendations"] = llm_analysis.get("recommendations", [])
        output["riskFactors"] = llm_analysis.get("risk_factors", [])
        output["confidenceAssessment"] = llm_analysis.get("confidence_assessment", "")
        
        # Build summary
        city = output.get("city", "Unknown")
        state = output.get("state", "XX")
        zip_code = output.get("zipCode", "00000")
        location_factor = output.get("locationFactor", 1.0)
        union_status = output.get("unionStatus", "mixed")
        
        output["summary"] = (
            f"Location analysis for {city}, {state} ({zip_code}): "
            f"Location factor {location_factor:.2f}, {union_status} market. "
            f"{len(output.get('keyFindings', []))} key findings identified."
        )
        
        return output
