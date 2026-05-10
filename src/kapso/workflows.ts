import { RP_ORIGIN } from "../../lib/auth/config";
import type { AgentActionRequest, PermissionDecision, StepUpChallenge } from "../domain/types";

const DEFAULT_KAPSO_API_BASE_URL = "https://api.kapso.ai/platform/v1";

export interface KapsoWorkflowExecutionResult {
  attempted: boolean;
  status: "queued" | "skipped" | "failed";
  workflowId?: string;
  executionId?: string;
  trackingId?: string;
  responseStatus?: number;
  reason?: string;
  details?: string;
}

export async function triggerKapsoWorkflowExecutionForStepUp(input: {
  request: AgentActionRequest;
  decision: PermissionDecision;
  challenge: StepUpChallenge;
  operationKind: "wallet_prepare_transfer" | "wallet_mock_execute_transfer";
}): Promise<KapsoWorkflowExecutionResult | undefined> {
  const { request, decision, challenge, operationKind } = input;

  if (challenge.channel !== "voice_biometric_callback") {
    return undefined;
  }

  const config = getKapsoConfig();
  if (!config.ok) {
    return {
      attempted: false,
      status: "skipped",
      reason: "kapso_not_configured",
      details: config.reason
    };
  }

  const phoneNumber = resolvePhoneNumber(challenge);
  if (!phoneNumber) {
    return {
      attempted: false,
      status: "skipped",
      workflowId: config.workflowId,
      reason: "missing_phone_number",
      details: "Set DEMO_PHONE_E164 or provide a profile phone number for voice step-up delivery."
    };
  }

  const url = new URL(`workflows/${config.workflowId}/executions`, withTrailingSlash(config.baseUrl)).toString();
  const payload = {
    workflow_execution: {
      phone_number: phoneNumber,
      ...(config.phoneNumberId ? { phone_number_id: config.phoneNumberId } : {}),
      ...(config.whatsappConfigId ? { whatsapp_config_id: config.whatsappConfigId } : {}),
      variables: {
        challenge_id: challenge.challengeId,
        request_id: request.requestId,
        action_hash: decision.actionHash,
        action_phrase: challenge.actionPhrase,
        spoken_operation_summary: challenge.spokenOperationSummary,
        spoken_risk_hint: challenge.spokenRiskHint ?? "",
        handoff_code: challenge.handoffCode,
        whatsapp_verification_url: challenge.whatsappVerificationUrl,
        challenge_url: new URL(`/api/step-up/voice/${challenge.challengeId}`, RP_ORIGIN).toString(),
        user_name: challenge.userDisplayName ?? challenge.verificationUsername,
        verification_username: challenge.verificationUsername,
        delivery_target: phoneNumber,
        asset: request.amount?.currency ?? "USDC",
        amount: request.amount?.value ?? null,
        to_address: request.counterparty ?? "",
        counterparty_identity: request.counterpartyIdentity ?? "",
        counterparty_route_trust: request.counterpartyRouteTrust ?? "",
        intent: request.intent
      },
      context: {
        source: "consentinel_mcp_wallet_transfer",
        operation_kind: operationKind,
        service: request.service,
        action: request.action,
        resource: request.resource,
        user_id: request.userId,
        agent_id: request.agentId
      },
      initial_data: {
        request,
        decision: {
          outcome: decision.outcome,
          riskScore: decision.riskScore,
          explanation: decision.explanation,
          requiredStepUp: decision.requiredStepUp
        },
        challenge
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    const responseBody = parseJsonSafely(responseText);

    if (!response.ok) {
      return {
        attempted: true,
        status: "failed",
        workflowId: config.workflowId,
        responseStatus: response.status,
        reason: `kapso_http_${response.status}`,
        details: extractKapsoError(responseBody, responseText)
      };
    }

    const data = isRecord(responseBody) && isRecord(responseBody.data) ? responseBody.data : undefined;

    return {
      attempted: true,
      status: "queued",
      workflowId: config.workflowId,
      executionId: typeof data?.id === "string" ? data.id : undefined,
      trackingId: typeof data?.tracking_id === "string" ? data.tracking_id : undefined,
      responseStatus: response.status
    };
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      workflowId: config.workflowId,
      reason: "kapso_network_error",
      details: error instanceof Error ? error.message : "Unknown network error"
    };
  }
}

function getKapsoConfig():
  | {
      ok: true;
      apiKey: string;
      baseUrl: string;
      workflowId: string;
      phoneNumberId?: string;
      whatsappConfigId?: number;
    }
  | {
      ok: false;
      reason: string;
    } {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  const workflowId = process.env.KAPSO_WORKFLOW_ID?.trim();

  if (!apiKey || !workflowId) {
    return {
      ok: false,
      reason: "KAPSO_API_KEY and KAPSO_WORKFLOW_ID are required to auto-start Kapso workflow executions."
    };
  }

  const rawWhatsappConfigId = process.env.KAPSO_WHATSAPP_CONFIG_ID?.trim();
  const whatsappConfigId =
    rawWhatsappConfigId && /^\d+$/.test(rawWhatsappConfigId) ? Number(rawWhatsappConfigId) : undefined;

  return {
    ok: true,
    apiKey,
    baseUrl: process.env.KAPSO_API_BASE_URL?.trim() || DEFAULT_KAPSO_API_BASE_URL,
    workflowId,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID?.trim() || undefined,
    whatsappConfigId
  };
}

function resolvePhoneNumber(challenge: StepUpChallenge) {
  return challenge.deliveryTarget?.trim() || process.env.DEMO_PHONE_E164?.trim() || undefined;
}

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function parseJsonSafely(value: string) {
  if (!value) return undefined;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function extractKapsoError(body: unknown, fallback: string) {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }

  if (isRecord(body) && isRecord(body.data) && typeof body.data.message === "string") {
    return body.data.message;
  }

  return fallback || "Kapso request failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
