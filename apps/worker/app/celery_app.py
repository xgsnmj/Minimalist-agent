from celery import Celery

from apps.worker.app.settings import get_redis_url


celery_app = Celery(
    "minimalist-agent-worker",
    broker=get_redis_url(),
    backend=get_redis_url(),
)


@celery_app.task(name="minimalist_agent_worker.health")
def worker_health() -> dict[str, str]:
    return {"service": "minimalist-agent-worker", "status": "ok"}
