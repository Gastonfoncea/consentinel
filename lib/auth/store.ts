import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/types";

export interface PasskeyCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

export interface StoredUser {
  id: string;
  username: string;
  credentials: PasskeyCredential[];
  currentChallenge?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __consentinelUserStore: Map<string, StoredUser> | undefined;
}

// Persistence path. Same data/runtime/ tree the kernel uses for
// durable-events.jsonl + pending-stepups.json so a single .gitignore
// covers all dev state. On Vercel the filesystem is read-only outside
// /tmp, so we redirect there when running serverless — mirrors what
// src/runtime/repositories.ts does. /tmp survives within a warm
// lambda but cold starts wipe it; Vercel KV is the post-hack target
// per CLAUDE.md. Locally this lands in the repo's data/runtime/ and
// survives dev-server restarts, which is what we need for the demo.
function resolveStorePath(): string {
  const isServerless = !!(process.env.VERCEL || process.env.NOW_REGION);
  const root = isServerless ? "/tmp" : process.cwd();
  return path.join(root, "data", "runtime", "users.json");
}

const STORE_PATH = resolveStorePath();

interface SerializedCredential {
  id: string;
  publicKey: string; // base64
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

interface SerializedUser {
  id: string;
  username: string;
  credentials: SerializedCredential[];
  currentChallenge?: string;
}

function serializeCredential(cred: PasskeyCredential): SerializedCredential {
  return {
    id: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString("base64"),
    counter: cred.counter,
    transports: cred.transports,
    deviceType: cred.deviceType,
    backedUp: cred.backedUp,
  };
}

function deserializeCredential(s: SerializedCredential): PasskeyCredential {
  return {
    id: s.id,
    publicKey: new Uint8Array(Buffer.from(s.publicKey, "base64")),
    counter: s.counter,
    transports: s.transports,
    deviceType: s.deviceType,
    backedUp: s.backedUp,
  };
}

function loadUsersFromDisk(): Map<string, StoredUser> {
  const map = new Map<string, StoredUser>();
  try {
    if (!fs.existsSync(STORE_PATH)) return map;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    if (!raw.trim()) return map;
    const parsed = JSON.parse(raw) as Record<string, SerializedUser>;
    for (const [k, u] of Object.entries(parsed)) {
      map.set(k, {
        id: u.id,
        username: u.username,
        credentials: (u.credentials ?? []).map(deserializeCredential),
        currentChallenge: u.currentChallenge,
      });
    }
  } catch (err) {
    // Corrupt JSON or unreadable file — start empty rather than crash
    // the process. Worst case the user re-registers their passkey.
    // eslint-disable-next-line no-console
    console.warn(
      "[auth-store] failed to load users.json, starting empty:",
      err instanceof Error ? err.message : err
    );
  }
  return map;
}

function saveUsersToDisk(map: Map<string, StoredUser>): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out: Record<string, SerializedUser> = {};
    for (const [k, u] of map.entries()) {
      out[k] = {
        id: u.id,
        username: u.username,
        credentials: u.credentials.map(serializeCredential),
        currentChallenge: u.currentChallenge,
      };
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(out, null, 2), "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[auth-store] failed to persist users.json:",
      err instanceof Error ? err.message : err
    );
  }
}

const users: Map<string, StoredUser> =
  globalThis.__consentinelUserStore ?? loadUsersFromDisk();

if (!globalThis.__consentinelUserStore) {
  globalThis.__consentinelUserStore = users;
}

function key(username: string): string {
  return username.trim().toLowerCase();
}

function persist(): void {
  saveUsersToDisk(users);
}

export function getUserByUsername(username: string): StoredUser | undefined {
  return users.get(key(username));
}

export function getOrCreateUser(username: string): StoredUser {
  const existing = getUserByUsername(username);
  if (existing) return existing;
  const created: StoredUser = {
    id: randomUUID(),
    username: username.trim(),
    credentials: [],
  };
  users.set(key(username), created);
  persist();
  return created;
}

export function setChallenge(username: string, challenge: string): void {
  const user = getUserByUsername(username);
  if (user) {
    user.currentChallenge = challenge;
    persist();
  }
}

export function consumeChallenge(username: string): string | undefined {
  const user = getUserByUsername(username);
  if (!user) return undefined;
  const challenge = user.currentChallenge;
  user.currentChallenge = undefined;
  persist();
  return challenge;
}

export function addCredential(username: string, credential: PasskeyCredential): void {
  const user = getUserByUsername(username);
  if (!user) throw new Error(`unknown user ${username}`);
  user.credentials.push(credential);
  persist();
}

export function findCredentialById(
  username: string,
  credentialId: string
): PasskeyCredential | undefined {
  const user = getUserByUsername(username);
  if (!user) return undefined;
  return user.credentials.find((c) => c.id === credentialId);
}

export function updateCredentialCounter(
  username: string,
  credentialId: string,
  counter: number
): void {
  const cred = findCredentialById(username, credentialId);
  if (cred) {
    cred.counter = counter;
    persist();
  }
}
