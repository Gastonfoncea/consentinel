export function LogPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-text">Kernel events</h2>
        <p className="text-xs text-muted">
          live SSE log · allow / deny / step-up
        </p>
      </div>
      <div className="flex-1 px-5 py-4">
        <p className="font-mono text-xs text-muted">
          {/* Placeholder. PLA-22 will render typed events with glow. */}
          log scaffolding ready — waiting for events
        </p>
      </div>
    </div>
  );
}
