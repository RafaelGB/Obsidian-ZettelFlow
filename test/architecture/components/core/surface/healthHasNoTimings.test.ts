import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * The timings are not on Health any more (#645 FR-15, AC-9).
 *
 * Health answers two questions about your notes. How long the plugin took on this machine is not
 * one of them, so the historical timings moved to Settings › Advanced. The one live thing — an
 * enrichment pass running now, with a way to stop it — stays on Tend, where you would see it.
 */
describe("Health holds no timings (#645)", () => {
    const host = read("src/architecture/components/core/surface/HealthSurfaceView.ts");
    const renderers = [...host.matchAll(/from "architecture\/(components\/core\/[\w/]+Renderer)"/g)].map(
        (match) => `src/architecture/${match[1]}.ts`
    );

    it("reads the renderers Health mounts", () => {
        expect(renderers).toHaveLength(2);
    });

    it("draws no timing history in any of them", () => {
        for (const file of renderers) {
            const source = read(file);
            expect({ file, speedFacts: source.includes("speedFacts("), title: source.includes("speed_title") }).toEqual({
                file,
                speedFacts: false,
                title: false,
            });
        }
    });

    it("keeps the live pass, with its stop, on Tend", () => {
        const tend = read("src/architecture/components/core/tend/TendRenderer.ts");
        expect(tend).toContain("speed_pass_running");
        expect(tend).toContain("speed_pass_cancel");
    });
});
