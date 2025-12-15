"""
Export a single estimate document (including deep pipeline outputs) from Firestore to JSON.

This is intended for debugging the Deep Pipeline locally (especially with the Firestore emulator),
so you can inspect `scopeOutput`, `costOutput`, `finalOutput`, etc.

Usage (Firestore emulator):
  # Firestore emulator default host/port is usually 127.0.0.1:8080
  $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
  $env:GCLOUD_PROJECT="collabcanvas-dev"
  python scripts/export_estimate.py --estimate-id est-... --out d:\\Jarvis\\Downloads\\estimate-export.json
"""

from __future__ import annotations

import argparse
import json
import os
import socket
from datetime import datetime
from typing import Any, Dict


def _json_safe(value: Any) -> Any:
    """Best-effort conversion of Firestore types to JSON-serializable values."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]

    # Firestore python types can be tricky across versions; avoid hard deps.
    tname = type(value).__name__
    if tname in {"DatetimeWithNanoseconds"}:
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    if tname in {"DocumentReference", "GeoPoint"}:
        return str(value)

    # Fallback: stringify unknown objects
    return str(value)


def _check_emulator_reachable() -> None:
    """Fail fast if FIRESTORE_EMULATOR_HOST is set but not reachable.

    firebase-admin will otherwise block on network calls which feels like a hang.
    """
    host = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not host:
        return
    if ":" not in host:
        return
    h, p = host.rsplit(":", 1)
    try:
        port = int(p)
    except Exception:
        return

    try:
        with socket.create_connection((h, port), timeout=1.5):
            return
    except Exception as e:
        raise RuntimeError(
            f"FIRESTORE_EMULATOR_HOST is set to '{host}' but it's not reachable. "
            f"Is the Firestore emulator running? Underlying error: {e}"
        )


def _strip_large_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove very large fields that make exports slow (e.g., base64 images)."""
    def _strip_path(d: Dict[str, Any], path: list[str]) -> Dict[str, Any]:
        """Strip a large string field at a given nested path (best-effort)."""
        cur: Any = d
        parents: list[tuple[Dict[str, Any], str]] = []
        for key in path[:-1]:
            if not isinstance(cur, dict) or key not in cur:
                return d
            parents.append((cur, key))
            cur = cur.get(key)
        leaf_key = path[-1]
        if not isinstance(cur, dict) or leaf_key not in cur:
            return d
        leaf_val = cur.get(leaf_key)
        if not (isinstance(leaf_val, str) and len(leaf_val) > 50000):
            return d

        # Rebuild only the necessary nested dicts (shallow copies) so we don't mutate the original input.
        new_root: Dict[str, Any] = dict(d)
        rebuilt: Dict[str, Any] = new_root
        for parent, key in parents:
            child = parent.get(key)
            if not isinstance(child, dict):
                return d
            child_copy = dict(child)
            rebuilt[key] = child_copy
            rebuilt = child_copy

        rebuilt[leaf_key] = f\"<<stripped: {'.'.join(path)} length={len(leaf_val)}>>\"
        return new_root

    try:
        # Common locations where the base64 CAD image shows up (snake_case and camelCase).
        for p in [
            [\"cadData\", \"fileUrl\"],
            [\"cad_data\", \"fileUrl\"],
            [\"clarificationOutput\", \"cadData\", \"fileUrl\"],
            [\"clarificationOutput\", \"cad_data\", \"fileUrl\"],
        ]:
            data = _strip_path(data, p)
    except Exception:
        return data
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Export Firestore estimates/{estimateId} to JSON")
    parser.add_argument("--estimate-id", required=True, help="Estimate document ID (e.g., est_... or est-...)")
    parser.add_argument("--out", required=False, help="Output file path (defaults to ./estimate-export.json)")
    parser.add_argument(
        "--project-id",
        required=False,
        help="GCP/Firebase project id (if not set, uses GCLOUD_PROJECT / FIREBASE_PROJECT_ID)",
    )
    parser.add_argument(
        "--strip-large",
        action="store_true",
        help="Strip large fields (e.g., cadData.fileUrl base64) to speed up export",
    )
    args = parser.parse_args()

    out_path = args.out or "estimate-export.json"
    project_id = (
        args.project_id
        or os.environ.get("GCLOUD_PROJECT")
        or os.environ.get("FIREBASE_PROJECT_ID")
        or os.environ.get("FIREBASE_PROJECT")
        or "collabcanvas-dev"
    )

    # Import firebase_admin lazily so this script can still display help without deps.
    import firebase_admin
    from firebase_admin import firestore  # type: ignore

    try:
        _check_emulator_reachable()
    except Exception as e:
        print(str(e))
        return 3

    if not firebase_admin._apps:
        # For emulator usage, credentials are not required. Providing projectId helps routing.
        firebase_admin.initialize_app(options={"projectId": project_id})

    db = firestore.client()
    doc_ref = db.collection("estimates").document(args.estimate_id)
    snap = doc_ref.get()

    if not snap.exists:
        print(f"Estimate not found: estimates/{args.estimate_id}")
        return 2

    data: Dict[str, Any] = snap.to_dict() or {}
    if args.strip_large:
        data = _strip_large_fields(data)

    export = {
        "estimateId": args.estimate_id,
        "projectId": project_id,
        "exportedAt": datetime.utcnow().isoformat() + "Z",
        "data": _json_safe(data),
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, sort_keys=True)

    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


