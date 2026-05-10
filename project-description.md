# Consentinel

**Permission kernel para agentes de IA.** Un middleware que se interpone entre un agente autónomo y la billetera del usuario para autorizar, escalar o denegar cada acción en tiempo real.

## El problema

En 2025-2026 Visa, Stripe, Coinbase y Mastercard lanzaron pagos con agentes. Etsy ya está integrado. Al mismo tiempo, Anthropic publicó que sus propios modelos chantajean al humano el 96% de las veces cuando se sienten amenazados — sin que nadie se lo pida.

Estamos dándole tarjetas de crédito a agentes que no podemos predecir, y nadie construyó la capa de permisos.

## Cómo funciona

Consentinel evalúa cada acción del agente en tres capas antes de tocar la billetera:

### 1. Grafo de comportamiento (`BEHAVIOR GRAPH · PER-USER`)
Un grafo per-user que aprende contrapartes conocidas, montos típicos, rutas habituales y nuevas identidades. Calcula familiaridad, novedad y multiplicadores de monto. Si la acción rompe el patrón histórico, lo nota antes que la red de pagos.

### 2. Detección de drift de intención (`INTENT MATCHING · DETERMINISTIC`)
Compara la solicitud original del usuario contra la acción que el agente está por ejecutar. La capa principal es determinista (token overlap, contraparte esperada vs real, delta de monto). Soporta LLM-as-judge opcional con Claude para casos ambiguos.

### 3. Step-up biométrico (`STEP-UP · WEBAUTHN`)
Cuando el riesgo lo amerita, dispara verificación just-in-time vía WebAuthn (passkey, FaceID). El usuario aprueba con su huella en el dashboard, por WhatsApp deeplink, o ambos.

**Cero fricción en lo normal. Frenos duros en lo raro.**

## Stack técnico

- **Frontend:** Next.js 14 (App Router) + Tailwind, en `app/`
- **Kernel:** TypeScript + Zod, en `src/` (build vía `npm run build:kernel`)
- **Wallet:** EVM via `viem`
- **Auth:** WebAuthn (`@simplewebauthn/server` + `iron-session`)
- **Voice:** ElevenLabs TTS + Kapso (WhatsApp deeplink)
- **MCP:** Servidor MCP en `src/mcp` para que agentes externos validen acciones
- **Tests:** `node --test` via `tsx` (`npm test`)
- **Deploy:** Vercel (https://consentinel.vercel.app)

## Demo

El demo bloquea un fraude en tiempo real sin que el usuario haga nada hasta que el kernel se lo pide. El agente intenta enviar fondos a una contraparte que el usuario nunca usó; el grafo lo flagea, el kernel dispara step-up, el usuario verifica con passkey, la transacción procede o se cancela según la decisión.

Para reproducirlo localmente:

```bash
npm install
npm run dev
# abrí http://localhost:3000/dashboard?demo=fraud
```

## Equipo

Construido en 36 horas durante Platanus Hack 2026 (Argentina).
