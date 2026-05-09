import { PermissionKernel } from "@/src/kernel";
import { demoProfile, seedEvents } from "@/src/demoFixtures";

// Single kernel instance shared across API routes. Pinned to globalThis so
// the in-memory behavior graph + vector memory survive Next.js HMR and
// per-route module isolation in dev (same trick as `lib/auth/store.ts`).

const KEY = "__consentinel_kernel__";

declare global {
  // eslint-disable-next-line no-var
  var __consentinel_kernel__: PermissionKernel | undefined;
}

export function getKernel(): PermissionKernel {
  if (!globalThis[KEY]) {
    const kernel = new PermissionKernel(demoProfile);
    for (const event of seedEvents) {
      kernel.record(event);
    }
    globalThis[KEY] = kernel;
  }
  return globalThis[KEY]!;
}

export { demoProfile };
