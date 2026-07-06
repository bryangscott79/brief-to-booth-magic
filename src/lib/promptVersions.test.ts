import { describe, it, expect } from "vitest";
import { makeVersionedAngleId, makeConfigScopedAngleId, parseVersionedAngleId, sanitizeConfigKey } from "./promptVersions";

describe("config-scoped angle ids", () => {
  it("round-trips version + config", () => {
    const id = makeConfigScopedAngleId(makeVersionedAngleId("hero_34", "abc123"), "20x40");
    expect(id).toBe("hero_34__v__abc123__cfg__20x40");
    expect(parseVersionedAngleId(id)).toEqual({ baseAngleId: "hero_34", versionId: "abc123", configKey: "20x40" });
  });
  it("parses legacy unversioned id", () => {
    expect(parseVersionedAngleId("hero_34")).toEqual({ baseAngleId: "hero_34", versionId: null, configKey: null });
  });
  it("parses versioned pre-config id", () => {
    expect(parseVersionedAngleId("zone_interior_z1__v__x9")).toEqual({ baseAngleId: "zone_interior_z1", versionId: "x9", configKey: null });
  });
  it("sanitizes labels deterministically and file-safe", () => {
    expect(sanitizeConfigKey("20x40")).toBe("20x40");
    expect(sanitizeConfigKey("20' x 40'")).toBe("20-x-40");
    expect(sanitizeConfigKey("10m X 10m")).toBe("10m-x-10m");
    expect(sanitizeConfigKey("  ")).toBe("size");
  });
  it("config-scopes an unversioned id defensively", () => {
    expect(parseVersionedAngleId("hero_34__cfg__100x60")).toEqual({ baseAngleId: "hero_34", versionId: null, configKey: "100x60" });
  });
});
