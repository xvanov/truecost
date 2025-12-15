"""Code Compliance Critic for TrueCost.

Provides qualitative feedback when CodeComplianceAgent output scores below threshold.
"""

from typing import Any, Dict, List, Optional
import structlog

from agents.critics.base_critic import BaseCritic
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


class CodeComplianceCritic(BaseCritic):
    """Critic for CodeComplianceAgent output."""

    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
    ):
        super().__init__(
            name="code_compliance_critic",
            primary_agent_name="code_compliance",
            firestore_service=firestore_service,
            llm_service=llm_service,
        )

    def get_critique_prompt(self) -> str:
        return """You are a building code compliance reviewer.

Your job is to improve the quality of ICC-based warning output for a construction project.

Focus on:
- Missing key fields (severity/title/details)
- Vague warnings that lack "what to check next"
- Overconfident claims (must acknowledge AHJ/local amendments)
- Clear mapping to affected work categories (plumbing/electrical/structural/etc.)
"""

    async def analyze_output(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any],
        score: int,
        scorer_feedback: str,
    ) -> Dict[str, Any]:
        issues: List[str] = []
        why_wrong: List[str] = []
        how_to_fix: List[str] = []

        warnings = output.get("warnings")
        if not isinstance(warnings, list):
            issues.append("warnings is not a list")
            why_wrong.append("The client expects warnings as a list for rendering")
            how_to_fix.append("Return warnings as an array of objects")
            return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix}

        for w in (warnings or [])[:10]:
            if not isinstance(w, dict):
                issues.append("One or more warnings are not objects")
                why_wrong.append("Each warning must be a structured object")
                how_to_fix.append("Ensure each warning is a JSON object with severity/title/details")
                break
            if not w.get("severity") or not w.get("title") or not w.get("details"):
                issues.append("Some warnings are missing required fields (severity/title/details)")
                why_wrong.append("Missing fields prevent reliable display and triage")
                how_to_fix.append("Include severity, title, and details for every warning")
                break

        disclaimer = output.get("disclaimer", "")
        if "AHJ" not in disclaimer and "authority" not in disclaimer.lower():
            issues.append("Disclaimer does not mention AHJ/local amendments")
            why_wrong.append("Code requirements vary by jurisdiction and local amendments")
            how_to_fix.append("Add a disclaimer noting local amendments and AHJ determination")

        return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix} if issues else {}



