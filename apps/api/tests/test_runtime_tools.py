from agents import (
    ApplyPatchTool,
    CodeInterpreterTool,
    ComputerTool,
    CustomTool,
    FileSearchTool,
    FunctionTool,
    ImageGenerationTool,
    LocalShellTool,
    WebSearchTool,
)
from fastapi.testclient import TestClient

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import AgentCapabilityPolicyResponse, AgentUpdateRequest, agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    model_configuration_store,
)
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime_tools import (
    project_safe_payload,
    public_tool_name_for_sdk_name,
    sdk_tools_for_run,
    tools_require_openai_responses,
)
from apps.api.tests.support import configure_default_agent_model, create_model_configuration_for_tests


def setup_function():
    local_account_store.reset()
    agent_store.reset()
    model_configuration_store.reset()
    conversation_store.reset()
    agent_run_store.reset()
    run_event_log_store.reset_for_tests()
    configure_default_agent_model()


def approved_user_token(client: TestClient) -> str:
    account = client.post(
        "/auth/register",
        json={
            "username": "user",
            "email": "user@example.com",
            "password": "correct horse battery staple",
        },
    ).json()
    local_account_store.approve(account["id"])
    return client.post(
        "/auth/login",
        json={
            "login": "user",
            "password": "correct horse battery staple",
        },
    ).json()["access_token"]


def create_run(client: TestClient, token: str) -> int:
    conversation = client.post(
        "/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Runtime tools",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    return client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Use tools."},
    ).json()["id"]


def test_agent_run_tool_call_gateway_route_is_removed():
    client = TestClient(app)
    token = approved_user_token(client)
    run_id = create_run(client, token)

    response = client.post(
        f"/runs/{run_id}/tool-calls",
        headers={"Authorization": f"Bearer {token}"},
        json={"tool_name": "search.web", "input": {"query": "agent"}},
    )

    assert response.status_code == 404


def test_sdk_tools_are_registered_from_run_capability_snapshot():
    client = TestClient(app)
    token = approved_user_token(client)
    agent_store.update(
        1,
        AgentUpdateRequest(
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=True,
                page_read_enabled=False,
            )
        ),
    )
    run_id = create_run(client, token)

    tool_names = [
        public_tool_name_for_sdk_name(tool.name)
        for tool in sdk_tools_for_run(agent_run_store.get(run_id))
    ]

    assert tool_names == ["search.web"]
    tools = sdk_tools_for_run(agent_run_store.get(run_id))
    assert isinstance(tools[0], WebSearchTool)
    assert tools_require_openai_responses(tools) is True


def test_sdk_tools_fall_back_to_function_tools_for_openai_compatible_providers():
    client = TestClient(app)
    token = approved_user_token(client)
    model_id = create_model_configuration_for_tests(
        provider_id="custom-openai-compatible",
        model_name="compatible-chat",
    )
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=model_id,
            allowed_model_configuration_ids=[model_id],
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=True,
                page_read_enabled=True,
            ),
        ),
    )
    run_id = create_run(client, token)

    tools = sdk_tools_for_run(agent_run_store.get(run_id))
    tool_names = [public_tool_name_for_sdk_name(tool.name) for tool in tools]

    assert tool_names == ["search.web", "page.read"]
    assert all(isinstance(tool, FunctionTool) for tool in tools)
    assert tools_require_openai_responses(tools) is False


def test_sdk_tools_fall_back_when_openai_provider_uses_compatible_gateway_endpoint():
    client = TestClient(app)
    token = approved_user_token(client)
    model_configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="OpenAI-compatible gateway",
            model_name="gpt-5.5",
            endpoint="https://www.packyapi.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            model_settings={
                "max_tokens": 8192,
                "temperature": 0.1,
            },
            enabled=True,
        )
    )
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=model_configuration.id,
            allowed_model_configuration_ids=[model_configuration.id],
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=True,
                page_read_enabled=True,
            ),
        ),
    )
    run_id = create_run(client, token)

    tools = sdk_tools_for_run(agent_run_store.get(run_id))
    tool_names = [public_tool_name_for_sdk_name(tool.name) for tool in tools]

    assert tool_names == ["search.web", "page.read"]
    assert all(isinstance(tool, FunctionTool) for tool in tools)
    assert tools_require_openai_responses(tools) is False


def test_sdk_tools_register_configured_openai_native_tools():
    client = TestClient(app)
    token = approved_user_token(client)
    model_configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Native tools",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            native_tool_settings={
                    "file_search": {
                        "vector_store_ids": ["vs_123"],
                        "max_num_results": 4,
                        "include_search_results": True,
                    },
                    "code_interpreter": {
                        "container": {
                            "type": "auto",
                            "memory_limit": "1g",
                            "network_policy": {"type": "disabled"},
                        }
                    },
                    "image_generation": {
                        "quality": "low",
                        "size": "1024x1024",
                    },
                },
            model_settings={"max_tokens": 1024,
            },
            enabled=True,
        )
    )
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=model_configuration.id,
            allowed_model_configuration_ids=[model_configuration.id],
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=False,
                page_read_enabled=False,
            ),
        ),
    )
    run_id = create_run(client, token)

    tools = sdk_tools_for_run(agent_run_store.get(run_id))
    tool_names = [public_tool_name_for_sdk_name(tool.name) for tool in tools]

    assert tool_names == ["file.search", "code.interpreter", "image.generate"]
    assert isinstance(tools[0], FileSearchTool)
    assert tools[0].vector_store_ids == ["vs_123"]
    assert tools[0].max_num_results == 4
    assert tools[0].include_search_results is True
    assert isinstance(tools[1], CodeInterpreterTool)
    assert tools[1].tool_config["container"]["memory_limit"] == "1g"
    assert isinstance(tools[2], ImageGenerationTool)
    assert tools[2].tool_config["quality"] == "low"
    assert tools_require_openai_responses(tools) is True


def test_sdk_tools_apply_configured_native_search_options():
    client = TestClient(app)
    token = approved_user_token(client)
    model_configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Native capability tools",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            native_tool_settings={
                    "web_search": {
                        "search_context_size": "high",
                        "external_web_access": False,
                    },
                    "shell": {
                        "environment": {
                            "type": "container_auto",
                            "memory_limit": "4g",
                            "network_policy": {"type": "disabled"},
                        }
                    },
            },
            enabled=True,
        )
    )
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=model_configuration.id,
            allowed_model_configuration_ids=[model_configuration.id],
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=True,
                page_read_enabled=False,
            ),
        ),
    )
    run_id = create_run(client, token)

    tools = sdk_tools_for_run(agent_run_store.get(run_id))

    assert isinstance(tools[0], WebSearchTool)
    assert tools[0].search_context_size == "high"
    assert tools[0].external_web_access is False
    assert len(tools) == 1


def test_sdk_tools_do_not_register_host_defined_native_tools_without_adapters():
    client = TestClient(app)
    token = approved_user_token(client)
    model_configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Host-defined tools",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="env:TEST_MODEL_API_KEY",
            native_tool_settings={
                    "apply_patch": {"enabled": True},
                    "computer": {"enabled": True},
                    "custom": {"enabled": True},
                    "local_shell": {"enabled": True},
            },
            enabled=True,
        )
    )
    agent_store.update(
        1,
        AgentUpdateRequest(
            default_model_configuration_id=model_configuration.id,
            allowed_model_configuration_ids=[model_configuration.id],
            capability_policy=AgentCapabilityPolicyResponse(
                mcp_server_ids=[],
                search_enabled=False,
                page_read_enabled=False,
            ),
        ),
    )
    run_id = create_run(client, token)

    tools = sdk_tools_for_run(agent_run_store.get(run_id))

    assert tools == []
    assert not any(
        isinstance(tool, (ApplyPatchTool, ComputerTool, CustomTool, LocalShellTool))
        for tool in tools
    )


def test_runtime_tool_safe_payload_removes_sensitive_keys_recursively():
    assert project_safe_payload(
        {
            "query": "agent",
            "api_key": "secret",
            "nested": {"token": "secret", "keep": "visible"},
            "items": [{"password": "secret", "title": "kept"}],
        }
    ) == {
        "query": "agent",
        "nested": {"keep": "visible"},
        "items": [{"title": "kept"}],
    }
