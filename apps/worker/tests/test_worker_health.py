from apps.worker.app.celery_app import worker_health


def test_worker_health_reports_ok():
    assert worker_health.run() == {
        "service": "minimalist-agent-worker",
        "status": "ok",
    }
