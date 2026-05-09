import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { demoProfile, demoRequests, demoUnknownCounterparty, seedEvents } from "../demoFixtures.js";
import type { IntentDriftInput, IntentDriftResult } from "../domain/types.js";
import { FileDurableEventRepository, FilePendingStepUpRepository } from "./repositories.js";
import { KernelRuntime } from "./runtime.js";
import { ensureWalletTestEnv } from "../testEnv.js";

ensureWalletTestEnv();

const deterministicDrift = {
  async evaluate(input: IntentDriftInput): Promise<IntentDriftResult> {
    return this.evaluateSync(input);
  },
  evaluateSync(input: IntentDriftInput): IntentDriftResult {
    return {
      driftDetected: input.actualCounterparty === demoUnknownCounterparty,
      confidence: 0.81,
      score: input.actualCounterparty === demoUnknownCounterparty ? 0.76 : 0.1,
      reasoning: "Deterministic test evaluator.",
      provider: "heuristic"
    };
  }
};

function makeRuntime(
  tempDir: string,
  options: {
    profileOverride?: Partial<typeof demoProfile>;
  } = {}
) {
  return new KernelRuntime({
    profile: {
      ...demoProfile,
      ...options.profileOverride
    },
    seedTrackEvents: seedEvents,
    durableEvents: new FileDurableEventRepository(join(tempDir, "durable-events.jsonl")),
    pendingStepUps: new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json")),
    intentDriftEvaluator: deterministicDrift,
    clock: () => new Date("2026-05-09T12:00:00.000Z")
  });
}

test("runtime bootstrap seeds only once even across re-instantiation", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-bootstrap-"));
  const repo = new FileDurableEventRepository(join(tempDir, "durable-events.jsonl"));

  const runtimeA = makeRuntime(tempDir);
  await runtimeA.assessAgentAction(demoRequests[0]!);

  const runtimeB = makeRuntime(tempDir);
  await runtimeB.assessAgentAction(demoRequests[0]!);

  const durable = await repo.list();
  assert.equal(durable.filter((event) => event.kind === "track_recorded" && event.source === "seed").length, seedEvents.length);

  rmSync(tempDir, { recursive: true, force: true });
});

test("pending step-up survives re-instantiation and can resume wallet preparation", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-prepare-stepup-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));

  const runtimeA = makeRuntime(tempDir);
  const stepUp = await runtimeA.prepareWalletTransfer(demoRequests[3]!);
  assert.equal(stepUp.ok, false);
  assert.equal(stepUp.status, "step_up_required");
  assert.ok(stepUp.challengeId);

  const runtimeB = makeRuntime(tempDir);
  const pending = await pendingRepo.get(stepUp.challengeId!);
  assert.equal(pending?.status, "pending");

  await runtimeB.beginPasskeyStepUp(stepUp.challengeId!, "alba", "auth-challenge");
  const resumed = await runtimeB.completeVerifiedStepUp(stepUp.challengeId!, "alba");

  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, "prepared");
  assert.equal(resumed.stepUpStatus, "verified");
  assert.equal(resumed.preparation.amountBaseUnits, "20000000");

  const completed = await pendingRepo.get(stepUp.challengeId!);
  assert.equal(completed?.status, "completed");

  rmSync(tempDir, { recursive: true, force: true });
});

test("verified step-up resumes wallet mock execution and promotes the route for future decisions", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-execute-stepup-"));
  const runtimeA = makeRuntime(tempDir);

  const stepUp = await runtimeA.mockExecuteWalletTransfer(demoRequests[3]!);
  assert.equal(stepUp.ok, false);
  assert.equal(stepUp.status, "step_up_required");
  assert.ok(stepUp.challengeId);

  await runtimeA.beginPasskeyStepUp(stepUp.challengeId!, "alba", "auth-challenge");
  const resumed = await runtimeA.completeVerifiedStepUp(stepUp.challengeId!, "alba");

  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, "mock_executed");
  assert.equal(resumed.stepUpStatus, "verified");

  const runtimeB = makeRuntime(tempDir);
  const followUp = await runtimeB.assessAgentAction({
    ...demoRequests[3]!,
    requestId: "req_follow_up_verified_route"
  });

  assert.notEqual(followUp.decision.outcome, "step_up");

  rmSync(tempDir, { recursive: true, force: true });
});

test("runtime stream emits challenge, verification, preparation, and mock execution events", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-stream-"));
  const runtime = makeRuntime(tempDir);
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => {
    events.push(event.type);
  });

  const stepUp = await runtime.mockExecuteWalletTransfer(demoRequests[3]!);
  assert.equal(stepUp.ok, false);
  await runtime.beginPasskeyStepUp(stepUp.challengeId!, "alba", "auth-challenge");
  await runtime.completeVerifiedStepUp(stepUp.challengeId!, "alba");

  unsubscribe();

  assert.ok(events.includes("permission.decision_made"));
  assert.ok(events.includes("step_up.challenge_created"));
  assert.ok(events.includes("step_up.verified"));
  assert.ok(events.includes("wallet.transfer_prepared"));
  assert.ok(events.includes("wallet.transfer_mock_executed"));

  rmSync(tempDir, { recursive: true, force: true });
});

test("wallet balance step-up persists challenge in pending repository", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-balance-stepup-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));
  const runtime = makeRuntime(tempDir);

  const result = await runtime.getWalletBalance(demoRequests[3]!);
  assert.equal(result.ok, false);
  assert.equal(result.status, "step_up_required");
  assert.equal(result.stepUpStatus, "pending");
  assert.ok(result.challengeId);

  const stored = await pendingRepo.get(result.challengeId!);
  assert.equal(stored?.status, "pending");
  assert.equal(stored?.operation.kind, "wallet_read_balance");
  assert.equal(stored?.channel, "passkey");

  // Survives re-instantiation
  const runtimeB = makeRuntime(tempDir);
  const pending = await runtimeB.getPendingStepUp(result.challengeId!);
  assert.equal(pending?.status, "pending");
  assert.equal(pending?.operation.kind, "wallet_read_balance");

  rmSync(tempDir, { recursive: true, force: true });
});

test("standalone assessment persists pending step-up and resumes re-assessment after passkey", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-standalone-stepup-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));
  const runtime = makeRuntime(tempDir);

  const result = await runtime.createStandaloneStepUpChallenge(demoRequests[3]!);
  assert.equal(result.ok, true);
  assert.equal(result.stepUpStatus, "pending");
  assert.ok(result.challengeId);
  assert.equal(result.decision.outcome, "step_up");

  const stored = await pendingRepo.get(result.challengeId!);
  assert.equal(stored?.status, "pending");
  assert.equal(stored?.operation.kind, "standalone_assessment");

  await runtime.beginPasskeyStepUp(result.challengeId!, "alba", "auth-challenge");
  const resumed = await runtime.completeVerifiedStepUp(result.challengeId!, "alba");

  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, "assessed");
  assert.equal(resumed.stepUpStatus, "verified");
  assert.notEqual(resumed.assessment.decision.outcome, "step_up");

  rmSync(tempDir, { recursive: true, force: true });
});

test("voice step-up requires phone confirmation before app verification", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-voice-stepup-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));
  const runtime = makeRuntime(tempDir, {
    profileOverride: {
      preferredStepUp: "voice_biometric_callback"
    }
  });

  const result = await runtime.mockExecuteWalletTransfer(demoRequests[3]!);
  assert.equal(result.ok, false);
  assert.equal(result.status, "step_up_required");
  assert.equal(result.challenge?.channel, "voice_biometric_callback");
  assert.equal(result.challenge?.deliveryChannel, "whatsapp");
  assert.ok(result.challenge?.handoffCode);
  assert.ok(result.challenge?.whatsappVerificationUrl.endsWith(`/v/${result.challenge?.handoffCode}`));
  assert.equal(result.challenge?.spokenOperationSummary, "enviar 20 USDC a Juan");
  assert.equal(result.challenge?.spokenRiskHint, "usando un destino nuevo");

  const byCode = await runtime.getPendingStepUpByHandoffCode(result.challenge!.handoffCode);
  assert.equal(byCode?.challengeId, result.challengeId);

  await assert.rejects(
    runtime.beginPasskeyStepUp(result.challengeId!, "alba", "auth-challenge"),
    /still needs verbal confirmation/
  );

  const phoneConfirmed = await runtime.confirmPhoneStepUp(result.challengeId!, "elevenlabs");
  assert.equal(phoneConfirmed.status, "phone_confirmed");

  const confirmedPending = await pendingRepo.get(result.challengeId!);
  assert.equal(confirmedPending?.status, "phone_confirmed");
  assert.equal(confirmedPending?.phoneConfirmationProvider, "elevenlabs");

  await runtime.beginPasskeyStepUp(result.challengeId!, "alba", "auth-challenge");
  const resumed = await runtime.completeVerifiedStepUp(result.challengeId!, "alba");

  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, "mock_executed");
  assert.equal(resumed.stepUpStatus, "verified");

  const completed = await pendingRepo.get(result.challengeId!);
  assert.equal(completed?.status, "completed");

  rmSync(tempDir, { recursive: true, force: true });
});

test("voice step-up is bound to the expected username before passkey can begin", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-voice-username-"));
  const runtime = makeRuntime(tempDir, {
    profileOverride: {
      preferredStepUp: "voice_biometric_callback"
    }
  });

  const result = await runtime.mockExecuteWalletTransfer(demoRequests[3]!);
  assert.equal(result.ok, false);

  await runtime.confirmPhoneStepUp(result.challengeId!, "elevenlabs");
  await assert.rejects(
    runtime.beginPasskeyStepUp(result.challengeId!, "bob", "auth-challenge"),
    /reserved for another user/
  );

  rmSync(tempDir, { recursive: true, force: true });
});

test("voice rejection marks step-up rejected and blocks further completion", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-voice-reject-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));
  const runtime = makeRuntime(tempDir, {
    profileOverride: {
      preferredStepUp: "voice_biometric_callback"
    }
  });

  const result = await runtime.createStandaloneStepUpChallenge(demoRequests[3]!);
  assert.equal(result.ok, true);
  assert.equal(result.challenge?.channel, "voice_biometric_callback");

  const rejected = await runtime.rejectStepUp(result.challengeId!, "user_denied");
  assert.equal(rejected.status, "rejected");

  const stored = await pendingRepo.get(result.challengeId!);
  assert.equal(stored?.status, "rejected");
  assert.equal(stored?.rejectedReason, "user_denied");

  await assert.rejects(
    runtime.beginPasskeyStepUp(result.challengeId!, "alba", "auth-challenge"),
    /was rejected/
  );

  rmSync(tempDir, { recursive: true, force: true });
});

test("voice confirmation and rejection endpoints behave idempotently for retries", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-voice-idempotent-"));
  const runtime = makeRuntime(tempDir, {
    profileOverride: {
      preferredStepUp: "voice_biometric_callback"
    }
  });

  const confirmedFlow = await runtime.createStandaloneStepUpChallenge(demoRequests[3]!);
  assert.equal(confirmedFlow.ok, true);
  const confirmedOnce = await runtime.confirmPhoneStepUp(confirmedFlow.challengeId!, "elevenlabs");
  assert.equal(confirmedOnce.status, "phone_confirmed");
  const confirmedTwice = await runtime.confirmPhoneStepUp(confirmedFlow.challengeId!, "elevenlabs");
  assert.equal(confirmedTwice.status, "phone_confirmed");

  const rejectedFlow = await runtime.createStandaloneStepUpChallenge({
    ...demoRequests[3]!,
    requestId: "req_voice_idempotent_reject"
  });
  assert.equal(rejectedFlow.ok, true);
  const rejectedOnce = await runtime.rejectStepUp(rejectedFlow.challengeId!, "user_denied");
  assert.equal(rejectedOnce.status, "rejected");
  const rejectedTwice = await runtime.rejectStepUp(rejectedFlow.challengeId!, "user_denied");
  assert.equal(rejectedTwice.status, "rejected");

  rmSync(tempDir, { recursive: true, force: true });
});
