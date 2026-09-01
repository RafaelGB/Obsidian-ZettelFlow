import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";
import type { App } from "obsidian";
import { ZfKnowledge } from "architecture/api/lib/knowledge/service/ZfKnowledge";
import { ZfAi } from "architecture/api/lib/ai/service/ZfAi";
import { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

// test/architecture/api → 3 ups → repo root
const ROOT = join(__dirname, "..", "..", "..");
const DOCS = join(ROOT, "docs");

function markdownFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
        else if (entry.endsWith(".md")) out.push(full);
    }
    return out;
}

async function members(): Promise<{ knowledge: Set<string>; ai: Set<string> }> {
    const knowledge = new ZfKnowledge({} as App, {
        model: () => new KnowledgeModel(),
        history: () => [],
        ready: () => true,
    });
    await knowledge.init();

    const ai = new ZfAi({} as App);
    await ai.init();

    return {
        knowledge: new Set(Object.keys(await knowledge.generate_object())),
        ai: new Set(Object.keys(await ai.generate_object())),
    };
}

/**
 * The whole point of epic #348 is that the API stops being described by hand-maintained copies that
 * drift from it. The docs are one of those copies. This is the cheapest possible enforcement: a page
 * may not name a member that does not exist.
 */
describe("the docs promise only members that exist (#350)", () => {
    const files = markdownFiles(DOCS);

    it("reads the docs tree", () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it("names no zf.knowledge member that is not on the API", async () => {
        const { knowledge } = await members();
        const offenders: string[] = [];

        for (const file of files) {
            for (const match of readFileSync(file, "utf8").matchAll(/zf\.knowledge\.(\w+)/g)) {
                if (!knowledge.has(match[1])) {
                    offenders.push(`${relative(ROOT, file).split(sep).join("/")} → zf.knowledge.${match[1]}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it("names no zf.ai member that is not on the API", async () => {
        const { ai } = await members();
        const offenders: string[] = [];

        for (const file of files) {
            for (const match of readFileSync(file, "utf8").matchAll(/zf\.ai\.(\w+)/g)) {
                if (!ai.has(match[1])) {
                    offenders.push(`${relative(ROOT, file).split(sep).join("/")} → zf.ai.${match[1]}`);
                }
            }
        }

        expect(offenders).toEqual([]);
    });

    it("no longer advertises the retired zf.dashboard() promise", () => {
        const offenders = files.filter((file) => /\bzf\.dashboard\(/.test(readFileSync(file, "utf8")));

        expect(offenders.map((file) => relative(ROOT, file).split(sep).join("/"))).toEqual([]);
    });
});
