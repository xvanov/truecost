"""Unit tests for FirestoreAgentFsBackend (Deep Agents filesystem backend)."""

from __future__ import annotations

import pytest

from services.deep_agents_backend import FirestoreAgentFsBackend


class _FakeDoc:
    def __init__(self, doc_id: str, store: dict):
        self._id = doc_id
        self._store = store
        self.exists = doc_id in store

    def get(self):
        self.exists = self._id in self._store
        return self

    def to_dict(self):
        return self._store.get(self._id)

    def set(self, data, merge=False):  # noqa: ANN001
        if merge and self._id in self._store:
            self._store[self._id] = {**self._store[self._id], **data}
        else:
            self._store[self._id] = dict(data)
        self.exists = True


class _FakeCollection:
    def __init__(self, store: dict):
        self._store = store

    def document(self, doc_id: str):
        return _FakeDoc(doc_id, self._store)

    def stream(self):
        # emulate Firestore stream() yielding docs with .to_dict()
        for doc_id in list(self._store.keys()):
            d = _FakeDoc(doc_id, self._store)
            d.get()
            yield d


class _FakeDb:
    def __init__(self):
        self._files = {}

    def collection(self, name: str):
        return _FakeDbPath(self).collection(name)

class _FakeDbPath:
    """Chainable Firestore-like path object that resolves the final 'files' collection."""

    def __init__(self, db: _FakeDb):
        self._db = db
        self._last_collection: str | None = None

    def collection(self, name: str):
        self._last_collection = name
        if name == "files":
            return _FakeCollection(self._db._files)
        return self

    def document(self, _doc_id: str):  # noqa: ANN001
        return self



@pytest.mark.asyncio
async def test_backend_write_read_edit_ls_and_grep():
    db = _FakeDb()
    backend = FirestoreAgentFsBackend(db=db, estimate_id="est-1", agent_name="location")

    # write + read
    wr = backend.write("/memories/note.txt", "hello\nworld\n")
    assert wr.error is None
    read = backend.read("/memories/note.txt")
    assert "L1:hello" in read
    assert "L2:world" in read

    # edit
    er = backend.edit("/memories/note.txt", "world", "there")
    assert er.error is None
    assert backend.read("/memories/note.txt").endswith("L2:there")

    # ls
    root = backend.ls_info("/memories")
    def _path(fi):
        return fi.get("path") if isinstance(fi, dict) else getattr(fi, "path", "")

    assert any(str(_path(f)).endswith("/memories/note.txt") for f in root)

    # grep
    matches = backend.grep_raw("there", path="/memories")
    assert isinstance(matches, list)
    def _m_path(m):
        return m.get("path") if isinstance(m, dict) else getattr(m, "path", "")

    def _m_line(m):
        return m.get("line") if isinstance(m, dict) else getattr(m, "line", None)

    assert any(str(_m_path(m)).endswith("/memories/note.txt") and _m_line(m) == 2 for m in matches)


