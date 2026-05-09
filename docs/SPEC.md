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
- The behavior graph can distinguish a counterparty identity from a specific wallet/address route.
- A vector memory retrieves similar historical actions.
- A risk engine returns `allow`, `allow_with_audit`, `step_up`, or `deny`.
- Wallet flows can prepare a real transaction payload before execution.
- x402 payment context is represented as first-class payment metadata.
- Step-up is modeled as eSIM/voice biometric callback, not an approval screen.
- Voice callback can collect only verbal intent; the final authorization still completes in-app via biometric/passkey verification bound to the same challenge.
- For the MVP handoff, the voice callback is paired with a WhatsApp verification link and a short handoff code that leads to the passkey completion screen.
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
- `counterpartyIdentity`: optional stable identity for the receiver when the concrete route is only one alias or wallet.
- `counterpartyRouteTrust`: optional route classification for the concrete destination, such as `verified`, `known_historical`, `claimed`, or `unknown`.
- `amount`: optional payment or value amount.
- `dataSensitivity`: public, internal, personal, financial, or secret.
- `reversibility`: reversible, compensatable, or irreversible.
- `x402`: optional HTTP-native payment context.
- `context.source`: where the action proposal came from, such as direct user input, email, or chat.
- `context.sourceTrust`: whether that source should be treated as trusted, mixed, or untrusted.
- `context.originalUserRequest`: the original user ask that delegated the action.
- `context.expectedCounterparty`: who the action was expected to target.
- `context.expectedCounterpartyIdentity`: the expected stable identity when multiple wallets/routes may belong to the same person or entity.
- `context.expectedCounterpartyRouteTrust`: whether the expected concrete route was already verified/known or is only being claimed at request time.
- `context.expectedAmount`: the expected delegated amount, if relevant.

This object is designed to answer a contextual question:

"Does this action still fit the delegated permission envelope for this user?"

For wallet and crypto flows, this expands into a second question:

"Is this still the same trusted person, and is the concrete wallet or route independently trustworthy enough to use now?"

## Decision Semantics

- `allow`: familiar and low-risk enough to execute autonomously.
- `allow_with_audit`: allowed, but important enough to log and explain.
- `step_up`: action can proceed only after voice/passkey/biometric verification bound to the exact action hash.
- A voice-first `step_up` remains pending after the call until the user finishes biometric verification in the app; a verbal rejection blocks the action immediately.
- The phone call must describe the concrete operation being validated in controlled human language, rather than reading a generic static prompt.
- `deny`: action violates hard policy or has excessive blast radius.

## Counterparty Identity And Route Trust

For crypto actions, the system separates:

- **Identity trust**: whether the user already has a trusted relationship with a person or entity, such as `Juan`.
- **Route trust**: whether the exact destination wallet/address/route has been safely used or verified before.

This prevents the system from over-trusting a new wallet just because the claimed person is familiar.

### Core concepts

- A known identity can have many routes or wallets across networks.
- A new route does **not** automatically inherit full trust from the identity.
- Identity familiarity can reduce friction, but route novelty remains a material risk signal.
- Untrusted sources claiming "this is also Juan's new wallet" should not silently upgrade trust.

### Route trust states

- `verified`: the route was explicitly verified by the user or a strong proof workflow.
- `known_historical`: the route has already been used successfully in prior approved behavior.
- `claimed`: the route is presented as belonging to a known identity, but the system has not independently verified or observed it before.
- `unknown`: the system has neither proof nor history tying the route to the identity.

### Decision guidance for new wallets

- Known identity + `verified` route: can inherit strong trust and behave like a familiar counterparty.
- Known identity + `known_historical` route: can inherit substantial trust with normal anomaly checks.
- Known identity + `claimed` route from a trusted direct-user context: should usually require `step_up` before first use.
- Known identity + `claimed` route from mixed or untrusted context: should default toward `step_up` or `deny`.
- Unknown identity + new route: behaves like a new counterparty with no inherited trust.

### Product principle

The system should prefer:

- **Trusting people over mediums** when the route is already verified or historically established.
- **Distrusting newly introduced wallets** until they become verified or historically established.

## Demo Narrative

1. Seed a user's normal behavior: a known recipient, recurring wallet transfers, and a typical delegated amount.
2. An agent requests the expected transfer to the expected recipient: the kernel allows it autonomously.
3. The same agent proposes a transfer that no longer fits the delegated envelope: different recipient, suspicious source, or unusual amount.
4. If the recipient is still claimed to be Juan but the wallet is newly introduced, the kernel treats that route as untrusted until verified.
5. When the action is allowed, the system prepares the concrete ERC-20 transfer payload that would be sent onchain.
6. The kernel explains why that action no longer looks viable inside the delegated permission envelope when it is blocked or escalated.
7. The kernel escalates to a voice biometric challenge bound to that exact action, instead of asking for a broad session approval.
8. The final transaction broadcast can remain mocked while the permission decision and prepared payload stay real and auditable.
