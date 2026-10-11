import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { destroySession } from "@/lib/session";

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(() => ({ value: "synthetic-session-token" })),
    delete: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/db", () => ({ db: { session: { updateMany: vi.fn() } } }));

afterEach(() => vi.clearAllMocks());

describe("server-side logout revocation", () => {
  it("clears the local cookie and reports failure if database revocation fails", async () => {
    vi.mocked(db.session.updateMany).mockRejectedValueOnce(new Error("synthetic database failure"));

    await expect(destroySession()).resolves.toBe(false);
    expect(cookieStore.delete).toHaveBeenCalledWith("keynix_session");
  });

  it("treats an already absent or revoked token as no active session", async () => {
    vi.mocked(db.session.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    await expect(destroySession()).resolves.toBe(true);
    expect(cookieStore.delete).toHaveBeenCalledWith("keynix_session");
  });
});
