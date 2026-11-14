const DEVELOPMENT_CORE_URL = "http://localhost:3001";

/**
 * Core's base URL for server-side requests. Development falls back to the local Core; a
 * production server without CORE_API_URL fails instead of quietly calling localhost.
 */
export function coreApiUrl(
  env: Record<string, string | undefined> = process.env,
) {
  const configured = env.CORE_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (env.NODE_ENV === "production") {
    throw new Error("CORE_API_URL is not set.");
  }

  return DEVELOPMENT_CORE_URL;
}
