import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { StateTransitionService, type FrontmatterAccessor } from "architecture/plugin/services/StateTransitionService";
import { LifecycleStateSchema, STATE_SUBJECT_PREFIX, stateSubject } from "architecture/knowledge/lifecycle";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import type { Judgement } from "architecture/knowledge/judgement";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";

// test/architecture/plugin/services → 4 ups → repo root
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function accessorWith(current: unknown): { accessor: FrontmatterAccessor; setSpy: jest.Mock } {
    const setSpy = jest.fn(async () => undefined);
    return {
        setSpy,
        accessor: {
            getProperty: () => current as never,
            setProperty: setSpy as never,
        },
    };
}

/** A judgement host whose log we can read, with the scope the real one honours. */
function hostWith(excluded: string[] = []): { log: Judgement[] } {
    const state = { judgements: { enabled: true, log: [] as Judgement[] }, excludedPaths: excluded };
    JudgementLog.getInstance().init({
        settings: state as never,
        saveSettings: () => undefined,
    });
    return { get log() { return state.judgements.log; } } as { log: Judgement[] };
}

/**
 * Promoting a note is a verdict you made (#581).
 *
 * It is the clearest human judgement the product has a vocabulary for, and it recorded nothing —
 * because Cultivate records its verdicts at the **friction** step, and `advance` deliberately has
 * none. So the verdict goes where the transition goes: one choke point, and a required `origin`, so
 * a future door cannot forget to say which act it was.
 */
describe("a transition records one verdict, at the one place it happens (#581)", () => {
    const service = StateTransitionService.getInstance();
    const schema = new LifecycleStateSchema();

    let host: { log: Judgement[] };
    beforeEach(() => {
        host = hostWith();
    });

    it("names the subject after the state, with no words in it", () => {
        expect(STATE_SUBJECT_PREFIX).toBe("state:");
        expect(stateSubject("literature")).toBe("state:literature");
        expect(stateSubject("literature")).toMatch(/^state:[a-z]+$/);
    });

    it("records exactly one entry on a successful promotion", async () => {
        const { accessor } = accessorWith("fleeting");
        expect(await service.transition(accessor, "state", schema, "literature", "Notes/a.md", "derived")).toBe(true);
        expect(host.log).toHaveLength(1);
        expect(host.log[0]).toMatchObject({
            path: "Notes/a.md",
            subject: "state:literature",
            origin: "derived",
            verdict: "accepted",
        });
    });

    it("carries the act, not a guess about it", async () => {
        const { accessor } = accessorWith("fleeting");
        await service.transition(accessor, "state", schema, "literature", "Notes/a.md", "human");
        expect(host.log[0].origin).toBe("human");
    });

    it("records nothing for a transition the machine refuses", async () => {
        const { accessor, setSpy } = accessorWith("permanent");
        expect(await service.transition(accessor, "state", schema, "literature", "Notes/a.md", "derived")).toBe(false);
        expect(setSpy).not.toHaveBeenCalled();
        expect(host.log).toHaveLength(0);
    });

    it("records nothing when the write fails", async () => {
        const accessor: FrontmatterAccessor = {
            getProperty: () => "fleeting" as never,
            setProperty: (async () => {
                throw new Error("boom");
            }) as never,
        };
        expect(await service.transition(accessor, "state", schema, "literature", "Notes/a.md", "derived")).toBe(false);
        expect(host.log).toHaveLength(0);
    });

    it("records nothing for a note outside the knowledge scope, and still transitions it", async () => {
        host = hostWith(["Excluded"]);
        const { accessor, setSpy } = accessorWith("fleeting");
        expect(await service.transition(accessor, "state", schema, "literature", "Excluded/a.md", "derived")).toBe(true);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(host.log).toHaveLength(0);
    });

    it("keeps no locale text in the record", () => {
        const table = { ...(en as Record<string, string>), ...(es as Record<string, string>) };
        expect(Object.keys(table)).not.toContain("state:literature");
        for (const value of Object.values(table)) expect(value).not.toContain("state:literature");
    });

    it("is recorded at the choke point, and each door says which act it was", () => {
        const service_src = read("src/architecture/plugin/services/StateTransitionService.ts");
        expect(service_src).toContain("JudgementLog.getInstance().record(");
        expect(service_src).toContain("stateSubject(target)");
        // Cultivate proposed it and you took it; the palette is you choosing.
        expect(read("src/architecture/plugin/services/CultivationService.ts")).toContain('"derived"');
        expect(read("src/starters/zcomponents/StateTransitionComponent.ts")).toContain('"human"');
    });
});
