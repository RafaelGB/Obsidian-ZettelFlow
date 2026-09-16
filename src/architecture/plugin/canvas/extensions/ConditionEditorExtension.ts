import { Canvas, CanvasEdge, CanvasElement } from "obsidian/canvas";
import { setIcon, setTooltip } from "obsidian";
import CanvasExtension from "./CanvasExtension";
import CanvasHelper from "./utils/CanvasHelper";
import { t } from "architecture/lang";
import { log } from "architecture";
import { ConditionEditorModal } from "zettelkasten/modals/ConditionEditorModal";
import { popupMenuOptions } from "./utils/popupMenuOptions";

/** Shared with the cleanup below: the popup is reused across selections (#432). */
const EDIT_CONDITION_BUTTON_ID = "edit-zettelflow-condition-btn";

/**
 * Adds an "Edit condition" button to the canvas popup menu when exactly one
 * edge is selected (#258 FR-1, AC-1, AC-7). Mirrors the pattern from
 * `EditCanvasExtension` — a `canvas:popup-menu` listener that is fully
 * feature-detected so a Canvas shape change silently skips the button rather
 * than crashing.
 */
export default class ConditionEditorExtension extends CanvasExtension {
    init(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("canvas:popup-menu", (eventCanvas: Canvas) => {
                if (eventCanvas.isDragging) return;
                if (!CanvasHelper.isCanvasFlow(this.plugin)) return;

                // Always take our own button away first; add it back only if it still applies.
                CanvasHelper.removePopupMenuOption(eventCanvas, EDIT_CONDITION_BUTTON_ID);
                if (!popupMenuOptions(CanvasHelper.selectionShape(eventCanvas)).condition) return;

                const [selected]: CanvasElement[] = [...eventCanvas.selection];
                if (!selected) return;

                // Feature-detect the undocumented edges Map
                const edges: Map<string, CanvasEdge> | undefined = (eventCanvas as unknown as { edges?: Map<string, CanvasEdge> }).edges;
                if (typeof edges?.get !== "function") {
                    log.warn("[ConditionEditorExtension] canvas.edges Map not available — skipping button");
                    return;
                }

                const selectedWithId = selected as unknown as { id: string };
                const edge = edges.get(selectedWithId.id);
                if (!edge) return; // selection is a node, not an edge

                const popupMenuEl = eventCanvas?.menu?.menuEl;
                if (!popupMenuEl) return;

                const buttonId = EDIT_CONDITION_BUTTON_ID;

                const btn = popupMenuEl.createEl("button");
                btn.id = buttonId;
                btn.classList.add("clickable-icon");
                setIcon(btn, "filter");
                setTooltip(btn, t("condition_editor_title"), { placement: "top" });
                btn.addEventListener("click", () => {
                    new ConditionEditorModal(this.plugin.app, edge, eventCanvas).open();
                });

                const totalItems = popupMenuEl.children.length;
                const ref = popupMenuEl.children[Math.max(0, totalItems - 1)];
                popupMenuEl.insertAfter(btn, ref);
            })
        );
    }
}
