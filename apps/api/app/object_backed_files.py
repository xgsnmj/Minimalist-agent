from __future__ import annotations

import base64
from collections.abc import Iterator
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from apps.api.app.object_storage import ObjectStorage


class FilePreviewType(StrEnum):
    MARKDOWN = "markdown"
    PLAINTEXT = "plaintext"
    IMAGE = "image"
    PDF = "pdf"
    CODE = "code"
    TABLE = "table"
    JSON = "json"
    HTML = "html"
    DOWNLOAD = "download"


@dataclass(frozen=True)
class ObjectBackedFile:
    id: int
    conversation_id: int
    filename: str
    content_type: str
    size: int
    bucket: str
    object_key: str


@dataclass(frozen=True)
class FilePreviewPayload:
    text: str | None = None
    data_url: str | None = None


TEXT_PREVIEW_MAX_BYTES = 256 * 1024
BINARY_INLINE_PREVIEW_MAX_BYTES = 1024 * 1024


class ObjectBackedRecord(Protocol):
    id: int
    conversation_id: int
    filename: str
    content_type: str
    size: int
    bucket: str
    object_key: str


def build_object_key(
    *,
    collection: str,
    conversation_id: int,
    file_id: int,
    filename: str,
) -> str:
    return f"{collection}/{conversation_id}/{file_id}/{filename}"


def store_object_for_record(
    *,
    storage: ObjectStorage,
    record: ObjectBackedRecord,
    collection: str,
    bucket: str,
    content: bytes,
) -> ObjectBackedFile:
    object_key = build_object_key(
        collection=collection,
        conversation_id=record.conversation_id,
        file_id=record.id,
        filename=record.filename,
    )
    stored = storage.put_bytes(
        bucket=bucket,
        object_key=object_key,
        content=content,
        content_type=record.content_type,
    )
    record.size = stored.size
    record.bucket = stored.bucket
    record.object_key = stored.object_key
    return object_backed_file_from_record(record)


def object_backed_file_from_record(record: ObjectBackedRecord) -> ObjectBackedFile:
    return ObjectBackedFile(
        id=record.id,
        conversation_id=record.conversation_id,
        filename=record.filename,
        content_type=record.content_type,
        size=record.size,
        bucket=record.bucket,
        object_key=record.object_key,
    )


def preview_payload_for_file(
    *,
    storage: ObjectStorage,
    file: ObjectBackedFile,
    preview_type: FilePreviewType | None = None,
) -> FilePreviewPayload:
    resolved_preview_type = preview_type or preview_type_for_content_type(
        file.content_type,
        file.filename,
    )

    if resolved_preview_type in {
        FilePreviewType.MARKDOWN,
        FilePreviewType.PLAINTEXT,
        FilePreviewType.CODE,
        FilePreviewType.TABLE,
        FilePreviewType.JSON,
        FilePreviewType.HTML,
    }:
        body = storage.get_bytes_range(
            bucket=file.bucket,
            object_key=file.object_key,
            length=TEXT_PREVIEW_MAX_BYTES,
        )
        return FilePreviewPayload(text=body.decode("utf-8", errors="replace"))

    if resolved_preview_type in {FilePreviewType.IMAGE, FilePreviewType.PDF}:
        if file.size > BINARY_INLINE_PREVIEW_MAX_BYTES:
            return FilePreviewPayload()
        body = storage.get_bytes(bucket=file.bucket, object_key=file.object_key)
        return FilePreviewPayload(
            data_url=(
                f"data:{file.content_type};base64,"
                f"{base64.b64encode(body).decode('ascii')}"
            )
        )

    return FilePreviewPayload()


def read_object_bytes(*, storage: ObjectStorage, file: ObjectBackedFile) -> bytes:
    return storage.get_bytes(bucket=file.bucket, object_key=file.object_key)


def iter_object_bytes(
    *,
    storage: ObjectStorage,
    file: ObjectBackedFile,
    chunk_size: int = 1024 * 1024,
) -> Iterator[bytes]:
    return storage.iter_bytes(
        bucket=file.bucket,
        object_key=file.object_key,
        chunk_size=chunk_size,
    )


def preview_type_for_content_type(content_type: str, filename: str) -> FilePreviewType:
    normalized_content_type = content_type.lower()
    normalized_filename = filename.lower()
    if normalized_content_type == "text/markdown" or normalized_filename.endswith((".md", ".markdown")):
        return FilePreviewType.MARKDOWN
    if normalized_content_type in {"text/html", "application/xhtml+xml"} or normalized_filename.endswith((".html", ".htm")):
        return FilePreviewType.HTML
    if normalized_content_type in {"text/csv", "application/csv", "text/tab-separated-values"} or normalized_filename.endswith((".csv", ".tsv")):
        return FilePreviewType.TABLE
    if normalized_content_type in {"application/json", "text/json"} or normalized_filename.endswith(".json"):
        return FilePreviewType.JSON
    if normalized_filename.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".css", ".yaml", ".yml", ".toml", ".jsonl")):
        return FilePreviewType.CODE
    if normalized_content_type.startswith("image/"):
        return FilePreviewType.IMAGE
    if normalized_content_type == "application/pdf" or normalized_filename.endswith(".pdf"):
        return FilePreviewType.PDF
    if normalized_content_type.startswith("text/"):
        return FilePreviewType.PLAINTEXT
    return FilePreviewType.DOWNLOAD
