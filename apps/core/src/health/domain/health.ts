/**
 * Domain: result of a health probe.
 */
export interface HealthStatus {
  status: "ok" | "degraded";
  db: "connected" | "unreachable";
}
