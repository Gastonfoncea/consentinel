"use client";

import { trustedServices } from "@/lib/wallet/trusted-services";
import { cn } from "@/lib/utils";

// PLA-44 — Trusted recurring services panel.
//
// Static-data sibling of WalletPanel that conveys the kernel's
// "learned trust" surface area: services the agent can pay without
// pinging the user. Visual style is borrowed from Apple's
// Subscriptions tray — tile + name + monthly amount + last paid hint,
// auto-pay badge, soft amount-changed warning when the kernel flagged
// a deviation but still let it through.
//
// Data lives in lib/wallet/trusted-services.ts so this component can
// stay presentational and the demo data is auditable in one place.

export function WalletTrusted() {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
          trusted recurring · auto-pay
        </p>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-allow/80">
          {trustedServices.length} servicios
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {trustedServices.map((svc) => (
          <li
            key={svc.id}
            className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-border/60 hover:bg-bg/40"
          >
            {/* Tile — solid color square with the merchant glyph. */}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-base font-semibold text-white"
              style={{ backgroundColor: svc.tileColor }}
              aria-hidden="true"
            >
              {svc.icon}
            </span>

            {/* Name + meta. min-w-0 so flexbox lets the row truncate
                instead of overflowing the card on narrow viewports. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm text-text">
                  {svc.name}
                </span>
                {svc.amountChanged && (
                  <span className="shrink-0 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-px font-mono text-[8px] uppercase tracking-wider text-warn">
                    amount changed
                  </span>
                )}
              </div>
              <span className="font-mono text-[10px] text-muted">
                {svc.lastPaid} · próximo {svc.nextDue}
              </span>
            </div>

            {/* Right rail: amount + auto-pay badge. */}
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-mono text-sm tabular-nums text-text">
                {svc.amount}
                <span className="ml-1 text-[10px] text-muted">USDC</span>
              </span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-px font-mono text-[8px] uppercase tracking-wider",
                  "border-allow/40 bg-allow/10 text-allow"
                )}
              >
                auto-pay
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted/70">
        El kernel los aprueba sin fricción porque están en el grafo de
        confianza. Los marcamos amber cuando el monto cambia respecto al
        histórico — la transacción igual pasa, pero te avisamos.
      </p>
    </div>
  );
}
