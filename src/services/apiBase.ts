/**
 * Split-deploy base URLs.
 *
 * - Same-origin (local dev / single Render service): leave VITE_API_URL unset
 *   and all calls stay relative ("/api/...", same-host WS).
 * - Vercel frontend + Render backend: set VITE_API_URL to the Render service
 *   origin, e.g. "https://trinetra-api.onrender.com". All REST calls are
 *   prefixed and the WS URL derives from it unless VITE_WS_URL overrides.
 */

/**
 * NOTE: Vite only inlines env vars accessed as literals
 * (`import.meta.env.VITE_API_URL`). Dynamic access
 * (`import.meta.env[key]`) compiles to a runtime `import.meta`
 * lookup that is `undefined` in the browser bundle — the variable
 * silently never lands. Do NOT "simplify" this back to a helper.
 */
function readViteApiUrl(): string {
  try {
    const v = import.meta.env.VITE_API_URL;
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* non-Vite runtime (server bundle) — fall through */
  }
  return "";
}

function readViteWsUrl(): string {
  try {
    const v = import.meta.env.VITE_WS_URL;
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* non-Vite runtime (server bundle) — fall through */
  }
  return "";
}

/** Render backend origin, no trailing slash. "" = same-origin. */
export const API_BASE: string = readViteApiUrl().replace(/\/+$/, "");

/** Prefix a "/api/..." (or any root-absolute) path with the backend origin. */
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** WebSocket endpoint for live case updates. */
export function caseWsUrl(token: string): string {
  const override = readViteWsUrl();
  if (override) {
    const sep = override.includes("?") ? "&" : "?";
    return `${override}${sep}token=${encodeURIComponent(token)}`;
  }
  if (API_BASE) {
    const wsOrigin = API_BASE.replace(/^http/, "ws");
    return `${wsOrigin}/ws/case-updates?token=${encodeURIComponent(token)}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/case-updates?token=${encodeURIComponent(token)}`;
}
