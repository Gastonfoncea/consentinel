import { amountBucket, canonicalizeAction } from "../domain/narrative.js";
import type { AgentActionRequest, SimilarAction, TrackRecordEvent } from "../domain/types.js";

interface VectorRecord {
  event: TrackRecordEvent;
  narrative: string;
  vector: number[];
}

export class HashingVectorMemory {
  private readonly records: VectorRecord[] = [];

  constructor(private readonly dimensions = 96) {}

  addEvent(event: TrackRecordEvent): void {
    const narrative = canonicalizeAction(event.request);
    this.records.push({
      event,
      narrative,
      vector: this.embed(narrative, event.request)
    });
  }

  searchSimilar(request: AgentActionRequest, limit = 5): SimilarAction[] {
    const query = this.embed(canonicalizeAction(request), request);

    return this.records
      .map((record) => ({
        eventId: record.event.eventId,
        similarity: cosineSimilarity(query, record.vector),
        outcome: record.event.outcome,
        occurredAt: record.event.occurredAt,
        narrative: record.narrative
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  size(): number {
    return this.records.length;
  }

  private embed(text: string, request: AgentActionRequest): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9_.:/-]+/g, " ");
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const enrichedTokens = [
      ...tokens,
      `svc:${request.service}`,
      `act:${request.action}`,
      `sens:${request.dataSensitivity}`,
      `rev:${request.reversibility}`,
      `bucket:${amountBucket(request.amount?.value)}`,
      request.counterparty ? `counterparty:${request.counterparty}` : "counterparty:none"
    ];

    for (let i = 0; i < enrichedTokens.length; i += 1) {
      this.addToken(vector, enrichedTokens[i], 1);
      if (i < enrichedTokens.length - 1) {
        this.addToken(vector, `${enrichedTokens[i]} ${enrichedTokens[i + 1]}`, 0.45);
      }
    }

    const norm = Math.hypot(...vector);
    return norm === 0 ? vector : vector.map((value) => value / norm);
  }

  private addToken(vector: number[], token: string, weight: number): void {
    const hash = fnv1a(token);
    const index = hash % this.dimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign * weight;
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) return 0;
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
  }
  return Math.max(-1, Math.min(1, dot));
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
