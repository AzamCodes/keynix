/** Reject browser state-changing requests unless they originate from this exact origin. */
export function hasSameRequestOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === origin && parsedOrigin.origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
