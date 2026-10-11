import { afterEach, describe, expect, it, vi } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { getOpaqueServerSetup } from "../src/lib/recovery-protocol";

const original = process.env.OPAQUE_SERVER_SETUP;

afterEach(() => {
  vi.unstubAllEnvs();
  if (original === undefined) delete process.env.OPAQUE_SERVER_SETUP;
  else process.env.OPAQUE_SERVER_SETUP = original;
});

describe("OPAQUE server setup configuration", () => {
  it("accepts the pinned library's documented generated format", async () => {
    await opaque.ready;
    const setup = opaque.server.createSetup();
    vi.stubEnv("OPAQUE_SERVER_SETUP", setup);
    expect(getOpaqueServerSetup()).toBe(setup);
  });

  it("rejects missing and malformed setup rather than silently replacing it", () => {
    vi.stubEnv("OPAQUE_SERVER_SETUP", "");
    expect(() => getOpaqueServerSetup()).toThrow(/171-character format/);
    vi.stubEnv("OPAQUE_SERVER_SETUP", "!".repeat(171));
    expect(() => getOpaqueServerSetup()).toThrow(/171-character format/);
  });
});
