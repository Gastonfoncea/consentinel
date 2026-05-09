import type {
  AgentActionRequest,
  DecisionSignal,
  PermissionOutcome,
  ProjectedEffect,
  TrackRecordEvent
} from "../domain/types.js";

type NodeKind = "user" | "agent" | "service" | "action" | "resource" | "counterparty";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
}

interface EdgeStats {
  from: string;
  to: string;
  relation: string;
  frequency: number;
  totalAmount: number;
  outcomes: Record<PermissionOutcome, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface GraphEvidence {
  familiarityScore: number;
  newCounterparty: boolean;
  amountMultiple: number;
  signals: DecisionSignal[];
}

export class BehaviorGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, EdgeStats>();

  ingest(event: TrackRecordEvent): void {
    const request = event.request;
    this.ensureNode("user", request.userId);
    this.ensureNode("agent", request.agentId);
    this.ensureNode("service", request.service);
    this.ensureNode("action", request.action);
    this.ensureNode("resource", request.resource);

    this.upsertEdge("user", request.userId, "agent", request.agentId, "delegated_to", event);
    this.upsertEdge("user", request.userId, "service", request.service, "connected_to", event);
    this.upsertEdge("agent", request.agentId, "service", request.service, "called", event);
    this.upsertEdge("action", request.action, "resource", request.resource, "targets", event);

    if (request.counterparty) {
      this.ensureNode("counterparty", request.counterparty);
      this.upsertEdge("user", request.userId, "counterparty", request.counterparty, "interacted_with", event);
      this.upsertEdge("service", request.service, "counterparty", request.counterparty, "routed_to", event);
    }
  }

  explain(request: AgentActionRequest): GraphEvidence {
    const userService = this.edgeStrength("user", request.userId, "service", request.service, "connected_to");
    const userAgent = this.edgeStrength("user", request.userId, "agent", request.agentId, "delegated_to");
    const agentService = this.edgeStrength("agent", request.agentId, "service", request.service, "called");
    const actionResource = this.edgeStrength("action", request.action, "resource", request.resource, "targets");
    const counterparty = request.counterparty
      ? this.edgeStrength("user", request.userId, "counterparty", request.counterparty, "interacted_with")
      : 0.55;

    const amountMultiple = this.amountMultiple(request);
    const newCounterparty = Boolean(request.counterparty && counterparty === 0);
    const familiarityScore =
      userService * 0.24 + userAgent * 0.18 + agentService * 0.22 + actionResource * 0.16 + counterparty * 0.2;

    return {
      familiarityScore,
      newCounterparty,
      amountMultiple,
      signals: [
        {
          name: "graph.user_service_familiarity",
          score: userService,
          rationale: `User-service history strength for ${request.userId} -> ${request.service}.`
        },
        {
          name: "graph.agent_service_familiarity",
          score: agentService,
          rationale: `Agent-service history strength for ${request.agentId} -> ${request.service}.`
        },
        {
          name: "graph.counterparty_familiarity",
          score: counterparty,
          rationale: request.counterparty
            ? `Counterparty ${request.counterparty} has ${newCounterparty ? "no" : "some"} prior user history.`
            : "No counterparty is involved in this action."
        },
        {
          name: "graph.amount_multiple",
          score: Math.min(amountMultiple / 5, 1),
          rationale: amountMultiple === 0
            ? "No historical payment amount to compare."
            : `Requested amount is ${amountMultiple.toFixed(2)}x the observed average for this relation.`
        },
        {
          name: "graph.overall_familiarity",
          score: familiarityScore,
          rationale: "Weighted familiarity across user, agent, service, action, resource, and counterparty edges."
        }
      ]
    };
  }

  projectEffects(request: AgentActionRequest): ProjectedEffect[] {
    const effects: ProjectedEffect[] = [];

    if (request.action === "pay" || request.x402) {
      effects.push({
        label: "value_transfer",
        severity: request.amount ? Math.min(request.amount.value / 2_500, 1) : 0.35,
        confidence: 0.92,
        rationale: "The action can move value or satisfy an HTTP-native payment requirement."
      });
    }

    if (request.dataSensitivity === "financial" || request.dataSensitivity === "secret") {
      effects.push({
        label: "sensitive_data_exposure",
        severity: request.dataSensitivity === "secret" ? 0.9 : 0.65,
        confidence: 0.86,
        rationale: `The requested resource is marked as ${request.dataSensitivity}.`
      });
    }

    if (request.reversibility === "irreversible") {
      effects.push({
        label: "irreversible_state_change",
        severity: 0.78,
        confidence: 0.88,
        rationale: "The action cannot be reliably undone after execution."
      });
    }

    if (request.action === "configure" || request.action === "delete") {
      effects.push({
        label: "control_plane_change",
        severity: request.action === "delete" ? 0.82 : 0.72,
        confidence: 0.8,
        rationale: "The action changes service configuration or removes state."
      });
    }

    return effects;
  }

  snapshot(): { nodes: GraphNode[]; edges: EdgeStats[] } {
    return {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()]
    };
  }

  private amountMultiple(request: AgentActionRequest): number {
    if (!request.amount || !request.counterparty) return 0;
    const edge = this.getEdge("user", request.userId, "counterparty", request.counterparty, "interacted_with");
    if (!edge || edge.totalAmount <= 0 || edge.frequency === 0) return 0;
    const average = edge.totalAmount / edge.frequency;
    return average === 0 ? 0 : request.amount.value / average;
  }

  private edgeStrength(
    fromKind: NodeKind,
    fromLabel: string,
    toKind: NodeKind,
    toLabel: string,
    relation: string
  ): number {
    const edge = this.getEdge(fromKind, fromLabel, toKind, toLabel, relation);
    if (!edge) return 0;
    const frequencyScore = Math.min(Math.log2(edge.frequency + 1) / 4, 1);
    const denyRate = edge.outcomes.deny / Math.max(edge.frequency, 1);
    return clamp(frequencyScore * (1 - denyRate * 0.7), 0, 1);
  }

  private upsertEdge(
    fromKind: NodeKind,
    fromLabel: string,
    toKind: NodeKind,
    toLabel: string,
    relation: string,
    event: TrackRecordEvent
  ): void {
    const from = nodeId(fromKind, fromLabel);
    const to = nodeId(toKind, toLabel);
    const key = edgeId(from, to, relation);
    const existing = this.edges.get(key);
    const amount = event.request.amount?.value ?? 0;

    if (!existing) {
      this.edges.set(key, {
        from,
        to,
        relation,
        frequency: 1,
        totalAmount: amount,
        outcomes: {
          allow: 0,
          allow_with_audit: 0,
          step_up: 0,
          deny: 0
        },
        firstSeen: event.occurredAt,
        lastSeen: event.occurredAt
      });
    } else {
      existing.frequency += 1;
      existing.totalAmount += amount;
      existing.lastSeen = event.occurredAt;
    }

    const edge = this.edges.get(key);
    if (edge) {
      edge.outcomes[event.outcome] += 1;
    }
  }

  private getEdge(
    fromKind: NodeKind,
    fromLabel: string,
    toKind: NodeKind,
    toLabel: string,
    relation: string
  ): EdgeStats | undefined {
    return this.edges.get(edgeId(nodeId(fromKind, fromLabel), nodeId(toKind, toLabel), relation));
  }

  private ensureNode(kind: NodeKind, label: string): void {
    const id = nodeId(kind, label);
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, kind, label });
    }
  }
}

function nodeId(kind: NodeKind, label: string): string {
  return `${kind}:${label}`;
}

function edgeId(from: string, to: string, relation: string): string {
  return `${from}-[${relation}]->${to}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
