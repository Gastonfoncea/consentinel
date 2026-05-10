import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/types";
import { getUpstashClient, isUpstashConfigured } from "@/lib/persist/upstash";

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

interface SerializedCredential {
  id: string;
  publicKeyBase64: string;
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

interface UserBackend {
  get(username: string): Promise<StoredUser | undefined>;
  set(user: StoredUser): Promise<void>;
}

function key(username: string): string {
  return username.trim().toLowerCase();
}

function userRedisKey(username: string): string {
  return `consentinel:user:${key(username)}`;
}

const STORE_PATH = path.join(
  process.cwd(),
  "data",
  "runtime",
  "users.json"
);

function serializeCredential(cred: PasskeyCredential): SerializedCredential {
  return {
    id: cred.id,
    publicKeyBase64: Buffer.from(cred.publicKey).toString("base64"),
    counter: cred.counter,
    transports: cred.transports,
    deviceType: cred.deviceType,
    backedUp: cred.backedUp,
  };
}

function deserializeCredential(s: SerializedCredential): PasskeyCredential {
  return {
    id: s.id,
    publicKey: new Uint8Array(Buffer.from(s.publicKeyBase64, "base64")),
    counter: s.counter,
    transports: s.transports,
    deviceType: s.deviceType,
    backedUp: s.backedUp,
  };
}

function serializeUser(user: StoredUser): SerializedUser {
  return {
    id: user.id,
    username: user.username,
    currentChallenge: user.currentChallenge,
    credentials: user.credentials.map(serializeCredential),
  };
}

function deserializeUser(s: SerializedUser): StoredUser {
  return {
    id: s.id,
    username: s.username,
    currentChallenge: s.currentChallenge,
    credentials: s.credentials.map(deserializeCredential),
  };
}

class UpstashUserBackend implements UserBackend {
  async get(username: string): Promise<StoredUser | undefined> {
    const raw = await getUpstashClient().get<SerializedUser>(userRedisKey(username));
    if (!raw) return undefined;
    return deserializeUser(raw);
  }

  async set(user: StoredUser): Promise<void> {
    await getUpstashClient().set(userRedisKey(user.username), serializeUser(user));
  }
}

class FileUserBackend implements UserBackend {
  private load(): Map<string, StoredUser> {
    const map = new Map<string, StoredUser>();
    try {
      if (!fs.existsSync(STORE_PATH)) return map;
      const raw = fs.readFileSync(STORE_PATH, "utf8");
      if (!raw.trim()) return map;
      const parsed = JSON.parse(raw) as Record<string, SerializedUser>;
      for (const [k, u] of Object.entries(parsed)) {
        map.set(k, deserializeUser(u));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[auth-store] failed to load users.json, starting empty:",
        err instanceof Error ? err.message : err
      );
    }
    return map;
  }

  private save(map: Map<string, StoredUser>): void {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const out: Record<string, SerializedUser> = {};
      for (const [k, u] of map.entries()) {
        out[k] = serializeUser(u);
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

  async get(username: string): Promise<StoredUser | undefined> {
    return this.load().get(key(username));
  }

  async set(user: StoredUser): Promise<void> {
    const map = this.load();
    map.set(key(user.username), user);
    this.save(map);
  }
}

let cachedBackend: UserBackend | null = null;

function backend(): UserBackend {
  if (!cachedBackend) {
    cachedBackend = isUpstashConfigured() ? new UpstashUserBackend() : new FileUserBackend();
  }
  return cachedBackend;
}

export async function getUserByUsername(username: string): Promise<StoredUser | undefined> {
  return backend().get(username);
}

export async function getOrCreateUser(username: string): Promise<StoredUser> {
  const existing = await backend().get(username);
  if (existing) return existing;
  const created: StoredUser = {
    id: randomUUID(),
    username: username.trim(),
    credentials: [],
  };
  await backend().set(created);
  return created;
}

export async function setChallenge(username: string, challenge: string): Promise<void> {
  const user = await backend().get(username);
  if (!user) return;
  user.currentChallenge = challenge;
  await backend().set(user);
}

export async function consumeChallenge(username: string): Promise<string | undefined> {
  const user = await backend().get(username);
  if (!user) return undefined;
  const challenge = user.currentChallenge;
  user.currentChallenge = undefined;
  await backend().set(user);
  return challenge;
}

export async function addCredential(
  username: string,
  credential: PasskeyCredential
): Promise<void> {
  const user = await backend().get(username);
  if (!user) throw new Error(`unknown user ${username}`);
  user.credentials.push(credential);
  await backend().set(user);
}

export async function findCredentialById(
  username: string,
  credentialId: string
): Promise<PasskeyCredential | undefined> {
  const user = await backend().get(username);
  if (!user) return undefined;
  return user.credentials.find((c) => c.id === credentialId);
}

export async function updateCredentialCounter(
  username: string,
  credentialId: string,
  counter: number
): Promise<void> {
  const user = await backend().get(username);
  if (!user) return;
  const cred = user.credentials.find((c) => c.id === credentialId);
  if (!cred) return;
  cred.counter = counter;
  await backend().set(user);
}
