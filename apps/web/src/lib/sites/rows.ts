import { UUID } from "../uuid";

// Narrowing for rows that come back from PostgREST as unknown JSON. The
// database is the boundary; this only makes the page's types honest.

export type SiteRecord = {
  id: string;
  name: string;
  address: string;
  status: "planned" | "active" | "paused" | "completed" | "archived";
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
  archived_at: string | null;
};

const STATUSES: readonly string[] = ["planned", "active", "paused", "completed", "archived"];

export function toSiteRecord(v: unknown): SiteRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    !UUID.test(o.id) ||
    typeof o.name !== "string" ||
    typeof o.address !== "string" ||
    typeof o.status !== "string" ||
    !STATUSES.includes(o.status) ||
    typeof o.latitude !== "number" ||
    typeof o.longitude !== "number" ||
    typeof o.geofence_radius_m !== "number" ||
    !(o.archived_at === null || typeof o.archived_at === "string")
  ) {
    return null;
  }
  return {
    id: o.id,
    name: o.name,
    address: o.address,
    status: o.status as SiteRecord["status"],
    latitude: o.latitude,
    longitude: o.longitude,
    geofence_radius_m: o.geofence_radius_m,
    archived_at: o.archived_at
  };
}
