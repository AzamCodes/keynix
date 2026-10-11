import { describe, expect, it } from "vitest";
import { readLimitedJson } from "@/lib/read-limited-json";

describe("readLimitedJson", () => {
  it("parses a synthetic JSON body within the byte limit", async () => {
    const result = await readLimitedJson(new Request("https://keynix.synthetic.test/api", {
      method: "POST",
      body: JSON.stringify({ label: "synthetic" }),
    }), 128);

    expect(result).toEqual({ ok: true, value: { label: "synthetic" } });
  });

  it("rejects oversized declared and streamed bodies", async () => {
    const declared = await readLimitedJson(new Request("https://keynix.synthetic.test/api", {
      method: "POST",
      headers: { "content-length": "129" },
      body: "{}",
    }), 128);
    const streamed = await readLimitedJson(new Request("https://keynix.synthetic.test/api", {
      method: "POST",
      body: "x".repeat(129),
    }), 128);

    expect(declared).toMatchObject({ ok: false, status: 413 });
    expect(streamed).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects malformed JSON and invalid declared lengths", async () => {
    const malformed = await readLimitedJson(new Request("https://keynix.synthetic.test/api", {
      method: "POST",
      body: "{invalid",
    }), 128);
    const invalidLength = await readLimitedJson(new Request("https://keynix.synthetic.test/api", {
      method: "POST",
      headers: { "content-length": "unknown" },
      body: "{}",
    }), 128);

    expect(malformed).toMatchObject({ ok: false, status: 400 });
    expect(invalidLength).toMatchObject({ ok: false, status: 400 });
  });
});
