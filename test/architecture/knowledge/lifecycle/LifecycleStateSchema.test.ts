import { describe, it, expect } from "@jest/globals";
import { LifecycleStateSchema } from "architecture/knowledge/lifecycle/LifecycleStateSchema";

describe("LifecycleStateSchema (AC-2, AC-3)", () => {
    const schema = new LifecycleStateSchema();

    it("maps missing / empty / unrecognized to fleeting and never throws (AC-2)", () => {
        expect(schema.parse({})).toBe("fleeting");
        expect(schema.parse({ state: "" })).toBe("fleeting");
        expect(schema.parse({ state: "   " })).toBe("fleeting");
        expect(schema.parse({ state: "nonsense" })).toBe("fleeting");
        expect(schema.parse({ state: 42 as unknown as string })).toBe("fleeting");
        expect(() => schema.parse(undefined as unknown as Record<string, unknown>)).not.toThrow();
    });

    it("recognizes case / whitespace / emoji variants (AC-3)", () => {
        for (const value of ["Permanent", "permanent", " permanent ", "💡 Permanent"]) {
            expect(schema.parse({ state: value })).toBe("permanent");
        }
    });

    it("honors a custom property name (read side of AC-8)", () => {
        const custom = new LifecycleStateSchema("phase");
        expect(custom.property).toBe("phase");
        expect(custom.parse({ phase: "evergreen" })).toBe("evergreen");
        expect(custom.parse({ state: "evergreen" })).toBe("fleeting"); // wrong key -> fallback
    });

    it("resolves an injected localized alias", () => {
        const localized = new LifecycleStateSchema("state", { Permanente: "permanent" });
        expect(localized.parse({ state: "Permanente" })).toBe("permanent");
    });

    it("exposes property and the full state list", () => {
        expect(schema.property).toBe("state");
        expect(schema.all).toEqual([
            "fleeting",
            "literature",
            "permanent",
            "developing",
            "evergreen",
            "archived",
        ]);
    });
});

describe("LifecycleStateSchema.recognises (#640 AC-5)", () => {
    const schema = new LifecycleStateSchema("state", { Fugaz: "fleeting" });

    it("recognises a stated token, its emoji form and a localized alias", () => {
        expect(schema.recognises({ state: "literature" })).toBe(true);
        expect(schema.recognises({ state: "📝 Literature" })).toBe(true);
        expect(schema.recognises({ state: "fugaz" })).toBe(true);
    });

    it("does not recognise a missing, empty or unknown value, even though parse reads it as fleeting", () => {
        for (const frontmatter of [{}, { state: "" }, { state: "someday" }, { state: 3 }]) {
            expect(schema.parse(frontmatter)).toBe("fleeting");
            expect(schema.recognises(frontmatter)).toBe(false);
        }
    });
});
