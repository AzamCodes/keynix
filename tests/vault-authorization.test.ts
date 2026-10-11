import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { PUT, DELETE } from "../src/app/api/vault/items/[id]/route";
import { POST } from "../src/app/api/vault/items/route";

vi.mock("@/lib/db", () => ({
  db: {
    vaultItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn() }));
const rateLimits = vi.hoisted(() => ({ check: vi.fn(async () => ({ success: true, reset: Date.now() + 60_000 })) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: rateLimits.check }));

const origin = "https://keynix.example";
const rowIdentity = { id: "synthetic-item-b", userId: "synthetic-user-a" };

afterEach(() => vi.clearAllMocks());

describe("vault API ownership and item identity", () => {
  it("scopes updates to the authenticated owner in the actual mutation", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(rowIdentity as never);
    vi.mocked(db.vaultItem.findFirst).mockResolvedValue({ ...rowIdentity } as never);
    vi.mocked(db.vaultItem.update).mockResolvedValue({ ...rowIdentity } as never);

    await PUT(
      new Request(`${origin}/api/vault/items/synthetic-item-b`, {
        method: "PUT",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: "synthetic-ciphertext",
          iv: "synthetic-iv",
          tag: "synthetic-tag",
          aadMeta: JSON.stringify({ itemId: rowIdentity.id, userId: rowIdentity.userId, version: 2 }),
        }),
      }),
      { params: Promise.resolve({ id: rowIdentity.id }) }
    );

    expect(db.vaultItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: rowIdentity.id, userId: rowIdentity.userId } })
    );
  });

  it("prevents another user's item from being edited or deleted by changing its ID", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "synthetic-user-a" } as never);
    vi.mocked(db.vaultItem.findFirst).mockResolvedValue(null);
    const params = { params: Promise.resolve({ id: "synthetic-user-b-item" }) };
    const payload = JSON.stringify({
      ciphertext: "synthetic-ciphertext",
      iv: "synthetic-iv",
      tag: "synthetic-tag",
      aadMeta: JSON.stringify({ itemId: "synthetic-user-b-item", userId: "synthetic-user-a", version: 2 }),
    });

    const update = await PUT(
      new Request(`${origin}/api/vault/items/synthetic-user-b-item`, {
        method: "PUT",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: payload,
      }),
      params
    );
    const deletion = await DELETE(
      new Request(`${origin}/api/vault/items/synthetic-user-b-item`, {
        method: "DELETE",
        headers: { Origin: origin },
      }),
      params
    );

    expect(update.status).toBe(404);
    expect(deletion.status).toBe(404);
    expect(db.vaultItem.update).not.toHaveBeenCalled();
    expect(db.vaultItem.delete).not.toHaveBeenCalled();
  });

  it("uses the version 2 authenticated item ID as the database row ID", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "synthetic-user-a" } as never);
    const syntheticUuid = "00000000-0000-4000-8000-000000000002";
    vi.mocked(db.vaultItem.create).mockResolvedValue({ id: syntheticUuid } as never);
    const aadMeta = JSON.stringify({ itemId: syntheticUuid, userId: "synthetic-user-a", version: 2 });

    await POST(
      new Request(`${origin}/api/vault/items`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: "synthetic-ciphertext",
          iv: "synthetic-iv",
          tag: "synthetic-tag",
          aadMeta,
        }),
      })
    );

    expect(db.vaultItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: syntheticUuid }) })
    );
  });

  it("rate-limits vault reads and writes against the authenticated user", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "synthetic-user-a" } as never);
    rateLimits.check.mockResolvedValueOnce({ success: false, reset: Date.now() + 60_000 });

    const response = await POST(
      new Request(`${origin}/api/vault/items`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      })
    );

    expect(response.status).toBe(429);
    expect(rateLimits.check).toHaveBeenCalledWith("user:synthetic-user-a", "vault-write", 120, 60_000);
    expect(db.vaultItem.create).not.toHaveBeenCalled();
  });

  it("rejects legacy-client V1 create and update requests", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ userId: "synthetic-user-a" } as never);
    const legacyId = "00000000-0000-4000-8000-000000000001";
    const response = await POST(
      new Request(`${origin}/api/vault/items`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: "synthetic-v1-ciphertext",
          iv: "synthetic-v1-iv",
          tag: "synthetic-v1-tag",
          aadMeta: JSON.stringify({ itemId: legacyId, userId: "synthetic-user-a", version: 1 }),
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(db.vaultItem.create).not.toHaveBeenCalled();

    const update = await PUT(
      new Request(`${origin}/api/vault/items/${legacyId}`, {
        method: "PUT",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          ciphertext: "synthetic-v1-ciphertext",
          iv: "synthetic-v1-iv",
          tag: "synthetic-v1-tag",
          aadMeta: JSON.stringify({ itemId: legacyId, userId: "synthetic-user-a", version: 1 }),
        }),
      }),
      { params: Promise.resolve({ id: legacyId }) }
    );
    expect(update.status).toBe(400);
    expect(db.vaultItem.update).not.toHaveBeenCalled();
  });
});
