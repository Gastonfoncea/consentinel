import type {
  AgentActionRequest,
  CounterpartyRouteTrust,
  DecisionSignal,
  PermissionOutcome,
  ProjectedEffect,
  TrackRecordEvent
} from "../domain/types.js";

type NodeKind = "user" | "agent" | "service" | "action" | "resource" | "counterparty" | "counterparty_identity";

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
  successfulFrequency: number;
  verifiedSuccessfulFrequency: number;
  totalAmount: number;
  outcomes: Record<PermissionOutcome, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface GraphRelationshipQuery {
  fromKind: NodeKind;
  fromLabel: string;
  toKind: NodeKind;
  toLabel: string;
  relation: string;
}

export interface GraphRelationship {
  from: string;
  to: string;
  relation: string;
  frequency: number;
  totalAmount: number;
  averageAmount: number;
  firstSeen: string;
  lastSeen: string;
  outcomes: Record<PermissionOutcome, number>;
}

export interface GraphEvidence {
  familiarityScore: number;
  newCounterparty: boolean;
  newRouteForKnownIdentity: boolean;
  routeNovelty: number;
  directRouteFamiliarity: number;
  identityFamiliarity: number;
  amountMultiple: number;
  routeTrust?: CounterpartyRouteTrust;
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

    if (request.counterpartyIdentity) {
      this.ensureNode("counterparty_identity", request.counterpartyIdentity);
      this.upsertEdge(
        "user",
        request.userId,
        "counterparty_identity",
        request.counterpartyIdentity,
        "trusts_identity",
        event
      );

      if (request.counterparty) {
        this.upsertEdge(
          "counterparty_identity",
          request.counterpartyIdentity,
          "counterparty",
          request.counterparty,
          "reachable_at",
          event
        );
      }
    }
  }

  explain(request: AgentActionRequest): GraphEvidence {
    const userService = this.edgeStrength("user", request.userId, "service", request.service, "connected_to");
    const userAgent = this.edgeStrength("user", request.userId, "agent", request.agentId, "delegated_to");
    const agentService = this.edgeStrength("agent", request.agentId, "service", request.service, "called");
    const actionResource = this.edgeStrength("action", request.action, "resource", request.resource, "targets");
    const directRouteEdge = request.counterparty
      ? this.getEdge("user", request.userId, "counterparty", request.counterparty, "interacted_with")
      : undefined;
    const identityEdge = request.counterpartyIdentity
      ? this.getEdge(
          "user",
          request.userId,
          "counterparty_identity",
          request.counterpartyIdentity,
          "trusts_identity"
        )
      : undefined;
    const directRouteFamiliarity = directRouteEdge ? this.edgeStrengthFromStats(directRouteEdge) : 0;
    const identityFamiliarity = identityEdge
      ? this.edgeStrength(
          "user",
          request.userId,
          "counterparty_identity",
          request.counterpartyIdentity,
          "trusts_identity"
        )
      : 0;
    const routeTrust = this.deriveRouteTrust(request, directRouteEdge);
    const routeNovelty = request.counterparty && !hasSuccessfulRouteHistory(directRouteEdge) ? 1 : 0;
    const newRouteForKnownIdentity = Boolean(routeNovelty && request.counterpartyIdentity && identityFamiliarity > 0);
    const routeTrustScore = routeTrust ? routeTrustSignalScore(routeTrust) : 0;
    const identityCarryover = newRouteForKnownIdentity ? identityFamiliarity * 0.22 : 0;
    const counterparty =
      !request.counterparty
        ? 0.55
        : routeTrust === "verified" || routeTrust === "known_historical"
          ? Math.max(directRouteFamiliarity, identityFamiliarity)
          : Math.max(directRouteFamiliarity, identityCarryover);

    const amountMultiple = this.amountMultiple(request);
    const newCounterparty = Boolean(request.counterparty && routeNovelty && identityFamiliarity === 0);
    const familiarityScore =
      userService * 0.24 + userAgent * 0.18 + agentService * 0.22 + actionResource * 0.16 + counterparty * 0.2;

    return {
      familiarityScore,
      newCounterparty,
      newRouteForKnownIdentity,
      routeNovelty,
      directRouteFamiliarity,
      identityFamiliarity,
      amountMultiple,
      routeTrust,
      signals: [
        {
          name: "graph.user_service_familiarity",
          score: userService,
          weight: 0,
          contribution: 0,
          rationale: `User-service history strength for ${request.userId} -> ${request.service}.`
        },
        {
          name: "graph.agent_service_familiarity",
          score: agentService,
          weight: 0,
          contribution: 0,
          rationale: `Agent-service history strength for ${request.agentId} -> ${request.service}.`
        },
        {
          name: "graph.counterparty_direct_familiarity",
          score: directRouteFamiliarity,
          weight: 0,
          contribution: 0,
          rationale: request.counterparty
            ? `Direct route ${request.counterparty} has ${directRouteFamiliarity === 0 ? "no" : "some"} prior successful user history.`
            : "No counterparty is involved in this action."
        },
        {
          name: "graph.counterparty_identity_familiarity",
          score: identityFamiliarity,
          weight: 0,
          contribution: 0,
          rationale: request.counterpartyIdentity
            ? `Counterparty identity ${request.counterpartyIdentity} has ${identityFamiliarity === 0 ? "no" : "some"} prior user history.`
            : "No counterparty identity was supplied for this action."
        },
        {
          name: "graph.counterparty_route_trust",
          score: routeTrustScore,
          weight: 0,
          contribution: 0,
          rationale: routeTrust
            ? `Exact route trust is classified as ${routeTrust}.`
            : "No concrete route trust classification applies to this action."
        },
        {
          name: "graph.counterparty_route_novelty",
          score: routeNovelty,
          weight: 0,
          contribution: 0,
          rationale: routeNovelty
            ? `The exact route ${request.counterparty ?? "none"} has no successful historical precedent yet.`
            : "The exact route has successful history and is not novel."
        },
        {
          name: "graph.counterparty_new_route_for_known_identity",
          score: newRouteForKnownIdentity ? 1 : 0,
          weight: 0,
          contribution: 0,
          rationale: newRouteForKnownIdentity
            ? `The route is newly introduced, but the identity ${request.counterpartyIdentity} is already known.`
            : "No known-identity/new-route split applies to this action."
        },
        {
          name: "graph.counterparty_familiarity",
          score: counterparty,
          weight: 0,
          contribution: 0,
          rationale: newRouteForKnownIdentity
            ? `Identity familiarity is only a secondary credit because ${request.counterparty} is a newly introduced route.`
            : request.counterparty
              ? `Effective counterparty familiarity is based on route history first, with identity familiarity as a secondary input.`
              : "No counterparty is involved in this action."
        },
        {
          name: "graph.amount_multiple",
          score: Math.min(amountMultiple / 5, 1),
          weight: 0,
          contribution: 0,
          rationale: amountMultiple === 0
            ? "No historical payment amount to compare."
            : `Requested amount is ${amountMultiple.toFixed(2)}x the observed average for this relation.`
        },
        {
          name: "graph.overall_familiarity",
          score: familiarityScore,
          weight: 0,
          contribution: 0,
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

  queryRelationship(query: GraphRelationshipQuery): GraphRelationship | undefined {
    const edge = this.getEdge(query.fromKind, query.fromLabel, query.toKind, query.toLabel, query.relation);
    if (!edge) return undefined;

    return {
      from: edge.from,
      to: edge.to,
      relation: edge.relation,
      frequency: edge.frequency,
      totalAmount: edge.totalAmount,
      averageAmount: edge.successfulFrequency > 0 ? edge.totalAmount / edge.successfulFrequency : 0,
      firstSeen: edge.firstSeen,
      lastSeen: edge.lastSeen,
      outcomes: { ...edge.outcomes }
    };
  }

  private amountMultiple(request: AgentActionRequest): number {
    if (!request.amount) return 0;
    const directRouteEdge =
      (request.counterparty
        ? this.getEdge("user", request.userId, "counterparty", request.counterparty, "interacted_with")
        : undefined);
    const identityEdge = request.counterpartyIdentity
        ? this.getEdge(
            "user",
            request.userId,
            "counterparty_identity",
            request.counterpartyIdentity,
            "trusts_identity"
          )
        : undefined;
    const edge = hasSuccessfulRouteHistory(directRouteEdge) ? directRouteEdge : identityEdge;
    if (!edge || edge.totalAmount <= 0 || edge.frequency === 0) return 0;
    const average = edge.totalAmount / Math.max(edge.successfulFrequency, 1);
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
    return this.edgeStrengthFromStats(edge);
  }

  private edgeStrengthFromStats(edge: EdgeStats): number {
    const frequencyScore = Math.min(Math.log2(edge.successfulFrequency + 1) / 4, 1);
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
        successfulFrequency: isSuccessfulRouteEvent(event) ? 1 : 0,
        verifiedSuccessfulFrequency: isVerifiedSuccessfulRouteEvent(event) ? 1 : 0,
        totalAmount: isSuccessfulRouteEvent(event) ? amount : 0,
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
      if (isSuccessfulRouteEvent(event)) {
        existing.successfulFrequency += 1;
        existing.totalAmount += amount;
      }
      if (isVerifiedSuccessfulRouteEvent(event)) {
        existing.verifiedSuccessfulFrequency += 1;
      }
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

  private deriveRouteTrust(
    request: AgentActionRequest,
    directRouteEdge?: EdgeStats
  ): CounterpartyRouteTrust | undefined {
    if (!request.counterparty) return undefined;
    if (hasVerifiedRouteHistory(directRouteEdge)) return "verified";
    if (hasSuccessfulRouteHistory(directRouteEdge)) return "known_historical";
    if (request.counterpartyRouteTrust === "claimed") return "claimed";
    return "unknown";
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

function routeTrustSignalScore(routeTrust: CounterpartyRouteTrust): number {
  switch (routeTrust) {
    case "verified":
      return 1;
    case "known_historical":
      return 0.78;
    case "claimed":
      return 0.28;
    case "unknown":
      return 0;
  }
}

function hasSuccessfulRouteHistory(edge?: EdgeStats): boolean {
  return Boolean(edge && edge.successfulFrequency > 0);
}

function hasVerifiedRouteHistory(edge?: EdgeStats): boolean {
  return Boolean(edge && edge.verifiedSuccessfulFrequency > 0);
}

function isSuccessfulRouteEvent(event: TrackRecordEvent): boolean {
  return event.outcome === "allow" || event.outcome === "allow_with_audit";
}

function isVerifiedSuccessfulRouteEvent(event: TrackRecordEvent): boolean {
  return isSuccessfulRouteEvent(event) && event.verifiedWith !== undefined && event.verifiedWith !== "none";
}
