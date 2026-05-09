# Architecture

## Core Idea

Platanus acts as a Policy Decision Point and Policy Enforcement Point for agent tool calls.

Agents should not directly call payment, messaging, or data tools. They call MCP tools exposed by Platanus. Platanus evaluates whether the action is plausible for this user, in this context, with this history, then returns a decision that downstream execution adapters can enforce.

This is not just a second auth check. It is a contextual permission layer sitting between agent intent and side effects.

## Modules

- `src/kernel.ts`: orchestration layer that combines memory, risk, and step-up.
- `src/memory/behaviorGraph.ts`: relationship memory for user behavior.
- `src/memory/vectorMemory.ts`: local deterministic vector memory for similar-action retrieval.
- `src/policy/riskEngine.ts`: scoring, hard policies, and decision explanations.
- `src/stepup/voiceBiometric.ts`: non-UI verification challenge bound to a specific action.
- `src/payments/x402.ts`: x402 payment metadata adapter.
- `src/mcp/server.ts`: MCP server exposing the permission kernel as tools.

## Behavior Graph

The graph stores edges like:

```text
user -> agent
user -> service
agent -> service
service -> counterparty
action -> resource
user -> counterparty
```

Edges collect frequency, last seen timestamp, total amount, and prior outcomes. The risk engine uses this to answer:

- Has this user worked with this counterparty before?
- Does this agent usually call this service?
- Is this action-resource pair routine?
- Is the amount close to previous behavior?
- Does this permission request fit the user's established operating pattern?

## Vector Memory

Each action is converted into a canonical narrative:

```text
user=user_alba agent=finance_agent service=x402 action=pay resource=api_usage
counterparty=acme amount=12.50 USD sensitivity=financial reversibility=compensatable intent=...
```

The MVP uses a deterministic hashing vectorizer so it runs locally during a hackathon. Similarity search provides fuzzy precedent evidence:

- Similar recurring payments decrease risk.
- Lack of similar precedent increases novelty risk.
- Similar denied events increase risk.
- Similar approved contexts can justify autonomous execution without another interruption.

## Risk Engine

The risk score blends:

- Action sensitivity.
- Data sensitivity.
- Reversibility.
- Amount and payment context.
- Delegated context fit, such as original ask vs proposed recipient or amount.
- Graph familiarity.
- Vector precedent similarity.
- Projected effects and blast radius.
- Hard policy violations.

The output is explainable. Every decision includes signals that can be displayed to a judge or consumed by another agent.

The intended interpretation is: "given the permissions this user has delegated, does this specific action still look viable?" not merely "is this token valid?"

## Step-Up Without Approval Screens

If an action needs verification, the kernel creates a challenge:

```text
challengeId
boundActionHash
channel = voice_biometric_callback
phone/eSIM route
short spoken phrase
ttlSeconds
```

The important design choice: approval is bound to the exact normalized action hash. A user is not approving a vague session; they are verifying one concrete permission.

## x402 Positioning

x402 is treated as optional payment context when the agent moves value. Platanus does not replace x402. It decides whether an agent is allowed to create or satisfy an x402 payment requirement for the user.

For the MVP, `src/payments/x402.ts` models the payment context and constraints so the policy engine can reason about value transfer.

## Threats vs Identity

Prompt injection, phishing, poisoned tool descriptions, or bad downstream context are all examples of why this layer matters.

They are not the whole product identity.

The durable architectural idea is broader: permissions for agents should be contextual, behavior-aware, and capable of escalating to biometric verification when the action stops looking reasonable.
