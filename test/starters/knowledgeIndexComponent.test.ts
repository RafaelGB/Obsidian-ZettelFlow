import { describe, it, expect, jest } from "@jest/globals";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { KnowledgeIndexComponent } from "starters/zcomponents/KnowledgeIndexComponent";

describe("KnowledgeIndexComponent", () => {
    it("bootstraps the KnowledgeIndex singleton on load", () => {
        const spy = jest
            .spyOn(KnowledgeIndex.getInstance(), "bootstrap")
            .mockImplementation(() => undefined);
        const plugin = {} as never;

        new KnowledgeIndexComponent(plugin).onLoad();

        // bootstrap(plugin, { parseInlineRelations }) — assert the plugin is passed, not the opts shape.
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toBe(plugin);
        spy.mockRestore();
    });
});
