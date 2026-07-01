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

## Full local MVP smoke workflow

The end-to-end MVP path is covered by a focused smoke test:

```bash
uv run pytest apps/api/tests/test_mvp_smoke_workflow.py -q
```

That smoke test verifies Local Account registration, Administrator approval, login, Model Configuration, Agent capability setup, Agent Conversation creation, a Background Agent Run, AG-UI SSE resume, Tool Calls, Artifact Preview, Run Cancellation, one-active-run behavior, and Administrator Run Audit with Full Trace access.

To try the same flow manually, start the local services:

```bash
scripts/dev-api.sh
scripts/dev-worker.sh
scripts/dev-web.sh
```

Then use the bootstrap Administrator to approve a registered Local Account, configure the Default Agent with an enabled Model Configuration, start an Agent Conversation, let the worker finish the run, refresh or return to the conversation to confirm the result, invoke an enabled tool that creates an artifact, preview the artifact, cancel a separate active run, and inspect the completed run from Run Audit.
