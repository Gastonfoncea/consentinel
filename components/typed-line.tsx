"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TypedLineProps {
  text: string;
  charDelayMs?: number;
  className?: string;
}

export function TypedLine({ text, charDelayMs = 50, className }: TypedLineProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (!text) return;
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setShown(i);
      if (i < text.length) {
        setTimeout(tick, charDelayMs);
      }
    };
    const handle = setTimeout(tick, charDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [text, charDelayMs]);

  const visible = text.slice(0, shown);
  const isTyping = shown < text.length;

  return (
    <span className={cn("font-mono", className)}>
      {visible}
      {isTyping && <span className="ml-0.5 inline-block w-1.5 animate-pulse bg-current">&nbsp;</span>}
    </span>
  );
}
