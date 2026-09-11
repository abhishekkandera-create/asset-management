/**
 * Exact origins, plus two conveniences a hosted deployment needs:
 *   `*.vercel.app`  matches every preview build of a frontend
 *   `*`             allows any origin — demo only, never production
 *
 * A request with no Origin header (curl, an uptime check, a server-to-server
 * call) is always allowed: CORS governs browsers, and refusing these would
 * break the health check.
 */
export type CorsMatcher = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void;

export function buildCorsMatcher(allowed: readonly string[]): CorsMatcher {
  const exact = new Set(allowed.filter((entry) => !entry.startsWith('*')));
  const suffixes = allowed
    .filter((entry) => entry.startsWith('*.'))
    .map((entry) => entry.slice(1));
  const allowAny = allowed.includes('*');

  return (origin, callback) => {
    if (!origin || allowAny || exact.has(origin)) return callback(null, true);

    const host = safeHost(origin);
    if (host && suffixes.some((suffix) => host.endsWith(suffix))) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
