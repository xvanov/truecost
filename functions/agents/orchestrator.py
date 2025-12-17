"""Pipeline Orchestrator for TrueCost.

Coordinates the deep agent pipeline with scorer/critic validation flow.
Manages agent sequencing, retries, and Firestore updates.
"""

import asyncio
import time
from typing import Dict, Any, Optional, List, Tuple, Type
from datetime import datetime
import structlog

from services.firestore_service import FirestoreService
from services.a2a_client import A2AClient
from config.settings import settings
from config.errors import (
    TrueCostError,
    PipelineError,
    AgentError,
    A2AError,
    ErrorCode
)
from agents.agent_cards import (
    AGENT_SEQUENCE,
    get_scorer_for_primary,
    get_critic_for_primary
)
from models.agent_output import (
    AgentStatus,
    PipelineStatus,
    PipelineResult,
    AgentScoreResult,
    CriticFeedback
)
from utils.agent_logger import (
    log_pipeline_start,
    log_pipeline_complete,
    log_pipeline_failed,
    log_agent_start,
    log_agent_output,
    log_scorer_result,
    log_critic_feedback,
    log_agent_error,
    log_agent_retry,
    log_input_context,
)

logger = structlog.get_logger()

# Constants
MAX_RETRIES = settings.pipeline_max_retries
PASSING_SCORE = settings.pipeline_passing_score


class PipelineOrchestrator:
    """Orchestrates the deep agent pipeline execution.
    
    Flow per agent:
    1. Run primary agent
    2. Run scorer agent (0-100)
    3. If score >= 80: PASS, move to next agent
    4. If score < 80: Run critic agent for feedback
    5. Retry primary agent with critic feedback (max 2 retries)
    6. If still failing: FAIL pipeline
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        a2a_client: Optional[A2AClient] = None
    ):
        """Initialize PipelineOrchestrator.
        
        Args:
            firestore_service: Optional Firestore service instance.
            a2a_client: Optional A2A client instance.
        """
        self.firestore = firestore_service or FirestoreService()
        self.a2a = a2a_client or A2AClient()
        
        self._start_time: Optional[float] = None
        self._total_tokens = 0
    
    @property
    def elapsed_ms(self) -> int:
        """Get elapsed time in milliseconds."""
        if self._start_time is None:
            return 0
        return int((time.time() - self._start_time) * 1000)
    
    async def run_pipeline(
        self,
        estimate_id: str,
        clarification_output: Dict[str, Any],
        project_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> PipelineResult:
        """Run the full deep agent pipeline.

        Args:
            estimate_id: The estimate document ID.
            clarification_output: ClarificationOutput v3.0.0 data.
            project_id: Optional project ID for syncing to frontend UI.
            user_id: Optional user ID who triggered the pipeline.

        Returns:
            PipelineResult with success/failure status.

        Raises:
            PipelineError: If pipeline fails unrecoverably.
        """
        self._start_time = time.time()
        self._total_tokens = 0
        self._project_id = project_id
        self._user_id = user_id
        self._started_at = int(self._start_time * 1000)

        # Log pipeline start with visual banner
        log_pipeline_start(estimate_id, len(AGENT_SEQUENCE))

        logger.info(
            "pipeline_started",
            estimate_id=estimate_id,
            project_id=project_id,
            agent_count=len(AGENT_SEQUENCE)
        )
        
        # Initialize pipeline status
        pipeline_status = PipelineStatus(
            current_agent=None,
            completed_agents=[],
            progress=0,
            agent_statuses={agent: AgentStatus.PENDING.value for agent in AGENT_SEQUENCE},
            scores={},
            retries={},
            started_at=datetime.utcnow()
        )
        
        await self._update_pipeline_status(estimate_id, pipeline_status)

        # Sync to project pipeline for frontend UI (only when invoked with a project_id)
        if self._project_id:
            await self.firestore.sync_to_project_pipeline(
                project_id=self._project_id,
                estimate_id=estimate_id,
                current_agent=None,
                completed_agents=[],
                progress=0,
                status="running",
                user_id=self._user_id,
                started_at=self._started_at,
            )

        # Track accumulated context from previous agents
        accumulated_context: Dict[str, Any] = {
            "clarification_output": clarification_output
        }
        completed_agents: List[str] = []
        failed_agent: Optional[str] = None
        
        try:
            for agent_name in AGENT_SEQUENCE:
                # Log agent start with visual banner
                log_agent_start(agent_name, estimate_id)
                
                # Log input context summary
                log_input_context(agent_name, estimate_id, accumulated_context)

                logger.info(
                    "agent_starting",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    progress=pipeline_status.get_progress_percentage(len(AGENT_SEQUENCE))
                )
                
                # Update current agent
                pipeline_status.current_agent = agent_name
                pipeline_status.agent_statuses[agent_name] = AgentStatus.RUNNING.value
                await self._update_pipeline_status(estimate_id, pipeline_status)
                
                # Run agent with scorer/critic flow
                success, output = await self._run_agent_with_validation(
                    estimate_id=estimate_id,
                    agent_name=agent_name,
                    input_data=accumulated_context,
                    pipeline_status=pipeline_status
                )
                
                if not success:
                    failed_agent = agent_name
                    pipeline_status.agent_statuses[agent_name] = AgentStatus.FAILED.value
                    pipeline_status.error = f"Agent {agent_name} failed after {MAX_RETRIES} retries"
                    await self._update_pipeline_status(estimate_id, pipeline_status)

                    # Log pipeline failure with visual banner
                    log_pipeline_failed(
                        estimate_id=estimate_id,
                        failed_agent=agent_name,
                        error=f"Failed after {MAX_RETRIES} retries",
                        completed_agents=completed_agents
                    )
                    
                    logger.error(
                        "pipeline_agent_failed",
                        estimate_id=estimate_id,
                        agent=agent_name,
                        retries=pipeline_status.retries.get(agent_name, 0)
                    )
                    
                    # Update estimate status to failed
                    await self.firestore.update_estimate(
                        estimate_id,
                        {"status": "failed", "error": f"Pipeline failed at {agent_name}"}
                    )
                    
                    return PipelineResult(
                        success=False,
                        estimate_id=estimate_id,
                        status="failed",
                        completed_agents=completed_agents,
                        failed_agent=failed_agent,
                        total_duration_ms=self.elapsed_ms,
                        total_tokens_used=self._total_tokens,
                        error=f"Agent {agent_name} failed validation"
                    )
                
                # Success - add to context and continue
                accumulated_context[f"{agent_name}_output"] = output
                completed_agents.append(agent_name)

                pipeline_status.completed_agents = completed_agents
                pipeline_status.agent_statuses[agent_name] = AgentStatus.COMPLETED.value
                pipeline_status.progress = pipeline_status.get_progress_percentage(len(AGENT_SEQUENCE))
                await self._update_pipeline_status(estimate_id, pipeline_status)

                # Log detailed agent output summary for debugging
                self._log_agent_output_summary(agent_name, output)

                logger.info(
                    "agent_completed",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    score=pipeline_status.scores.get(agent_name),
                    progress=pipeline_status.progress
                )

                # Sync progress to project pipeline for frontend UI
                if self._project_id:
                    await self.firestore.sync_to_project_pipeline(
                        project_id=self._project_id,
                        estimate_id=estimate_id,
                        current_agent=agent_name,
                        completed_agents=completed_agents,
                        progress=pipeline_status.progress,
                        status="running",
                        user_id=self._user_id,
                        started_at=self._started_at,
                    )
            
            # All agents completed successfully
            pipeline_status.completed_at = datetime.utcnow()
            pipeline_status.progress = 100
            await self._update_pipeline_status(estimate_id, pipeline_status)
            
            # Update estimate status to final
            await self.firestore.update_estimate(
                estimate_id,
                {"status": "final"}
            )

            # Log pipeline completion with visual banner
            log_pipeline_complete(
                estimate_id=estimate_id,
                completed_agents=completed_agents,
                duration_ms=self.elapsed_ms,
                total_tokens=self._total_tokens
            )
            
            logger.info(
                "pipeline_completed",
                estimate_id=estimate_id,
                duration_ms=self.elapsed_ms,
                total_tokens=self._total_tokens
            )

            # Sync completion to project pipeline for frontend UI
            if self._project_id:
                await self.firestore.sync_to_project_pipeline(
                    project_id=self._project_id,
                    estimate_id=estimate_id,
                    current_agent=None,
                    completed_agents=completed_agents,
                    progress=100,
                    status="complete",
                    user_id=self._user_id,
                    started_at=self._started_at,
                )

            return PipelineResult(
                success=True,
                estimate_id=estimate_id,
                status="completed",
                completed_agents=completed_agents,
                total_duration_ms=self.elapsed_ms,
                total_tokens_used=self._total_tokens
            )
            
        except Exception as e:
            # Log pipeline failure with visual banner
            log_pipeline_failed(
                estimate_id=estimate_id,
                failed_agent=pipeline_status.current_agent or "unknown",
                error=str(e),
                completed_agents=completed_agents
            )

            logger.exception(
                "pipeline_exception",
                estimate_id=estimate_id,
                error=str(e)
            )

            pipeline_status.error = str(e)
            await self._update_pipeline_status(estimate_id, pipeline_status)

            await self.firestore.update_estimate(
                estimate_id,
                {"status": "failed", "error": str(e)}
            )

            # Sync failure to project pipeline for frontend UI
            if self._project_id:
                await self.firestore.sync_to_project_pipeline(
                    project_id=self._project_id,
                    estimate_id=estimate_id,
                    current_agent=pipeline_status.current_agent,
                    completed_agents=completed_agents,
                    progress=pipeline_status.progress,
                    status="error",
                    error=str(e),
                    user_id=self._user_id,
                    started_at=self._started_at,
                )

            raise PipelineError(
                code=ErrorCode.PIPELINE_FAILED,
                message=f"Pipeline failed: {str(e)}",
                estimate_id=estimate_id,
                current_agent=pipeline_status.current_agent
            )
    
    async def _run_agent_with_validation(
        self,
        estimate_id: str,
        agent_name: str,
        input_data: Dict[str, Any],
        pipeline_status: PipelineStatus
    ) -> Tuple[bool, Dict[str, Any]]:
        """Run an agent with scorer/critic validation flow.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the primary agent.
            input_data: Input data for the agent.
            pipeline_status: Current pipeline status.
            
        Returns:
            Tuple of (success, output).
        """
        retry_count = 0
        critic_feedback: Optional[Dict[str, Any]] = None
        
        while retry_count <= MAX_RETRIES:
            # 1. Run primary agent
            try:
                output = await self._call_primary_agent(
                    estimate_id=estimate_id,
                    agent_name=agent_name,
                    input_data=input_data,
                    critic_feedback=critic_feedback,
                    retry_attempt=retry_count
                )
                
                # Log agent output with visual banner
                metadata = getattr(self, '_last_agent_metadata', {})
                log_agent_output(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    output=output,
                    duration_ms=metadata.get('duration_ms', 0),
                    tokens_used=metadata.get('tokens_used', 0)
                )

            except (A2AError, TrueCostError) as e:
                # Log agent error with visual banner
                log_agent_error(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    error=str(e),
                    retry_attempt=retry_count
                )

                logger.error(
                    "primary_agent_error",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    retry=retry_count,
                    error=str(e)
                )
                retry_count += 1
                continue
            
            # 2. Run scorer agent
            try:
                score_result = await self._call_scorer_agent(
                    estimate_id=estimate_id,
                    agent_name=agent_name,
                    output=output,
                    input_data=input_data
                )
                
                # Log scorer result with visual banner
                log_scorer_result(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    score=score_result.score,
                    passed=score_result.passed,
                    breakdown=score_result.breakdown,
                    feedback=score_result.feedback
                )

            except (A2AError, TrueCostError) as e:
                logger.error(
                    "scorer_agent_error",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    error=str(e)
                )
                # If scorer fails, treat as passing to not block pipeline
                score_result = AgentScoreResult(
                    score=80,
                    passed=True,
                    breakdown=[],
                    feedback="Scorer unavailable, defaulting to pass"
                )
                
                # Log scorer result (default pass)
                log_scorer_result(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    score=score_result.score,
                    passed=score_result.passed,
                    breakdown=score_result.breakdown,
                    feedback=score_result.feedback
                )
            
            # Update score in pipeline status
            pipeline_status.scores[agent_name] = score_result.score
            pipeline_status.retries[agent_name] = retry_count
            
            # 3. Check if passed
            if score_result.passed:
                # Save successful output
                await self.firestore.save_agent_output(
                    estimate_id=estimate_id,
                    agent_name=agent_name,
                    output=output,
                    score=score_result.score
                )
                return True, output
            
            # 4. Score too low - call critic if we have retries left
            if retry_count >= MAX_RETRIES:
                logger.warning(
                    "max_retries_exceeded",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    score=score_result.score,
                    retries=retry_count
                )
                return False, output
            
            # 5. Call critic agent for feedback
            try:
                critic_feedback = await self._call_critic_agent(
                    estimate_id=estimate_id,
                    agent_name=agent_name,
                    output=output,
                    input_data=input_data,
                    score=score_result.score,
                    scorer_feedback=score_result.feedback
                )
                
                # Log critic feedback with visual banner
                log_critic_feedback(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    feedback=critic_feedback
                )

            except (A2AError, TrueCostError) as e:
                logger.error(
                    "critic_agent_error",
                    estimate_id=estimate_id,
                    agent=agent_name,
                    error=str(e)
                )
                # Generate basic feedback if critic fails
                critic_feedback = {
                    "issues": [f"Score was {score_result.score}/100, below threshold of {PASSING_SCORE}"],
                    "why_wrong": "Output did not meet quality standards",
                    "how_to_fix": ["Review and improve the output quality"],
                    "score": score_result.score
                }
                
                # Log critic feedback (fallback)
                log_critic_feedback(
                    agent_name=agent_name,
                    estimate_id=estimate_id,
                    feedback=critic_feedback
                )

            # Log retry with visual banner
            log_agent_retry(
                agent_name=agent_name,
                estimate_id=estimate_id,
                retry_number=retry_count + 1,
                previous_score=score_result.score
            )
            
            logger.info(
                "agent_retry_with_feedback",
                estimate_id=estimate_id,
                agent=agent_name,
                score=score_result.score,
                retry=retry_count + 1,
                issues_count=len(critic_feedback.get("issues", []))
            )
            
            # Update status to retrying
            pipeline_status.agent_statuses[agent_name] = AgentStatus.RETRYING.value
            await self._update_pipeline_status(estimate_id, pipeline_status)
            
            retry_count += 1
        
        return False, {}
    
    async def _call_primary_agent(
        self,
        estimate_id: str,
        agent_name: str,
        input_data: Dict[str, Any],
        critic_feedback: Optional[Dict[str, Any]] = None,
        retry_attempt: int = 0
    ) -> Dict[str, Any]:
        """Call a primary agent via A2A protocol.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the agent.
            input_data: Input data for processing.
            critic_feedback: Optional critic feedback for retry.
            retry_attempt: Current retry attempt number.
            
        Returns:
            Agent output data.
        """
        message = {
            "estimate_id": estimate_id,
            "input": input_data,
            "retry_attempt": retry_attempt
        }
        
        if critic_feedback:
            message["critic_feedback"] = critic_feedback
        
        response = await self.a2a.send_task(
            target_agent=agent_name,
            message=message,
            thread_id=estimate_id
        )
        
        # Extract result data
        result = self.a2a.extract_result_data(response)
        
        # Track tokens and store metadata for logging
        metadata = response.get("result", {}).get("metadata", {})
        if tokens := metadata.get("tokens_used"):
            self._total_tokens += tokens
        
        # Store metadata for logging in _run_agent_with_validation
        self._last_agent_metadata = {
            'duration_ms': metadata.get('duration_ms', 0),
            'tokens_used': metadata.get('tokens_used', 0)
        }
        
        return result
    
    async def _call_scorer_agent(
        self,
        estimate_id: str,
        agent_name: str,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> AgentScoreResult:
        """Call a scorer agent via A2A protocol.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the primary agent being scored.
            output: Primary agent's output.
            input_data: Original input data.
            
        Returns:
            AgentScoreResult with score and feedback.
        """
        scorer_name = get_scorer_for_primary(agent_name)
        
        message = {
            "estimate_id": estimate_id,
            "agent_name": agent_name,
            "output": output,
            "input": input_data
        }
        
        response = await self.a2a.send_task(
            target_agent=scorer_name,
            message=message,
            thread_id=estimate_id
        )
        
        result = self.a2a.extract_result_data(response)
        
        return AgentScoreResult(
            score=result.get("score", 0),
            passed=result.get("passed", False),
            breakdown=result.get("breakdown", []),
            feedback=result.get("feedback", "")
        )
    
    async def _call_critic_agent(
        self,
        estimate_id: str,
        agent_name: str,
        output: Dict[str, Any],
        input_data: Dict[str, Any],
        score: int,
        scorer_feedback: str
    ) -> Dict[str, Any]:
        """Call a critic agent via A2A protocol.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the primary agent being critiqued.
            output: Primary agent's output.
            input_data: Original input data.
            score: Scorer's numerical score.
            scorer_feedback: Feedback from the scorer.
            
        Returns:
            Critic feedback dict.
        """
        critic_name = get_critic_for_primary(agent_name)
        
        message = {
            "estimate_id": estimate_id,
            "agent_name": agent_name,
            "output": output,
            "input": input_data,
            "score": score,
            "scorer_feedback": scorer_feedback
        }
        
        response = await self.a2a.send_task(
            target_agent=critic_name,
            message=message,
            thread_id=estimate_id
        )
        
        return self.a2a.extract_result_data(response)
    
    async def _update_pipeline_status(
        self,
        estimate_id: str,
        pipeline_status: PipelineStatus
    ) -> None:
        """Update pipeline status in Firestore.
        
        Args:
            estimate_id: The estimate document ID.
            pipeline_status: Current pipeline status.
        """
        status_dict = pipeline_status.model_dump(by_alias=True, exclude_none=True)
        
        # Convert datetime to Firestore timestamp
        if "startedAt" in status_dict and isinstance(status_dict["startedAt"], datetime):
            from firebase_admin import firestore as fs
            status_dict["startedAt"] = status_dict["startedAt"]
        
        await self.firestore.update_estimate(
            estimate_id,
            {"pipelineStatus": status_dict}
        )
    
    async def get_pipeline_status(self, estimate_id: str) -> Optional[PipelineStatus]:
        """Get current pipeline status.

        Args:
            estimate_id: The estimate document ID.

        Returns:
            PipelineStatus or None if not found.
        """
        estimate = await self.firestore.get_estimate(estimate_id)

        if not estimate:
            return None

        status_data = estimate.get("pipelineStatus")
        if not status_data:
            return None

        return PipelineStatus(**status_data)

    def _log_agent_output_summary(self, agent_name: str, output: Dict[str, Any]) -> None:
        """Log detailed summary of agent output for debugging.

        Args:
            agent_name: Name of the agent that completed.
            output: Agent output data.
        """
        print(f"\n{'='*60}")
        print(f"[AGENT OUTPUT] {agent_name.upper()} AGENT COMPLETED")
        print(f"{'='*60}")

        if agent_name == "location":
            print(f"  ZIP Code: {output.get('zipCode', 'N/A')}")
            print(f"  City/State: {output.get('city', 'N/A')}, {output.get('state', 'N/A')}")
            print(f"  Location Factor: {output.get('locationFactor', 'N/A')}")
            labor_rates = output.get('laborRates', {})
            print(f"  Labor Rates:")
            print(f"    - Electrician: ${labor_rates.get('electrician', 'N/A')}/hr")
            print(f"    - Plumber: ${labor_rates.get('plumber', 'N/A')}/hr")
            print(f"    - Carpenter: ${labor_rates.get('carpenter', 'N/A')}/hr")
            print(f"    - General Labor: ${labor_rates.get('generalLabor', 'N/A')}/hr")
            print(f"  Confidence: {output.get('confidence', 'N/A')}")

        elif agent_name == "scope":
            divisions = output.get('divisions', [])
            print(f"  Total Divisions: {len(divisions)}")
            total_items = sum(len(d.get('lineItems', [])) for d in divisions)
            print(f"  Total Line Items: {total_items}")
            for div in divisions[:5]:  # Show first 5 divisions
                print(f"    - {div.get('divisionCode', '??')}: {div.get('divisionName', 'Unknown')} ({len(div.get('lineItems', []))} items)")
            print(f"  Confidence: {output.get('confidence', 'N/A')}")

        elif agent_name == "cost":
            subtotals = output.get('subtotals', {})
            total = output.get('total', {})
            print(f"  COST BREAKDOWN:")
            materials = subtotals.get('materials', {})
            labor = subtotals.get('labor', {})
            print(f"    - Materials: ${materials.get('low', 0):,.2f} - ${materials.get('high', 0):,.2f}")
            print(f"    - Labor: ${labor.get('low', 0):,.2f} - ${labor.get('high', 0):,.2f}")
            print(f"    - Total Labor Hours: {subtotals.get('totalLaborHours', 'N/A')}")
            print(f"  GRAND TOTAL: ${total.get('low', 0):,.2f} - ${total.get('high', 0):,.2f}")
            print(f"  Items with exact costs: {output.get('itemsWithExactCosts', 'N/A')}")
            print(f"  Items with estimated costs: {output.get('itemsWithEstimatedCosts', 'N/A')}")
            print(f"  Confidence: {output.get('confidence', 'N/A')}")

            # Check for mock data indicators
            divisions = output.get('divisions', [])
            total_items = sum(len(d.get('lineItems', [])) for d in divisions)
            exact = output.get('itemsWithExactCosts', 0)
            estimated = output.get('itemsWithEstimatedCosts', total_items)
            if total_items > 0:
                pct_estimated = (estimated / total_items) * 100
                if pct_estimated > 50:
                    print(f"  ⚠️  WARNING: {pct_estimated:.0f}% of items using ESTIMATED (mock) costs!")

        elif agent_name == "timeline":
            tasks = output.get('tasks', [])
            print(f"  Total Tasks: {len(tasks)}")
            print(f"  Total Duration: {output.get('totalDuration', 'N/A')} working days")
            print(f"  Calendar Days: {output.get('totalCalendarDays', 'N/A')}")
            duration_range = output.get('durationRange', {})
            print(f"  Duration Range: {duration_range.get('optimistic', 'N/A')} - {duration_range.get('pessimistic', 'N/A')} days")
            print(f"  Schedule Confidence: {output.get('scheduleConfidence', 'N/A')}")
            # Show first few tasks
            for task in tasks[:5]:
                print(f"    - {task.get('name', 'Unknown')}: {task.get('durationDays', '?')} days ({task.get('primaryTrade', 'N/A')})")

        elif agent_name == "risk":
            print(f"  Risk Score: {output.get('riskScore', 'N/A')}/100")
            print(f"  Risk Level: {output.get('riskLevel', 'N/A')}")
            risks = output.get('risks', [])
            print(f"  Total Risks Identified: {len(risks)}")
            for risk in risks[:3]:
                print(f"    - {risk.get('name', 'Unknown')}: {risk.get('severity', 'N/A')} severity")

        elif agent_name == "final":
            print(f"  P50 Total: ${output.get('p50', 0):,.2f}")
            print(f"  P80 Total: ${output.get('p80', 0):,.2f}")
            print(f"  P90 Total: ${output.get('p90', 0):,.2f}")
            print(f"  Timeline Weeks: {output.get('timelineWeeks', 'N/A')}")
            print(f"  Monte Carlo Iterations: {output.get('monteCarloIterations', 'N/A')}")

        else:
            # Generic logging for other agents
            print(f"  Output keys: {list(output.keys())}")
            if 'confidence' in output:
                print(f"  Confidence: {output.get('confidence')}")

        print(f"{'='*60}\n")


# Convenience function for Cloud Function entry point
async def run_deep_pipeline(
    estimate_id: str,
    clarification_output: Dict[str, Any]
) -> PipelineResult:
    """Run the deep agent pipeline.
    
    Convenience function wrapping PipelineOrchestrator.
    
    Args:
        estimate_id: The estimate document ID.
        clarification_output: ClarificationOutput v3.0.0 data.
        
    Returns:
        PipelineResult with success/failure status.
    """
    orchestrator = PipelineOrchestrator()
    return await orchestrator.run_pipeline(estimate_id, clarification_output)



