"""Firestore service for TrueCost.

Provides CRUD operations for estimates and agent outputs.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime
import inspect
import structlog

from firebase_admin import firestore

from config.errors import TrueCostError, ErrorCode

logger = structlog.get_logger()


class FirestoreService:
    """Service for Firestore operations.
    
    Handles all database operations for estimates, agent outputs,
    and pipeline status updates.
    
    Note: Firebase Admin SDK for Python is synchronous. Methods are
    marked async for interface compatibility but operations are sync.
    """
    
    COLLECTION_ESTIMATES = "estimates"
    COLLECTION_PROJECTS = "projects"
    SUBCOLLECTION_PIPELINE = "pipeline"
    SUBCOLLECTION_AGENT_OUTPUTS = "agentOutputs"
    SUBCOLLECTION_CONVERSATIONS = "conversations"
    SUBCOLLECTION_VERSIONS = "versions"
    SUBCOLLECTION_COST_ITEMS = "costItems"

    # Map Python agent names to frontend stage names
    AGENT_TO_STAGE_MAP = {
        "location": "location",
        "scope": "scope",
        "cost": "cost",
        "risk": "risk",
        "timeline": "risk",  # Timeline maps to risk stage for UI
        "final": "final",
    }
    
    def __init__(self, db=None):
        """Initialize FirestoreService.
        
        Args:
            db: Optional Firestore client. If not provided, uses default.
        """
        self._db = db
    
    @property
    def db(self):
        """Get Firestore client (lazy initialization)."""
        if self._db is None:
            self._db = firestore.client()
        return self._db

    async def _maybe_await(self, result: Any) -> Any:
        """Await result if it is awaitable (supports AsyncMock in unit tests)."""
        if inspect.isawaitable(result):
            return await result
        return result
    
    async def get_estimate(self, estimate_id: str) -> Optional[Dict[str, Any]]:
        """Fetch estimate document by ID.
        
        Args:
            estimate_id: The estimate document ID.
            
        Returns:
            Estimate document data or None if not found.
            
        Raises:
            TrueCostError: If Firestore operation fails.
        """
        try:
            doc_ref = self.db.collection(self.COLLECTION_ESTIMATES).document(estimate_id)
            doc = await self._maybe_await(doc_ref.get())
            
            if doc.exists:
                return {"id": doc.id, **doc.to_dict()}
            return None
            
        except Exception as e:
            logger.error("firestore_get_failed", estimate_id=estimate_id, error=str(e))
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_ERROR,
                message=f"Failed to get estimate: {str(e)}",
                details={"estimate_id": estimate_id}
            )
    
    async def update_estimate(
        self,
        estimate_id: str,
        data: Dict[str, Any]
    ) -> None:
        """Update estimate document.
        
        Args:
            estimate_id: The estimate document ID.
            data: Fields to update (supports dot notation for nested fields).
            
        Raises:
            TrueCostError: If Firestore operation fails.
        """
        try:
            doc_ref = self.db.collection(self.COLLECTION_ESTIMATES).document(estimate_id)
            
            # Add timestamp
            data["updatedAt"] = firestore.SERVER_TIMESTAMP
            
            await self._maybe_await(doc_ref.update(data))
            logger.info("estimate_updated", estimate_id=estimate_id, fields=list(data.keys()))
            
        except Exception as e:
            logger.error("firestore_update_failed", estimate_id=estimate_id, error=str(e))
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_WRITE_FAILED,
                message=f"Failed to update estimate: {str(e)}",
                details={"estimate_id": estimate_id}
            )
    
    async def update_agent_status(
        self,
        estimate_id: str,
        agent_name: str,
        status: str,
        retry: Optional[int] = None
    ) -> None:
        """Update pipeline status for an agent.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the agent.
            status: Status string (pending, running, completed, failed).
            retry: Optional retry attempt number.
        """
        update_data = {
            f"pipelineStatus.agentStatuses.{agent_name}": status,
            "pipelineStatus.currentAgent": agent_name,
            "pipelineStatus.lastUpdated": firestore.SERVER_TIMESTAMP
        }
        
        if retry is not None:
            update_data[f"pipelineStatus.retries.{agent_name}"] = retry
        
        await self.update_estimate(estimate_id, update_data)
        logger.info("agent_status_updated", estimate_id=estimate_id, agent=agent_name, status=status)

    async def sync_to_project_pipeline(
        self,
        project_id: str,
        estimate_id: str,
        current_agent: Optional[str],
        completed_agents: List[str],
        progress: int,
        status: str = "running",
        error: Optional[str] = None,
        user_id: Optional[str] = None,
        started_at: Optional[int] = None,
    ) -> None:
        """Sync pipeline status to the project collection for frontend UI.

        The frontend UI watches /projects/{projectId}/pipeline/status for
        real-time progress updates. This method syncs the Python pipeline
        status to that location.

        Args:
            project_id: The project document ID.
            estimate_id: The estimate document ID (used as pipelineId).
            current_agent: Current agent name (will be mapped to stage name).
            completed_agents: List of completed agent names.
            progress: Progress percentage (0-100).
            status: Pipeline status ('running', 'complete', 'error', 'idle').
            error: Optional error message.
            user_id: User who triggered the pipeline.
            started_at: Pipeline start timestamp (ms since epoch).
        """
        if not project_id:
            logger.warning("sync_skipped_no_project_id", estimate_id=estimate_id)
            return

        try:
            # Map agent names to stage names for the frontend
            current_stage = self.AGENT_TO_STAGE_MAP.get(current_agent) if current_agent else None
            completed_stages = [
                self.AGENT_TO_STAGE_MAP.get(agent, agent)
                for agent in completed_agents
                if agent in self.AGENT_TO_STAGE_MAP
            ]
            # Remove duplicates while preserving order
            completed_stages = list(dict.fromkeys(completed_stages))

            # Build status document matching frontend expectations
            status_data = {
                "status": status,
                "currentStage": current_stage,
                "completedStages": completed_stages,
                "progress": progress,
                "pipelineId": estimate_id,
                "projectId": project_id,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }

            if started_at:
                status_data["startedAt"] = started_at
            if user_id:
                status_data["triggeredBy"] = user_id
            if error:
                status_data["error"] = error
            if status == "complete":
                import time
                status_data["completedAt"] = int(time.time() * 1000)

            # Write to /projects/{projectId}/pipeline/status
            doc_ref = (
                self.db
                .collection(self.COLLECTION_PROJECTS)
                .document(project_id)
                .collection(self.SUBCOLLECTION_PIPELINE)
                .document("status")
            )

            await self._maybe_await(doc_ref.set(status_data, merge=True))

            logger.info(
                "project_pipeline_synced",
                project_id=project_id,
                estimate_id=estimate_id,
                status=status,
                progress=progress,
                current_stage=current_stage,
            )

        except Exception as e:
            # Don't fail the pipeline if sync fails - just log warning
            logger.warning(
                "project_pipeline_sync_failed",
                project_id=project_id,
                estimate_id=estimate_id,
                error=str(e),
            )

    async def save_agent_output(
        self,
        estimate_id: str,
        agent_name: str,
        output: Dict[str, Any],
        summary: Optional[str] = None,
        confidence: Optional[float] = None,
        tokens_used: Optional[int] = None,
        duration_ms: Optional[int] = None,
        score: Optional[int] = None
    ) -> None:
        """Save agent output to subcollection.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the agent.
            output: Agent output data.
            summary: Human-readable summary.
            confidence: Confidence score (0-1).
            tokens_used: Number of LLM tokens used.
            duration_ms: Processing duration in milliseconds.
            score: Scorer agent score (0-100).
            
        Raises:
            TrueCostError: If Firestore operation fails.
        """
        try:
            doc_ref = (
                self.db
                .collection(self.COLLECTION_ESTIMATES)
                .document(estimate_id)
                .collection(self.SUBCOLLECTION_AGENT_OUTPUTS)
                .document(agent_name)
            )
            
            agent_output_data = {
                "status": "completed",
                "output": output,
                "summary": summary,
                "confidence": confidence,
                "tokensUsed": tokens_used,
                "durationMs": duration_ms,
                "score": score,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP
            }
            
            # Remove None values
            agent_output_data = {k: v for k, v in agent_output_data.items() if v is not None}
            
            await self._maybe_await(doc_ref.set(agent_output_data))
            
            # Also update the main estimate document with agent output
            await self.update_estimate(estimate_id, {
                f"{agent_name}Output": output,
                f"pipelineStatus.agentStatuses.{agent_name}": "completed"
            })
            
            logger.info(
                "agent_output_saved",
                estimate_id=estimate_id,
                agent=agent_name,
                tokens=tokens_used,
                duration_ms=duration_ms
            )
            
        except Exception as e:
            logger.error(
                "agent_output_save_failed",
                estimate_id=estimate_id,
                agent=agent_name,
                error=str(e)
            )
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_WRITE_FAILED,
                message=f"Failed to save agent output: {str(e)}",
                details={"estimate_id": estimate_id, "agent_name": agent_name}
            )

    async def save_cost_items(
        self,
        estimate_id: str,
        items: List[Dict[str, Any]]
    ) -> int:
        """Save granular cost items to a dedicated subcollection.

        This is used to persist high-granularity BOM/material takeoff data
        without risking the Firestore 1MB document size limit on the root
        estimate document.

        Data is stored at:
          /estimates/{estimateId}/costItems/{costItemId}

        Args:
            estimate_id: The estimate document ID.
            items: List of cost item dicts. If an item has an "id" field it will
                be used as the document ID; otherwise Firestore will generate one.

        Returns:
            Number of items written.
        """
        if not items:
            return 0

        try:
            coll_ref = (
                self.db
                .collection(self.COLLECTION_ESTIMATES)
                .document(estimate_id)
                .collection(self.SUBCOLLECTION_COST_ITEMS)
            )

            batch = self.db.batch()
            written = 0

            for item in items:
                if not isinstance(item, dict):
                    continue

                item_id = item.get("id")
                doc_ref = coll_ref.document(item_id) if item_id else coll_ref.document()

                data = {**item}
                data["updatedAt"] = firestore.SERVER_TIMESTAMP
                if "createdAt" not in data:
                    data["createdAt"] = firestore.SERVER_TIMESTAMP

                batch.set(doc_ref, data, merge=True)
                written += 1

            if written:
                await self._maybe_await(batch.commit())

            return written
        except Exception as e:
            logger.error("cost_items_save_failed", estimate_id=estimate_id, error=str(e))
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_WRITE_FAILED,
                message=f"Failed to save cost items: {str(e)}",
                details={"estimate_id": estimate_id}
            )

    async def list_cost_items(
        self,
        estimate_id: str,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """List granular cost items for an estimate.

        Args:
            estimate_id: The estimate document ID.
            limit: Optional maximum number of items to return.

        Returns:
            List of cost item documents (each includes "id").
        """
        try:
            coll_ref = (
                self.db
                .collection(self.COLLECTION_ESTIMATES)
                .document(estimate_id)
                .collection(self.SUBCOLLECTION_COST_ITEMS)
            )

            query = coll_ref
            if limit is not None:
                query = query.limit(int(limit))

            docs = query.stream()
            results: List[Dict[str, Any]] = []
            for doc in docs:
                results.append({"id": doc.id, **(doc.to_dict() or {})})
            return results
        except Exception as e:
            logger.error("cost_items_list_failed", estimate_id=estimate_id, error=str(e))
            return []
    
    async def get_agent_output(
        self,
        estimate_id: str,
        agent_name: str
    ) -> Optional[Dict[str, Any]]:
        """Get agent output from subcollection.
        
        Args:
            estimate_id: The estimate document ID.
            agent_name: Name of the agent.
            
        Returns:
            Agent output data or None if not found.
        """
        try:
            doc_ref = (
                self.db
                .collection(self.COLLECTION_ESTIMATES)
                .document(estimate_id)
                .collection(self.SUBCOLLECTION_AGENT_OUTPUTS)
                .document(agent_name)
            )
            
            doc = await self._maybe_await(doc_ref.get())
            if doc.exists:
                return doc.to_dict()
            return None
            
        except Exception as e:
            logger.error(
                "agent_output_get_failed",
                estimate_id=estimate_id,
                agent=agent_name,
                error=str(e)
            )
            return None
    
    async def delete_estimate(self, estimate_id: str) -> None:
        """Delete estimate and all subcollections.
        
        Args:
            estimate_id: The estimate document ID.
            
        Raises:
            TrueCostError: If Firestore operation fails.
        """
        try:
            estimate_ref = self.db.collection(self.COLLECTION_ESTIMATES).document(estimate_id)
            
            # Delete subcollections
            subcollections = [
                self.SUBCOLLECTION_AGENT_OUTPUTS,
                self.SUBCOLLECTION_COST_ITEMS,
                self.SUBCOLLECTION_CONVERSATIONS,
                self.SUBCOLLECTION_VERSIONS
            ]
            
            for subcollection_name in subcollections:
                subcollection = estimate_ref.collection(subcollection_name)
                docs = subcollection.stream()  # Synchronous generator
                for doc in docs:
                    await self._maybe_await(doc.reference.delete())
            
            # Delete main document
            await self._maybe_await(estimate_ref.delete())
            
            logger.info("estimate_deleted", estimate_id=estimate_id)
            
        except Exception as e:
            logger.error("estimate_delete_failed", estimate_id=estimate_id, error=str(e))
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_ERROR,
                message=f"Failed to delete estimate: {str(e)}",
                details={"estimate_id": estimate_id}
            )
    
    async def create_estimate(
        self,
        estimate_id: str,
        user_id: str,
        clarification_output: Dict[str, Any]
    ) -> str:
        """Create a new estimate document.
        
        Args:
            estimate_id: The estimate document ID.
            user_id: The user's ID.
            clarification_output: ClarificationOutput from Dev 3.
            
        Returns:
            The created estimate ID.
        """
        try:
            doc_ref = self.db.collection(self.COLLECTION_ESTIMATES).document(estimate_id)
            
            estimate_data = {
                "userId": user_id,
                "status": "processing",
                "clarificationOutput": clarification_output,
                "pipelineStatus": {
                    "currentAgent": None,
                    "completedAgents": [],
                    "progress": 0,
                    "agentStatuses": {},
                    "scores": {},
                    "retries": {}
                },
                "createdAt": firestore.SERVER_TIMESTAMP,
                "updatedAt": firestore.SERVER_TIMESTAMP
            }
            
            await self._maybe_await(doc_ref.set(estimate_data))
            logger.info("estimate_created", estimate_id=estimate_id, user_id=user_id)
            
            return estimate_id
            
        except Exception as e:
            logger.error("estimate_create_failed", estimate_id=estimate_id, error=str(e))
            raise TrueCostError(
                code=ErrorCode.FIRESTORE_WRITE_FAILED,
                message=f"Failed to create estimate: {str(e)}",
                details={"estimate_id": estimate_id}
            )
