import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { log } from "architecture/monitoring/Logger";

describe("Logger", () => {
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let debugSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it("emits error even when debug mode is off", () => {
    log.setDebugMode(false);
    log.error("boom");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("emits error out of the box, before any setDebugMode/setLevelInfo call (regression)", () => {
    // A fresh singleton (never configured) used to leave error() as a no-op, silently
    // swallowing errors on a plain load. The constructor now wires it up.
    jest.isolateModules(() => {
      const freshLog = (
        require("architecture/monitoring/Logger") as typeof import("architecture/monitoring/Logger")
      ).log;
      freshLog.error("boom");
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("still emits error when debug mode is on", () => {
    log.setDebugMode(true);
    log.error("boom");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does NOT emit debug when debug mode is off", () => {
    log.setDebugMode(false);
    log.setLevelInfo("trace");
    log.debug("noise");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("emits debug when debug mode is on and the level is high enough", () => {
    log.setDebugMode(true);
    log.setLevelInfo("debug");
    log.debug("hello");
    expect(debugSpy).toHaveBeenCalled();
  });
});
