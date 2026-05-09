"use client";

import { TRUSTED_SERVICES, type TrustedService } from "@/lib/wallet/trusted-services";

// Trusted recurring section — autopaid services the kernel lets through
// without prompt. Sells "the kernel doesn't get in the way of normal life;
// it only intervenes on anomalies."

export function WalletTrusted() {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        trusted recurring · auto-pay
      </p>
      <ul className="flex flex-col gap-1.5">
        {TRUSTED_SERVICES.map((s) => (
          <TrustedRow key={s.id} service={s} />
        ))}
      </ul>
    </div>
  );
}

function TrustedRow({ service }: { service: TrustedService }) {
  const drift = service.amountChange;
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-bg">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-base">
          {service.glyph}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-text">{service.name}</span>
          <span className="font-mono text-[10px] text-muted">
            last paid {service.lastChargedDaysAgo}d ago · {service.cadence}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {drift ? (
          <span className="rounded-full border border-yellow-400/30 bg-yellow-400/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-yellow-200">
            +{drift.to - drift.from} chg
          </span>
        ) : (
          <span className="rounded-full border border-allow/30 bg-allow/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-allow">
            auto
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-text">
          {service.amountUsdc} USDC
        </span>
      </span>
    </li>
  );
}
