from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.artifacts import ArtifactPreviewType, preview_type_for_content_type
from apps.api.app.database import Base, SessionLocal, engine
from apps.api.app.object_storage import object_storage


class RunAttachmentCreateRequest(BaseModel):
    filename: str = Field(min_length=1)
    content_type: str = Field(min_length=1)
    body: str


class RunAttachmentResponse(BaseModel):
    id: int
    conversation_id: int
    filename: str
    content_type: str
    size: int
    preview_type: ArtifactPreviewType


class RunAttachmentPreviewResponse(BaseModel):
    attachment_id: int
    filename: str
    content_type: str
    preview_type: ArtifactPreviewType
    text: str | None = None


class RunAttachmentRecord(Base):
    __tablename__ = "run_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    run_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    preview_type: Mapped[str] = mapped_column(String(32), nullable=False)
    record_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSON,
        nullable=False,
        default=dict,
    )


@dataclass
class RunAttachment:
    id: int
    conversation_id: int
    run_id: int | None
    filename: str
    content_type: str
    size: int
    bucket: str
    object_key: str
    preview_type: ArtifactPreviewType
    metadata: dict[str, Any] = field(default_factory=dict)


class RunAttachmentStore:
    def create(
        self,
        *,
        conversation_id: int,
        run_id: int | None,
        filename: str,
        content_type: str,
        body: bytes,
    ) -> RunAttachment:
        with SessionLocal() as session:
            record = RunAttachmentRecord(
                conversation_id=conversation_id,
                run_id=run_id,
                filename=filename,
                content_type=content_type,
                size=0,
                bucket="",
                object_key="",
                preview_type=preview_type_for_content_type(content_type, filename).value,
                record_metadata={},
            )
            session.add(record)
            session.flush()
            object_key = self._build_object_key(record.id, conversation_id, filename)
            stored = object_storage.put_bytes(
                bucket="minimalist-agent",
                object_key=object_key,
                content=body,
                content_type=content_type,
            )
            record.size = stored.size
            record.bucket = stored.bucket
            record.object_key = stored.object_key
            session.commit()
            session.refresh(record)
            return self._attachment_from_record(record)

    def get(self, attachment_id: int) -> RunAttachment:
        with SessionLocal() as session:
            record = session.get(RunAttachmentRecord, attachment_id)
            if record is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Run Attachment not found.",
                )
            return self._attachment_from_record(record)

    def list_for_conversation(self, conversation_id: int) -> list[RunAttachment]:
        with SessionLocal() as session:
            records = session.scalars(
                select(RunAttachmentRecord)
                .where(RunAttachmentRecord.conversation_id == conversation_id)
                .order_by(RunAttachmentRecord.id.asc())
            ).all()
            return [self._attachment_from_record(record) for record in records]

    def preview(self, attachment_id: int) -> RunAttachmentPreviewResponse:
        attachment = self.get(attachment_id)
        body = object_storage.get_bytes(bucket=attachment.bucket, object_key=attachment.object_key)
        return RunAttachmentPreviewResponse(
            attachment_id=attachment.id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            preview_type=attachment.preview_type,
            text=body.decode("utf-8", errors="replace"),
        )

    def reset_for_tests(self) -> None:
        from apps.api.app.database import reset_database

        reset_database()
        if hasattr(object_storage, "reset"):
            object_storage.reset()

    def _attachment_from_record(self, record: RunAttachmentRecord) -> RunAttachment:
        return RunAttachment(
            id=record.id,
            conversation_id=record.conversation_id,
            run_id=record.run_id,
            filename=record.filename,
            content_type=record.content_type,
            size=record.size,
            bucket=record.bucket,
            object_key=record.object_key,
            preview_type=ArtifactPreviewType(record.preview_type),
            metadata=dict(record.record_metadata or {}),
        )

    def _build_object_key(self, attachment_id: int, conversation_id: int, filename: str) -> str:
        return f"attachments/{conversation_id}/{attachment_id}/{filename}"


run_attachment_store = RunAttachmentStore()

Base.metadata.create_all(bind=engine)
