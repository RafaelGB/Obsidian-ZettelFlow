import { describe, it, expect } from "@jest/globals";
import es from "architecture/lang/locale/es";

const ES = es as Record<string, string>;
const GROUPS = Object.entries(ES)
    .filter(([key]) => /^settings_section_[a-z]+$/.test(key))
    .map(([, value]) => value);

/**
 * **The es locale names things as the es tab and the es Library do** (#800 D13–D15, FR-6, AC-5).
 * Two Reader messages sent you to *Ajustes › Thinking*, a group the Spanish tab calls *Pensar*; the
 * Library was *Tu librería*, which in Spanish is a bookshop.
 */
describe("the es locale's names (#800)", () => {
    it("reads the eight es groups", () => {
        expect(GROUPS).toHaveLength(8);
        expect(GROUPS).toContain("Pensar");
    });

    it("names only es groups after Ajustes", () => {
        const paths = Object.entries(ES).flatMap(([key, value]) =>
            [...value.matchAll(/Ajustes\s*[›→>]\s*([^.,:;()›→>]+?)(?=\s*(?:[.,:;()›→>]|para\b|$))/g)].map((match) => [key, match[1].trim()])
        );
        expect(paths.length).toBeGreaterThan(2);
        expect(paths.filter(([, group]) => !GROUPS.includes(group))).toEqual([]);
        expect(Object.values(ES).filter((value) => value.includes("Ajustes › Thinking"))).toEqual([]);
    });

    it("calls the thinking space by its es mode name, Pensar", () => {
        expect(ES.surface_mode_lab).toBe("Pensar");
        expect(Object.entries(ES).filter(([, value]) => /\bThink\b/.test(value))).toEqual([]);
    });

    it("calls the book Library a biblioteca", () => {
        expect(ES.library_title).toContain("biblioteca");
        expect(ES.library_title).not.toContain("librería");
    });

    it("keeps librería for the code library, where it is the right word", () => {
        expect(ES.library_reloaded_all.toLowerCase()).toContain("librería");
        expect(ES.workbench_surface_library).toContain("librería");
    });

    it("calls the ribbon's entry Comunidad, and the palette's Systems room Explorar sistemas (D14, settled by #798)", () => {
        expect(ES.community_view_title).toBe("Comunidad");
        expect(ES.command_browse_systems).toBe("Explorar sistemas");
    });
});
