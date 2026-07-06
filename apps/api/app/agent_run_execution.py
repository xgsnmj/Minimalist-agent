from __future__ import annotations

from apps.api.app.agent_run_lifecycle import agent_run_lifecycle
from apps.api.app.agent_runs import AgentRun, AgentRunCreateRequest
from apps.api.app.conversations import AgentConversation
from apps.api.app.run_event_log import RunEvent


class AgentRunExecution:
    def queue_for_conversation(
        self,
        *,
        conversation: AgentConversation,
        request: AgentRunCreateRequest,
    ) -> AgentRun:
        return agent_run_lifecycle.queue_for_conversation(
            conversation=conversation,
            request=request,
        )

    def queue_and_dispatch_for_conversation(
        self,
        *,
        conversation: AgentConversation,
        request: AgentRunCreateRequest,
    ) -> AgentRun:
        return self.dispatch(
            self.queue_for_conversation(
                conversation=conversation,
                request=request,
            )
        )

    def dispatch(self, run: AgentRun) -> AgentRun:
        from apps.api.app.agent_run_dispatcher import agent_run_dispatcher

        return agent_run_dispatcher.dispatch(run)

    def execute(self, run_id: int) -> dict[str, object]:
        from apps.api.app.runtime import runtime_store

        return runtime_store.execute(run_id)

    def mark_worker_enqueued(self, run_id: int) -> AgentRun:
        return agent_run_lifecycle.mark_worker_enqueued(run_id)

    def cancel_for_user(self, *, owner_user_id: int, run_id: int) -> AgentRun:
        return agent_run_lifecycle.cancel_for_user(
            owner_user_id=owner_user_id,
            run_id=run_id,
        )

    def begin_runtime_execution(self, run_id: int) -> AgentRun:
        return agent_run_lifecycle.begin_runtime_execution(run_id)

    def apply_runtime_success(
        self,
        *,
        run_id: int,
        assistant_message: str | None,
        process_summaries: list[str],
        full_trace: dict[str, object],
    ) -> AgentRun:
        return agent_run_lifecycle.apply_runtime_success(
            run_id=run_id,
            assistant_message=assistant_message,
            process_summaries=process_summaries,
            full_trace=full_trace,
        )

    def apply_runtime_failure(self, *, run_id: int, message: str) -> AgentRun:
        return agent_run_lifecycle.apply_runtime_failure(
            run_id=run_id,
            message=message,
        )

    def record_process_summary(self, run: AgentRun, *, summary: str) -> RunEvent:
        return agent_run_lifecycle.record_process_summary(run, summary=summary)

    def record_message_delta(self, run: AgentRun, *, delta: str) -> RunEvent:
        return agent_run_lifecycle.record_message_delta(run, delta=delta)

    def record_tool_call(self, run: AgentRun, *, tool_call: dict[str, object]) -> RunEvent:
        return agent_run_lifecycle.record_tool_call(run, tool_call=tool_call)

    def append_card_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        conversation_id: int,
        card: dict[str, object],
    ) -> RunEvent:
        return agent_run_lifecycle.append_card_event_for_user(
            owner_user_id=owner_user_id,
            run_id=run_id,
            conversation_id=conversation_id,
            card=card,
        )

    def append_tool_call_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        tool_call: dict[str, object],
    ) -> RunEvent:
        return agent_run_lifecycle.append_tool_call_event_for_user(
            owner_user_id=owner_user_id,
            run_id=run_id,
            tool_call=tool_call,
        )

    def list_events_after_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> list[RunEvent]:
        return agent_run_lifecycle.list_events_after_for_user(
            owner_user_id=owner_user_id,
            run_id=run_id,
            after_sequence=after_sequence,
        )

    def format_sse_events(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> str:
        return agent_run_lifecycle.format_sse_events(
            owner_user_id=owner_user_id,
            run_id=run_id,
            after_sequence=after_sequence,
        )


agent_run_execution = AgentRunExecution()
