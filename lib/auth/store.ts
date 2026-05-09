import { randomUUID } from "node:crypto";
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

const users = new Map<string, StoredUser>();

function key(username: string): string {
  return username.trim().toLowerCase();
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
  return created;
}

export function setChallenge(username: string, challenge: string): void {
  const user = getUserByUsername(username);
  if (user) user.currentChallenge = challenge;
}

export function consumeChallenge(username: string): string | undefined {
  const user = getUserByUsername(username);
  if (!user) return undefined;
  const challenge = user.currentChallenge;
  user.currentChallenge = undefined;
  return challenge;
}

export function addCredential(username: string, credential: PasskeyCredential): void {
  const user = getUserByUsername(username);
  if (!user) throw new Error(`unknown user ${username}`);
  user.credentials.push(credential);
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
  if (cred) cred.counter = counter;
}
