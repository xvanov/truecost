"""Deep Agents Firestore-backed filesystem backend.

This module implements a Deep Agents backend that stores "files" in Firestore so
agent planning/artifacts can persist across retries and pipeline runs.

Paths are treated as absolute POSIX-style paths, e.g. "/memories/notes.md".
All files are scoped to (estimate_id, agent_name).
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from fnmatch import fnmatch
from typing import Any, Dict, List, Optional

import structlog

from firebase_admin import firestore

try:
    # Deep Agents backend protocol + shared types
    from deepagents.backends.protocol import BackendProtocol, WriteResult, EditResult
    from deepagents.backends.utils import FileInfo, GrepMatch
except Exception:  # pragma: no cover - imported at runtime when deepagents installed
    BackendProtocol = object  # type: ignore

    @dataclass
    class FileInfo:  # type: ignore
        path: str
        is_dir: bool = False
        size: Optional[int] = None
        modified_at: Optional[str] = None

    @dataclass
    class GrepMatch:  # type: ignore
        path: str
        line: int
        text: str

    @dataclass
    class WriteResult:  # type: ignore
        error: Optional[str] = None
        path: Optional[str] = None
        files_update: Optional[Dict[str, Any]] = None

    @dataclass
    class EditResult:  # type: ignore
        error: Optional[str] = None
        path: Optional[str] = None
        files_update: Optional[Dict[str, Any]] = None
        occurrences: Optional[int] = None


logger = structlog.get_logger(__name__)


def _fileinfo_get(fi: Any, key: str, default: Any = None) -> Any:
    if isinstance(fi, dict):
        return fi.get(key, default)
    return getattr(fi, key, default)


def _fileinfo_set(fi: Any, key: str, value: Any) -> None:
    if isinstance(fi, dict):
        fi[key] = value
        return
    setattr(fi, key, value)


def _fileinfo_make(**kwargs: Any) -> Any:
    """Create a FileInfo compatible with Deep Agents' expected type.

    In some deepagents versions, FileInfo is a TypedDict (dict-like). In others,
    it may be a dataclass/object. We support both.
    """
    try:
        # If FileInfo is a TypedDict alias, calling it returns a dict.
        return FileInfo(**kwargs)  # type: ignore[misc]
    except Exception:
        return dict(kwargs)


def _fileinfo_path(fi: Any) -> str:
    p = _fileinfo_get(fi, "path")
    return str(p or "")


def _grep_match_make(**kwargs: Any) -> Any:
    try:
        return GrepMatch(**kwargs)  # type: ignore[misc]
    except Exception:
        return dict(kwargs)


def _normalize_path(path: str) -> str:
    if not path:
        return "/"
    if not path.startswith("/"):
        path = "/" + path
    # collapse multiple slashes
    path = re.sub(r"/{2,}", "/", path)
    # remove trailing slash (except root)
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return path


def _doc_id_for_path(path: str) -> str:
    return hashlib.sha1(path.encode("utf-8")).hexdigest()


class FirestoreAgentFsBackend(BackendProtocol):
    """Firestore-backed Deep Agents filesystem.

    Stored at:
      /estimates/{estimateId}/agentFs/{agentName}/files/{sha1(path)}
    """

    SUBCOLLECTION_AGENT_FS = "agentFs"
    SUBCOLLECTION_FILES = "files"

    def __init__(self, db: Any, estimate_id: str, agent_name: str):
        self._db = db
        self._estimate_id = estimate_id
        self._agent_name = agent_name

    # ----------------------------
    # Firestore helpers
    # ----------------------------
    def _files_collection(self):
        return (
            self._db.collection("estimates")
            .document(self._estimate_id)
            .collection(self.SUBCOLLECTION_AGENT_FS)
            .document(self._agent_name)
            .collection(self.SUBCOLLECTION_FILES)
        )

    def _get_file_doc(self, file_path: str):
        file_path = _normalize_path(file_path)
        return self._files_collection().document(_doc_id_for_path(file_path))

    def _load_all_files(self) -> List[Dict[str, Any]]:
        # Note: for now we load all documents; expected small per agent.
        docs = self._files_collection().stream()
        out: List[Dict[str, Any]] = []
        for d in docs:
            data = d.to_dict() or {}
            out.append(data)
        return out

    def _get_file_content(self, file_path: str) -> Optional[str]:
        doc = self._get_file_doc(file_path).get()
        if not getattr(doc, "exists", False):
            return None
        data = doc.to_dict() or {}
        return data.get("content")

    # ----------------------------
    # BackendProtocol required methods
    # ----------------------------
    def ls_info(self, path: str) -> List[FileInfo]:
        path = _normalize_path(path)
        prefix = path if path.endswith("/") else (path + "/") if path != "/" else "/"

        files = self._load_all_files()
        children: Dict[str, FileInfo] = {}

        for f in files:
            p = _normalize_path(str(f.get("path", "")))
            if not p.startswith(prefix):
                continue
            remainder = p[len(prefix) :]
            if remainder == "":
                continue
            first = remainder.split("/", 1)[0]
            child_path = _normalize_path(prefix + first)
            is_dir = "/" in remainder

            if child_path not in children:
                children[child_path] = _fileinfo_make(
                    path=child_path,
                    is_dir=is_dir,
                    size=None,
                    modified_at=None,
                )

            # If any file indicates it's a directory, mark it
            if is_dir:
                _fileinfo_set(children[child_path], "is_dir", True)
            else:
                # File metadata
                content = f.get("content", "")
                try:
                    _fileinfo_set(
                        children[child_path],
                        "size",
                        int(f.get("size")) if f.get("size") is not None else len(content),
                    )
                except Exception:
                    _fileinfo_set(children[child_path], "size", len(content))
                _fileinfo_set(children[child_path], "modified_at", f.get("updatedAtIso") or None)

        return [children[k] for k in sorted(children.keys())]

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> str:
        file_path = _normalize_path(file_path)
        content = self._get_file_content(file_path)
        if content is None:
            return f"Error: File '{file_path}' not found"

        lines = content.splitlines()
        start = max(int(offset), 0)
        end = min(start + max(int(limit), 0), len(lines))
        numbered: List[str] = []
        for idx in range(start, end):
            numbered.append(f"L{idx+1}:{lines[idx]}")
        return "\n".join(numbered) if numbered else ""

    def glob_info(self, pattern: str, path: str = "/") -> List[FileInfo]:
        path = _normalize_path(path)
        files = self._load_all_files()
        results: List[FileInfo] = []
        for f in files:
            p = _normalize_path(str(f.get("path", "")))
            if not p.startswith(path if path.endswith("/") else (path + "/") if path != "/" else "/"):
                continue
            if fnmatch(p, pattern) or fnmatch(p[len(path) :] if p.startswith(path) else p, pattern):
                content = f.get("content", "")
                results.append(
                    _fileinfo_make(
                        path=p,
                        is_dir=False,
                        size=len(content),
                        modified_at=f.get("updatedAtIso") or None,
                    )
                )
        return sorted(results, key=_fileinfo_path)

    def grep_raw(self, pattern: str, path: Optional[str] = None, glob: Optional[str] = None) -> List[GrepMatch] | str:
        try:
            rx = re.compile(pattern)
        except re.error as e:
            return f"Invalid regex pattern: {e}"

        base_path = _normalize_path(path or "/")
        files = self._load_all_files()
        matches: List[GrepMatch] = []

        for f in files:
            p = _normalize_path(str(f.get("path", "")))
            if not p.startswith(base_path if base_path.endswith("/") else (base_path + "/") if base_path != "/" else "/"):
                continue
            if glob and not fnmatch(p, glob):
                continue
            content = str(f.get("content") or "")
            for i, line in enumerate(content.splitlines(), start=1):
                if rx.search(line):
                    matches.append(_grep_match_make(path=p, line=i, text=line))
        return matches

    def write(self, file_path: str, content: str) -> WriteResult:
        file_path = _normalize_path(file_path)
        doc_ref = self._get_file_doc(file_path)
        doc = doc_ref.get()
        if getattr(doc, "exists", False):
            return WriteResult(error=f"Error: File '{file_path}' already exists", path=file_path, files_update=None)

        now = datetime.utcnow().isoformat() + "Z"
        doc_ref.set(
            {
                "path": file_path,
                "content": content,
                "size": len(content),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedAtIso": now,
                "createdAt": firestore.SERVER_TIMESTAMP,
                "createdAtIso": now,
            },
            merge=False,
        )
        return WriteResult(error=None, path=file_path, files_update=None)

    def edit(self, file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> EditResult:
        file_path = _normalize_path(file_path)
        doc_ref = self._get_file_doc(file_path)
        doc = doc_ref.get()
        if not getattr(doc, "exists", False):
            return EditResult(error=f"Error: File '{file_path}' not found", path=file_path, files_update=None, occurrences=None)

        data = doc.to_dict() or {}
        content = str(data.get("content") or "")
        if old_string not in content:
            return EditResult(error="Error: old_string not found", path=file_path, files_update=None, occurrences=0)

        occurrences = content.count(old_string)
        if not replace_all and occurrences != 1:
            return EditResult(
                error=f"Error: old_string must be unique (found {occurrences} occurrences). Use replace_all=True to replace all.",
                path=file_path,
                files_update=None,
                occurrences=occurrences,
            )

        updated = content.replace(old_string, new_string) if replace_all else content.replace(old_string, new_string, 1)
        now = datetime.utcnow().isoformat() + "Z"
        doc_ref.set(
            {
                "path": file_path,
                "content": updated,
                "size": len(updated),
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "updatedAtIso": now,
            },
            merge=True,
        )
        return EditResult(error=None, path=file_path, files_update=None, occurrences=occurrences if replace_all else 1)


