/**
 * Device-aware biometric copy. The kernel only knows it requested a
 * `passkey` step-up — WebAuthn abstracts the actual authenticator (FaceID,
 * TouchID, fingerprint sensor, security key). We pick the right user-facing
 * label based on a coarse user-agent sniff so the prompt reads natural on
 * the user's actual device.
 *
 * Returns "generic" during SSR and on unrecognized devices so the first
 * paint is safe; the client re-renders with the device-specific copy on
 * hydration.
 */

export type BiometricMethod = "faceid" | "touchid" | "fingerprint" | "generic";

export function detectBiometricMethod(): BiometricMethod {
  if (typeof navigator === "undefined") return "generic";

  const ua = navigator.userAgent;

  // iPhone X+ ships FaceID; older models had TouchID but are rare in 2026.
  if (/iPhone/.test(ua)) return "faceid";

  // iPad: Pro models have FaceID, the rest TouchID. TouchID is the safer
  // default — copy still says "tu huella o FaceID" works for either UI.
  if (/iPad/.test(ua)) return "touchid";

  // macOS: TouchID on most modern keyboards (Apple Silicon, Magic Keyboard
  // with Touch ID, MacBook Pro/Air with TouchID). Fallback if absent is
  // password, which WebAuthn handles transparently.
  if (/Macintosh/.test(ua)) return "touchid";

  // Android: fingerprint is near-universal. Some devices have face unlock
  // but it's not Class 3 biometric on most — fingerprint is the safe label.
  if (/Android/.test(ua)) return "fingerprint";

  return "generic";
}

export interface BiometricCopy {
  /** Status badge / label, second-person tuteo. */
  status: string;
  /** Button label. */
  action: string;
  /** Short noun for inline use ("usá tu FaceID"). */
  short: string;
}

export function biometricCopy(method: BiometricMethod): BiometricCopy {
  switch (method) {
    case "faceid":
      return {
        status: "Confirmá con FaceID",
        action: "Confirmar con FaceID",
        short: "FaceID",
      };
    case "touchid":
      return {
        status: "Confirmá con TouchID",
        action: "Confirmar con TouchID",
        short: "TouchID",
      };
    case "fingerprint":
      return {
        status: "Confirmá con tu huella",
        action: "Confirmar con tu huella",
        short: "huella",
      };
    default:
      return {
        status: "Confirmá con tu huella o FaceID",
        action: "Confirmar",
        short: "biometría",
      };
  }
}
