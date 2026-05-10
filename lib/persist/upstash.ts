import { Redis } from "@upstash/redis";

let cachedClient: Redis | null = null;

export function isUpstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getUpstashClient(): Redis {
  if (!isUpstashConfigured()) {
    throw new Error(
      "Upstash Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"
    );
  }

  if (!cachedClient) {
    cachedClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  return cachedClient;
}
