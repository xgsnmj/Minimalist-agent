import os

from apps.api.app.agents import AgentUpdateRequest, agent_store
from apps.api.app.model_configurations import (
    ModelConfiguration,
    ModelConfigurationMutationRequest,
    model_configuration_store,
)


def bootstrap_default_model_configuration() -> ModelConfiguration | None:
    if _env_flag("DEFAULT_MODEL_BOOTSTRAP_DISABLED"):
        return None

    model_name = os.getenv("DEFAULT_MODEL_NAME", "gpt-5.5").strip()
    if not model_name:
        return None

    provider_id = os.getenv("DEFAULT_MODEL_PROVIDER_ID", "openai").strip() or "openai"
    endpoint = os.getenv("DEFAULT_MODEL_ENDPOINT", "https://api.openai.com/v1").strip()
    credential_reference = os.getenv(
        "DEFAULT_MODEL_CREDENTIAL_REFERENCE",
        "env:OPENAI_API_KEY",
    ).strip()
    display_name = os.getenv("DEFAULT_MODEL_CONFIGURATION_NAME", model_name).strip() or model_name

    configuration = _find_model_configuration(
        provider_id=provider_id,
        model_name=model_name,
        endpoint=endpoint,
        credential_reference=credential_reference,
    )
    if configuration is None:
        configuration = model_configuration_store.create(
            ModelConfigurationMutationRequest(
                provider_id=provider_id,
                name=display_name,
                model_name=model_name,
                endpoint=endpoint,
                credential_reference=credential_reference,
                default_parameters={},
                enabled=True,
            )
        )

    default_agent = agent_store.get(1)
    allowed_model_ids = list(dict.fromkeys([
        configuration.id,
        *default_agent.allowed_model_configuration_ids,
    ]))
    if (
        default_agent.default_model_configuration_id != configuration.id
        or default_agent.allowed_model_configuration_ids != allowed_model_ids
    ):
        agent_store.update(
            default_agent.id,
            AgentUpdateRequest(
                default_model_configuration_id=configuration.id,
                allowed_model_configuration_ids=allowed_model_ids,
            ),
        )
    return configuration


def _find_model_configuration(
    *,
    provider_id: str,
    model_name: str,
    endpoint: str,
    credential_reference: str,
) -> ModelConfiguration | None:
    for configuration in model_configuration_store.list_configurations():
        if (
            configuration.provider_id == provider_id
            and configuration.model_name == model_name
            and configuration.endpoint == endpoint
            and configuration.credential_reference == credential_reference
        ):
            return configuration
    return None


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
