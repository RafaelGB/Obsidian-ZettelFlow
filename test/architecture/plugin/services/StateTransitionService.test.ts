import { describe, it, expect, jest } from "@jest/globals";
import { StateTransitionService, FrontmatterAccessor } from "architecture/plugin/services/StateTransitionService";
import { LifecycleStateSchema } from "architecture/knowledge/lifecycle";

type SetSpy = jest.Mock<(property: string, value: unknown) => Promise<void>>;

function accessorWith(current: unknown): { accessor: FrontmatterAccessor; setSpy: SetSpy } {
    const setSpy = jest.fn(async () => undefined) as SetSpy;
    const accessor: FrontmatterAccessor = {
        getProperty: () => current as never,
        setProperty: setSpy as never,
    };
    return { accessor, setSpy };
}

describe("StateTransitionService", () => {
    const service = StateTransitionService.getInstance();
    const schema = new LifecycleStateSchema();

    it("writes only the configured state property on a valid transition (AC-6)", async () => {
        const { accessor, setSpy } = accessorWith("permanent");
        const ok = await service.transition(accessor, "state", schema, "developing", "a.md");
        expect(ok).toBe(true);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith("state", "developing");
    });

    it("performs no write on an invalid transition (AC-7)", async () => {
        const { accessor, setSpy } = accessorWith("permanent");
        const ok = await service.transition(accessor, "state", schema, "literature", "a.md");
        expect(ok).toBe(false);
        expect(setSpy).not.toHaveBeenCalled();
    });

    it("honors a custom property name on write (AC-8)", async () => {
        const custom = new LifecycleStateSchema("phase");
        const { accessor, setSpy } = accessorWith("fleeting");
        const ok = await service.transition(accessor, "phase", custom, "permanent", "a.md");
        expect(ok).toBe(true);
        expect(setSpy).toHaveBeenCalledWith("phase", "permanent");
    });

    it("returns false (no throw) when the write fails", async () => {
        const setSpy = jest.fn(async () => {
            throw new Error("boom");
        }) as SetSpy;
        const accessor: FrontmatterAccessor = {
            getProperty: () => "fleeting" as never,
            setProperty: setSpy as never,
        };
        const ok = await service.transition(accessor, "state", schema, "permanent", "a.md");
        expect(ok).toBe(false);
    });
});
