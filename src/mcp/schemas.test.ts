import assert from "node:assert/strict";
import test from "node:test";
import { demoRequests, seedEvents } from "../demoFixtures.js";
import { requestSchema } from "./schemas.js";

test("request schema accepts explicit route-trust fields", () => {
  const parsed = requestSchema.parse(demoRequests[3]);

  assert.equal(parsed.counterpartyRouteTrust, "claimed");
  assert.equal(parsed.context?.expectedCounterpartyRouteTrust, "known_historical");
});

test("request schema rejects invalid route-trust values", () => {
  assert.throws(
    () =>
      requestSchema.parse({
        ...demoRequests[0],
        counterpartyRouteTrust: "totally_safe"
      }),
    /Invalid option/
  );

  assert.throws(
    () =>
      requestSchema.parse({
        ...seedEvents[0]?.request,
        context: {
          ...seedEvents[0]?.request.context,
          expectedCounterpartyRouteTrust: "mystery"
        }
      }),
    /Invalid option/
  );
});
