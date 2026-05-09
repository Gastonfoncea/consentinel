"use client";

import dynamic from "next/dynamic";
import type { BlobState } from "./presence-blob/states";

export type { BlobState };

const BlobCanvas = dynamic(() => import("./presence-blob/blob-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-3 w-3 animate-pulse rounded-full bg-stepup/50" />
    </div>
  ),
});

interface PresenceBlobProps {
  state?: BlobState;
  pulseSeed?: number;
  className?: string;
}

export function PresenceBlob({
  state = "idle",
  pulseSeed = 0,
  className,
}: PresenceBlobProps) {
  return (
    <div className={className ?? "h-full w-full"}>
      <BlobCanvas state={state} pulseSeed={pulseSeed} />
    </div>
  );
}
