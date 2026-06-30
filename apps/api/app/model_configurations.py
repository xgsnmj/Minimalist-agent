from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field


class ModelProviderCatalogEntry(BaseModel):
    id: str
    name: str
    logo: str
    endpoint_template: str
    compatibility_notes: str
    recommended_models: list[str]
    documentation_url: str


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
    credential_reference: str = Field(min_length=1)
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


class ModelConfigurationStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._configurations: dict[int, ModelConfiguration] = {}

    def list_configurations(self) -> list[ModelConfiguration]:
        return sorted(self._configurations.values(), key=lambda configuration: configuration.id)

    def get(self, configuration_id: int) -> ModelConfiguration:
        return self._configuration_or_404(configuration_id)

    def create(self, request: ModelConfigurationMutationRequest) -> ModelConfiguration:
        configuration = ModelConfiguration(
            id=self._next_id,
            provider_id=request.provider_id,
            name=request.name,
            model_name=request.model_name,
            endpoint=request.endpoint,
            credential_reference=request.credential_reference,
            default_parameters=dict(request.default_parameters),
            enabled=request.enabled,
        )
        self._next_id += 1
        self._configurations[configuration.id] = configuration
        return configuration

    def update(
        self,
        configuration_id: int,
        request: ModelConfigurationUpdateRequest,
    ) -> ModelConfiguration:
        configuration = self._configuration_or_404(configuration_id)
        if request.provider_id is not None:
            configuration.provider_id = request.provider_id
        if request.name is not None:
            configuration.name = request.name
        if request.model_name is not None:
            configuration.model_name = request.model_name
        if request.endpoint is not None:
            configuration.endpoint = request.endpoint
        if request.credential_reference is not None:
            configuration.credential_reference = request.credential_reference
        if request.default_parameters is not None:
            configuration.default_parameters = dict(request.default_parameters)
        if request.enabled is not None:
            configuration.enabled = request.enabled
        return configuration

    def _configuration_or_404(self, configuration_id: int) -> ModelConfiguration:
        configuration = self._configurations.get(configuration_id)
        if configuration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Model Configuration not found.",
            )
        return configuration


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
    )
