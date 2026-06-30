import os


def get_redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:6379/0")
