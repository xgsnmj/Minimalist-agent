# Reference backend and middleware stack

Minimalist Agent will use FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, MySQL, Redis, MinIO, and Celery as its backend and middleware foundation. This follows the proven stack from the reference workspace and gives the platform standard places for users, configuration, conversations, messages, tool call indexes, artifact metadata, background jobs, cache, queueing, and object storage. Agent Runs can execute as background work while the frontend subscribes to persisted events through the Agent Event Protocol.
