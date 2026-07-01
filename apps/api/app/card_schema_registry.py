from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class CardSchema(StrEnum):
    ARTIFACT = "artifact_card"
    TOOL_RESULT = "tool_result_card"
    CHOICE = "choice_card"
    CITATION = "citation_card"
    STATUS = "status_card"
    FORM_REQUEST = "form_request_card"


class CardStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StrictCardPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def reject_unsafe_values(cls, value: Any) -> Any:
        reject_unsafe_card_payload(value)
        return value


class ArtifactCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.ARTIFACT, alias="schema")
    artifact_id: int = Field(gt=0)
    filename: str = Field(min_length=1, max_length=255)
    preview_type: str = Field(min_length=1, max_length=32)


class ToolResultCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.TOOL_RESULT, alias="schema")
    tool_call_id: str | None = Field(default=None, max_length=120)
    tool_name: str = Field(min_length=1, max_length=120)
    status: CardStatus
    summary: str = Field(min_length=1, max_length=1000)


class ChoiceCardOption(StrictCardPayload):
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)


class ChoiceCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.CHOICE, alias="schema")
    prompt: str = Field(min_length=1, max_length=500)
    options: list[ChoiceCardOption] = Field(min_length=1, max_length=8)


class CitationCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.CITATION, alias="schema")
    title: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=2048)
    source: str | None = Field(default=None, max_length=160)
    snippet: str | None = Field(default=None, max_length=1000)


class StatusCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.STATUS, alias="schema")
    status: CardStatus
    title: str = Field(min_length=1, max_length=160)
    detail: str | None = Field(default=None, max_length=1000)


class FormRequestField(StrictCardPayload):
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=160)
    type: str = Field(pattern="^(text|textarea|number|select|checkbox)$")
    required: bool = True
    options: list[str] | None = Field(default=None, max_length=12)


class FormRequestCardPayload(StrictCardPayload):
    card_schema: CardSchema = Field(default=CardSchema.FORM_REQUEST, alias="schema")
    title: str = Field(min_length=1, max_length=160)
    fields: list[FormRequestField] = Field(min_length=1, max_length=12)


class CardResponse(BaseModel):
    card_schema: CardSchema = Field(alias="schema")
    payload: dict[str, Any]


class CardCreateRequest(BaseModel):
    run_id: int | None = Field(default=None, gt=0)
    card: dict[str, Any]


@dataclass
class CardRegistryEntry:
    schema: CardSchema


REGISTERED_CARD_SCHEMAS = {
    CardSchema.ARTIFACT,
    CardSchema.TOOL_RESULT,
    CardSchema.CHOICE,
    CardSchema.CITATION,
    CardSchema.STATUS,
    CardSchema.FORM_REQUEST,
}

DANGEROUS_CARD_KEYS = {
    "__html",
    "component",
    "component_name",
    "dangerouslySetInnerHTML",
    "html",
    "innerHTML",
}

CARD_PAYLOAD_MODELS = {
    CardSchema.ARTIFACT: ArtifactCardPayload,
    CardSchema.TOOL_RESULT: ToolResultCardPayload,
    CardSchema.CHOICE: ChoiceCardPayload,
    CardSchema.CITATION: CitationCardPayload,
    CardSchema.STATUS: StatusCardPayload,
    CardSchema.FORM_REQUEST: FormRequestCardPayload,
}


def reject_unsafe_card_payload(value: Any) -> None:
    if isinstance(value, dict):
        for key, child_value in value.items():
            if key in DANGEROUS_CARD_KEYS:
                raise ValueError("Card payload contains unsafe rendering fields.")
            reject_unsafe_card_payload(child_value)
        return

    if isinstance(value, list):
        for item in value:
            reject_unsafe_card_payload(item)
        return

    if isinstance(value, str):
        normalized = value.lower()
        if "<script" in normalized or "</script" in normalized or "javascript:" in normalized:
            raise ValueError("Card payload contains unsafe HTML.")


class CardSchemaRegistryStore:
    def accept_card(self, payload: dict[str, Any]) -> CardResponse:
        if "schema" not in payload:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Card schema is required.",
            )

        try:
            reject_unsafe_card_payload(payload)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        try:
            schema = CardSchema(payload["schema"])
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unregistered card schema.",
            ) from exc

        if schema not in REGISTERED_CARD_SCHEMAS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unregistered card schema.",
            )

        try:
            card = CARD_PAYLOAD_MODELS[schema].model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid card payload.",
            ) from exc

        payload_without_schema = card.model_dump(mode="json", exclude={"card_schema"})
        return CardResponse(schema=schema, payload=payload_without_schema)


card_schema_registry_store = CardSchemaRegistryStore()
