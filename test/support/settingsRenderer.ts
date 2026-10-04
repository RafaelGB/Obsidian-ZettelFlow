/* eslint-disable @typescript-eslint/no-explicit-any */
import { Setting, __captureSettings } from "obsidian";
import { DomNode } from "./dashboardDom";

/**
 * A stand-in for Obsidian's declarative settings renderer, faithful where the plugin has been bitten
 * (#659 runtime audit, read from Obsidian 1.14.4's own renderer):
 *
 * - **First pass:** the container is emptied; each group becomes `div.setting-group` (plus its
 *   `cls`) holding an optional heading and `div.setting-items`; each item a `Setting` whose
 *   `render` runs and may return a cleanup.
 * - **Every pass ends with `setChildrenInPlace(groups)`**: anything in the container that is not a
 *   group is removed. A row that moved DOM out of itself loses it here.
 * - **`update()` keeps the rows**: it runs a row's *old* cleanup first, then clears only the control
 *   column, then runs `render` again on the same element.
 * - **`refreshDomState()`** only re-evaluates `visible` (hiding with `display: none`); it never
 *   re-runs `render`.
 * - **Closing the tab** runs every cleanup.
 */
interface Row {
    item: any;
    setting: Setting & { settingEl: DomNode; controlEl: DomNode };
    cleanup: (() => void) | undefined;
}

interface Group {
    definition: any;
    el: DomNode;
    rows: Row[];
}

const shown = (visible: unknown) => (typeof visible === "function" ? (visible as () => boolean)() : visible !== false);

export class SettingsRenderer {
    private groups: Group[] = [];

    constructor(
        private readonly container: DomNode,
        private readonly definitions: () => any[]
    ) {}

    /** The first pass, as `display()` does it. */
    display(): void {
        __captureSettings(() => undefined);
        this.container.empty();
        this.groups = this.definitions().map((definition) => this.buildGroup(definition));
        this.settle();
    }

    /** `update()`: same rows, old cleanup, cleared control column, render again. */
    update(): void {
        __captureSettings(() => undefined);
        for (const group of this.groups) {
            for (const row of group.rows) {
                row.cleanup?.();
                row.setting.controlEl.empty();
                row.cleanup = this.run(row);
            }
        }
        this.settle();
    }

    /** `refreshDomState()`: visibility only. */
    refreshDomState(): void {
        this.applyVisibility();
    }

    /** The tab is closed or another tab opened: every cleanup runs. */
    close(): void {
        for (const group of this.groups) for (const row of group.rows) row.cleanup?.();
        this.groups = [];
    }

    /** The `Setting` of the item with this name, to drive its controls. */
    setting(name: string): any {
        for (const group of this.groups) {
            const row = group.rows.find((candidate) => candidate.item.name === name);
            if (row) return row.setting;
        }
        throw new Error(`no settings row named ${name}`);
    }

    /** The row element of the item with this name, for asserting on what it drew. */
    row(name: string): DomNode {
        for (const group of this.groups) {
            const row = group.rows.find((candidate) => candidate.item.name === name);
            if (row) return row.setting.settingEl;
        }
        throw new Error(`no settings row named ${name}`);
    }

    private buildGroup(definition: any): Group {
        const el = this.container.createDiv({ cls: ["setting-group", definition.cls].filter(Boolean).join(" ") });
        if (definition.heading) el.createDiv({ cls: "setting-item setting-item-heading", text: definition.heading });
        const items = el.createDiv({ cls: "setting-items" });
        const rows: Row[] = (definition.items ?? []).map((item: any) => {
            const setting = new Setting(items) as Row["setting"];
            setting.setName(item.name);
            if (typeof item.desc === "string") setting.setDesc(item.desc);
            const row: Row = { item, setting, cleanup: undefined };
            row.cleanup = this.run(row);
            return row;
        });
        return { definition, el, rows };
    }

    private run(row: Row): (() => void) | undefined {
        const result = row.item.render?.(row.setting);
        return typeof result === "function" ? result : undefined;
    }

    /** `setChildrenInPlace(groups)`, then visibility. */
    private settle(): void {
        const keep = this.groups.map((group) => group.el);
        for (const child of [...this.container.children]) if (!keep.includes(child)) child.remove();
        this.applyVisibility();
    }

    private applyVisibility(): void {
        for (const group of this.groups) {
            group.el.toggleClass("is-hidden", !shown(group.definition.visible));
            for (const row of group.rows) row.setting.settingEl.toggleClass("is-hidden", !shown(row.item.visible));
        }
    }
}
