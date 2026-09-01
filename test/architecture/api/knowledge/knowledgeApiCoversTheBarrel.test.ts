import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import * as state from "architecture/knowledge/state";
import { knowledgeApi, NOT_EXPOSED, type KnowledgeApiDeps } from "architecture/api/lib/knowledge/knowledgeApi";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

// test/architecture/api/knowledge → 4 ups → repo root
const API_MODULE = join(__dirname, "..", "..", "..", "..", "src", "architecture", "api", "lib", "knowledge", "knowledgeApi.ts");

const deps: KnowledgeApiDeps = {
    model: () => new KnowledgeModel(),
    history: () => [],
    ready: () => true,
};

/** Every function the State barrel exports — the surface `zf.knowledge` has to account for. */
function barrelFunctions(): string[] {
    return Object.entries(state)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort();
}

describe("zf.knowledge accounts for the whole State barrel (#350, FR-2/AC-1)", () => {
    const exposed = knowledgeApi(deps);

    it("finds a barrel worth exposing", () => {
        expect(barrelFunctions().length).toBeGreaterThan(20);
    });

    /**
     * The failure this prevents is silent omission: someone adds a projection to the State barrel and
     * `zf.knowledge` quietly falls a feature behind, which is exactly the hand-written-mirror bug epic
     * #348 exists to kill. Declining to expose something is a fine answer — it just has to be written
     * down in NOT_EXPOSED with a reason.
     */
    it("either exposes or explicitly declines every exported projection", () => {
        const exposedSources = new Set(Object.keys(exposed));
        const declined = new Set(Object.keys(NOT_EXPOSED));

        const unaccounted = barrelFunctions().filter((name) => {
            if (declined.has(name)) return false;
            // A member may be exposed under a friendlier name; match on the source reference instead.
            const source = readFileSync(API_MODULE, "utf8");
            return !exposedSources.has(name) && !new RegExp(`\\b${name}\\(`).test(source);
        });

        expect(unaccounted).toEqual([]);
    });

    it("gives every declined export a reason, not a bare name", () => {
        for (const [name, reason] of Object.entries(NOT_EXPOSED)) {
            expect(`${name}:${reason}`).not.toMatch(/:$/);
            expect(reason.length).toBeGreaterThan(8);
        }
    });

    it("declines nothing that does not exist — a stale exclusion is drift too", () => {
        const known = new Set(barrelFunctions());
        expect(Object.keys(NOT_EXPOSED).filter((name) => !known.has(name))).toEqual([]);
    });

    it("documents every exposed member with a signature and a summary", () => {
        for (const [name, member] of Object.entries(exposed)) {
            expect(`${name}:${member.signature}`).not.toMatch(/:$/);
            expect(`${name}:${member.summary}`).not.toMatch(/:$/);
            expect(typeof member.call).toBe("function");
        }
    });

    it("exposes no writer — scripts read the whole model and write only their own note", () => {
        const writerish = Object.keys(exposed).filter((name) =>
            /^(write|set|save|delete|remove|create|update|record)/.test(name)
        );

        expect(writerish).toEqual([]);
    });
});

describe("the knowledge binding stays inside the State surface (#350, AC-3)", () => {
    it("imports no deep analysis path", () => {
        const source = readFileSync(API_MODULE, "utf8");
        const offenders: string[] = [];
        for (const match of source.matchAll(/from\s+["'](architecture\/knowledge[^"']*)["']/g)) {
            const spec = match[1];
            // The model type is the one deep import the pure seam already sanctions (KnowledgeContext).
            if (spec !== "architecture/knowledge/state" && spec !== "architecture/knowledge/model/KnowledgeModel") {
                offenders.push(spec);
            }
        }

        expect(offenders).toEqual([]);
    });

    it("stays Obsidian-free, so it runs in a test with no vault", () => {
        expect(readFileSync(API_MODULE, "utf8")).not.toMatch(/from\s+["']obsidian["']/);
    });
});
