import { kernelEventStream } from "@/lib/events/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const controller = new AbortController();

  req.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const stream = new ReadableStream({
    async start(streamController) {
      streamController.enqueue(encoder.encode(`: connected\n\n`));
      try {
        for await (const event of kernelEventStream(controller.signal)) {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          streamController.enqueue(encoder.encode(payload));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          streamController.error(err);
          return;
        }
      } finally {
        streamController.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
