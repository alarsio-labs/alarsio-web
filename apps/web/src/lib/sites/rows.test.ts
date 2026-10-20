import { describe, expect, it } from "vitest";
import { toSiteRecord } from "./rows";

const row = {
  id: "51000000-0000-4000-8000-000000000001",
  name: "Tower A",
  address: "12 MG Road",
  status: "active",
  latitude: 18.5204,
  longitude: 73.8567,
  geofence_radius_m: 200,
  archived_at: null
};

describe("toSiteRecord", () => {
  it("accepts a row of the right shape", () => {
    expect(toSiteRecord(row)).toEqual(row);
  });

  it("keeps the archive date of an archived site", () => {
    expect(toSiteRecord({ ...row, status: "archived", archived_at: "2026-10-20T10:00:00Z" })).toMatchObject({
      status: "archived",
      archived_at: "2026-10-20T10:00:00Z"
    });
  });

  it("drops anything malformed instead of guessing", () => {
    expect(toSiteRecord(null)).toBeNull();
    expect(toSiteRecord("x")).toBeNull();
    expect(toSiteRecord({ ...row, id: "nope" })).toBeNull();
    expect(toSiteRecord({ ...row, status: "deleted" })).toBeNull();
    expect(toSiteRecord({ ...row, latitude: "18.5" })).toBeNull();
    expect(toSiteRecord({ ...row, geofence_radius_m: null })).toBeNull();
    expect(toSiteRecord({ ...row, archived_at: 5 })).toBeNull();
    expect(toSiteRecord({ ...row, name: undefined })).toBeNull();
  });
});
