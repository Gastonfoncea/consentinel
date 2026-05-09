# Platanus Agent Permission Kernel

An agent-first middleware for dynamic permissions.

Static scopes do not work well for autonomous agents. Either the user grants a permanent master key, or the agent gets blocked every few minutes. Platanus sits between the agent and the action to decide whether a requested operation looks reasonable for this user, this context, and this track record.

The MVP is intentionally not UI-first. Agents call MCP tools. The kernel decides whether a requested action should pass autonomously, pass with audit, require biometric step-up, or be denied.

## Product Framing

**Permission intelligence for autonomous agents.**

Instead of treating permissions as binary, Platanus builds a user-specific understanding from:

- A behavior graph of users, agents, services, actions, resources, counterparties, and prior outcomes.
- A vector memory of past action narratives for fuzzy precedent matching.
- A risk policy engine that estimates novelty, amount deviation, sensitivity, reversibility, permission viability, and likely effects.
- Non-UI step-up channels such as eSIM voice callback plus biometric/passkey verification.
- Optional payment context such as x402 when the agent is moving value.

The point is not to authenticate the user again and again. The point is to decide whether an action still looks like something the user would plausibly want to allow right now.

To support that, requests can carry delegated context such as the original user ask, expected recipient, expected amount, and the trust level of the source that influenced the action.

## Demo

```bash
npm install
npm run demo
```

Run as an MCP server:

```bash
npm run mcp
```

## Architecture

```text
Agent tool call
  -> MCP permission tools
  -> PermissionKernel
  -> BehaviorGraph + VectorMemory
  -> RiskEngine
  -> allow | allow_with_audit | step_up | deny
  -> optional voice biometric challenge bound to exact action hash
```

## Why This Is Not Just Rules

Rules alone cannot answer: "is this normal for this user, this agent, this counterparty, and this context?"

This MVP stores each permission event twice:

- As graph edges, so the kernel can reason about relationships and frequency.
- As embedded action text, so the kernel can retrieve similar precedents even when the exact action changes.

The local vectorizer is deterministic hashing for hackathon reliability. It can be swapped for Voyage, OpenAI, or another embedding model without changing the decision flow.

## What It Is Not

Platanus is not primarily an anti-phishing product, an OAuth broker, or a mobile approval screen.

Those are useful threat scenarios and integration details, but the core product is a permission kernel that reasons over behavior and context before an agent acts.

## Core MCP Tools

- `platanus_record_track_event`: add a prior user behavior event.
- `platanus_assess_agent_action`: decide whether an agent action should pass, step up, or be denied.
- `platanus_explain_permission_memory`: show graph and vector evidence behind a future action.
- `platanus_create_step_up_challenge`: generate a voice biometric challenge bound to the exact action.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/SPEC.md](docs/SPEC.md).
