from types import SimpleNamespace

from fastapi.testclient import TestClient

from agents import FunctionTool
from agents.sandbox import SandboxAgent

from apps.api.app.agent_runs import agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.auth import local_account_store
from apps.api.app.conversations import conversation_store
from apps.api.app.app import app
from apps.api.app.model_configurations import (
    ModelConfigurationMutationRequest,
    model_configuration_store,
)
from apps.api.app.run_event_log import run_event_log_store
from apps.api.app.runtime import (
    SandboxCapabilityProfile,
    SandboxRuntimeType,
    _runtime_agent,
    _sandbox_capabilities_for_profile,
    _sandbox_run_config_for_configuration,
    _sandbox_runtime_type_for_configuration,
)
from apps.api.app.runtime_tools import capability_for_tool_name, public_tool_name_for_sdk_name
from apps.api.tests.support import configure_default_agent_model


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
            "title": "SandboxAgent run",
            "agent_id": 1,
            "initial_message": "Start this conversation.",
        },
    ).json()
    return client.post(
        f"/conversations/{conversation['id']}/runs",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Use the sandbox runtime."},
    ).json()["id"]


def test_runtime_uses_sandbox_agent_with_default_capabilities():
    client = TestClient(app)
    token = approved_user_token(client)
    run_id = create_run(client, token)
    run = agent_run_store.get(run_id)
    agent = agent_store.get(run.capability_snapshot.agent_id)

    runtime_agent = _runtime_agent(
        agent=agent,
        model_name="gpt-5",
        runtime_tools=[],
        run=run,
    )

    assert isinstance(runtime_agent, SandboxAgent)
    assert [capability.type for capability in runtime_agent.capabilities] == [
        "filesystem",
        "shell",
        "compaction",
    ]


def test_chat_function_profile_registers_all_chat_compatible_sandbox_tools():
    fake_session = SimpleNamespace(supports_pty=lambda: True)
    capabilities = _sandbox_capabilities_for_profile(SandboxCapabilityProfile.CHAT_FUNCTIONS)
    tools = []
    for capability in capabilities or []:
        capability.bind(fake_session)
        tools.extend(capability.tools())

    tool_names = [tool.name for tool in tools]

    assert tool_names == ["view_image", "exec_command", "write_stdin"]
    assert all(isinstance(tool, FunctionTool) for tool in tools)
    assert "apply_patch" not in tool_names


def test_sandbox_runtime_defaults_to_local():
    configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Local sandbox",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="sk-direct",
            enabled=True,
        )
    )

    run_config = _sandbox_run_config_for_configuration(configuration)

    assert _sandbox_runtime_type_for_configuration(configuration) == SandboxRuntimeType.LOCAL
    assert run_config.client.backend_id == "unix_local"
    assert run_config.options is None


def test_docker_sandbox_runtime_uses_local_docker_from_environment(monkeypatch):
    captured: dict[str, object] = {}

    def fake_from_env(**kwargs):
        captured["from_env_kwargs"] = kwargs
        return SimpleNamespace()

    import docker

    monkeypatch.setattr(docker, "from_env", fake_from_env)
    configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Docker sandbox",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="sk-direct",
            native_tool_settings={
                "sandbox_agent": {
                    "runtime": {
                        "type": "docker",
                        "image": "minimalist-agent-sandbox:py314",
                        "exposed_ports": [3000, "5173"],
                    }
                }
            },
            enabled=True,
        )
    )

    run_config = _sandbox_run_config_for_configuration(configuration)

    assert _sandbox_runtime_type_for_configuration(configuration) == SandboxRuntimeType.DOCKER
    assert captured["from_env_kwargs"] == {}
    assert run_config.client.backend_id == "docker"
    assert run_config.options.image == "minimalist-agent-sandbox:py314"
    assert run_config.options.exposed_ports == (3000, 5173)


def test_docker_sandbox_runtime_supports_remote_ssh_docker(monkeypatch):
    captured: dict[str, object] = {}

    def fake_docker_client(**kwargs):
        captured["docker_client_kwargs"] = kwargs
        return SimpleNamespace()

    import docker

    monkeypatch.setattr(docker, "DockerClient", fake_docker_client)
    configuration = model_configuration_store.create(
        ModelConfigurationMutationRequest(
            provider_id="openai",
            name="Remote Docker sandbox",
            model_name="gpt-5",
            endpoint="https://api.openai.com/v1",
            credential_reference="sk-direct",
            native_tool_settings={
                "sandbox_agent": {
                    "runtime": {
                        "type": "docker",
                        "docker_host": "ssh://docker-agent@example.com",
                        "image": "minimalist-agent-sandbox:py314",
                        "timeout": 45,
                        "version": "1.45",
                    }
                }
            },
            enabled=True,
        )
    )

    run_config = _sandbox_run_config_for_configuration(configuration)

    assert captured["docker_client_kwargs"] == {
        "base_url": "ssh://docker-agent@example.com",
        "timeout": 45,
        "use_ssh_client": True,
        "version": "1.45",
    }
    assert run_config.client.backend_id == "docker"
    assert run_config.options.image == "minimalist-agent-sandbox:py314"
    assert run_config.options.exposed_ports == ()


def test_sandbox_agent_shell_tools_are_reported_as_sandbox_capability():
    assert public_tool_name_for_sdk_name("exec_command") == "sandbox.exec"
    assert public_tool_name_for_sdk_name("write_stdin") == "sandbox.write_stdin"
    assert capability_for_tool_name("exec_command") == "sandbox"
    assert capability_for_tool_name("write_stdin") == "sandbox"
