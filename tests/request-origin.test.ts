import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSameRequestOrigin } from "../src/lib/request-origin";
import { POST as logoutPost } from "../src/app/api/auth/logout/route";
import { destroySession } from "../src/lib/session";

vi.mock("@/lib/session", () => ({ destroySession: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("state-changing request origin validation", () => {
  it("accepts an exact same-origin request", () => {
    expect(
      hasSameRequestOrigin(
        new Request("https://keynix.example/api/auth/logout", {
          method: "POST",
          headers: { Origin: "https://keynix.example" },
        })
      )
    ).toBe(true);
  });

  it.each([undefined, "null", "https://attacker.example", "not an origin"])(
    "rejects absent, opaque, cross-origin, or malformed Origin (%s)",
    (origin) => {
      const headers = new Headers();
      if (origin !== undefined) headers.set("Origin", origin);
      expect(
        hasSameRequestOrigin(
          new Request("https://keynix.example/api/auth/logout", {
            method: "POST",
            headers,
          })
        )
      ).toBe(false);
    }
  );

  it("rejects cross-origin logout before revocation and reports revocation failures", async () => {
    const destroy = vi.mocked(destroySession);
    destroy.mockResolvedValueOnce(false);

    const rejected = await logoutPost(
      new Request("https://keynix.example/api/auth/logout", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      })
    );
    expect(rejected.status).toBe(403);
    expect(destroy).not.toHaveBeenCalled();

    const failed = await logoutPost(
      new Request("https://keynix.example/api/auth/logout", {
        method: "POST",
        headers: { Origin: "https://keynix.example" },
      })
    );
    expect(failed.status).toBe(500);
  });
});
