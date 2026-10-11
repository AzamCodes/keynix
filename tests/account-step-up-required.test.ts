import { describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => ({
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock("@/lib/request-origin", () => ({ hasSameRequestOrigin: () => true }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { updateMany: writes.userUpdate, delete: writes.userDelete },
    session: { updateMany: writes.sessionUpdate },
  },
}));
vi.mock("@/lib/session", () => ({
  getCurrentSession: vi.fn(async () => ({
    id: "synthetic-session-id",
    userId: "synthetic-user-id",
    user: { authHash: "synthetic-auth-hash", recoveryVersion: 1 },
  })),
}));

import { POST as changePassword } from "../src/app/api/account/change-password/route";
import { POST as deleteAccount } from "../src/app/api/account/delete/route";

function request(path: string): Request {
  return new Request(`https://keynix.example${path}`, {
    method: "POST",
    headers: { origin: "https://keynix.example" },
  });
}

describe("account mutations require a fresh credential proof", () => {
  it("rejects password change despite a valid session and does not write", async () => {
    const response = await changePassword(request("/api/account/change-password"));

    expect(response.status).toBe(501);
    expect(writes.userUpdate).not.toHaveBeenCalled();
    expect(writes.sessionUpdate).not.toHaveBeenCalled();
  });

  it("rejects account deletion despite a valid session and does not delete or revoke", async () => {
    const response = await deleteAccount(request("/api/account/delete"));

    expect(response.status).toBe(501);
    expect(writes.userDelete).not.toHaveBeenCalled();
    expect(writes.sessionUpdate).not.toHaveBeenCalled();
  });
});
