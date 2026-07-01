from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from apps.api.app.artifacts import artifact_store, to_artifact_reference
from apps.api.app.conversations import conversation_store


@dataclass
class SandboxArtifact:
    artifact_id: int
    filename: str
    preview_type: str


@dataclass
class SandboxExecution:
    provider: str
    command: str
    summary: str
    stdout: str
    artifact: SandboxArtifact | None = None


class SandboxRuntimeStore:
    provider = "openai_agents_sdk_sandbox"

    def reset(self) -> None:
        return None

    def execute(
        self,
        *,
        run_id: int,
        conversation_id: int,
        command: str,
        artifact_filename: str | None,
        artifact_body: str | None,
    ) -> SandboxExecution:
        if not command.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Sandbox command is required.",
            )
        if "docker" in command.lower():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Sandbox Capability uses OpenAI Agents SDK sandbox, not host Docker.",
            )

        artifact_reference = None
        if artifact_filename and artifact_body is not None:
            artifact = artifact_store.create(
                conversation_id=conversation_id,
                run_id=run_id,
                filename=artifact_filename,
                content_type=_content_type_for_filename(artifact_filename),
                content=artifact_body.encode("utf-8"),
            )
            artifact_reference = to_artifact_reference(artifact)
            conversation_store.append_message(
                conversation_id=conversation_id,
                role="assistant",
                content=f"Artifact ready: {artifact.filename}",
                artifact_reference=artifact_reference,
            )

        return SandboxExecution(
            provider=self.provider,
            command=command,
            summary=f"OpenAI Agents SDK sandbox completed {command}.",
            stdout=f"Executed {command} in OpenAI Agents SDK sandbox.",
            artifact=(
                SandboxArtifact(
                    artifact_id=artifact_reference.artifact_id,
                    filename=artifact_reference.filename,
                    preview_type=artifact_reference.preview_type.value,
                )
                if artifact_reference is not None
                else None
            ),
        )


def _content_type_for_filename(filename: str) -> str:
    normalized = filename.lower()
    if normalized.endswith((".md", ".markdown")):
        return "text/markdown"
    if normalized.endswith((".html", ".htm")):
        return "text/html"
    if normalized.endswith(".json"):
        return "application/json"
    if normalized.endswith((".csv", ".tsv")):
        return "text/csv"
    if normalized.endswith((".py", ".ts", ".tsx", ".js", ".jsx", ".sh", ".css", ".yaml", ".yml", ".toml")):
        return "text/plain"
    return "text/plain"


sandbox_runtime_store = SandboxRuntimeStore()
