import { describe, test, expect } from "vitest";
import {
  probeLogSources,
  readServiceLog,
  readWorkerLog,
} from "../../lib/systemLogs.js";

describe("probeLogSources", () => {
  test("reports availability for every known log source, including worker", async () => {
    const sources = await probeLogSources();
    for (const id of ["admin", "installer", "service", "worker", "nginx"]) {
      expect(sources[id]).toBeDefined();
      expect(typeof sources[id].available).toBe("boolean");
    }
    expect(sources.admin.available).toBe(true);
  });
});

describe("readWorkerLog", () => {
  test("resolves to the standard system-log shape", async () => {
    const result = await readWorkerLog({ maxLines: 10 });
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.lines)).toBe(true);
    if (result.available) {
      expect(typeof result.source).toBe("string");
    } else {
      expect(typeof result.reason).toBe("string");
    }
  });
});

describe("readServiceLog (regression after journal refactor)", () => {
  test("resolves to the standard system-log shape", async () => {
    const result = await readServiceLog({ maxLines: 10 });
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.lines)).toBe(true);
  });
});
