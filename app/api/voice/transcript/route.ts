import { NextResponse } from "next/server";
import { z } from "zod";
import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/voice/transcript
//
// The browser-side ElevenLabs SDK calls this whenever the agent emits a
// new message (user transcript or agent response). We just relay it onto
// the kernel runtime's event bus so the LogPanel + ChatPanel render the
// conversation alongside permission events.

const bodySchema = z.object({
  requestId: z.string(),
  role: z.enum(["user", "agent"]),
  text: z.string().min(1).max(2000)
});

const kernelRuntime = getSharedKernelRuntime();

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

  kernelRuntime.emit({
    type: "voice.message",
    ts: Date.now(),
    requestId: payload.requestId,
    role: payload.role,
    text: payload.text
  });

  return NextResponse.json({ ok: true });
}
