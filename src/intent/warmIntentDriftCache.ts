import { demoRequests } from "../demoFixtures.js";
import { AnthropicIntentDriftEvaluator, refreshIntentDriftCache, requestToIntentDriftInput } from "./intentDrift.js";
import { FileIntentDriftCache } from "./intentDriftCache.js";

const evaluator = new AnthropicIntentDriftEvaluator({
  cache: new FileIntentDriftCache()
});

const results = await refreshIntentDriftCache(
  evaluator,
  demoRequests.map((request) => requestToIntentDriftInput(request))
);

for (let i = 0; i < results.length; i += 1) {
  const request = demoRequests[i];
  const result = results[i];
  console.log(
    `${request?.requestId}: provider=${result?.provider} cache=${result?.cacheStatus ?? "unknown"} score=${result?.score.toFixed(2)}`
  );
}
