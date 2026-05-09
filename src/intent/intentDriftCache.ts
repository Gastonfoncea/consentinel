import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IntentDriftInput, IntentDriftResult } from "../domain/types.js";

interface IntentDriftCacheFile {
  version: 1;
  entries: Record<string, IntentDriftResult>;
}

const EMPTY_CACHE: IntentDriftCacheFile = {
  version: 1,
  entries: {}
};

export class FileIntentDriftCache {
  constructor(private readonly filePath = resolve(process.cwd(), "data", "intent-drift-cache.json")) {}

  cacheKey(input: IntentDriftInput): string {
    const payload = [
      input.originalUserRequest ?? "none",
      input.proposedActionNarrative,
      input.source,
      input.sourceTrust,
      input.expectedCounterparty ?? "none",
      input.actualCounterparty ?? "none",
      formatAmount(input.expectedAmount),
      formatAmount(input.actualAmount)
    ].join("\n");

    return createHash("sha256").update(payload).digest("hex");
  }

  read(key: string): IntentDriftResult | undefined {
    const cache = this.load();
    return cache.entries[key];
  }

  write(key: string, result: IntentDriftResult): void {
    const cache = this.load();
    cache.entries[key] = result;
    this.persist(cache);
  }

  path(): string {
    return this.filePath;
  }

  private load(): IntentDriftCacheFile {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_CACHE, entries: {} };
    }

    const raw = readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<IntentDriftCacheFile>;
    return {
      version: 1,
      entries: parsed.entries ?? {}
    };
  }

  private persist(cache: IntentDriftCacheFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(cache, null, 2) + "\n", "utf8");
  }
}

function formatAmount(amount?: IntentDriftInput["expectedAmount"]): string {
  return amount ? `${amount.value}:${amount.currency}` : "none";
}
