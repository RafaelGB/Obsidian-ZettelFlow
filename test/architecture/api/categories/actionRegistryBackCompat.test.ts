import { describe, it, expect, beforeEach } from "@jest/globals";
import { actionsStore, CustomZettelAction } from "architecture/api";
import type { Action, ActionSetting, ActionSettingReader, ExecuteInfo } from "architecture/api";
import {
    groupActionsByCategory,
    type ActionCategory,
} from "architecture/api/categories/categories";

/** A minimal action stub — a third-party action may or may not declare a category (#33). */
class StubAction extends CustomZettelAction {
    id: string;
    override category?: ActionCategory;
    defaultAction: Action = { type: "stub", id: "stub" };
    settings: ActionSetting = () => undefined;
    settingsReader: ActionSettingReader = () => undefined;
    link = "";
    purpose = "stub";
    getIcon(): string {
        return "box";
    }
    getLabel(): string {
        return this.id;
    }
    constructor(id: string, category?: ActionCategory) {
        super();
        this.id = id;
        this.category = category;
    }
}

describe("action registry back-compat with an optional category (#152, #33, AC-2)", () => {
    beforeEach(() => actionsStore.unregisterAll());

    it("registers and resolves both a categorized and a category-less action", async () => {
        actionsStore.registerAction(new StubAction("with-cat", "relations"));
        actionsStore.registerAction(new StubAction("no-cat")); // third-party, no category

        expect(actionsStore.getActionsKeys().sort()).toEqual(["no-cat", "with-cat"]);
        // Both resolve and run without throwing (behavior unchanged by the optional field).
        await expect(
            actionsStore.getAction("no-cat").execute({} as unknown as ExecuteInfo)
        ).resolves.toBeUndefined();
        await expect(
            actionsStore.getAction("with-cat").execute({} as unknown as ExecuteInfo)
        ).resolves.toBeUndefined();
    });

    it("buckets a category-less action into the uncategorized group", () => {
        actionsStore.registerAction(new StubAction("with-cat", "manipulation"));
        actionsStore.registerAction(new StubAction("no-cat"));

        const actions = actionsStore.getActionsKeys().map((key) => actionsStore.getAction(key));
        const groups = groupActionsByCategory(actions);

        const uncategorized = groups.find((group) => group.category === null);
        expect(uncategorized?.items.map((a) => a.id)).toEqual(["no-cat"]);
        const manipulation = groups.find((group) => group.category === "manipulation");
        expect(manipulation?.items.map((a) => a.id)).toEqual(["with-cat"]);
    });
});
