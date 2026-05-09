import { PermissionKernel } from "./kernel.js";
import { demoProfile, demoRequests, seedEvents } from "./demoFixtures.js";
import { buildX402Permission } from "./payments/x402.js";

const kernel = new PermissionKernel(demoProfile);
for (const event of seedEvents) {
  kernel.record(event);
}

console.log("Platanus Agent Permission Kernel demo\n");
console.log(`Profile: ${demoProfile.userId} mode=${demoProfile.conservatism} trustedDevice=${demoProfile.trustedDevice}\n`);

for (const request of demoRequests) {
  const evaluation = await kernel.decide(request);
  const { decision } = evaluation;
  console.log(`--- ${request.requestId}`);
  console.log(`${request.action.toUpperCase()} ${request.service}/${request.resource}`);
  console.log(`Outcome: ${decision.outcome} risk=${decision.riskScore.toFixed(2)}`);
  console.log(`Why: ${decision.explanation}`);
  console.log(`Top vector precedent: ${decision.similarActions[0]?.similarity.toFixed(2) ?? "none"}`);
  console.log(
    `Drift: provider=${evaluation.intentDrift.provider} cache=${evaluation.intentDrift.cacheStatus ?? "n/a"} score=${evaluation.intentDrift.score.toFixed(2)}`
  );
  console.log(`Events: ${evaluation.events.map((entry) => entry.type).join(" -> ")}`);

  const x402 = buildX402Permission(request);
  if (x402) {
    console.log(`x402: ${x402.endpoint} max=${x402.maximumSpend.value} ${x402.maximumSpend.currency}`);
  }

  if (decision.outcome === "step_up") {
    const challenge = kernel.createStepUpChallenge(request, decision, new Date("2026-05-09T12:00:00.000Z"));
    console.log(`Step-up channel: ${challenge.channel}`);
    console.log(`Challenge prompt: ${challenge.prompt}`);
  }

  console.log("");
}
