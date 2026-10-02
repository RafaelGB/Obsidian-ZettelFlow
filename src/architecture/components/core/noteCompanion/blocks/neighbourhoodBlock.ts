import { Keymap } from "obsidian";
import { c } from "architecture";
import { t, tCount } from "architecture/lang";
import type { Neighbour, NoteNeighbourhood } from "architecture/knowledge/state";
import { hoverPreview, makeActivatable } from "architecture/components/core/a11y";
import { layoutNeighbourhood, type LayoutNode } from "../neighbourhoodLayout";
import type { CompanionFocus } from "../noteCompanionContract";
import { CompanionBlock, noteName, type CompanionContext } from "./CompanionBlock";

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

/** Ask the window the element is in — a popout has its own. Absent under a test runner. */
function prefersReducedMotion(el: HTMLElement): boolean {
    const win = (el as HTMLElement & { win?: Window }).win ?? (typeof activeWindow === "undefined" ? undefined : activeWindow);
    return win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
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
    /** The view chosen on screen, ahead of the settings round-trip. */
    private chosen: View | null = null;

    update(ctx: CompanionContext): void {
        this.ctx = ctx;
        this.beginRender();
        this.el.empty();
        this.groups.clear();
        if (ctx.screen.kind !== "note") return;

        const model = ctx.screen.model;
        const view = this.chosen ?? ctx.neighbourhoodView;
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
        this.choose("list");
        const target = this.groups.get(focus === "links-in" ? "in" : "out");
        if (!target) return;
        target.scrollIntoView({ behavior: prefersReducedMotion(target) ? "auto" : "smooth", block: "start" });
        const highlight = c("note-companion-highlight");
        target.addClass(highlight);
        target.addEventListener("animationend", () => target.removeClass(highlight), { once: true });
    }

    private choose(view: View): void {
        this.chosen = view;
        this.ctx?.setNeighbourhoodView(view);
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
        const layout = layoutNeighbourhood(hood.neighbours, hood.near);
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
            const edge = svg.createSvg("line", {
                cls: [c("note-companion-edge"), c(`note-companion-edge--${node.cls}`)].join(" "),
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
            this.on(more, "click", () => this.choose("list"));
        }
        this.renderLegend(root);
    }

    private renderNode(svg: SVGElement, ctx: CompanionContext, node: LayoutNode, edge: SVGElement | undefined): void {
        const g = svg.createSvg("g", {
            cls: [c("note-companion-node"), c(`note-companion-node--${node.cls}`)].join(" "),
            attr: { tabindex: 0, role: "link", "aria-label": this.nodeName(node) },
        });
        g.createSvg("circle", { attr: { cx: node.x, cy: node.y, r: 6 } });
        g.createSvg("text", {
            cls: c("note-companion-node-label"),
            attr: { x: node.labelX, y: node.labelY, "text-anchor": node.anchor },
        }).setText(node.label);

        const lit = (on: boolean) => edge?.toggleClass("is-highlighted", on);
        this.on(g as unknown as HTMLElement, "mouseenter", () => lit(true));
        this.on(g as unknown as HTMLElement, "mouseleave", () => lit(false));
        this.on(g as unknown as HTMLElement, "focus", () => lit(true));
        this.on(g as unknown as HTMLElement, "blur", () => lit(false));
        this.on(g as unknown as HTMLElement, "click", (evt) => ctx.open(node.path, Keymap.isModEvent(evt)));
        this.on(g as unknown as HTMLElement, "keydown", (evt) => {
            if (evt.key !== "Enter") return;
            evt.preventDefault();
            ctx.open(node.path, Keymap.isModEvent(evt));
        });
        hoverPreview(ctx.app, g, node.path, ctx.owner);
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
        for (const neighbour of rows) {
            const row = group.createDiv({ cls: c("note-companion-row") });
            const name = row.createSpan({
                cls: c("note-companion-row-name"),
                text: neighbour.title || noteName(neighbour.path),
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
