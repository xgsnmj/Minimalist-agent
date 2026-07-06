from __future__ import annotations

from fastapi import HTTPException, status

from apps.api.app.agent_runs import (
    ACTIVE_RUN_STATUSES,
    AgentRun,
    AgentRunCreateRequest,
    AgentRunStatus,
    agent_run_store,
    capability_snapshot_for_agent,
    format_sse_event,
)
from apps.api.app.conversations import (
    AgentConversation,
    ConversationStatus,
    conversation_store,
)
from apps.api.app.run_event_log import RunEvent, run_event_log_store


class AgentRunLifecycle:
    def queue_for_conversation(
        self,
        *,
        conversation: AgentConversation,
        request: AgentRunCreateRequest,
    ) -> AgentRun:
        self._raise_if_conversation_has_active_run(conversation.id)
        conversation_store.append_message(
            conversation_id=conversation.id,
            role="user",
            content=request.message,
        )
        conversation_store.set_status(
            conversation_id=conversation.id,
            conversation_status=ConversationStatus.RUNNING,
        )
        run = agent_run_store.create(
            conversation_id=conversation.id,
            owner_user_id=conversation.owner_user_id,
            capability_snapshot=capability_snapshot_for_agent(
                agent=conversation.agent,
                selected_model_configuration_id=conversation.selected_model_configuration_id,
            ),
            user_message=request.message,
            events=["queued"],
        )
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.QUEUED.value},
        )
        return run

    def mark_worker_enqueued(self, run_id: int) -> AgentRun:
        run = agent_run_store.get(run_id)
        run.worker_enqueued = True
        if "worker_enqueued" not in run.events:
            run.events.append("worker_enqueued")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.QUEUED.value, "worker_enqueued": True},
        )
        return agent_run_store.save(run)

    def cancel_for_user(self, *, owner_user_id: int, run_id: int) -> AgentRun:
        run = agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        if run.status in ACTIVE_RUN_STATUSES:
            run.status = AgentRunStatus.CANCELLED
            run.events.append("cancelled")
            self._append_event(
                run,
                event_type="run.status",
                data={"status": AgentRunStatus.CANCELLED.value},
            )
            run = agent_run_store.save(run)
            self._release_conversation(run)
        return run

    def begin_runtime_execution(self, run_id: int) -> AgentRun:
        run = agent_run_store.get(run_id)
        run.status = AgentRunStatus.RUNNING
        run.events.append("running")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.RUNNING.value},
        )
        return agent_run_store.save(run)

    def apply_runtime_success(
        self,
        *,
        run_id: int,
        assistant_message: str | None,
        process_summaries: list[str],
        full_trace: dict[str, object],
    ) -> AgentRun:
        run = agent_run_store.get(run_id)
        for summary in process_summaries:
            self.record_process_summary(run, summary=summary)
        run.assistant_message = assistant_message
        if assistant_message:
            conversation_store.append_message(
                conversation_id=run.conversation_id,
                role="assistant",
                content=assistant_message,
            )
            self._append_event(
                run,
                event_type="message.completed",
                data={"role": "assistant", "content": assistant_message},
            )
        run.full_trace = full_trace
        run.status = AgentRunStatus.COMPLETED
        run.events.append("completed")
        self._append_event(
            run,
            event_type="run.status",
            data={"status": AgentRunStatus.COMPLETED.value},
        )
        run = agent_run_store.save(run)
        self._release_conversation(run)
        return run

    def apply_runtime_failure(self, *, run_id: int, message: str) -> AgentRun:
        run = agent_run_store.get(run_id)
        run.status = AgentRunStatus.FAILED
        run.error = message
        if not run.assistant_message:
            run.assistant_message = _failure_assistant_message(message)
            conversation_store.append_message(
                conversation_id=run.conversation_id,
                role="assistant",
                content=run.assistant_message,
            )
        if "failed" not in run.events:
            run.events.append("failed")
        self._append_event(
            run,
            event_type="run.error",
            data={
                "status": AgentRunStatus.FAILED.value,
                "message": run.error,
            },
        )
        run = agent_run_store.save(run)
        self._release_conversation(run)
        return run

    def record_process_summary(self, run: AgentRun, *, summary: str) -> RunEvent:
        run.process_summaries.append(summary)
        event = self._append_event(
            run,
            event_type="process.summary",
            data={"summary": summary},
        )
        agent_run_store.save(run)
        return event

    def record_message_delta(self, run: AgentRun, *, delta: str) -> RunEvent:
        current_run = agent_run_store.get(run.id)
        return self._append_event(
            current_run,
            event_type="message.delta",
            data={"role": "assistant", "delta": delta},
        )

    def record_tool_call(self, run: AgentRun, *, tool_call: dict[str, object]) -> RunEvent:
        current_run = agent_run_store.get(run.id)
        return self._append_event(
            current_run,
            event_type="tool.call",
            data={"tool_call": tool_call},
        )

    def append_card_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        conversation_id: int,
        card: dict[str, object],
    ) -> RunEvent:
        run = agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        if run.conversation_id != conversation_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agent Run not found.",
            )
        return self._append_event(
            run,
            event_type="card.rendered",
            data={"card": card},
        )

    def append_tool_call_event_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        tool_call: dict[str, object],
    ) -> RunEvent:
        run = agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        return self._append_event(
            run,
            event_type="tool.call",
            data={"tool_call": tool_call},
        )

    def list_events_after_for_user(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> list[RunEvent]:
        agent_run_store.get_for_user(owner_user_id=owner_user_id, run_id=run_id)
        return run_event_log_store.list_after(run_id=run_id, after_sequence=after_sequence)

    def format_sse_events(
        self,
        *,
        owner_user_id: int,
        run_id: int,
        after_sequence: int,
    ) -> str:
        return "".join(
            format_sse_event(event)
            for event in self.list_events_after_for_user(
                owner_user_id=owner_user_id,
                run_id=run_id,
                after_sequence=after_sequence,
            )
        )

    def _raise_if_conversation_has_active_run(self, conversation_id: int) -> None:
        for run in agent_run_store.list_all():
            if run.conversation_id == conversation_id and run.status in ACTIVE_RUN_STATUSES:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Agent Conversation already has an active run.",
                )

    def _append_event(
        self,
        run: AgentRun,
        *,
        event_type: str,
        data: dict[str, object],
    ) -> RunEvent:
        event = run_event_log_store.append(
            run_id=run.id,
            event_type=event_type,
            data=data,
        )
        run.event_log.append(event)
        return event

    def _release_conversation(self, run: AgentRun) -> None:
        conversation_store.set_status(
            conversation_id=run.conversation_id,
            conversation_status=ConversationStatus.IDLE,
        )


agent_run_lifecycle = AgentRunLifecycle()


def _failure_assistant_message(message: str) -> str:
    detail = message.strip() or "Agent Run failed."
    return f"运行未完成：{detail}"
