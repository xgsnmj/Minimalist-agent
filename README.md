# Minimalist Agent

Minimalist Agent is a single-workspace Agent Platform for WorkBuddy-like Agent Conversations and administrator-governed Agent capabilities.

## Development

Install dependencies:

```bash
pnpm install
uv sync
```

Run checks:

```bash
pnpm run ci
```

Start services separately:

```bash
scripts/dev-api.sh
scripts/dev-worker.sh
scripts/dev-web.sh
```

Or start the local stack with Docker Compose:

```bash
docker compose -f infra/docker-compose.yml up
```

## Local Accounts

The MVP uses Local Accounts. Newly registered Users start in `pending` status and cannot access protected Agent Platform surfaces until an Administrator approves them. Administrators can approve, reject, and disable Local Accounts.

## Administrator bootstrap

The first Administrator is created outside normal registration. Local development and deployment should provide these variables to the bootstrap flow:

```bash
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=change-me
```

The bootstrap account is enabled immediately and can approve the first pending Local Accounts.
