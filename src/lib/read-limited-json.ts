export type LimitedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "Invalid JSON body" | "Request body too large" };

/** Read JSON without buffering an unbounded API request body. */
export async function readLimitedJson(request: Request, maxBytes: number): Promise<LimitedJsonResult> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, status: 400, error: "Invalid JSON body" };
    if (Number(declaredLength) > maxBytes) return { ok: false, status: 413, error: "Request body too large" };
  }

  if (!request.body) return { ok: false, status: 400, error: "Invalid JSON body" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: "Request body too large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  } finally {
    reader.releaseLock();
  }
}
