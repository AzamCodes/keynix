import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("service worker private-content cache rules", () => {
  it("does not intercept dashboard HTML, Next RSC payloads, or API responses", () => {
    const handlers: Record<string, (event: never) => void> = {};
    const cache = { addAll: vi.fn(), put: vi.fn(), match: vi.fn() };
    const self = {
      location: { origin: "https://keynix.example" },
      clients: { claim: vi.fn() },
      addEventListener: (name: string, handler: (event: never) => void) => {
        handlers[name] = handler;
      },
      skipWaiting: vi.fn(),
    };
    runInNewContext(readFileSync("public/sw.js", "utf8"), {
      self,
      caches: { open: vi.fn(async () => cache), keys: vi.fn(async () => []), delete: vi.fn() },
      URL,
      Promise,
      fetch: vi.fn(async () => new Response("synthetic public asset", { status: 200 })),
    });

    const shouldIntercept = (url: string, destination: string, mode: string) => {
      let intercepted = false;
      handlers.fetch({
        request: { method: "GET", url, destination, mode },
        respondWith: () => { intercepted = true; },
      } as never);
      return intercepted;
    };

    expect(shouldIntercept("https://keynix.example/dashboard", "document", "navigate")).toBe(false);
    expect(shouldIntercept("https://keynix.example/dashboard?_rsc=synthetic", "", "same-origin")).toBe(false);
    expect(shouldIntercept("https://keynix.example/api/vault/items", "", "same-origin")).toBe(false);
    expect(shouldIntercept("https://keynix.example/_next/static/chunk.js", "script", "same-origin")).toBe(true);
    expect(shouldIntercept("https://keynix.example/dashboard/private.js", "script", "same-origin")).toBe(false);
  });
});
