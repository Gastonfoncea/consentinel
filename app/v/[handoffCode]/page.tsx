import { redirect } from "next/navigation";

// Legacy path. The MCP / Kapso flow now hands the user
// /dashboard?challenge=<handoffCode>, where the verification card is
// rendered alongside the blob and Melisa re-narrates. Any old WhatsApp
// link still pointing here keeps working.
export default function LegacyStepUpPage({
  params
}: {
  params: { handoffCode: string };
}) {
  redirect(`/dashboard?challenge=${encodeURIComponent(params.handoffCode)}`);
}
