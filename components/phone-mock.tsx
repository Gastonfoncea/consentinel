export function PhoneMock() {
  return (
    <div className="mx-auto flex w-full max-w-md items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="h-10 w-10 rounded-full border border-border bg-bg" />
      <div className="flex-1">
        <p className="text-sm text-text">Consentinel</p>
        <p className="font-mono text-xs text-muted">
          {/* Placeholder. PLA-24 wires 11labs call states. */}
          idle · awaiting step-up trigger
        </p>
      </div>
      <span className="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted">
        idle
      </span>
    </div>
  );
}
