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
  type: "preauth" | "login" | "register",
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
    } catch (err) {
      console.error("Upstash Redis Rate Limit error, falling back:", err);
    }
  }

  // Priority 2: Database-backed persistent rate limiter
  const now = Date.now();
  const key = `ratelimit:${type}:${identifier}`;

  try {
    const record = await db.rateLimit.findUnique({
      where: { key },
    });

    if (!record || record.expiresAt.getTime() <= now) {
      const expiresAt = new Date(now + windowMs);
      await db.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: 1, expiresAt },
      });
      return {
        success: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        reset: expiresAt.getTime(),
      };
    }

    if (record.count >= maxRequests) {
      return {
        success: false,
        limit: maxRequests,
        remaining: 0,
        reset: record.expiresAt.getTime(),
      };
    }

    const updated = await db.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    return {
      success: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - updated.count),
      reset: record.expiresAt.getTime(),
    };
  } catch {
    // Priority 3: In-memory fallback (Unit tests / Offline dev)
    return checkMemoryLimit(key, maxRequests, windowMs);
  }
}
