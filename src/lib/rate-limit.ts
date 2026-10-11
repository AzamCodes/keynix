import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { db } from "./db";

let upstashRatelimiters: Record<string, Ratelimit> = {};

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  upstashRatelimiters = {
    preauth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "@upstash/ratelimit/preauth",
    }),
    login: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "@upstash/ratelimit/login",
    }),
    register: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "15 m"),
      prefix: "@upstash/ratelimit/register",
    }),
    "password-change": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 h"),
      prefix: "@upstash/ratelimit/password-change",
    }),
    "account-delete": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 d"),
      prefix: "@upstash/ratelimit/account-delete",
    }),
    "recovery-start": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "@upstash/ratelimit/recovery-start",
    }),
    "recovery-finish": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "@upstash/ratelimit/recovery-finish",
    }),
    "recovery-enroll": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "@upstash/ratelimit/recovery-enroll",
    }),
    "vault-read": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(600, "1 m"),
      prefix: "@upstash/ratelimit/vault-read",
    }),
    "vault-write": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      prefix: "@upstash/ratelimit/vault-write",
    }),
    "vault-delete": new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "1 m"),
      prefix: "@upstash/ratelimit/vault-delete",
    }),
  };
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// In-memory fallback store when Redis and Database are offline (e.g., unit tests)
const inMemoryStore: Map<string, { count: number; expiresAt: number }> = new Map();

function checkMemoryLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const record = inMemoryStore.get(key);

  if (!record || record.expiresAt <= now) {
    const expiresAt = now + windowMs;
    inMemoryStore.set(key, { count: 1, expiresAt });
    return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: expiresAt };
  }

  if (record.count >= maxRequests) {
    return { success: false, limit: maxRequests, remaining: 0, reset: record.expiresAt };
  }

  record.count += 1;
  return { success: true, limit: maxRequests, remaining: maxRequests - record.count, reset: record.expiresAt };
}

export async function checkRateLimit(
  identifier: string,
  type: "preauth" | "login" | "register" | "password-change" | "account-delete" | "recovery-start" | "recovery-finish" | "recovery-enroll" | "vault-read" | "vault-write" | "vault-delete",
  maxRequests: number = 5,
  windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
  // Priority 1: Upstash Redis (Vercel Serverless Production)
  if (upstashRatelimiters[type]) {
    try {
      const res = await upstashRatelimiters[type].limit(identifier);
      return {
        success: res.success,
        limit: res.limit,
        remaining: res.remaining,
        reset: res.reset,
      };
    } catch {
      // Do not log backend errors that might embed request or credential data.
      console.error("Upstash Redis rate limiting is unavailable; trying the database backend.");
    }
  }

  // Priority 2: Atomic database-backed limiter shared by application instances.
  const now = Date.now();
  const key = `ratelimit:${type}:${identifier}`;

  try {
    const resetAt = new Date(now + windowMs);
    const [record] = await db.$queryRaw<Array<{ count: number; expires_at: Date }>>`
      INSERT INTO "rate_limits" ("key", "count", "expires_at")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "rate_limits"."expires_at" <= NOW() THEN 1
          ELSE "rate_limits"."count" + 1
        END,
        "expires_at" = CASE
          WHEN "rate_limits"."expires_at" <= NOW() THEN EXCLUDED."expires_at"
          ELSE "rate_limits"."expires_at"
        END
      RETURNING "count", "expires_at"
    `;

    if (!record) throw new Error("Rate limit store returned no row");
    const blocked = record.count > maxRequests;

    return {
      success: !blocked,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      reset: record.expires_at.getTime(),
    };
  } catch {
    // An in-process counter is not a reliable production control across
    // serverless instances. Keep it limited to local development and tests.
    if (
      process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL_ENV === "preview"
    ) {
      const reset = Date.now() + windowMs;
      console.error("Shared rate limiting is unavailable in a deployed environment.");
      return { success: false, limit: maxRequests, remaining: 0, reset };
    }

    return checkMemoryLimit(key, maxRequests, windowMs);
  }
}
