from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from apps.api.app.artifacts import (
    Artifact,
    ArtifactPreviewResponse,
    ArtifactPreviewType,
    artifact_store,
)
from apps.api.app.object_backed_files import (
    iter_object_bytes,
    object_backed_file_from_record,
    preview_payload_for_file,
)
from apps.api.app.object_storage import object_storage
from apps.api.app.run_attachments import (
    RunAttachment,
    RunAttachmentPreviewResponse,
    run_attachment_store,
)


@dataclass(frozen=True)
class ConversationFileDownload:
    filename: str
    content_type: str
    body: Iterator[bytes]


class ConversationFileLibrary:
    def artifact_preview(self, artifact_id: int) -> ArtifactPreviewResponse:
        artifact = artifact_store.get(artifact_id)
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

    def artifact_download(self, artifact_id: int) -> ConversationFileDownload:
        artifact = artifact_store.get(artifact_id)
        return self._download_for_file(artifact)

    def run_attachment_preview(self, attachment_id: int) -> RunAttachmentPreviewResponse:
        attachment = run_attachment_store.get(attachment_id)
        payload = preview_payload_for_file(
            storage=object_storage,
            file=object_backed_file_from_record(attachment),
            preview_type=attachment.preview_type,
        )
        return RunAttachmentPreviewResponse(
            attachment_id=attachment.id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            preview_type=attachment.preview_type,
            text=payload.text,
        )

    def run_attachment_download(self, attachment_id: int) -> ConversationFileDownload:
        attachment = run_attachment_store.get(attachment_id)
        return self._download_for_file(attachment)

    def _download_for_file(
        self,
        file: Artifact | RunAttachment,
    ) -> ConversationFileDownload:
        return ConversationFileDownload(
            filename=file.filename,
            content_type=file.content_type,
            body=iter_object_bytes(
                storage=object_storage,
                file=object_backed_file_from_record(file),
            ),
        )


conversation_file_library = ConversationFileLibrary()
