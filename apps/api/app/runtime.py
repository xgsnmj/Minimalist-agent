from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from agents import Agent, Model, ModelProvider, ModelSettings, ModelTracing, Runner, RunConfig
from agents.items import ModelResponse, MessageOutputItem, ReasoningItem, ToolCallItem
from agents.tracing import flush_traces, set_trace_processors
from agents.tracing.processor_interface import TracingProcessor as TracingProcessorProtocol
from agents.tracing.traces import Trace
from agents.usage import Usage
from openai.types.responses import ResponseOutputMessage, ResponseOutputText

from apps.api.app.agent_runs import AgentRunStatus, agent_run_store
from apps.api.app.agents import agent_store
from apps.api.app.conversations import ConversationStatus, conversation_store
from apps.api.app.model_configurations import model_configuration_store


@dataclass
class RuntimeResult:
    status: str
    model_name: str
    agent_instruction_snapshot: str
    process_summaries: list[str] = field(default_factory=list)
    full_trace: dict[str, object] = field(default_factory=dict)


class _CapturedTraceProcessor(TracingProcessorProtocol):
    def __init__(self) -> None:
        self.trace: dict[str, object] | None = None

    def on_trace_start(self, trace: Trace) -> None:
        self.trace = trace.to_json(include_tracing_api_key=False)

    def on_trace_end(self, trace: Trace) -> None:
        self.trace = trace.to_json(include_tracing_api_key=False)

    def on_span_start(self, span) -> None:
        return None

    def on_span_end(self, span) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self) -> None:
        return None


class _LocalModel(Model):
    def __init__(self, model_name: str, provider_id: str) -> None:
        self.model_name = model_name
        self.provider_id = provider_id

    async def get_response(
        self,
        system_instructions: str | None,
        input: str | list[Any],
        model_settings: ModelSettings,
        tools: list[Any],
        output_schema: Any,
        handoffs: list[Any],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: Any,
    ) -> ModelResponse:
        user_message = _last_user_text(input)
        assistant_text = f"{self.provider_id}:{self.model_name} handled {user_message}"
        output = ResponseOutputMessage(
            id=f"response-{self.model_name}",
            content=[
                ResponseOutputText(
                    annotations=[],
                    text=assistant_text,
                    type="output_text",
                )
            ],
            role="assistant",
            status="completed",
            type="message",
        )
        return ModelResponse(
            output=[output],
            usage=Usage(requests=1, input_tokens=1, output_tokens=1, total_tokens=2),
            response_id=f"response-{self.model_name}",
        )

    def stream_response(
        self,
        system_instructions: str | None,
        input: str | list[Any],
        model_settings: ModelSettings,
        tools: list[Any],
        output_schema: Any,
        handoffs: list[Any],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
        conversation_id: str | None,
        prompt: Any,
    ):
        raise NotImplementedError


class _LocalModelProvider(ModelProvider):
    def __init__(self, provider_id: str, model_name: str) -> None:
        self.provider_id = provider_id
        self.model_name = model_name

    def get_model(self, model_name: str | None) -> Model:
        return _LocalModel(model_name or self.model_name, self.provider_id)


class RuntimeStore:
    def reset(self) -> None:
        return None

    def execute(self, run_id: int) -> dict[str, object]:
        run = agent_run_store.get(run_id)
        if run.status in {AgentRunStatus.CANCELLED, AgentRunStatus.COMPLETED, AgentRunStatus.FAILED}:
            return self._runtime_result_from_run(run, full_trace=_trace_fallback(run))

        if "failure" in run.user_message.lower():
            run.status = AgentRunStatus.FAILED
            run.error = "Mock Agent Runtime failed."
            run.events.append("failed")
            agent_run_store._append_event(
                run,
                event_type="run.error",
                data={"status": run.status.value, "message": run.error},
            )
            conversation_store.set_status(
                conversation_id=run.conversation_id,
                conversation_status=ConversationStatus.IDLE,
            )
            return self._runtime_result_from_run(run, full_trace=_trace_fallback(run))

        model_configuration = _resolve_model_configuration(run.capability_snapshot.selected_model_configuration_id)
        agent = agent_store.get(run.capability_snapshot.agent_id)
        provider_id = model_configuration.provider_id if model_configuration else "openai"
        model_name = model_configuration.model_name if model_configuration else "gpt-5"

        trace_processor = _CapturedTraceProcessor()
        set_trace_processors([trace_processor])

        run.status = AgentRunStatus.RUNNING
        run.events.append("running")
        agent_run_store._append_event(
            run,
            event_type="run.status",
            data={"status": run.status.value},
        )

        runtime_agent = Agent(
            name=agent.name,
            instructions=agent.instruction,
            model=model_name,
        )
        run_config = RunConfig(
            model_provider=_LocalModelProvider(provider_id=provider_id, model_name=model_name),
            model_settings=ModelSettings(include_usage=True, metadata={"provider_id": provider_id}),
            workflow_name="Agent workflow",
            trace_include_sensitive_data=False,
            trace_metadata={
                "agent_id": str(agent.id),
                "run_id": str(run.id),
                "conversation_id": str(run.conversation_id),
                "provider_id": provider_id,
                "model_name": model_name,
            },
        )

        try:
            result = Runner.run_sync(runtime_agent, run.user_message, run_config=run_config)
        except Exception as exc:
            run.status = AgentRunStatus.FAILED
            run.error = str(exc)
            run.events.append("failed")
            agent_run_store._append_event(
                run,
                event_type="run.error",
                data={"status": run.status.value, "message": run.error},
            )
            set_trace_processors([])
            flush_traces()
            return self._runtime_result_from_run(run, full_trace=_trace_fallback(run))

        assistant_message = _extract_final_output(result.final_output)
        run.assistant_message = assistant_message
        run.process_summaries = [
            f"Reviewed the Agent Instruction snapshot for conversation {run.conversation_id}.",
            f"Used model {model_name} from {provider_id}.",
        ]
        for summary in run.process_summaries:
            agent_run_store._append_event(
                run,
                event_type="process.summary",
                data={"summary": summary},
            )
        if assistant_message:
            conversation_store.append_message(
                conversation_id=run.conversation_id,
                role="assistant",
                content=assistant_message,
            )
            agent_run_store._append_event(
                run,
                event_type="message.completed",
                data={"role": "assistant", "content": assistant_message},
            )
        run.status = AgentRunStatus.COMPLETED
        run.events.append("completed")
        agent_run_store._append_event(
            run,
            event_type="run.status",
            data={"status": run.status.value},
        )
        conversation_store.set_status(
            conversation_id=run.conversation_id,
            conversation_status=ConversationStatus.IDLE,
        )
        trace = trace_processor.trace or _trace_fallback(run)
        trace.setdefault("workflow_name", "Agent workflow")
        trace.setdefault("metadata", {})
        trace["run_id"] = run.id
        trace["agent_id"] = agent.id
        trace["model_name"] = model_name
        run.full_trace = trace
        set_trace_processors([])
        flush_traces()
        return self._runtime_result_from_run(run, model_name=model_name, full_trace=trace)

    def _runtime_result_from_run(
        self,
        run,
        *,
        model_name: str | None = None,
        full_trace: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "id": run.id,
            "status": run.status.value,
            "model_name": model_name or _run_model_name(run),
            "agent_instruction_snapshot": run.capability_snapshot.agent_instruction_snapshot,
            "process_summaries": list(run.process_summaries),
            "full_trace": full_trace or _trace_fallback(run),
        }


def _resolve_model_configuration(configuration_id: int | None):
    if configuration_id is not None:
        return model_configuration_store.get(configuration_id)
    configs = model_configuration_store.list_configurations()
    return configs[0] if configs else None


def _run_model_name(run) -> str:
    model_configuration = _resolve_model_configuration(run.capability_snapshot.selected_model_configuration_id)
    return model_configuration.model_name if model_configuration else "gpt-5"


def _trace_fallback(run) -> dict[str, object]:
    return {
        "workflow_name": "Agent workflow",
        "metadata": {
            "run_id": run.id,
            "conversation_id": run.conversation_id,
            "agent_id": run.capability_snapshot.agent_id,
        },
    }


def _last_user_text(input_value: str | list[Any]) -> str:
    if isinstance(input_value, str):
        return input_value
    for item in reversed(input_value):
        if isinstance(item, dict) and item.get("role") == "user":
            content = item.get("content")
            if isinstance(content, str):
                return content
    return ""


def _extract_final_output(final_output: object) -> str:
    if isinstance(final_output, str):
        return final_output
    if isinstance(final_output, MessageOutputItem):
        return final_output.raw_item.content[0].text if final_output.raw_item.content else ""
    if isinstance(final_output, ReasoningItem):
        return ""
    if isinstance(final_output, ToolCallItem):
        return ""
    if isinstance(final_output, dict):
        text = final_output.get("text")
        if isinstance(text, str):
            return text
    return str(final_output)


runtime_store = RuntimeStore()
