from __future__ import annotations

import os
from enum import StrEnum

from apps.api.app.agent_run_execution import agent_run_execution
from apps.api.app.agent_runs import AgentRun, agent_run_store
from apps.api.app.runtime import runtime_store


class AgentRunDispatchMode(StrEnum):
    CELERY = "celery"
    INLINE = "inline"
    MANUAL = "manual"


class AgentRunDispatcher:
    def dispatch(self, run: AgentRun) -> AgentRun:
        mode = dispatch_mode()
        if mode == AgentRunDispatchMode.MANUAL:
            return agent_run_execution.mark_worker_enqueued(run.id)
        if mode == AgentRunDispatchMode.INLINE:
            agent_run_execution.mark_worker_enqueued(run.id)
            runtime_store.execute(run.id)
            return agent_run_store.get(run.id)

        agent_run_execution.mark_worker_enqueued(run.id)
        try:
            from apps.worker.app.celery_app import process_agent_run

            process_agent_run.delay(run.id)
        except Exception as exc:
            agent_run_execution.apply_runtime_failure(
                run_id=run.id,
                message=f"Failed to enqueue Agent Run worker task: {exc}",
            )
        return agent_run_store.get(run.id)


def dispatch_mode() -> AgentRunDispatchMode:
    configured = os.getenv("AGENT_RUN_DISPATCH_MODE", "").strip().lower()
    if configured:
        return AgentRunDispatchMode(configured)
    if os.getenv("PYTEST_CURRENT_TEST"):
        return AgentRunDispatchMode.MANUAL
    return AgentRunDispatchMode.CELERY


agent_run_dispatcher = AgentRunDispatcher()
