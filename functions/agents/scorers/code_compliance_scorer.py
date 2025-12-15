"""Code Compliance Scorer for TrueCost.

Scores CodeComplianceAgent output for structural completeness.
"""

from typing import Any, Dict, List, Optional
import structlog

from agents.scorers.base_scorer import BaseScorer
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


class CodeComplianceScorer(BaseScorer):
    """Objective scoring for code compliance warnings output."""

    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
    ):
        super().__init__(
            name="code_compliance_scorer",
            primary_agent_name="code_compliance",
            firestore_service=firestore_service,
            llm_service=llm_service,
        )

    def get_scoring_criteria(self) -> List[Dict[str, Any]]:
        return [
            {"name": "has_code_system", "weight": 2},
            {"name": "has_jurisdiction", "weight": 2},
            {"name": "warnings_are_list", "weight": 3},
            {"name": "warnings_have_min_fields", "weight": 3},
        ]

    async def evaluate_criterion(
        self,
        criterion: Dict[str, Any],
        output: Dict[str, Any],
        input_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        name = criterion.get("name")

        if name == "has_code_system":
            ok = (output.get("codeSystem") in ["ICC", "IBC", "IRC", "IECC"]) or bool(output.get("codeSystem"))
            return {"score": 100 if ok else 0, "feedback": "codeSystem present" if ok else "Missing codeSystem"}

        if name == "has_jurisdiction":
            juris = output.get("jurisdiction")
            ok = isinstance(juris, dict) and any(juris.get(k) for k in ["state", "city", "zipCode"])
            return {"score": 100 if ok else 50, "feedback": "Jurisdiction present" if ok else "Jurisdiction missing/empty"}

        if name == "warnings_are_list":
            warnings = output.get("warnings")
            ok = isinstance(warnings, list)
            return {"score": 100 if ok else 0, "feedback": "warnings is list" if ok else "warnings must be a list"}

        if name == "warnings_have_min_fields":
            warnings = output.get("warnings") or []
            if not isinstance(warnings, list):
                return {"score": 0, "feedback": "warnings must be a list"}
            if len(warnings) == 0:
                # Acceptable: some projects may have no warnings; score based on structure.
                return {"score": 80, "feedback": "No warnings returned (acceptable if scope is minimal)"}

            required = {"severity", "title", "details"}
            valid = 0
            for w in warnings[:20]:
                if isinstance(w, dict) and required.issubset(set(w.keys())):
                    valid += 1
            ratio = valid / max(1, min(20, len(warnings)))
            return {"score": int(100 * ratio), "feedback": f"{valid} warnings have required fields"}

        return {"score": 0, "feedback": "Unknown criterion"}



