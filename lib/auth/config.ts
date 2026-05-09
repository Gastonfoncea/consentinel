export const RP_NAME = "Consentinel";

export const RP_ID = process.env.RP_ID || "localhost";

export const RP_ORIGIN =
  process.env.RP_ORIGIN ||
  (process.env.NODE_ENV === "production"
    ? `https://${RP_ID}`
    : "http://localhost:3000");

export const SESSION_PASSWORD =
  process.env.SESSION_PASSWORD ||
  "consentinel_dev_session_password_change_me_min_32_chars";

export const SESSION_COOKIE = "consentinel_session";
