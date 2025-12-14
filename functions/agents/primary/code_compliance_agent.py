"""Code Compliance Agent for TrueCost.

Generates ICC (IBC/IRC/IECC family) code-related warnings based on project context.

Notes:
- This agent provides *warnings*, not permitting/legal determinations.
- It must not invent jurisdiction-specific requirements when inputs are missing.
"""

from typing import Any, Dict, List, Optional
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


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


class CodeComplianceAgent(BaseA2AAgent):
    """Generates ICC code compliance warnings for the final report."""

    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
    ):
        super().__init__(
            name="code_compliance",
            firestore_service=firestore_service,
            llm_service=llm_service,
        )

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

        # Build a compact context to avoid token bloat.
        context = {
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
                # Prefer richer scope info if present; fall back to high-level division list.
                "totalLineItems": scope_output.get("totalLineItems"),
                "divisions": scope_output.get("divisions"),
                "summary": scope_output.get("summary"),
            },
            "costSummary": {
                "totalCost": cost_output.get("totalCost"),
                "materials": cost_output.get("materials"),
                "labor": cost_output.get("labor"),
            },
            "criticFeedback": feedback,
        }

        logger.info(
            "code_compliance_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None,
        )

        from services.deep_agent_factory import deep_agent_generate_json

        llm = await deep_agent_generate_json(
            estimate_id=estimate_id,
            agent_name=self.name,
            system_prompt=ICC_CODE_COMPLIANCE_PROMPT,
            user_message=(
                "CODE_COMPLIANCE_REQUEST\n\n"
                "Generate ICC code compliance warnings for this project context:\n"
                f"{context}"
            ),
            firestore_service=self.firestore,
            max_tokens=1200,
        )

        content = llm.get("content", {}) or {}
        warnings: List[Dict[str, Any]] = content.get("warnings") or []

        return {
            "estimateId": estimate_id,
            "codeSystem": content.get("codeSystem", "ICC"),
            "jurisdiction": content.get("jurisdiction", context.get("location")),
            "warnings": warnings,
            "disclaimer": content.get(
                "disclaimer",
                "These are informational considerations based on ICC code families. "
                "Final requirements depend on local amendments and the authority having jurisdiction (AHJ).",
            ),
        }


