export function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-text">Agent chat</h2>
        <p className="text-xs text-muted">user ⇄ agent transcript</p>
      </div>
      <div className="flex-1 px-5 py-4">
        <p className="font-mono text-xs text-muted">
          {/* Placeholder. Wire in PLA-21 (SSE) and message components. */}
          chat scaffolding ready — waiting for stream wiring
        </p>
      </div>
    </div>
  );
}
