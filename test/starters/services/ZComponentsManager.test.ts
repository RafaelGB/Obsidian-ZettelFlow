import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { ZComponentsManager } from "starters/services/ZComponentsManager";

// PluginComponent is used only as a type in the manager, so importing it here stays light.
type FakeComponent = { onLoad: () => void; onUnload: () => void };

describe("ZComponentsManager", () => {
  beforeEach(() => {
    // Ensure a clean registry (the manager is a module-level singleton).
    ZComponentsManager.unloadComponents();
  });

  it("runs onUnload on every registered component and clears the registry", () => {
    const a: FakeComponent = { onLoad: jest.fn(), onUnload: jest.fn() };
    const b: FakeComponent = { onLoad: jest.fn(), onUnload: jest.fn() };

    ZComponentsManager.registerComponent(a as unknown as never);
    ZComponentsManager.registerComponent(b as unknown as never);

    ZComponentsManager.unloadComponents();

    expect(a.onUnload).toHaveBeenCalledTimes(1);
    expect(b.onUnload).toHaveBeenCalledTimes(1);

    (a.onUnload as ReturnType<typeof jest.fn>).mockClear();
    ZComponentsManager.unloadComponents();
    expect(a.onUnload).not.toHaveBeenCalled();
  });

  it("runs onLoad on every registered component", () => {
    const a: FakeComponent = { onLoad: jest.fn(), onUnload: jest.fn() };
    ZComponentsManager.registerComponent(a as unknown as never);
    ZComponentsManager.loadComponents();
    expect(a.onLoad).toHaveBeenCalledTimes(1);
  });
});
