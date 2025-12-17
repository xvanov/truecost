"""Code Compliance Agent for TrueCost.

Generates ICC (IBC/IRC/IECC family) code-related warnings based on project context.
Uses web search to find real permit fees and requirements for the specific location.

Notes:
- This agent provides *warnings*, not permitting/legal determinations.
- It must not invent jurisdiction-specific requirements when inputs are missing.
- Permit fees are estimates based on web search - actual fees must be verified.
"""

from typing import Any, Dict, List, Optional
import time
import json
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.serper_service import SerperService, get_serper_service

logger = structlog.get_logger()


# =============================================================================
# SYSTEM PROMPTS
# =============================================================================

ICC_CODE_COMPLIANCE_PROMPT = """You are a building code compliance assistant for construction projects.

Scope: ICC codes (IBC/IRC/IECC and related ICC family). Provide *non-legal* warnings and considerations.

Rules:
- Use the provided project scope, location, and details only.
- Do NOT claim something is definitively required if it depends on local amendments or missing details.
- If information is missing, say so and return a warning requesting the missing detail.
- Output JSON strictly in the schema below.

Output JSON schema:
{
  "codeSystem": "ICC",
  "jurisdiction": {
    "country": "US",
    "state": "CA",
    "city": "San Jose",
    "zipCode": "95112"
  },
  "warnings": [
    {
      "severity": "info|warning|critical",
      "codeFamily": "IBC|IRC|IECC|IPC|IMC|NEC|Unknown",
      "title": "Short title",
      "details": "Detailed explanation and what to confirm",
      "whyItMatters": "One sentence impact",
      "whatToCheckNext": ["bullet", "bullet"],
      "appliesTo": ["demolition", "plumbing", "electrical", "structural", "hvac", "energy", "fire_safety", "general"]
    }
  ],
  "disclaimer": "..."
}
"""


EXTRACT_PERMIT_FEES_PROMPT = """You are a permit fee extraction assistant. Given web search results about building permits for a specific location, extract any permit fee information you can find.

Extract the following if present:
1. Building permit base fee
2. Building permit percentage of project value
3. Electrical permit fee
4. Plumbing permit fee
5. Mechanical/HVAC permit fee
6. Plan review fee
7. Impact fees
8. Any other fees mentioned

## Output Format (JSON):
{
    "fees": {
        "buildingPermitBase": <number or null>,
        "buildingPermitPercentage": <percentage as decimal or null>,
        "electricalPermit": <number or null>,
        "plumbingPermit": <number or null>,
        "mechanicalPermit": <number or null>,
        "planReviewFee": <number or null>,
        "impactFees": <number or null>,
        "inspectionFee": <number or null>
    },
    "source": "<primary source of information>",
    "notes": ["any relevant notes about fee structure"],
    "confidence": "high|medium|low",
    "lastUpdated": "<date if mentioned>"
}

Only include fees that are explicitly mentioned in the search results. Use null for any fee not found.
Do not invent or guess values - only extract what is clearly stated.
"""


# =============================================================================
# CODE COMPLIANCE AGENT CLASS
# =============================================================================


class CodeComplianceAgent(BaseA2AAgent):
    """Generates ICC code compliance warnings and permit fee estimates.

    This agent:
    1. Searches the web for permit fees specific to the project location
    2. Uses LLM to extract permit fee data from search results
    3. Generates code compliance warnings based on project scope
    4. Combines permit fees with compliance warnings
    """

    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        serper_service: Optional[SerperService] = None,
    ):
        super().__init__(
            name="code_compliance",
            firestore_service=firestore_service,
            llm_service=llm_service,
        )
        self.serper = serper_service or get_serper_service()

    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self._start_time = time.time()

        clarification = input_data.get("clarification_output", {}) or {}
        project_brief = clarification.get("projectBrief", {}) or {}
        location = project_brief.get("location", {}) or {}

        scope_output = input_data.get("scope_output", {}) or {}
        cost_output = input_data.get("cost_output", {}) or {}

        city = location.get("city", "")
        state = location.get("state", "")
        zip_code = location.get("zipCode", "")
        project_type = project_brief.get("projectType", "remodel")

        logger.info(
            "code_compliance_agent_running",
            estimate_id=estimate_id,
            city=city,
            state=state,
            has_feedback=feedback is not None,
        )

        # Step 1: Search for permit fees
        permit_fees = await self._search_permit_fees(
            city=city,
            state=state,
            project_type=project_type
        )

        # Step 2: Generate code compliance warnings
        context = self._build_context(
            estimate_id=estimate_id,
            project_brief=project_brief,
            location=location,
            scope_output=scope_output,
            cost_output=cost_output,
            permit_fees=permit_fees,
            feedback=feedback
        )

        llm = await self.llm.generate_json(
            system_prompt=ICC_CODE_COMPLIANCE_PROMPT,
            user_message=(
                "CODE_COMPLIANCE_REQUEST\n\n"
                "Generate ICC code compliance warnings for this project context:\n"
                f"{json.dumps(context, indent=2)}"
            ),
        )

        self._tokens_used = llm.get("tokens_used", 0)

        content = llm.get("content", {}) or {}
        warnings: List[Dict[str, Any]] = content.get("warnings") or []

        # Step 3: Build output with permit fees
        output = {
            "estimateId": estimate_id,
            "codeSystem": content.get("codeSystem", "ICC"),
            "jurisdiction": content.get("jurisdiction", {
                "country": "US",
                "state": state,
                "city": city,
                "zipCode": zip_code
            }),
            "warnings": warnings,
            "permitFees": permit_fees.get("fees", {}),
            "permitFeeSource": permit_fees.get("source"),
            "permitFeeConfidence": permit_fees.get("confidence", "low"),
            "permitFeeNotes": permit_fees.get("notes", []),
            "summary": self._build_summary(warnings, permit_fees),
            "confidence": self._calculate_confidence(warnings, permit_fees),
            "disclaimer": content.get(
                "disclaimer",
                "These are informational considerations based on ICC code families. "
                "Final requirements depend on local amendments and the authority having jurisdiction (AHJ). "
                "Permit fees shown are estimates based on web search and must be verified with the local building department.",
            ),
        }

        # Save to Firestore
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
            "code_compliance_agent_completed",
            estimate_id=estimate_id,
            warning_count=len(warnings),
            permit_fee_confidence=permit_fees.get("confidence"),
            duration_ms=self.duration_ms
        )

        return output

    async def _search_permit_fees(
        self,
        city: str,
        state: str,
        project_type: str
    ) -> Dict[str, Any]:
        """Search for permit fees using web search.

        Args:
            city: City name
            state: State abbreviation
            project_type: Type of construction project

        Returns:
            Dict with extracted permit fee data
        """
        if not city or not state:
            return {
                "fees": {},
                "source": None,
                "notes": ["Location not provided - cannot search for specific permit fees"],
                "confidence": "low"
            }

        try:
            # Search for permit fees
            search_results = await self.serper.search_permit_fees(
                city=city,
                state=state,
                project_type=project_type
            )

            if not search_results or not search_results.get("results"):
                return {
                    "fees": self._get_default_permit_fees(state),
                    "source": "default_estimates",
                    "notes": ["No specific permit fee information found - using regional estimates"],
                    "confidence": "low"
                }

            # Use LLM to extract permit fees from search results
            search_summary = self._build_permit_search_summary(search_results)

            result = await self.llm.generate_json(
                system_prompt=EXTRACT_PERMIT_FEES_PROMPT,
                user_message=f"Extract permit fee information from these search results for {city}, {state}:\n\n{search_summary}"
            )

            self._tokens_used += result.get("tokens_used", 0)
            extracted = result.get("content", {})

            # Validate and merge with defaults
            fees = extracted.get("fees", {})
            if not any(fees.values()):
                # No fees extracted, use defaults
                fees = self._get_default_permit_fees(state)
                extracted["source"] = "default_estimates"
                extracted["confidence"] = "low"
                extracted["notes"] = extracted.get("notes", []) + ["Could not extract specific fees - using regional estimates"]

            return {
                "fees": fees,
                "source": extracted.get("source"),
                "notes": extracted.get("notes", []),
                "confidence": extracted.get("confidence", "medium"),
                "lastUpdated": extracted.get("lastUpdated")
            }

        except Exception as e:
            logger.warning(
                "permit_fee_search_error",
                city=city,
                state=state,
                error=str(e)
            )
            return {
                "fees": self._get_default_permit_fees(state),
                "source": "default_estimates",
                "notes": [f"Error searching for permit fees: {str(e)}"],
                "confidence": "low"
            }

    def _build_permit_search_summary(self, search_results: Dict[str, Any]) -> str:
        """Build a text summary of permit search results.

        Args:
            search_results: Raw search results from Serper

        Returns:
            Formatted text summary
        """
        results = search_results.get("results", [])
        if not results:
            return "No search results found."

        parts = []
        for r in results[:5]:  # Top 5 results
            if isinstance(r, dict):
                title = r.get("title", "")
                snippet = r.get("snippet", "")
                link = r.get("link", "")
                query = r.get("query", "")
                if title or snippet:
                    parts.append(f"**{title}**")
                    parts.append(f"Query: {query}")
                    parts.append(f"Source: {link}")
                    parts.append(f"Content: {snippet}")
                    parts.append("")

        return "\n".join(parts)

    def _get_default_permit_fees(self, state: str) -> Dict[str, Any]:
        """Get default permit fees based on state.

        Args:
            state: State abbreviation

        Returns:
            Default permit fee estimates
        """
        # High-cost states
        high_cost_states = {"NY", "CA", "MA", "CT", "WA", "NJ", "HI", "AK"}
        # Low-cost states
        low_cost_states = {"MS", "AR", "AL", "WV", "KY", "OK", "TN", "SC"}

        if state in high_cost_states:
            return {
                "buildingPermitBase": 750.0,
                "buildingPermitPercentage": 0.02,
                "electricalPermit": 250.0,
                "plumbingPermit": 250.0,
                "mechanicalPermit": 200.0,
                "planReviewFee": 400.0,
                "inspectionFee": 200.0
            }
        elif state in low_cost_states:
            return {
                "buildingPermitBase": 300.0,
                "buildingPermitPercentage": 0.01,
                "electricalPermit": 100.0,
                "plumbingPermit": 100.0,
                "mechanicalPermit": 75.0,
                "planReviewFee": 150.0,
                "inspectionFee": 100.0
            }
        else:
            # Mid-range defaults
            return {
                "buildingPermitBase": 500.0,
                "buildingPermitPercentage": 0.015,
                "electricalPermit": 175.0,
                "plumbingPermit": 175.0,
                "mechanicalPermit": 150.0,
                "planReviewFee": 200.0,
                "inspectionFee": 125.0
            }

    def _build_context(
        self,
        estimate_id: str,
        project_brief: Dict[str, Any],
        location: Dict[str, Any],
        scope_output: Dict[str, Any],
        cost_output: Dict[str, Any],
        permit_fees: Dict[str, Any],
        feedback: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Build context for LLM code compliance generation.

        Args:
            Various input data

        Returns:
            Context dict for LLM
        """
        return {
            "estimateId": estimate_id,
            "projectType": project_brief.get("projectType"),
            "finishLevel": (project_brief.get("scopeSummary", {}) or {}).get("finishLevel"),
            "totalSqft": (project_brief.get("scopeSummary", {}) or {}).get("totalSqft"),
            "location": {
                "country": "US",
                "state": location.get("state"),
                "city": location.get("city"),
                "zipCode": location.get("zipCode"),
                "fullAddress": location.get("fullAddress"),
            },
            "scope": {
                "totalLineItems": scope_output.get("totalLineItems"),
                "divisions": scope_output.get("divisions"),
                "summary": scope_output.get("summary"),
            },
            "costSummary": {
                "totalCost": cost_output.get("totalCost"),
                "materials": cost_output.get("materials"),
                "labor": cost_output.get("labor"),
            },
            "permitFees": permit_fees.get("fees"),
            "criticFeedback": feedback,
        }

    def _build_summary(
        self,
        warnings: List[Dict[str, Any]],
        permit_fees: Dict[str, Any]
    ) -> str:
        """Build summary of code compliance output.

        Args:
            warnings: List of code warnings
            permit_fees: Permit fee data

        Returns:
            Summary string
        """
        critical_count = sum(1 for w in warnings if w.get("severity") == "critical")
        warning_count = sum(1 for w in warnings if w.get("severity") == "warning")
        info_count = sum(1 for w in warnings if w.get("severity") == "info")

        fees = permit_fees.get("fees", {})
        total_permit_cost = sum(
            v for v in fees.values()
            if v and isinstance(v, (int, float)) and v > 1  # Exclude percentages
        )

        parts = []
        if critical_count > 0:
            parts.append(f"{critical_count} critical")
        if warning_count > 0:
            parts.append(f"{warning_count} warnings")
        if info_count > 0:
            parts.append(f"{info_count} info")

        warning_summary = ", ".join(parts) if parts else "No issues"
        permit_summary = f"${total_permit_cost:,.0f} estimated" if total_permit_cost > 0 else "Not estimated"

        return f"Code compliance: {warning_summary}. Permit fees: {permit_summary}."

    def _calculate_confidence(
        self,
        warnings: List[Dict[str, Any]],
        permit_fees: Dict[str, Any]
    ) -> float:
        """Calculate confidence score for output.

        Args:
            warnings: List of code warnings
            permit_fees: Permit fee data

        Returns:
            Confidence score (0-1)
        """
        base_confidence = 0.6

        # Add confidence based on permit fee source
        permit_confidence = permit_fees.get("confidence", "low")
        if permit_confidence == "high":
            base_confidence += 0.2
        elif permit_confidence == "medium":
            base_confidence += 0.1

        # Add confidence if warnings were generated
        if warnings:
            base_confidence += 0.1

        return min(0.95, base_confidence)
