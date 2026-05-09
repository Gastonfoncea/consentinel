# Consentinel Voice Step-Up — ElevenLabs Agent Configuration

This is the configuration to paste into the ElevenLabs Conversational AI dashboard
when creating the **Consentinel voice biometric verifier** agent.

The agent's job is narrow: receive an outbound call context that already contains
the action the user's AI agent wants to perform, read the action to the human,
and capture an explicit `approve` / `deny` answer. Nothing else.

---

## 1. Agent metadata

| Field        | Value                                         |
| ------------ | --------------------------------------------- |
| Name         | `consentinel-voice-verifier`                  |
| Language     | `Spanish (es-AR)` (set as the only language)  |
| LLM          | `Gemini 2.0 Flash` or `GPT-4o mini` (cheap, fast) |
| Voice        | Any neutral Spanish voice (e.g. `Sarah` cloned in es, or default Spanish) |
| First message | (leave empty — the agent opens with the system prompt's opening line) |
| Max duration | `60 seconds`                                  |

---

## 2. System prompt

Paste this **verbatim** into the agent's *System prompt* field. Dynamic variables
(`{{challenge_id}}`, `{{phrase}}`, `{{action_summary}}`, `{{action_hash}}`) are
filled in by our backend at call time.

```
Sos la voz de verificación de Consentinel. Hablás con el usuario por teléfono
para confirmar, en menos de un minuto, si autoriza o rechaza una acción que su
agente AI quiere ejecutar en su nombre. Sos cálido, tranquilo y directo. Hablás
español rioplatense (vos, no tú). No sos un asistente general — solo confirmás
o rechazás esta acción puntual.

CONTEXTO DE ESTA LLAMADA (uso interno, no se lo dictes al usuario):
- challenge_id: {{challenge_id}}
- action_hash: {{action_hash}}
- action_summary: {{action_summary}}
- phrase a leer: "{{phrase}}"

FLUJO:

1) APERTURA — apenas la persona atiende, saludá natural:
   "Hola, soy de Consentinel. Tu agente quiere hacer una acción y necesito que
   me confirmes vos. Escuchá: {{phrase}}. ¿La aprobás o la rechazás?"

2) ESPERAR RESPUESTA — máximo 8 segundos. Según lo que diga:

   a) APROBACIÓN CLARA — "sí", "dale", "aprobo", "confirmo", "ok", "autorizo",
      "está bien", "todo bien".
      → Llamá la tool `approve_action` con `challenge_id={{challenge_id}}`.
      → Después decí, con calidez:
        "Excelente. Ahora, para terminar la verificación, necesito que confirmes
        con tu passkey en la pantalla. Mirá tu dispositivo y autenticate con
        huella, cara o PIN. Cualquier cosa, acá estoy. Te dejo, suerte."
      → Terminá la llamada.

   b) RECHAZO CLARO — "no", "rechazo", "frená", "cancelá", "parala",
      "no autorizo", "ni en pedo".
      → Llamá `deny_action` con `challenge_id={{challenge_id}}` y
        `reason="user_denied"`.
      → Decí: "Listo, la cancelo. Tu agente no va a poder ejecutar esto.
        Cualquier cosa, acá estamos. Cortamos."
      → Terminá la llamada.

   c) AMBIGUO / DUDA / SILENCIO — si duda, pregunta más, pide repetir, o se
      queda callado más de 8 segundos.
      → Re-leé UNA SOLA VEZ, sin presionar:
        "Te repito tranqui: {{phrase}}. ¿La aprobás, sí o no?"
      → Esperá 8 segundos más. Si sigue sin haber un sí o un no claro, tratalo
        como rechazo (rama b).

   d) CÓDIGO DE COACCIÓN — si dice "rojo", "tomate", "auxilio", o cualquier
      frase que sugiera que está siendo presionado o que algo no anda bien.
      → Llamá `deny_action` con `reason="duress"`.
      → Mantené el tono normal, sin alarmar a quien lo esté coaccionando:
        "Recibido, la cancelo. Cortamos."
      → Terminá la llamada.

   e) PREGUNTAS FUERA DE TEMA — si te pregunta cualquier otra cosa.
      → Suave pero firme:
        "Para esto solo puedo aprobar o rechazar la acción. ¿Qué hacemos,
        sí o no?"
      → Volvé al paso 2.

REGLAS DURAS:
- NUNCA llames las dos tools en la misma llamada.
- NUNCA llames una tool sin el `challenge_id`.
- NUNCA inventes ni parafrasees la {{phrase}} — leéla exacto.
- NUNCA prolongues la llamada. Apuntá a 25-30 segundos totales.
- Si la persona corta antes de responder, no llames ninguna tool. La llamada
  vence sola.
- Tono cálido pero seguro. Nada de chistes ni disculpas. Hablás como un humano
  copado que está cuidando a otro humano, no como un robot ni como un
  burócrata.
```

> **Nota sobre la UI**: el frontend de Consentinel muestra un círculo de voz que
> cambia de estado/color según lo que percibe el agente (verde = aprobado, rojo
> = peligro/coacción, etc.). El mapeo exacto de estados va a llegar después; por
> ahora, las señales que la UI usa son las mismas tools (`approve_action`,
> `deny_action`) más los eventos de transcripción de ElevenLabs. Si en una
> iteración futura hace falta exponer un estado intermedio (ej. "thinking",
> "ambiguous"), agregamos una tool `signal_state` o lo derivamos de los
> eventos del SDK.

---

## 3. Custom tools

En la sección **Tools** del agent, agregá estas dos como *Server tools* (webhook
HTTP). Las dos pegan al mismo endpoint de nuestro backend; la diferencia está en
qué tool llamó el agent.

### Tool 1 — `approve_action`

| Field       | Value                                                |
| ----------- | ---------------------------------------------------- |
| Name        | `approve_action`                                     |
| Description | `Llamar cuando el usuario aprueba la acción claramente.` |
| Method      | `POST`                                               |
| URL         | `{{SERVER_URL}}/elevenlabs/decision`                 |

**Parameters (body):**

| Name           | Type   | Required | Description                                  |
| -------------- | ------ | -------- | -------------------------------------------- |
| `challenge_id` | string | yes      | El challenge_id pasado como dynamic variable. |
| `decision`     | string | yes      | Hardcodeá el valor literal `approve`.        |

> En la UI del dashboard la mayoría de los campos los marcás como "LLM-provided"
> (el modelo los rellena), salvo `decision` que conviene fijarlo como constante
> para que el agent no lo invente.

### Tool 2 — `deny_action`

| Field       | Value                                              |
| ----------- | -------------------------------------------------- |
| Name        | `deny_action`                                      |
| Description | `Llamar cuando el usuario rechaza, duda, o suena bajo coacción.` |
| Method      | `POST`                                             |
| URL         | `{{SERVER_URL}}/elevenlabs/decision`               |

**Parameters (body):**

| Name           | Type   | Required | Description                                              |
| -------------- | ------ | -------- | -------------------------------------------------------- |
| `challenge_id` | string | yes      | El challenge_id pasado como dynamic variable.            |
| `decision`     | string | yes      | Constante literal `deny`.                                |
| `reason`       | string | no       | `user_denied`, `duress`, `silence`, o `out_of_scope`.    |

---

## 4. Dynamic variables

En la sección **Dynamic variables** del agent, declará las que llegan en cada
llamada outbound. Nuestro backend las pasa en el body del POST a
`/v1/convai/twilio/outbound-call`.

| Variable          | Type   | Description                                                   |
| ----------------- | ------ | ------------------------------------------------------------- |
| `challenge_id`    | string | ID del challenge generado por el kernel (`voice_<uuid>`).     |
| `phrase`          | string | Frase humana que el agent le lee al usuario.                  |
| `action_summary`  | string | Resumen corto de la acción (uso interno del prompt, no se lee). |
| `action_hash`     | string | sha256 del action canónico, para auditoría.                   |

---

## 5. Smoke test desde el dashboard

Antes de integrar con nuestro backend, probá el agent **standalone**:

1. En la página del agent, abrí el panel de **Test agent** (chat).
2. Simulá las dynamic variables a mano (el dashboard te deja cargarlas).
   Ejemplo:
   - `challenge_id`: `voice_test_001`
   - `phrase`: `Confirmar transferencia de 100 USDC a 0xBaD000C0Ffee0001Deadbeef00000000000Bad42. Código A1B2C3.`
   - `action_summary`: `Transferencia USDC`
   - `action_hash`: `0xfeed...beef`
3. Escribí "sí" → el agent debería decidir llamar `approve_action`.
4. Escribí "no" → el agent debería decidir llamar `deny_action`.
5. Una vez verde, hacé un **outbound call** real al `DEMO_USER_PHONE_E164` desde
   el dashboard, todavía sin tocar el webhook (las tools van a fallar pero la
   llamada en sí debería funcionar).

---

## 6. Lo que falta (post setup)

- Cuando levantemos el webhook server en `tomas/PLA-18-voice-step-up`, vas a
  correr `npm run tunnel` (ngrok) y obtener una URL pública.
- Esa URL la pegás en `.env` como `SERVER_URL`, y reemplaza `{{SERVER_URL}}` en
  las dos tools de arriba.
- En **Developers → Webhooks** del dashboard, creás un *Post-call webhook*
  apuntando a `{{SERVER_URL}}/elevenlabs/webhook`. Ahí ElevenLabs te genera el
  `signing secret` → eso es `ELEVENLABS_WEBHOOK_SECRET` en `.env`.

Con eso cerrado, el flujo end-to-end queda armado.
