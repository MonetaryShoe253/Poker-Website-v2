/** Where to send someone after sign-in/onboarding, from a `?next=` param.
 * Only same-site paths are honoured ("/submit?..."), never "//evil.com" or
 * absolute URLs, so the param can't be used as an open redirect. */
export function safeNext(params: URLSearchParams, fallback = "/play"): string {
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
