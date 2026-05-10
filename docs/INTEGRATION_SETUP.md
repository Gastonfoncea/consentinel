# Remote MCP Integration

## MCP endpoint

- URL: `/api/mcp`
- Methods: `GET`, `POST`, `DELETE`, `OPTIONS`
- Auth: `Authorization: Bearer <MCP_SERVER_TOKEN>`
- Fallback auth: if `MCP_SERVER_TOKEN` is unset, the server accepts `STEP_UP_SERVICE_TOKEN`

## Stateless behavior

- The remote MCP transport is stateless on purpose.
- `initialize` does not return `mcp-session-id`.
- `tools/list` and `tools/call` can be sent as independent requests.
- This avoids `MCP session not found` failures when Vercel routes follow-up calls to a different instance.

## Step-up companion endpoints

- `GET /api/step-up/voice/:challengeId`
- `POST /api/step-up/voice/confirm`
- `POST /api/step-up/voice/reject`
- `GET /api/step-up/voice/tts/:challengeId`
- `POST /api/step-up/passkey/approve`
- `POST /api/step-up/passkey/reject`

## Required env

- `STEP_UP_SERVICE_TOKEN`
- `MCP_SERVER_TOKEN` (recommended)
- `ELEVENLABS_API_KEY` for `/api/step-up/voice/tts/:challengeId`
- Optional TTS overrides: `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`
- `PREFERRED_STEP_UP=voice_biometric_callback` if you want MCP `wallet_transfer` step-ups to auto-trigger Kapso
- `KAPSO_API_KEY`
- `KAPSO_WORKFLOW_ID`
- Optional Kapso overrides: `KAPSO_API_BASE_URL`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WHATSAPP_CONFIG_ID`
- `DEMO_PHONE_E164`, `DEMO_USER_ID`, and `DEMO_USERNAME` so MCP wallet requests carry the real phone/user context outside a logged-in browser session

## Local verification

```bash
npm run test:mcp-remote
```

This verifies:

- `initialize` returns `200`
- no `mcp-session-id` header is issued
- `tools/list` works in a separate request with the negotiated protocol version

## Kapso auto-trigger behavior

- The MCP `wallet_transfer` flow only starts Kapso automatically when the kernel returns `step_up_required` and the selected channel is `voice_biometric_callback`.
- The backend queues `POST {KAPSO_API_BASE_URL}/workflows/{KAPSO_WORKFLOW_ID}/executions` with the `challengeId`, handoff code, verification URL, transfer details, and user context.
- If Kapso is not configured or the API call fails, the kernel result is still returned; the response includes `kapsoExecution` metadata for debugging.
