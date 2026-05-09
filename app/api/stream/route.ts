import { getSharedKernelRuntime } from "@/src/runtime/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kernelRuntime = getSharedKernelRuntime();

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (pingTimer) clearInterval(pingTimer);
    if (unsubscribe) unsubscribe();
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`: connected\n\n`));

      unsubscribe = kernelRuntime.subscribe((event) => {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      });

      pingTimer = setInterval(() => {
        const payload = `data: ${JSON.stringify({ type: "ping", ts: Date.now() })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }, 8000);

      req.signal.addEventListener(
        "abort",
        () => {
          close();
          controller.close();
        },
        { once: true }
      );
    },
    cancel() {
      close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
