# Threat Model

## Assets

- User authority over connected services.
- Payment authorization and x402 settlement intent.
- Sensitive personal, financial, and secret data.
- Behavioral memory and audit logs.

## Primary Threats

- Prompt injection causes an agent to request dangerous tool calls.
- A legitimate agent is tricked into changing amount, counterparty, or resource.
- Stolen agent credentials attempt high-value actions.
- A broad OAuth scope is abused after initial consent.
- A user approves one thing but a different action is executed.
- Behavioral anomaly detection has false positives or false negatives.

## MVP Mitigations

- Normalize every action into a structured permission object.
- Bind verification to an exact action hash.
- Separate soft anomaly signals from hard deny policies.
- Track graph and vector memory for explainability.
- Treat new counterparties, irreversible actions, and sensitive data shares as high-risk.
- Require non-UI step-up for high-risk but potentially legitimate actions.

## Explicit Residual Risks

- The local hashing vectorizer is not semantically rich enough for production.
- Voice biometric verification is represented as an adapter contract, not a provider integration.
- x402 settlement is modeled as payment context, not fully executed in this MVP.
- Behavior graphs can encode stale or poisoned history without future anti-abuse controls.
