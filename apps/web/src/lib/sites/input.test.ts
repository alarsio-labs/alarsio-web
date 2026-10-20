import { describe, expect, it } from "vitest";
import { SITE_STATUSES, cleanSiteInput, isSiteStatus, mapUrl, siteErrorCode } from "./input";

const good = { name: "Tower A", address: "12 MG Road, Pune", latitude: "18.5204", longitude: "73.8567", radius: "200" };
const clean = (over: Record<string, unknown> = {}) => cleanSiteInput({ ...good, ...over });
const code = (over: Record<string, unknown>) => {
  const r = clean(over);
  return r.ok ? null : r.code;
};

describe("cleanSiteInput", () => {
  it("returns trimmed text and numbers for a good site", () => {
    expect(clean({ name: "  Tower A  ", address: " 12 MG Road " })).toEqual({
      ok: true,
      value: { name: "Tower A", address: "12 MG Road", latitude: 18.5204, longitude: 73.8567, geofence_radius_m: 200 }
    });
  });

  it("holds the name to 1 to 120 characters, counting characters not UTF-16 units", () => {
    expect(code({ name: "" })).toBe("site_name");
    expect(code({ name: "   " })).toBe("site_name");
    expect(code({ name: "x" })).toBeNull();
    expect(code({ name: "x".repeat(120) })).toBeNull();
    expect(code({ name: "x".repeat(121) })).toBe("site_name");
    expect(code({ name: "🏗".repeat(120) })).toBeNull();
    expect(code({ name: "🏗".repeat(121) })).toBe("site_name");
    expect(code({ name: 7 })).toBe("site_name");
    expect(code({ name: null })).toBe("site_name");
  });

  it("holds the address to 1 to 500 characters", () => {
    expect(code({ address: "" })).toBe("site_address");
    expect(code({ address: " \t " })).toBe("site_address");
    expect(code({ address: "a".repeat(500) })).toBeNull();
    expect(code({ address: "a".repeat(501) })).toBe("site_address");
    expect(code({ address: undefined })).toBe("site_address");
  });

  it("holds latitude to -90..90, on the edge and just outside", () => {
    expect(code({ latitude: "90" })).toBeNull();
    expect(code({ latitude: "-90" })).toBeNull();
    expect(code({ latitude: "90.000001" })).toBe("site_latitude");
    expect(code({ latitude: "-90.000001" })).toBe("site_latitude");
    expect(code({ latitude: "91" })).toBe("site_latitude");
    expect(code({ latitude: "0" })).toBeNull();
  });

  it("holds longitude to -180..180, on the edge and just outside", () => {
    expect(code({ longitude: "180" })).toBeNull();
    expect(code({ longitude: "-180" })).toBeNull();
    expect(code({ longitude: "180.000001" })).toBe("site_longitude");
    expect(code({ longitude: "-180.000001" })).toBe("site_longitude");
    expect(code({ longitude: "181" })).toBe("site_longitude");
  });

  it("accepts only plain decimals for a coordinate", () => {
    for (const bad of ["", " ", "1e3", "NaN", "Infinity", "0x10", "12,5", "+5", "5.", ".5", "--5", "5 5", "12.5N", "1".repeat(4), "0.1234567890123456"]) {
      expect(code({ latitude: bad }), `latitude ${JSON.stringify(bad)}`).toBe("site_latitude");
      expect(code({ longitude: bad }), `longitude ${JSON.stringify(bad)}`).toBe("site_longitude");
    }
    expect(code({ latitude: 18.5 })).toBe("site_latitude");
    expect(code({ latitude: null })).toBe("site_latitude");
  });

  it("rounds a coordinate to the 6 places the database keeps, and trims spaces", () => {
    const r = clean({ latitude: " 18.52040449 ", longitude: "-73.8567004" });
    expect(r).toMatchObject({ ok: true, value: { latitude: 18.520404, longitude: -73.8567 } });
  });

  it("judges the range after rounding, as the database does", () => {
    expect(code({ latitude: "90.0000004" })).toBeNull();
    expect(code({ latitude: "90.0000006" })).toBe("site_latitude");
  });

  it("holds the radius to whole metres from 50 to 2000", () => {
    expect(code({ radius: "49" })).toBe("site_radius");
    expect(code({ radius: "50" })).toBeNull();
    expect(code({ radius: "2000" })).toBeNull();
    expect(code({ radius: "2001" })).toBe("site_radius");
    for (const bad of ["", " ", "200.5", "200m", "-200", "1e3", "abc", "NaN", "99999", "0x64"]) {
      expect(code({ radius: bad }), `radius ${JSON.stringify(bad)}`).toBe("site_radius");
    }
    expect(code({ radius: 200 })).toBe("site_radius");
  });

  it("reports the first wrong field, in the order the form shows them", () => {
    expect(code({ name: "", address: "", latitude: "x" })).toBe("site_name");
    expect(code({ address: "", latitude: "x" })).toBe("site_address");
    expect(code({ latitude: "x", radius: "1" })).toBe("site_latitude");
    expect(code({ longitude: "x", radius: "1" })).toBe("site_longitude");
  });
});

describe("isSiteStatus", () => {
  it("accepts the four statuses a manager may set, and never archived", () => {
    expect([...SITE_STATUSES]).toEqual(["planned", "active", "paused", "completed"]);
    for (const s of SITE_STATUSES) expect(isSiteStatus(s)).toBe(true);
    for (const bad of ["archived", "", "ACTIVE", "__proto__", "constructor", null, undefined, 3]) {
      expect(isSiteStatus(bad), String(bad)).toBe(false);
    }
  });
});

describe("siteErrorCode", () => {
  it("names only the answers a manager can act on", () => {
    expect(siteErrorCode("42501")).toBe("site_forbidden");
    expect(siteErrorCode("23505")).toBe("site_exists");
    expect(siteErrorCode("23514")).toBe("generic");
    expect(siteErrorCode("XX000")).toBe("generic");
    expect(siteErrorCode(undefined)).toBe("generic");
  });
});

describe("mapUrl", () => {
  it("builds the find-on-map link from numbers only", () => {
    expect(mapUrl(18.5204, 73.8567)).toBe("https://www.google.com/maps/search/?api=1&query=18.5204,73.8567");
    expect(mapUrl(-1.5, -0.25)).toBe("https://www.google.com/maps/search/?api=1&query=-1.5,-0.25");
  });

  it("returns null for a value that is not a finite number", () => {
    expect(mapUrl(Number.NaN, 1)).toBeNull();
    expect(mapUrl(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
