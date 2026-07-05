import os

from apps.api.app.agents import AgentUpdateRequest, agent_store
from apps.api.app.model_configurations import (
    ModelConfiguration,
    ModelConfigurationMutationRequest,
    ModelHealthStatus,
    model_configuration_store,
)
from apps.api.app.runtime import resolve_model_api_key


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
    if configuration is None and _has_configured_credential(credential_reference):
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
    if configuration is not None and not _has_configured_credential(configuration.credential_reference):
        configuration = None
    if configuration is None:
        configuration = _find_usable_model_configuration(model_name=model_name)
    if configuration is None:
        return None

    default_agent = agent_store.get(1)
    allowed_model_ids = list(dict.fromkeys([
        configuration.id,
        *[
            configuration_id
            for configuration_id in default_agent.allowed_model_configuration_ids
            if _is_usable_model_configuration_id(configuration_id)
        ],
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


def _find_usable_model_configuration(*, model_name: str) -> ModelConfiguration | None:
    candidates = [
        configuration
        for configuration in model_configuration_store.list_configurations()
        if configuration.model_name == model_name
        and configuration.enabled
        and _has_configured_credential(configuration.credential_reference)
    ]
    if not candidates:
        return None

    return sorted(
        candidates,
        key=lambda configuration: (
            configuration.health_status != ModelHealthStatus.HEALTHY,
            configuration.id,
        ),
    )[0]


def _has_configured_credential(credential_reference: str) -> bool:
    try:
        resolve_model_api_key(credential_reference)
    except Exception:
        return False
    return True


def _is_usable_model_configuration_id(configuration_id: int) -> bool:
    try:
        configuration = model_configuration_store.get(configuration_id)
    except Exception:
        return False
    return configuration.enabled and _has_configured_credential(configuration.credential_reference)


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
