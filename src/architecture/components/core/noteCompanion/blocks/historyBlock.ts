import { c } from "architecture";
import { EvolutionTimelineRenderer } from "architecture/components/core/timeline/EvolutionTimelineRenderer";
import { CompanionBlock, type CompanionContext } from "./CompanionBlock";

/**
 * The note's history, as it was (#640 FR-17) — the Timeline renderer mounted unchanged, reading the
 * companion's note instead of the active editor. The story redesign (#642) replaces this block.
 */
export class HistoryBlock extends CompanionBlock {
    readonly id = "history";
    readonly column = "side";

    private renderer: EvolutionTimelineRenderer | null = null;
    private path: string | null = null;

    update(ctx: CompanionContext): void {
        if (ctx.screen.kind !== "note") {
            this.unmount();
            return;
        }
        this.path = ctx.screen.model.path;
        if (this.renderer) {
            this.renderer.recompute();
            return;
        }
        this.el.empty();
        const host = this.el.createDiv({ cls: c("note-companion-history") });
        this.renderer = this.addChild(new EvolutionTimelineRenderer(host, ctx.app, () => this.path));
    }

    onunload(): void {
        this.renderer = null;
    }

    private unmount(): void {
        if (this.renderer) this.removeChild(this.renderer);
        this.renderer = null;
        this.el.empty();
    }
}
