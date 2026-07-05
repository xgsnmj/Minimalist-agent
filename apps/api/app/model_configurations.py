from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Integer, String, Text, select
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.database import Base, JsonPayload, SessionLocal, engine
from apps.api.app.secret_vault import secret_vault_store


class ModelProviderCatalogEntry(BaseModel):
    id: str
    name: str
    logo: str
    endpoint_template: str
    compatibility_notes: str
    recommended_models: list[str]
    documentation_url: str


class ModelHealthStatus(StrEnum):
    NOT_CHECKED = "not_checked"
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"


MODEL_PROVIDER_CATALOG: list[ModelProviderCatalogEntry] = [
    ModelProviderCatalogEntry(
        id="openai",
        name="OpenAI",
        logo="openai",
        endpoint_template="https://api.openai.com/v1",
        compatibility_notes="Native OpenAI provider.",
        recommended_models=["gpt-5", "gpt-5-mini"],
        documentation_url="https://platform.openai.com/docs",
    ),
    ModelProviderCatalogEntry(
        id="anthropic",
        name="Anthropic",
        logo="anthropic",
        endpoint_template="https://api.anthropic.com",
        compatibility_notes="Anthropic Messages API provider.",
        recommended_models=["claude-sonnet-4-5", "claude-haiku-4-5"],
        documentation_url="https://docs.anthropic.com",
    ),
    ModelProviderCatalogEntry(
        id="google-gemini",
        name="Google Gemini",
        logo="google-gemini",
        endpoint_template="https://generativelanguage.googleapis.com",
        compatibility_notes="Google Gemini API provider.",
        recommended_models=["gemini-2.5-pro", "gemini-2.5-flash"],
        documentation_url="https://ai.google.dev/gemini-api/docs",
    ),
    ModelProviderCatalogEntry(
        id="deepseek",
        name="DeepSeek",
        logo="deepseek",
        endpoint_template="https://api.deepseek.com",
        compatibility_notes="OpenAI-compatible provider.",
        recommended_models=["deepseek-chat", "deepseek-reasoner"],
        documentation_url="https://api-docs.deepseek.com",
    ),
    ModelProviderCatalogEntry(
        id="qwen-dashscope",
        name="Qwen / Alibaba Cloud DashScope",
        logo="qwen",
        endpoint_template="https://dashscope.aliyuncs.com/compatible-mode/v1",
        compatibility_notes="OpenAI-compatible DashScope endpoint.",
        recommended_models=["qwen-plus", "qwen-max"],
        documentation_url="https://help.aliyun.com/zh/model-studio",
    ),
    ModelProviderCatalogEntry(
        id="moonshot-kimi",
        name="Moonshot / Kimi",
        logo="moonshot",
        endpoint_template="https://api.moonshot.cn/v1",
        compatibility_notes="OpenAI-compatible provider.",
        recommended_models=["kimi-k2-0905-preview", "moonshot-v1-128k"],
        documentation_url="https://platform.moonshot.cn/docs",
    ),
    ModelProviderCatalogEntry(
        id="bytedance-doubao",
        name="ByteDance Doubao",
        logo="doubao",
        endpoint_template="https://ark.cn-beijing.volces.com/api/v3",
        compatibility_notes="OpenAI-compatible Volcano Engine endpoint.",
        recommended_models=["doubao-seed-1-6", "doubao-1-5-pro"],
        documentation_url="https://www.volcengine.com/docs/82379",
    ),
    ModelProviderCatalogEntry(
        id="zhipu-glm",
        name="Zhipu / GLM",
        logo="zhipu",
        endpoint_template="https://open.bigmodel.cn/api/paas/v4",
        compatibility_notes="OpenAI-compatible provider.",
        recommended_models=["glm-4.5", "glm-4.5-air"],
        documentation_url="https://docs.bigmodel.cn",
    ),
    ModelProviderCatalogEntry(
        id="minimax",
        name="MiniMax",
        logo="minimax",
        endpoint_template="https://api.minimax.io/v1",
        compatibility_notes="MiniMax model provider.",
        recommended_models=["MiniMax-M1", "abab6.5s-chat"],
        documentation_url="https://platform.minimaxi.com/document",
    ),
    ModelProviderCatalogEntry(
        id="openrouter",
        name="OpenRouter",
        logo="openrouter",
        endpoint_template="https://openrouter.ai/api/v1",
        compatibility_notes="OpenAI-compatible routing provider.",
        recommended_models=["openrouter/auto"],
        documentation_url="https://openrouter.ai/docs",
    ),
    ModelProviderCatalogEntry(
        id="custom-openai-compatible",
        name="Custom OpenAI-compatible endpoint",
        logo="custom-endpoint",
        endpoint_template="https://your-model-gateway.example.com/v1",
        compatibility_notes="Administrator-defined OpenAI-compatible gateway or relay.",
        recommended_models=[],
        documentation_url="https://platform.openai.com/docs/api-reference",
    ),
]


class ModelConfigurationMutationRequest(BaseModel):
    provider_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    endpoint: str = Field(min_length=1)
    credential_reference: str | None = Field(default=None, min_length=1)
    api_key: str | None = Field(default=None, exclude=True)
    default_parameters: dict[str, Any] = {}
    enabled: bool = True


class ModelConfigurationUpdateRequest(BaseModel):
    provider_id: str | None = Field(default=None, min_length=1)
    name: str | None = Field(default=None, min_length=1)
    model_name: str | None = Field(default=None, min_length=1)
    endpoint: str | None = Field(default=None, min_length=1)
    credential_reference: str | None = Field(default=None, min_length=1)
    api_key: str | None = Field(default=None, exclude=True)
    default_parameters: dict[str, Any] | None = None
    enabled: bool | None = None


class ModelConfigurationResponse(BaseModel):
    id: int
    provider_id: str
    name: str
    model_name: str
    endpoint: str
    credential_reference: str
    default_parameters: dict[str, Any]
    enabled: bool
    health_status: ModelHealthStatus
    last_checked_at: str | None = None
    last_error: str | None = None


class ModelConfigurationHealthCheckResponse(BaseModel):
    configuration: ModelConfigurationResponse
    status: ModelHealthStatus
    checked_at: str
    message: str


@dataclass
class ModelConfiguration:
    id: int
    provider_id: str
    name: str
    model_name: str
    endpoint: str
    credential_reference: str
    default_parameters: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    health_status: ModelHealthStatus = ModelHealthStatus.NOT_CHECKED
    last_checked_at: str | None = None
    last_error: str | None = None


class ModelConfigurationRecord(Base):
    __tablename__ = "model_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False)
    credential_reference: Mapped[str] = mapped_column(String(512), nullable=False)
    default_parameters: Mapped[dict[str, Any]] = mapped_column(
        JsonPayload,
        nullable=False,
        default=dict,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    health_status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ModelHealthStatus.NOT_CHECKED.value,
    )
    last_checked_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ModelHealthCheckRecord(Base):
    __tablename__ = "model_health_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_configuration_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    health_status: Mapped[str] = mapped_column(String(32), nullable=False)
    checked_at: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)


class ModelConfigurationStore:
    def reset(self) -> None:
        Base.metadata.create_all(bind=engine)
        secret_vault_store.reset()
        with SessionLocal() as session:
            session.query(ModelHealthCheckRecord).delete()
            session.query(ModelConfigurationRecord).delete()
            session.commit()

    def list_configurations(self) -> list[ModelConfiguration]:
        with SessionLocal() as session:
            records = session.scalars(
                select(ModelConfigurationRecord).order_by(ModelConfigurationRecord.id.asc())
            ).all()
            return [self._configuration_from_record(record) for record in records]

    def get(self, configuration_id: int) -> ModelConfiguration:
        with SessionLocal() as session:
            record = self._configuration_record_or_404(session, configuration_id)
            return self._configuration_from_record(record)

    def create(self, request: ModelConfigurationMutationRequest) -> ModelConfiguration:
        now = _utc_now()
        credential_reference = self._credential_reference_for_create(request)
        with SessionLocal() as session:
            record = ModelConfigurationRecord(
                provider_id=request.provider_id,
                name=request.name,
                model_name=request.model_name,
                endpoint=request.endpoint,
                credential_reference=credential_reference,
                default_parameters=dict(request.default_parameters),
                enabled=request.enabled,
                health_status=ModelHealthStatus.NOT_CHECKED.value,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            session.commit()
            session.refresh(record)
            return self._configuration_from_record(record)

    def update(
        self,
        configuration_id: int,
        request: ModelConfigurationUpdateRequest,
    ) -> ModelConfiguration:
        with SessionLocal() as session:
            record = self._configuration_record_or_404(session, configuration_id)
            if request.provider_id is not None:
                record.provider_id = request.provider_id
            if request.name is not None:
                record.name = request.name
            if request.model_name is not None:
                record.model_name = request.model_name
            if request.endpoint is not None:
                record.endpoint = request.endpoint
            credential_reference = self._credential_reference_for_update(request)
            if credential_reference is not None:
                record.credential_reference = credential_reference
            if request.default_parameters is not None:
                record.default_parameters = dict(request.default_parameters)
            if request.enabled is not None:
                record.enabled = request.enabled
            record.updated_at = _utc_now()
            session.commit()
            session.refresh(record)
            return self._configuration_from_record(record)

    def delete(self, configuration_id: int) -> ModelConfiguration:
        with SessionLocal() as session:
            record = self._configuration_record_or_404(session, configuration_id)
            configuration = self._configuration_from_record(record)
            session.query(ModelHealthCheckRecord).filter(
                ModelHealthCheckRecord.model_configuration_id == configuration_id
            ).delete()
            session.delete(record)
            session.commit()
            return configuration

    def _credential_reference_for_create(
        self,
        request: ModelConfigurationMutationRequest,
    ) -> str:
        reference = _clean_optional_text(request.credential_reference)
        api_key = _clean_optional_text(request.api_key)
        if api_key:
            return api_key
        if reference is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="API key is required.",
            )
        return reference

    def _credential_reference_for_update(
        self,
        request: ModelConfigurationUpdateRequest,
    ) -> str | None:
        requested_reference = _clean_optional_text(request.credential_reference)
        api_key = _clean_optional_text(request.api_key)
        if api_key:
            return api_key
        if request.credential_reference is not None:
            if requested_reference is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="API key is required.",
                )
            return requested_reference
        return None

    def record_health_check(
        self,
        *,
        configuration_id: int,
        health_status: ModelHealthStatus,
        checked_at: str,
        last_error: str | None,
    ) -> ModelConfiguration:
        with SessionLocal() as session:
            record = self._configuration_record_or_404(session, configuration_id)
            record.health_status = health_status.value
            record.last_checked_at = checked_at
            record.last_error = last_error
            record.updated_at = _utc_now()
            session.add(
                ModelHealthCheckRecord(
                    model_configuration_id=configuration_id,
                    health_status=health_status.value,
                    checked_at=checked_at,
                    message=last_error,
                )
            )
            session.commit()
            session.refresh(record)
            return self._configuration_from_record(record)

    def _configuration_record_or_404(
        self,
        session,
        configuration_id: int,
    ) -> ModelConfigurationRecord:
        record = session.get(ModelConfigurationRecord, configuration_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Model Configuration not found.",
            )
        return record

    def _configuration_from_record(self, record: ModelConfigurationRecord) -> ModelConfiguration:
        return ModelConfiguration(
            id=record.id,
            provider_id=record.provider_id,
            name=record.name,
            model_name=record.model_name,
            endpoint=record.endpoint,
            credential_reference=record.credential_reference,
            default_parameters=dict(record.default_parameters or {}),
            enabled=record.enabled,
            health_status=ModelHealthStatus(record.health_status),
            last_checked_at=record.last_checked_at,
            last_error=record.last_error,
        )


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


model_configuration_store = ModelConfigurationStore()


def to_model_configuration_response(
    configuration: ModelConfiguration,
) -> ModelConfigurationResponse:
    return ModelConfigurationResponse(
        id=configuration.id,
        provider_id=configuration.provider_id,
        name=configuration.name,
        model_name=configuration.model_name,
        endpoint=configuration.endpoint,
        credential_reference=configuration.credential_reference,
        default_parameters=configuration.default_parameters,
        enabled=configuration.enabled,
        health_status=configuration.health_status,
        last_checked_at=configuration.last_checked_at,
        last_error=configuration.last_error,
    )
