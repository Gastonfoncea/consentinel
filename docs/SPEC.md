# Spec: Agentic Permission Kernel

## Problem

The agentic future breaks current permission models.

Static scopes are too coarse: either the user grants broad access forever or the agent gets interrupted constantly. Autonomous agents need a permission layer that can reason over context, history, intent, and blast radius before acting.

## Product Thesis

Platanus is a permission kernel for autonomous agents.

It lets agents operate freely for familiar, low-risk actions while escalating unusual, high-impact, or behaviorally implausible actions through non-UI verification channels.

## Primary User Story

As a user with autonomous agents connected to personal services, I want my agents to act without constant approval screens, while still requiring strong verification when an action stops looking like something I would plausibly want.

## MVP Scope

- MCP tools expose the permission kernel to agents.
- A behavior graph tracks user-agent-service-action-resource-counterparty relationships.
- A vector memory retrieves similar historical actions.
- A risk engine returns `allow`, `allow_with_audit`, `step_up`, or `deny`.
- x402 payment context is represented as first-class payment metadata.
- Step-up is modeled as eSIM/voice biometric callback, not an approval screen.
- The system explains why an action appears viable or non-viable for the user based on track record and context.

## Non-Goals For MVP

- Production banking integrations.
- Perfect anomaly detection.
- Full biometric provider integration.
- Consumer mobile app.
- General-purpose OAuth broker.
- A phishing-only or scam-only positioning.

## Permission Object

Every agent action is normalized into:

- `userId`: owner of the permission graph.
- `agentId`: requesting agent.
- `service`: target service or protocol.
- `action`: read, write, send, pay, share, delete, trade, or configure.
- `resource`: object being touched.
- `intent`: natural-language reason supplied by the agent.
- `counterparty`: receiver, merchant, domain, or external actor.
- `amount`: optional payment or value amount.
- `dataSensitivity`: public, internal, personal, financial, or secret.
- `reversibility`: reversible, compensatable, or irreversible.
- `x402`: optional HTTP-native payment context.
- `context.source`: where the action proposal came from, such as direct user input, email, or chat.
- `context.sourceTrust`: whether that source should be treated as trusted, mixed, or untrusted.
- `context.originalUserRequest`: the original user ask that delegated the action.
- `context.expectedCounterparty`: who the action was expected to target.
- `context.expectedAmount`: the expected delegated amount, if relevant.

This object is designed to answer a contextual question:

"Does this action still fit the delegated permission envelope for this user?"

## Decision Semantics

- `allow`: familiar and low-risk enough to execute autonomously.
- `allow_with_audit`: allowed, but important enough to log and explain.
- `step_up`: action can proceed only after voice/passkey/biometric verification bound to the exact action hash.
- `deny`: action violates hard policy or has excessive blast radius.

## Demo Narrative

1. Seed a user's normal behavior: a known recipient, recurring wallet transfers, and a typical delegated amount.
2. An agent requests the expected transfer to the expected recipient: the kernel allows it autonomously.
3. The same agent proposes a transfer that no longer fits the delegated envelope: different recipient, suspicious source, or unusual amount.
4. The kernel explains why that action no longer looks viable inside the delegated permission envelope.
5. The kernel escalates to a voice biometric challenge bound to that exact action, instead of asking for a broad session approval.
