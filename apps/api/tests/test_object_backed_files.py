from dataclasses import dataclass

from apps.api.app.object_backed_files import (
    ObjectBackedFile,
    build_object_key,
    preview_payload_for_file,
    store_object_for_record,
)
from apps.api.app.object_storage import InMemoryObjectStorage


@dataclass
class FileRecord:
    id: int
    conversation_id: int
    filename: str
    content_type: str
    size: int = 0
    bucket: str = ""
    object_key: str = ""


def test_object_backed_file_store_writes_metadata_and_builds_preview_payloads():
    storage = InMemoryObjectStorage()
    record = FileRecord(
        id=42,
        conversation_id=7,
        filename="brief.md",
        content_type="text/markdown",
    )

    stored = store_object_for_record(
        storage=storage,
        record=record,
        collection="artifacts",
        bucket="minimalist-agent",
        content=b"# Brief",
    )
    preview = preview_payload_for_file(storage=storage, file=stored)

    assert record.size == len(b"# Brief")
    assert record.bucket == "minimalist-agent"
    assert record.object_key == "artifacts/7/42/brief.md"
    assert stored == ObjectBackedFile(
        id=42,
        conversation_id=7,
        filename="brief.md",
        content_type="text/markdown",
        size=len(b"# Brief"),
        bucket="minimalist-agent",
        object_key="artifacts/7/42/brief.md",
    )
    assert preview.text == "# Brief"
    assert preview.data_url is None


def test_object_key_builder_names_domain_collection():
    assert build_object_key(
        collection="run-attachments",
        conversation_id=3,
        file_id=9,
        filename="notes.txt",
    ) == "run-attachments/3/9/notes.txt"
