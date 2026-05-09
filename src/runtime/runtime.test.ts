import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { demoProfile, demoRequests, demoUnknownCounterparty, seedEvents } from "../demoFixtures.js";
import type { IntentDriftInput, IntentDriftResult } from "../domain/types.js";
import { FileDurableEventRepository, FilePendingStepUpRepository } from "./repositories.js";
import { KernelRuntime } from "./runtime.js";

process.env.WALLET_PRIVATE_KEY ??=
  "0x1111111111111111111111111111111111111111111111111111111111111111";
process.env.USDC_CONTRACT ??= "0x2222222222222222222222222222222222222222";

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

function makeRuntime(tempDir: string) {
  return new KernelRuntime({
    profile: demoProfile,
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

test("canceled step-up is final and cannot be verified afterwards", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "runtime-cancel-stepup-"));
  const pendingRepo = new FilePendingStepUpRepository(join(tempDir, "pending-stepups.json"));
  const runtime = makeRuntime(tempDir);
  const events: string[] = [];
  const unsubscribe = runtime.subscribe((event) => {
    events.push(event.type);
  });

  const stepUp = await runtime.mockExecuteWalletTransfer(demoRequests[3]!);
  assert.equal(stepUp.ok, false);
  assert.equal(stepUp.status, "step_up_required");
  assert.ok(stepUp.challengeId);

  const result = await runtime.cancelPendingStepUp(stepUp.challengeId!, "alba");
  assert.equal(result.canceled, true);
  assert.equal(result.challengeId, stepUp.challengeId);

  const persisted = await pendingRepo.get(stepUp.challengeId!);
  assert.equal(persisted?.status, "canceled");
  assert.equal(persisted?.canceledByUsername, "alba");

  assert.ok(events.includes("step_up.canceled"));

  await assert.rejects(
    () => runtime.completeVerifiedStepUp(stepUp.challengeId!, "alba"),
    /not pending/
  );
  await assert.rejects(
    () => runtime.cancelPendingStepUp(stepUp.challengeId!, "alba"),
    /not pending/
  );

  unsubscribe();
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
