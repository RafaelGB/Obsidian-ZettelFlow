import { Keymap } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import type { Neighbour, NoteNeighbourhood } from "architecture/knowledge/state";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { layoutNeighbourhood, type LayoutNode } from "../neighbourhoodLayout";
import type { CompanionFocus } from "../noteCompanionContract";
import { CompanionBlock, distinctNames, noteName, type CompanionContext } from "./CompanionBlock";

type LocaleKey = Parameters<typeof t>[0];
type View = "graph" | "list";

/** A relation type's name. A literal map, so the locale guardrail sees every key. */
const TYPE_KEY: Record<string, LocaleKey> = {
    supports: "relation_type_supports",
    contradicts: "relation_type_contradicts",
    expands: "relation_type_expands",
    "inspired-by": "relation_type_inspired_by",
    question: "relation_type_question",
    example: "relation_type_example",
    implements: "relation_type_implements",
};

function typeName(type: string | undefined): string {
    const key = type ? TYPE_KEY[type] : undefined;
    return key ? t(key) : t("note_companion_legend_link");
}

/**
 * **The neighbourhood** (#643, epic #639): what the note links to and what links to it, drawn as an
 * ego graph — colour is the relation, a dashed node is near but not linked — or listed, as the
 * accessible twin of the same facts.
 *
 * It writes nothing. Hover previews, a click opens (a modifier-click in a new tab), every node is
 * reachable by keyboard and named for a screen reader. Graph or list is remembered in the settings.
 */
export class NeighbourhoodBlock extends CompanionBlock {
    readonly id = "neighbourhood";
    readonly column = "main";

    private ctx: CompanionContext | null = null;
    /** Where each list group is, for a hand-over from the head's link counts. */
    private groups = new Map<"in" | "out", HTMLElement>();
    /** The view chosen with the toggle, ahead of the settings round-trip. */
    private chosen: View | null = null;
    /**
     * The note a hand-over showed as a list (a head count, "+N more"). One-shot: the list stays
     * while you are on that note and the saved Graph / List takes over again on the next one.
     */
    private forcedFor: string | null = null;

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        this.beginRender();
        this.el.empty();
        this.groups.clear();
        if (ctx.screen.kind !== "note") return;

        const model = ctx.screen.model;
        if (this.forcedFor !== model.path) this.forcedFor = null;
        const view: View = this.forcedFor ? "list" : (this.chosen ?? ctx.neighbourhoodView);
        const root = this.el.createDiv({ cls: c("note-companion-neighbourhood") });
        this.renderHeader(root, view);

        const hood = model.neighbourhood;
        if (!hood) {
            root.createDiv({ cls: c("note-companion-quiet"), text: t("note_companion_neighbourhood_error") });
            return;
        }
        if (view === "list") this.renderList(root, ctx, hood);
        else this.renderGraph(root, ctx, hood, model.title);
    }

    claims(focus: CompanionFocus): boolean {
        return focus === "links-in" || focus === "links-out";
    }

    /** The head's link counts land here: the list, scrolled to that group, highlighted once. */
    reveal(focus: CompanionFocus): void {
        if (!this.ctx || !this.claims(focus)) return;
        // Shown as a list for this hand-over only: clicking a count is not choosing a preference,
        // so the saved Graph / List (FR-11) is left as it was. Only the toggle saves.
        this.choose("list", false);
        const target = this.groups.get(focus === "links-in" ? "in" : "out");
        if (!target) return;
        this.ctx.scrollTo(target);
        this.highlightOnce(target);
    }

    /** `remember`: the toggle — saved. Otherwise a hand-over: a list for this note only. */
    private choose(view: View, remember = true): void {
        if (remember) {
            this.chosen = view;
            this.forcedFor = null;
            this.ctx?.setNeighbourhoodView(view);
        } else if (this.ctx?.screen.kind === "note") {
            this.forcedFor = this.ctx.screen.model.path;
        }
        if (this.ctx) this.update(this.ctx);
    }

    private renderHeader(root: HTMLElement, view: View): void {
        const head = root.createDiv({ cls: c("note-companion-neighbourhood-head") });
        head.createDiv({ cls: c("note-companion-eyebrow"), text: t("note_companion_neighbourhood_title") });
        const toggle = head.createDiv({
            cls: c("note-companion-toggle"),
            attr: { role: "group", "aria-label": t("note_companion_neighbourhood_view_label") },
        });
        for (const [option, key] of [
            ["graph", "note_companion_neighbourhood_graph"],
            ["list", "note_companion_neighbourhood_list"],
        ] as const) {
            const on = view === option;
            const button = toggle.createEl("button", {
                cls: [c("note-companion-toggle-option"), ...(on ? ["is-active"] : [])].join(" "),
                text: t(key),
                attr: { type: "button", "aria-pressed": String(on) },
            });
            this.on(button, "click", () => this.choose(option));
        }
    }

    private renderGraph(root: HTMLElement, ctx: CompanionContext, hood: NoteNeighbourhood, title: string): void {
        if (hood.neighbours.length === 0 && hood.near.length === 0) {
            root.createDiv({ cls: c("note-companion-quiet"), text: t("note_companion_neighbourhood_empty") });
            return;
        }
        // Measured, so one unit is one pixel and labels keep their size in a narrow sidebar.
        const layout = layoutNeighbourhood(hood.neighbours, hood.near, root.clientWidth || undefined);
        const svg = root.createSvg("svg", {
            cls: c("note-companion-graph"),
            attr: {
                viewBox: `0 0 ${layout.width} ${layout.height}`,
                role: "group",
                "aria-label": t("note_companion_neighbourhood_aria", title),
            },
        });

        const edges = new Map<string, SVGElement>();
        for (const node of layout.nodes) {
            // Obsidian's createSvg adds `cls` as ONE classList token: several classes go as an array.
            const edge = svg.createSvg("line", {
                cls: [c("note-companion-edge"), c(`note-companion-edge--${node.cls}`)],
                attr: { x1: layout.cx, y1: layout.cy, x2: node.x, y2: node.y },
            });
            edges.set(node.path, edge);
        }
        svg.createSvg("circle", { cls: c("note-companion-centre"), attr: { cx: layout.cx, cy: layout.cy, r: 9 } });

        // DOM order is the reading order: clockwise from twelve, then the near ring.
        for (const node of layout.nodes) this.renderNode(svg, ctx, node, edges.get(node.path));

        if (layout.overflow > 0) {
            const more = root.createEl("button", {
                cls: c("note-companion-more-links"),
                text: tCount(layout.overflow, "note_companion_neighbourhood_more", String(layout.overflow)),
                attr: { type: "button" },
            });
            this.on(more, "click", () => this.choose("list", false));
        }
        this.renderLegend(root);
    }

    private renderNode(svg: SVGElement, ctx: CompanionContext, node: LayoutNode, edge: SVGElement | undefined): void {
        const g = svg.createSvg("g", {
            cls: [c("note-companion-node"), c(`note-companion-node--${node.cls}`)],
            attr: { tabindex: 0, role: "link", "aria-label": this.nodeName(node) },
        });
        // A finger-sized target around a small dot; the label is part of the target too.
        g.createSvg("circle", { cls: c("note-companion-node-hit"), attr: { cx: node.x, cy: node.y, r: 12 } });
        g.createSvg("circle", { cls: c("note-companion-node-dot"), attr: { cx: node.x, cy: node.y, r: 6 } });
        g.createSvg("text", {
            cls: c("note-companion-node-label"),
            attr: { x: node.labelX, y: node.labelY, "text-anchor": node.anchor },
        }).setText(node.label);

        const lit = (on: boolean) => edge?.toggleClass("is-highlighted", on);
        this.on(g, "mouseenter", () => lit(true));
        this.on(g, "mouseleave", () => lit(false));
        this.on(g, "focus", () => lit(true));
        this.on(g, "blur", () => lit(false));
        this.on(g, "click", (evt) => ctx.open(node.path, Keymap.isModEvent(evt)));
        this.on(g, "keydown", (evt) => {
            if (evt.key !== "Enter") return;
            evt.preventDefault();
            ctx.open(node.path, Keymap.isModEvent(evt));
        });
        // Obsidian's hover handler calls `targetEl.isShown()`, which an SVG element does not have.
        // Each node gets its own (it needs nothing else: SVG elements have getBoundingClientRect),
        // so the popover anchors on the node hovered — a shared anchor kept showing the first one.
        const anchor = Object.assign(g, { isShown: () => g.isConnected }) as unknown as HTMLElement;
        hoverPreview(ctx.app, g, node.path, ctx.owner, anchor);
    }

    /** "Title, relation, direction" — or "Title, near but not linked". */
    private nodeName(node: LayoutNode): string {
        const n = node.neighbour;
        if (!n) return `${node.title}, ${t("note_companion_node_near")}`;
        const type = n.outType && n.outType !== "link" ? n.outType : n.inType;
        const direction = n.inbound && n.outbound ? "note_companion_node_both" : n.inbound ? "note_companion_node_in" : "note_companion_node_out";
        return t("note_companion_node_label", node.title, typeName(type), t(direction));
    }

    private renderLegend(root: HTMLElement): void {
        const legend = root.createDiv({ cls: c("note-companion-legend") });
        for (const [cls, label] of [
            ["supports", typeName("supports")],
            ["contradicts", typeName("contradicts")],
            ["example", typeName("example")],
            ["link", t("note_companion_legend_link")],
            ["near", t("note_companion_legend_near")],
        ] as const) {
            const item = legend.createSpan({ cls: c("note-companion-legend-item") });
            item.createSpan({ cls: [c("note-companion-legend-mark"), c(`note-companion-legend-mark--${cls}`)].join(" ") });
            item.createSpan({ text: label });
        }
    }

    private renderList(root: HTMLElement, ctx: CompanionContext, hood: NoteNeighbourhood): void {
        this.renderGroup(root, ctx, "in", hood.linksIn);
        this.renderGroup(root, ctx, "out", hood.linksOut);
    }

    private renderGroup(root: HTMLElement, ctx: CompanionContext, which: "in" | "out", rows: Neighbour[]): void {
        const group = root.createDiv({ cls: c("note-companion-link-group"), attr: { "data-group": which } });
        this.groups.set(which, group);
        const head = group.createDiv({ cls: c("note-companion-link-group-title") });
        head.createSpan({ text: t(which === "in" ? "note_companion_group_in" : "note_companion_group_out") });
        head.createSpan({ cls: c("note-companion-summary-count"), text: ` · ${rows.length}` });
        if (rows.length === 0) {
            group.createDiv({
                cls: c("note-companion-quiet"),
                text: t(which === "in" ? "note_companion_none_in" : "note_companion_none_out"),
            });
            return;
        }
        const names = distinctNames(rows.map((neighbour) => neighbour.path));
        for (const neighbour of rows) {
            const row = group.createDiv({ cls: c("note-companion-row") });
            const name = row.createSpan({
                cls: c("note-companion-row-name"),
                text: neighbour.title && neighbour.title !== noteName(neighbour.path) ? neighbour.title : names.get(neighbour.path) ?? noteName(neighbour.path),
                attr: { title: neighbour.path },
            });
            makeActivatable(name, () => ctx.open(neighbour.path));
            hoverPreview(ctx.app, name, neighbour.path, ctx.owner);
            // The chip names the relation in this direction — a plain link needs no chip.
            const type = which === "in" ? neighbour.inType : neighbour.outType;
            if (type && type !== "link") row.createSpan({ cls: c("note-companion-chip"), text: typeName(type) });
        }
    }
}
