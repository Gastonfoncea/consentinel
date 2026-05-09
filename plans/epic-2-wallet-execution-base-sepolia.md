# Plan: Wallet Execution Layer on Base Sepolia

> Source PRD: Assumed next Linear epic after EPIC-1, centered on `CON-9` (`Base Sepolia wallet base`) plus the wallet/execution path implied by the current product spec and remote branch history.

## Architectural decisions

Durable decisions that apply across all phases:

- **Repo shape**: Keep the current single repository with three clear surfaces: Next.js demo app, TypeScript kernel/MCP layer, and `contracts/` as a Foundry workspace.
- **Chain target**: Use **Base Sepolia** as the only supported chain for this epic.
- **Token baseline**: Use a demo-safe ERC-20 with **6 decimals** (`MockUSDC`) as the primary payment asset for wallet flows.
- **Permission boundary**: The kernel remains the decision point. No wallet action should bypass `PermissionKernel.decide()`.
- **Execution model**: This epic prepares and executes narrowly-scoped wallet actions, not a general wallet platform. Start with a single transfer flow before broader wallet capabilities.
- **Step-up boundary**: Step-up remains challenge generation and action binding. Full real biometric completion and telephony execution stay out of scope.
- **State model**: Treat wallet state as read-mostly chain state plus deterministic local demo fixtures where live infra is absent.
- **Transport surface**: Reuse MCP tools and the existing demo/event-stream surface instead of inventing a second orchestration path.

---

## Phase 1: Wallet Sandbox Foundation

**User stories**: As a team, we can stand up a reliable Base Sepolia demo environment with one wallet asset and deterministic local developer setup.

### What to build

Establish the chain sandbox that the rest of the epic depends on: Foundry workspace present in the repo, one demo ERC-20 contract, documented env vars, network constants, and the minimum scripts/config needed to build, test, and reason about wallet actions consistently.

### Acceptance criteria

- [ ] The repo includes a `contracts/` workspace that builds and tests independently from the TypeScript kernel.
- [ ] Base Sepolia is the documented and code-defined target network for this epic.
- [ ] `MockUSDC` is available as the canonical demo token with stable metadata and decimals.
- [ ] The project docs explain how local contributors obtain or simulate balances for demo scenarios.

---

## Phase 2: Chain Read Model

**User stories**: As the kernel and demo app, we can inspect wallet state before deciding or preparing an action.

### What to build

Add a narrow chain read layer that can answer the questions the kernel and UI need: wallet address, chain identity, token balance, token metadata, and transfer feasibility inputs. Keep the API intentionally small and shaped around the demo payment use case rather than generic web3 exploration.

### Acceptance criteria

- [ ] The app/kernel can resolve the active wallet, chain, and supported payment token for the demo flow.
- [ ] The read layer can return token balances and enough metadata to display and validate a payment amount.
- [ ] The read path supports both live Base Sepolia usage and deterministic fallback/fixture behavior for offline demo work.
- [ ] Read-model failures surface as typed errors that the demo and MCP tools can explain cleanly.

---

## Phase 3: Permission-Gated Wallet Intent

**User stories**: As an agent, I can request an onchain payment through the permission kernel and receive a decision tied to the exact wallet action.

### What to build

Introduce a normalized wallet payment request that maps cleanly into the existing `AgentActionRequest` contract. The kernel should assess onchain transfers with the same contextual reasoning as the rest of the system, including counterparty familiarity, amount plausibility, source trust, and x402/payment metadata where relevant.

### Acceptance criteria

- [ ] A wallet transfer request can be normalized into the kernel without bespoke one-off policy logic.
- [ ] The decision output includes signals and event trace specific enough to explain why the wallet action is allowed, audited, stepped up, or denied.
- [ ] The exact action hash used for step-up is stable for a given normalized wallet request.
- [ ] Suspicious recipient swaps and anomalous amounts still trigger the expected protective behavior in wallet scenarios.

---

## Phase 4: Transaction Preparation and Execution Adapter

**User stories**: As a system, once a wallet action is approved, we can prepare the concrete transaction payload needed to execute it on Base Sepolia.

### What to build

Add a thin execution adapter that converts an approved wallet intent into a concrete transfer payload for the target chain and token. Keep it single-purpose: one transfer primitive, one token baseline, one chain. The adapter should separate preparation from send/broadcast so the kernel retains control over authorization boundaries.

### Acceptance criteria

- [ ] Approved wallet actions produce a deterministic transaction preparation artifact with recipient, amount, token, chain, and calldata/value fields as needed.
- [ ] Denied or step-up-blocked actions never produce an executable payload until their decision state allows it.
- [ ] The execution adapter is testable without requiring a live chain for every validation path.
- [ ] The prepared transaction shape is reusable by MCP tools and the demo UI without additional translation layers.

---

## Phase 5: MCP and Demo End-to-End Flow

**User stories**: As a demo operator or judge, I can watch an agent request a wallet transfer, see the kernel reason about it, and observe the resulting onchain preparation path.

### What to build

Expose the wallet flow through the existing MCP surface and through the Next.js demo/log stream. The happy path should show a familiar, approved transfer. The protective path should show a recipient or amount deviation that produces `step_up` or `deny`, with the explanation visible in the UI.

### Acceptance criteria

- [ ] MCP exposes a wallet-oriented assessment and/or execution-preparation path without bypassing existing tool naming conventions unless a new tool is clearly required.
- [ ] The Next.js demo can render the wallet decision trace using the current event/log surfaces.
- [ ] At least one approved wallet scenario and one blocked/escalated wallet scenario are demoable end to end.
- [ ] The event stream and UI copy make it obvious when the system is preparing an onchain transfer versus merely simulating it.

---

## Phase 6: Validation, Safety Rails, and Demo Ops

**User stories**: As a team, we can trust the epic enough to demo it repeatedly without mystery failures.

### What to build

Finish the epic with focused validation: contract tests, kernel tests for wallet scenarios, MCP-level integration checks, and a short operator runbook for env vars, funded addresses, faucet assumptions, and fallback behavior. Treat this as the “make the demo hold together under pressure” phase.

### Acceptance criteria

- [ ] Contract-level tests cover token behavior and any transfer preparation assumptions the adapter relies on.
- [ ] Kernel tests cover familiar transfer allow, suspicious recipient step-up, and out-of-envelope deny behavior for wallet actions.
- [ ] MCP/demo validations prove the wallet flow still works when live chain access is unavailable or partially degraded.
- [ ] The repo documents how to run the wallet demo, what is mocked, and what is genuinely live on Base Sepolia.
