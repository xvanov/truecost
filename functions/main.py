"""Cloud Function entry points for TrueCost Deep Agent Pipeline.

Provides HTTP endpoints for:
- Starting the deep pipeline
- Getting pipeline status
- Deleting estimates
- A2A endpoints for all 19 agents
"""

import asyncio
import json
from typing import Dict, Any
from uuid import uuid4
from datetime import datetime, date

import structlog
from firebase_functions import https_fn, options
from firebase_admin import initialize_app, firestore

from config.settings import settings
from config.errors import TrueCostError, ErrorCode, ValidationError
from services.firestore_service import FirestoreService
from validators.clarification_validator import validate_clarification_output

# Initialize Firebase Admin SDK
try:
    initialize_app()
except ValueError:
    # Already initialized
    pass

logger = structlog.get_logger()

# ============================================================================
# Helper Functions
# ============================================================================


def success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Build success response."""
    return {"success": True, "data": data}


def error_response(code: str, message: str, details: Dict[str, Any] = None) -> Dict[str, Any]:
    """Build error response."""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {}
        }
    }


def get_request_json(req: https_fn.Request) -> Dict[str, Any]:
    """Extract JSON from request body.
    
    Args:
        req: HTTP request object.
        
    Returns:
        Parsed JSON data.
        
    Raises:
        ValidationError: If JSON is invalid.
    """
    try:
        return req.get_json(force=True) or {}
    except Exception as e:
        raise ValidationError(
            message=f"Invalid JSON in request body: {str(e)}"
        )


def get_user_id(req: https_fn.Request) -> str:
    """Extract user ID from request.
    
    In production, this would validate the Firebase Auth token.
    For now, we accept userId in the request body.
    
    Args:
        req: HTTP request object.
        
    Returns:
        User ID string.
    """
    data = get_request_json(req)
    user_id = data.get("userId")
    
    if not user_id:
        raise ValidationError(
            message="Missing userId in request",
            field="userId"
        )
    
    return user_id


# ============================================================================
# Pipeline Entry Points
# ============================================================================


@https_fn.on_request(
    timeout_sec=540,  # 9 minutes for initial setup
    memory=options.MemoryOption.GB_1,
    region="us-central1"
)
def start_deep_pipeline(req: https_fn.Request) -> https_fn.Response:
    """Start the deep agent pipeline.
    
    This endpoint:
    1. Validates the ClarificationOutput
    2. Creates the estimate document
    3. Starts the pipeline asynchronously
    4. Returns immediately with the estimate ID
    
    The pipeline runs in the background (5-15 minutes).
    Frontend should listen to Firestore for progress updates.
    
    Request body:
    {
        "userId": "user-123",
        "projectId": "proj-xxx",  // Optional: for UI progress sync
        "clarificationOutput": {...}  // ClarificationOutput v3.0.0
    }
    
    Response:
    {
        "success": true,
        "data": {
            "estimateId": "est-xxx",
            "status": "processing"
        }
    }
    """
    if req.method == "OPTIONS":
        return _cors_response()
    
    try:
        data = get_request_json(req)
        user_id = data.get("userId")
        project_id = data.get("projectId")  # Optional: for UI sync
        clarification_output = data.get("clarificationOutput")

        # Validate required fields
        if not user_id:
            return _json_response(
                error_response(
                    ErrorCode.MISSING_FIELD,
                    "Missing userId in request"
                ),
                status=400
            )
        
        if not clarification_output:
            return _json_response(
                error_response(
                    ErrorCode.MISSING_FIELD,
                    "Missing clarificationOutput in request"
                ),
                status=400
            )
        
        # Validate ClarificationOutput schema
        validation_result = validate_clarification_output(clarification_output)
        if not validation_result.is_valid:
            return _json_response(
                error_response(
                    ErrorCode.VALIDATION_ERROR,
                    "Invalid clarificationOutput",
                    {"errors": validation_result.errors}
                ),
                status=400
            )
        
        # Generate estimate ID or use provided one
        estimate_id = clarification_output.get("estimateId") or f"est-{uuid4().hex[:12]}"
        
        logger.info(
            "pipeline_request_received",
            user_id=user_id,
            project_id=project_id,
            estimate_id=estimate_id
        )

        # Create estimate document and start pipeline
        result = asyncio.run(_start_pipeline_async(
            estimate_id=estimate_id,
            user_id=user_id,
            project_id=project_id,
            clarification_output=clarification_output
        ))
        
        return _json_response(success_response(result))
        
    except ValidationError as e:
        return _json_response(
            error_response(e.code, e.message, e.details),
            status=400
        )
    except TrueCostError as e:
        logger.error("pipeline_start_error", error=e.message, code=e.code)
        return _json_response(
            error_response(e.code, e.message, e.details),
            status=500
        )
    except Exception as e:
        logger.exception("pipeline_start_exception", error=str(e))
        return _json_response(
            error_response(
                ErrorCode.PIPELINE_FAILED,
                f"Failed to start pipeline: {str(e)}"
            ),
            status=500
        )


async def _start_pipeline_async(
    estimate_id: str,
    user_id: str,
    project_id: str | None,
    clarification_output: Dict[str, Any]
) -> Dict[str, Any]:
    """Start pipeline and run to completion.

    Creates the estimate document and runs the full pipeline.
    Note: In production, long-running pipelines should use Cloud Tasks or Pub/Sub.
    For the emulator/testing, we run synchronously to completion.

    Args:
        estimate_id: Estimate document ID.
        user_id: User who triggered the pipeline.
        project_id: Optional project ID for UI progress sync.
        clarification_output: ClarificationOutput v3.0.0 from clarification agent.
    """
    from services.firestore_service import FirestoreService
    from agents.orchestrator import PipelineOrchestrator

    firestore_service = FirestoreService()

    # Create estimate document
    await firestore_service.create_estimate(
        estimate_id=estimate_id,
        user_id=user_id,
        clarification_output=clarification_output
    )

    # Run pipeline to completion
    orchestrator = PipelineOrchestrator(firestore_service=firestore_service)

    try:
        result = await orchestrator.run_pipeline(
            estimate_id=estimate_id,
            clarification_output=clarification_output,
            project_id=project_id,
            user_id=user_id
        )
        return {
            "estimateId": estimate_id,
            "status": result.status,
            "completedAgents": result.completed_agents,
            "totalDurationMs": result.total_duration_ms
        }
    except Exception as e:
        logger.exception(
            "pipeline_error",
            estimate_id=estimate_id,
            error=str(e)
        )
        return {
            "estimateId": estimate_id,
            "status": "failed",
            "error": str(e)
        }


@https_fn.on_request(
    timeout_sec=30,
    memory=options.MemoryOption.MB_256,
    region="us-central1"
)
def get_pipeline_status(req: https_fn.Request) -> https_fn.Response:
    """Get current pipeline status.
    
    Reads from Firestore pipelineStatus field.
    
    Request body:
    {
        "estimateId": "est-xxx"
    }
    
    Response:
    {
        "success": true,
        "data": {
            "status": "processing",
            "currentAgent": "cost",
            "progress": 60,
            "completedAgents": ["location", "scope", "cost"],
            "scores": {"location": 85, "scope": 92, "cost": 88}
        }
    }
    """
    if req.method == "OPTIONS":
        return _cors_response()
    
    try:
        data = get_request_json(req)
        estimate_id = data.get("estimateId")
        
        if not estimate_id:
            return _json_response(
                error_response(
                    ErrorCode.MISSING_FIELD,
                    "Missing estimateId in request"
                ),
                status=400
            )
        
        result = asyncio.run(_get_status_async(estimate_id))
        
        return _json_response(success_response(result))
        
    except TrueCostError as e:
        return _json_response(
            error_response(e.code, e.message, e.details),
            status=404 if e.code == ErrorCode.ESTIMATE_NOT_FOUND else 500
        )
    except Exception as e:
        logger.exception("get_status_error", error=str(e))
        return _json_response(
            error_response(
                ErrorCode.FIRESTORE_ERROR,
                f"Failed to get status: {str(e)}"
            ),
            status=500
        )


async def _get_status_async(estimate_id: str) -> Dict[str, Any]:
    """Get pipeline status from Firestore."""
    from services.firestore_service import FirestoreService
    
    firestore_service = FirestoreService()
    estimate = await firestore_service.get_estimate(estimate_id)
    
    if not estimate:
        raise TrueCostError(
            code=ErrorCode.ESTIMATE_NOT_FOUND,
            message=f"Estimate not found: {estimate_id}",
            details={"estimateId": estimate_id}
        )
    
    pipeline_status = estimate.get("pipelineStatus", {})
    status = estimate.get("status", "unknown")
    
    result = {
        "estimateId": estimate_id,
        "status": status,
        "currentAgent": pipeline_status.get("currentAgent"),
        "progress": pipeline_status.get("progress", 0),
        "completedAgents": pipeline_status.get("completedAgents", []),
        "scores": pipeline_status.get("scores", {}),
        "retries": pipeline_status.get("retries", {}),
        "error": pipeline_status.get("error")
    }
    
    # Include agent outputs for display
    for output_key in ["locationOutput", "scopeOutput", "costOutput", "riskOutput", "timelineOutput", "finalOutput"]:
        if output_key in estimate:
            result[output_key] = estimate[output_key]

    # Inject full granular cost ledger into the response (no truncation).
    # We keep the authoritative list in the subcollection to avoid root doc size limits.
    try:
        if "finalOutput" in result and isinstance(result["finalOutput"], dict):
            cost_items = await firestore_service.list_cost_items(estimate_id)
            result["finalOutput"]["granularCostItems"] = {
                "count": len(cost_items),
                "collectionPath": f"/estimates/{estimate_id}/costItems",
                "items": cost_items,
            }
    except Exception as e:
        logger.warning("cost_items_attach_failed", estimate_id=estimate_id, error=str(e))
    
    # Include final estimate data if pipeline is completed
    if status == "completed":
        # Add all the summary fields for the dashboard
        result.update({
            "projectName": estimate.get("projectName"),
            "address": estimate.get("address"),
            "projectType": estimate.get("projectType"),
            "scope": estimate.get("scope"),
            "squareFootage": estimate.get("squareFootage"),
            "totalCost": estimate.get("totalCost"),
            "p50": estimate.get("p50"),
            "p80": estimate.get("p80"),
            "p90": estimate.get("p90"),
            "contingencyPct": estimate.get("contingencyPct"),
            "timelineWeeks": estimate.get("timelineWeeks"),
            "monteCarloIterations": estimate.get("monteCarloIterations"),
            "costDrivers": estimate.get("costDrivers"),
            "laborAnalysis": estimate.get("laborAnalysis"),
            "schedule": estimate.get("schedule"),
            "cost_breakdown": estimate.get("cost_breakdown"),
            "risk_analysis": estimate.get("risk_analysis"),
            "bill_of_quantities": estimate.get("bill_of_quantities"),
            "assumptions": estimate.get("assumptions"),
            "cad_data": estimate.get("cad_data"),
            "costItemsCount": estimate.get("costItemsCount"),
            "costItemsCollectionPath": estimate.get("costItemsCollectionPath"),
        })
    
    return result


@https_fn.on_request(
    timeout_sec=60,
    memory=options.MemoryOption.MB_256,
    region="us-central1"
)
def delete_estimate(req: https_fn.Request) -> https_fn.Response:
    """Delete an estimate and all subcollections.
    
    Request body:
    {
        "estimateId": "est-xxx",
        "userId": "user-123"  // For authorization check
    }
    
    Response:
    {
        "success": true,
        "data": {"deleted": true}
    }
    """
    if req.method == "OPTIONS":
        return _cors_response()
    
    try:
        data = get_request_json(req)
        estimate_id = data.get("estimateId")
        user_id = data.get("userId")
        
        if not estimate_id:
            return _json_response(
                error_response(
                    ErrorCode.MISSING_FIELD,
                    "Missing estimateId in request"
                ),
                status=400
            )
        
        if not user_id:
            return _json_response(
                error_response(
                    ErrorCode.MISSING_FIELD,
                    "Missing userId in request"
                ),
                status=400
            )
        
        asyncio.run(_delete_estimate_async(estimate_id, user_id))
        
        return _json_response(success_response({"deleted": True}))
        
    except TrueCostError as e:
        return _json_response(
            error_response(e.code, e.message, e.details),
            status=404 if e.code == ErrorCode.ESTIMATE_NOT_FOUND else 500
        )
    except Exception as e:
        logger.exception("delete_estimate_error", error=str(e))
        return _json_response(
            error_response(
                ErrorCode.FIRESTORE_ERROR,
                f"Failed to delete estimate: {str(e)}"
            ),
            status=500
        )


async def _delete_estimate_async(estimate_id: str, user_id: str) -> None:
    """Delete estimate after authorization check."""
    from services.firestore_service import FirestoreService
    
    firestore_service = FirestoreService()
    
    # Verify estimate exists and belongs to user
    estimate = await firestore_service.get_estimate(estimate_id)
    
    if not estimate:
        raise TrueCostError(
            code=ErrorCode.ESTIMATE_NOT_FOUND,
            message=f"Estimate not found: {estimate_id}",
            details={"estimateId": estimate_id}
        )
    
    if estimate.get("userId") != user_id:
        raise TrueCostError(
            code=ErrorCode.VALIDATION_ERROR,
            message="Not authorized to delete this estimate",
            details={"estimateId": estimate_id}
        )
    
    await firestore_service.delete_estimate(estimate_id)


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "3600"
}


def _cors_response() -> https_fn.Response:
    """Return CORS preflight response."""
    return https_fn.Response(
        "",
        status=204,
        headers=CORS_HEADERS
    )


def _json_response(data: dict, status: int = 200) -> https_fn.Response:
    """Return JSON response with CORS headers."""

    def _json_default(o: Any):
        """JSON serializer for objects not serializable by default.

        Firestore returns timestamp types like `DatetimeWithNanoseconds` which
        behave like datetime objects but are not JSON serializable.
        """
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        # Some Firestore timestamp types may not be direct datetime subclasses but
        # still provide isoformat(). Use duck-typing fallback.
        if hasattr(o, "isoformat"):
            try:
                return o.isoformat()
            except Exception:
                pass
        return str(o)

    return https_fn.Response(
        json.dumps(data, default=_json_default),
        status=status,
        mimetype="application/json",
        headers=CORS_HEADERS
    )


# ============================================================================
# A2A Agent Endpoints
# ============================================================================

# Agent endpoint configuration
AGENT_ENDPOINT_CONFIG = {
    "timeout_sec": 300,  # 5 minutes per agent
    "memory": options.MemoryOption.GB_1,
    "region": "us-central1"
}


def _create_a2a_handler(agent_class, agent_name: str):
    """Create A2A endpoint handler for an agent.
    
    Args:
        agent_class: Agent class to instantiate.
        agent_name: Name of the agent.
        
    Returns:
        Handler function.
    """
    async def _handle_request(request_data: Dict[str, Any]) -> Dict[str, Any]:
        agent = agent_class()
        return await agent.handle_a2a_request(request_data)
    
    def handler(req: https_fn.Request) -> https_fn.Response:
        if req.method == "OPTIONS":
            return _cors_response()
        
        try:
            data = get_request_json(req)
            result = asyncio.run(_handle_request(data))
            
            return _json_response(result)
        except Exception as e:
            logger.exception(f"a2a_{agent_name}_error", error=str(e))
            return _json_response(
                {
                    "jsonrpc": "2.0",
                    "id": data.get("id", "unknown"),
                    "error": {"code": -32603, "message": str(e)}
                },
                status=500
            )
    
    return handler


# Primary Agent Endpoints
# These will be populated when stub agents are created
# For now, create placeholder endpoints

@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_location(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Location Agent."""
    from agents.primary.location_agent import LocationAgent
    return _handle_a2a_request(req, LocationAgent, "location")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_scope(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Scope Agent."""
    from agents.primary.scope_agent import ScopeAgent
    return _handle_a2a_request(req, ScopeAgent, "scope")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_code_compliance(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Code Compliance Agent (ICC warnings)."""
    from agents.primary.code_compliance_agent import CodeComplianceAgent
    return _handle_a2a_request(req, CodeComplianceAgent, "code_compliance")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_cost(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Cost Agent."""
    from agents.primary.cost_agent import CostAgent
    return _handle_a2a_request(req, CostAgent, "cost")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_risk(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Risk Agent."""
    from agents.primary.risk_agent import RiskAgent
    return _handle_a2a_request(req, RiskAgent, "risk")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_timeline(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Timeline Agent."""
    from agents.primary.timeline_agent import TimelineAgent
    return _handle_a2a_request(req, TimelineAgent, "timeline")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_final(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Final Agent."""
    from agents.primary.final_agent import FinalAgent
    return _handle_a2a_request(req, FinalAgent, "final")


# Scorer Agent Endpoints
@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_location_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Location Scorer."""
    from agents.scorers.location_scorer import LocationScorer
    return _handle_a2a_request(req, LocationScorer, "location_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_scope_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Scope Scorer."""
    from agents.scorers.scope_scorer import ScopeScorer
    return _handle_a2a_request(req, ScopeScorer, "scope_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_code_compliance_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Code Compliance Scorer."""
    from agents.scorers.code_compliance_scorer import CodeComplianceScorer
    return _handle_a2a_request(req, CodeComplianceScorer, "code_compliance_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_cost_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Cost Scorer."""
    from agents.scorers.cost_scorer import CostScorer
    return _handle_a2a_request(req, CostScorer, "cost_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_risk_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Risk Scorer."""
    from agents.scorers.risk_scorer import RiskScorer
    return _handle_a2a_request(req, RiskScorer, "risk_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_timeline_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Timeline Scorer."""
    from agents.scorers.timeline_scorer import TimelineScorer
    return _handle_a2a_request(req, TimelineScorer, "timeline_scorer")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_final_scorer(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Final Scorer."""
    from agents.scorers.final_scorer import FinalScorer
    return _handle_a2a_request(req, FinalScorer, "final_scorer")


# Critic Agent Endpoints
@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_location_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Location Critic."""
    from agents.critics.location_critic import LocationCritic
    return _handle_a2a_request(req, LocationCritic, "location_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_scope_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Scope Critic."""
    from agents.critics.scope_critic import ScopeCritic
    return _handle_a2a_request(req, ScopeCritic, "scope_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_code_compliance_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Code Compliance Critic."""
    from agents.critics.code_compliance_critic import CodeComplianceCritic
    return _handle_a2a_request(req, CodeComplianceCritic, "code_compliance_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_cost_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Cost Critic."""
    from agents.critics.cost_critic import CostCritic
    return _handle_a2a_request(req, CostCritic, "cost_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_risk_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Risk Critic."""
    from agents.critics.risk_critic import RiskCritic
    return _handle_a2a_request(req, RiskCritic, "risk_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_timeline_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Timeline Critic."""
    from agents.critics.timeline_critic import TimelineCritic
    return _handle_a2a_request(req, TimelineCritic, "timeline_critic")


@https_fn.on_request(**AGENT_ENDPOINT_CONFIG)
def a2a_final_critic(req: https_fn.Request) -> https_fn.Response:
    """A2A endpoint for Final Critic."""
    from agents.critics.final_critic import FinalCritic
    return _handle_a2a_request(req, FinalCritic, "final_critic")


def _handle_a2a_request(
    req: https_fn.Request,
    agent_class,
    agent_name: str
) -> https_fn.Response:
    """Handle A2A request for any agent type.
    
    Args:
        req: HTTP request.
        agent_class: Agent class to instantiate.
        agent_name: Name of the agent.
        
    Returns:
        HTTP response with A2A JSON-RPC result.
    """
    if req.method == "OPTIONS":
        return _cors_response()
    
    try:
        data = get_request_json(req)
        
        async def _process():
            agent = agent_class()
            return await agent.handle_a2a_request(data)
        
        result = asyncio.run(_process())
        
        return _json_response(result)
        
    except Exception as e:
        logger.exception(f"a2a_{agent_name}_error", error=str(e))
        request_id = "unknown"
        try:
            request_id = get_request_json(req).get("id", "unknown")
        except Exception:
            pass
        
        return _json_response(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32603, "message": str(e)}
            },
            status=500
        )

