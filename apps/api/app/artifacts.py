from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Integer, String, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, JsonPayload, SessionLocal
from apps.api.app.object_backed_files import (
    FilePreviewType,
    object_backed_file_from_record,
    preview_payload_for_file,
    preview_type_for_content_type,
    read_object_bytes,
    store_object_for_record,
)
from apps.api.app.object_storage import object_storage


ArtifactPreviewType = FilePreviewType


class ArtifactMessageReference(BaseModel):
    artifact_id: int
    filename: str
    preview_type: ArtifactPreviewType


class ArtifactCreateRequest(BaseModel):
    filename: str = Field(min_length=1)
    content_type: str = Field(min_length=1)
    body: str | None = None
    body_base64: str | None = None

    @model_validator(mode="after")
    def validate_body(self) -> "ArtifactCreateRequest":
        if self.body is None and self.body_base64 is None:
            raise ValueError("Either body or body_base64 must be provided.")
        if self.body is not None and self.body_base64 is not None:
            raise ValueError("Provide either body or body_base64, not both.")
        return self

    def content_bytes(self) -> bytes:
        if self.body_base64 is not None:
            return base64.b64decode(self.body_base64.encode("utf-8"))
        return (self.body or "").encode("utf-8")


class ArtifactResponse(BaseModel):
    id: int
    conversation_id: int
    filename: str
    content_type: str
    size: int
    preview_type: ArtifactPreviewType


class ArtifactPreviewResponse(BaseModel):
    artifact_id: int
    filename: str
    content_type: str
    preview_type: ArtifactPreviewType
    download_url: str
    text: str | None = None
    data_url: str | None = None


class ArtifactRecord(Base):
    __tablename__ = "artifacts"

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
        JsonPayload,
        nullable=False,
        default=dict,
    )


@dataclass
class Artifact:
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


class ArtifactStore:
    def create(
        self,
        *,
        conversation_id: int,
        run_id: int | None,
        filename: str,
        content_type: str,
        content: bytes,
        preview_type: ArtifactPreviewType | None = None,
    ) -> Artifact:
        with SessionLocal() as session:
            preview_value = (preview_type or preview_type_for_content_type(content_type, filename)).value
            record = ArtifactRecord(
                conversation_id=conversation_id,
                run_id=run_id,
                filename=filename,
                content_type=content_type,
                size=0,
                bucket="",
                object_key="",
                preview_type=preview_value,
                record_metadata={},
            )
            session.add(record)
            session.flush()
            store_object_for_record(
                storage=object_storage,
                record=record,
                collection="artifacts",
                bucket="minimalist-agent",
                content=content,
            )
            session.commit()
            session.refresh(record)
            return self._artifact_from_record(record)

    def get(self, artifact_id: int) -> Artifact:
        with SessionLocal() as session:
            record = session.get(ArtifactRecord, artifact_id)
            if record is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Artifact not found.",
                )
            return self._artifact_from_record(record)

    def list_for_conversation(self, conversation_id: int) -> list[Artifact]:
        with SessionLocal() as session:
            records = session.scalars(
                select(ArtifactRecord)
                .where(ArtifactRecord.conversation_id == conversation_id)
                .order_by(ArtifactRecord.id.asc())
            ).all()
            return [self._artifact_from_record(record) for record in records]

    def preview(self, artifact_id: int) -> ArtifactPreviewResponse:
        artifact = self.get(artifact_id)
        payload = preview_payload_for_file(
            storage=object_storage,
            file=object_backed_file_from_record(artifact),
            preview_type=artifact.preview_type,
        )
        download_url = f"/artifacts/{artifact.id}/download"

        if artifact.preview_type in {
            ArtifactPreviewType.MARKDOWN,
            ArtifactPreviewType.PLAINTEXT,
            ArtifactPreviewType.CODE,
            ArtifactPreviewType.TABLE,
            ArtifactPreviewType.JSON,
            ArtifactPreviewType.HTML,
        }:
            return ArtifactPreviewResponse(
                artifact_id=artifact.id,
                filename=artifact.filename,
                content_type=artifact.content_type,
                preview_type=artifact.preview_type,
                download_url=download_url,
                text=payload.text,
            )

        if artifact.preview_type in {ArtifactPreviewType.IMAGE, ArtifactPreviewType.PDF}:
            return ArtifactPreviewResponse(
                artifact_id=artifact.id,
                filename=artifact.filename,
                content_type=artifact.content_type,
                preview_type=artifact.preview_type,
                download_url=download_url,
                data_url=payload.data_url,
            )

        return ArtifactPreviewResponse(
            artifact_id=artifact.id,
            filename=artifact.filename,
            content_type=artifact.content_type,
            preview_type=artifact.preview_type,
            download_url=download_url,
        )

    def download_bytes(self, artifact_id: int) -> tuple[Artifact, bytes]:
        artifact = self.get(artifact_id)
        return artifact, read_object_bytes(
            storage=object_storage,
            file=object_backed_file_from_record(artifact),
        )

    def reset_for_tests(self) -> None:
        from apps.api.app.database import reset_database

        reset_database()
        if hasattr(object_storage, "reset"):
            object_storage.reset()

    def _artifact_from_record(self, record: ArtifactRecord) -> Artifact:
        return Artifact(
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


artifact_store = ArtifactStore()


def to_artifact_reference(artifact: Artifact) -> ArtifactMessageReference:
    return ArtifactMessageReference(
        artifact_id=artifact.id,
        filename=artifact.filename,
        preview_type=artifact.preview_type,
    )
