import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: vi.fn(), rateLimit: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() } },
}));

const mutableEnvironment = process.env as Record<string, string | undefined>;
const oldNodeEnv = process.env.NODE_ENV;
const oldVercelEnv = process.env.VERCEL_ENV;

afterEach(() => {
  if (oldNodeEnv === undefined) delete mutableEnvironment.NODE_ENV;
  else mutableEnvironment.NODE_ENV = oldNodeEnv;
  if (oldVercelEnv === undefined) delete mutableEnvironment.VERCEL_ENV;
  else mutableEnvironment.VERCEL_ENV = oldVercelEnv;
  vi.clearAllMocks();
});

describe("rate-limit backend failure behavior", () => {
  it("fails closed instead of using per-process memory in Production", async () => {
    mutableEnvironment.NODE_ENV = "production";
    mutableEnvironment.VERCEL_ENV = "production";
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error("synthetic backend failure"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkRateLimit("synthetic-client", "login", 2, 1000);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(error).toHaveBeenCalledWith("Shared rate limiting is unavailable in a deployed environment.");
    error.mockRestore();
  });

  it("uses the isolated in-memory fallback in tests when shared storage is unavailable", async () => {
    mutableEnvironment.NODE_ENV = "test";
    delete mutableEnvironment.VERCEL_ENV;
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error("synthetic backend failure"));

    const first = await checkRateLimit("synthetic-test-client", "login", 1, 1000);
    const second = await checkRateLimit("synthetic-test-client", "login", 1, 1000);

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
  });

  it("fails closed in Preview instead of using an instance-local counter", async () => {
    mutableEnvironment.NODE_ENV = "test";
    mutableEnvironment.VERCEL_ENV = "preview";
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error("synthetic backend failure"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkRateLimit("synthetic-preview-client", "login", 2, 1000);

    expect(result.success).toBe(false);
    expect(error).toHaveBeenCalledWith("Shared rate limiting is unavailable in a deployed environment.");
    error.mockRestore();
  });

  it("enforces the database threshold from the atomic returned counter", async () => {
    mutableEnvironment.NODE_ENV = "production";
    mutableEnvironment.VERCEL_ENV = "production";
    vi.mocked(db.$queryRaw)
      .mockResolvedValueOnce([{ count: 1, expires_at: new Date(Date.now() + 10_000) }])
      .mockResolvedValueOnce([{ count: 2, expires_at: new Date(Date.now() + 10_000) }])
      .mockResolvedValueOnce([{ count: 3, expires_at: new Date(Date.now() + 10_000) }]);

    const first = await checkRateLimit("synthetic-shared-client", "login", 2, 10_000);
    const second = await checkRateLimit("synthetic-shared-client", "login", 2, 10_000);
    const third = await checkRateLimit("synthetic-shared-client", "login", 2, 10_000);

    expect([first.success, second.success, third.success]).toEqual([true, true, false]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
