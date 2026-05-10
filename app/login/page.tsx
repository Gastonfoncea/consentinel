"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

type Mode = "register" | "login";
type Status = "idle" | "pending" | "error" | "success";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function run(mode: Mode, e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setStatus("pending");
    setError(null);

    try {
      const beginRes = await fetch(`/api/auth/${mode}/begin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!beginRes.ok) {
        const err = await beginRes.json().catch(() => ({}));
        throw new Error(err.error || `failed to start ${mode}`);
      }

      const options = await beginRes.json();

      const credential =
        mode === "register"
          ? await startRegistration(options)
          : await startAuthentication(options);

      const finishRes = await fetch(`/api/auth/${mode}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, response: credential }),
      });

      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}));
        throw new Error(err.error || "verification failed");
      }

      setStatus("success");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-allow shadow-glow-allow" />
            <span className="font-mono text-sm tracking-wide">consentinel</span>
          </div>
          <h1 className="text-xl font-medium">Sign in with passkey</h1>
          <p className="mt-1 text-xs text-muted">
            FaceID · TouchID · Windows Hello — no password.
          </p>
        </div>

        <form className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              username
            </span>
            <input
              type="text"
              value={username}
              autoFocus
              autoComplete="username"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alba"
              className="rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-text outline-none transition focus:border-allow"
            />
          </label>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              onClick={(e) => run("login", e)}
              disabled={status === "pending" || !username.trim()}
              className="rounded-md border border-allow bg-allow/10 px-4 py-2 font-mono text-sm text-allow transition hover:bg-allow/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "pending" ? "verifying…" : "Login with passkey"}
            </button>
            <button
              type="button"
              onClick={(e) => run("register", e)}
              disabled={status === "pending" || !username.trim()}
              className="rounded-md border border-border bg-transparent px-4 py-2 font-mono text-sm text-text transition hover:border-stepup hover:text-stepup disabled:cursor-not-allowed disabled:opacity-40"
            >
              Register new passkey
            </button>
          </div>

          {error && (
            <p className="mt-2 break-words font-mono text-xs text-deny">
              ✗ {error}
            </p>
          )}
          {status === "success" && (
            <p className="mt-2 font-mono text-xs text-allow">
              ✓ verified — redirecting…
            </p>
          )}
        </form>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-wider text-muted">
          step-up channel · passkey
        </p>
      </div>
    </main>
  );
}
