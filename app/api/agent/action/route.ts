import { NextResponse } from "next/server";
import { z } from "zod";
import { publish } from "@/lib/events/bus";
import { getKernel } from "@/lib/kernel/instance";
import {
  SCENARIOS,
  buildPhraseForChallenge,
  buildRequest,
  type ScenarioId
} from "@/lib/agent/scenarios";
import { createChallenge } from "@/src/stepup/voiceVerification";
import type { KernelDecisionTrace } from "@/src/kernel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/agent/action
//   body: { scenario: "aligned_transfer" | "recipient_swap" | "amount_spike" }
//
// Builds the canonical AgentActionRequest for the chosen demo scenario,
// runs it through the kernel, publishes events to the SSE bus at each
// stage, and — when a step-up is required — creates a voice challenge so
// the browser can launch the ElevenLabs SDK with the right dynamic
// variables.

const bodySchema = z.object({
  scenario: z.enum(["aligned_transfer", "recipient_swap", "amount_spike"])
});

const ENV_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "";

export async function POST(req: Request) {
  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 400 }
    );
  }

  const scenarioId = payload.scenario as ScenarioId;
  const meta = SCENARIOS[scenarioId];
  const request = buildRequest(scenarioId);

  // 1. Publish the initial "request" event so the UI flips to thinking.
  publish({
    type: "request",
    ts: Date.now(),
    requestId: request.requestId,
    agentId: request.agentId,
    action: request.action,
    service: request.service,
    intent: request.intent
  });

  publish({
    type: "thinking",
    ts: Date.now(),
    requestId: request.requestId,
    message: `Routing through behavior graph and vector memory for ${meta.label.toLowerCase()}…`
  });

  // 2. Run the kernel. This includes the Anthropic intent-drift call which
  //    can take ~2-5s — we keep the connection open so the UI sees evidence
  //    + decision in the same response.
  let trace: KernelDecisionTrace;
  try {
    trace = await getKernel().decide(request);
  } catch (err) {
    publish({
      type: "decision",
      ts: Date.now(),
      requestId: request.requestId,
      outcome: "deny",
      riskScore: 1,
      explanation: `Kernel error: ${err instanceof Error ? err.message : String(err)}`
    });
    return NextResponse.json(
      {
        ok: false,
        error: "kernel_failure",
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }

  const { decision, graphEvidence, similarActions, intentDrift } = trace;

  // 3. Translate the kernel's structured signals into UI-shaped evidence
  //    events so the log panel + circle have something to show.
  publish({
    type: "evidence",
    ts: Date.now(),
    requestId: request.requestId,
    label: "graph",
    detail: graphEvidence.newCounterparty
      ? "counterparty never seen before"
      : `familiarityScore ${graphEvidence.familiarityScore.toFixed(2)} · amountMultiple ${graphEvidence.amountMultiple.toFixed(2)}`
  });

  publish({
    type: "evidence",
    ts: Date.now(),
    requestId: request.requestId,
    label: "vectors",
    detail:
      similarActions.length > 0
        ? `top precedent similarity ${similarActions[0]!.similarity.toFixed(2)}`
        : "no precedent for this recipient"
  });

  publish({
    type: "evidence",
    ts: Date.now(),
    requestId: request.requestId,
    label: "intent_drift",
    detail: `${intentDrift.driftDetected ? "drift detected" : "aligned with original ask"} · score ${intentDrift.score.toFixed(2)} (${intentDrift.provider})`
  });

  // 4. Publish the kernel decision. For step_up this is the provisional
  //    decision; the final allow/deny will be emitted later by the voice
  //    decision route or the passkey-complete route.
  publish({
    type: "decision",
    ts: Date.now(),
    requestId: request.requestId,
    outcome: decision.outcome,
    riskScore: decision.riskScore,
    explanation: decision.explanation
  });

  if (decision.outcome !== "step_up") {
    return NextResponse.json({
      ok: true,
      status: decision.outcome,
      decision: {
        requestId: decision.requestId,
        outcome: decision.outcome,
        riskScore: decision.riskScore,
        explanation: decision.explanation,
        actionHash: decision.actionHash
      }
    });
  }

  // 5. step_up — create a challenge and tell the browser to start the SDK.
  const phrase = buildPhraseForChallenge(request);
  const actionSummary = request.intent;

  const challenge = createChallenge({
    requestId: request.requestId,
    userId: request.userId,
    agentId: request.agentId,
    phrase,
    actionSummary,
    actionHash: decision.actionHash,
    request
  });

  publish({
    type: "step_up",
    ts: Date.now(),
    requestId: request.requestId,
    channel: "voice_biometric_callback",
    prompt: phrase
  });

  return NextResponse.json({
    ok: true,
    status: "step_up_required",
    challenge: {
      challengeId: challenge.challengeId,
      requestId: challenge.requestId,
      phrase: challenge.phrase,
      actionSummary: challenge.actionSummary,
      actionHash: challenge.actionHash,
      expiresAt: challenge.expiresAt
    },
    elevenlabs: {
      agentId: ENV_AGENT_ID,
      hasAgentId: ENV_AGENT_ID.length > 0,
      // dynamic variables the browser passes when starting the SDK session
      dynamicVariables: {
        challenge_id: challenge.challengeId,
        phrase: challenge.phrase,
        action_summary: challenge.actionSummary,
        action_hash: challenge.actionHash
      }
    },
    decision: {
      requestId: decision.requestId,
      outcome: decision.outcome,
      riskScore: decision.riskScore,
      explanation: decision.explanation,
      actionHash: decision.actionHash
    }
  });
}

// GET — list scenarios so the UI can render buttons without hardcoding.
export async function GET() {
  return NextResponse.json({
    ok: true,
    scenarios: Object.values(SCENARIOS)
  });
}
