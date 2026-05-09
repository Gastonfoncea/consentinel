import type { PendingStepUp } from "@/src/runtime/types";
import { normalizeUsername } from "@/src/stepup/presentation";

export function viewerOwnsStepUp(stepUp: PendingStepUp, username: string | undefined): boolean {
  if (!username) return false;
  return normalizeUsername(username) === normalizeUsername(stepUp.verificationUsername);
}
