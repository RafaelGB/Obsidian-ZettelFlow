import ZettelFlow from "main";
import { Notice, requireApiVersion } from "obsidian";
import { CanvasView, PopupMenu } from "obsidian/canvas";
import PatchHelper from "./utils/PatchHelper";
import { CanvasPatchStatus } from "./utils/CanvasPatchStatus";
import { log } from "architecture";
import { t } from "architecture/lang";
import JSONSS from "json-stable-stringify"
import JSONC from "tiny-jsonc"

export default class CanvasPatcher {
    /** Which patches attached vs. degraded (#304); shows a single Notice on the first degrade. */
    private readonly status = new CanvasPatchStatus(() => this.notifyDegradedOnce());
    private noticeShown = false;

    constructor(private plugin: ZettelFlow) {
        void this.patch();
    }

    /** Show the "canvas integration partially unavailable" Notice at most once per session (#304 S2). */
    private notifyDegradedOnce() {
        if (this.noticeShown) return;
        this.noticeShown = true;
        new Notice(t('notice_canvas_patch_failed'));
    }

    public async patch() {
        try {
            // Wait for layout ready -> Support deferred view initialization
            await new Promise<void>(resolve => this.plugin.app.workspace.onLayoutReady(() => resolve()))

            // Get the current canvas view fully loaded
            const getCanvasView = async (): Promise<CanvasView | null> => {
                const canvasLeaf = this.plugin.app.workspace.getLeavesOfType('canvas')?.first()
                if (!canvasLeaf) return null

                if (requireApiVersion('1.7.2')) await canvasLeaf.loadIfDeferred() // Load the canvas if the view is deferred
                return canvasLeaf.view as CanvasView
            }

            // Get the current canvas view or wait for it to be created
            let canvasView = await getCanvasView()
            canvasView ??= await new Promise<CanvasView>(resolve => {
                const event = this.plugin.app.workspace.on('layout-change', () => {
                    void (async () => {
                        const newCanvasView = await getCanvasView()
                        if (!newCanvasView) return

                        resolve(newCanvasView)
                        this.plugin.app.workspace.offref(event)
                    })()
                })

                this.plugin.registerEvent(event)
            })

            // Guard against changed Canvas internals: degrade gracefully instead of throwing.
            if (!canvasView?.canvas) {
                this.notifyCanvasUnavailable('the canvas view exposes no canvas object')
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-this-alias -- referenced inside monkey-around function() closures that rebind `this` to the patched canvas
            const that = this;

            // Patch canvas popup menu (guarded — the menu is an internal we don't control)
            if (canvasView.canvas.menu) {
                const menuPatched = PatchHelper.patchPrototype<PopupMenu>(this.plugin, canvasView.canvas.menu, {
                    render: (next: () => void) => function (this: PopupMenu) {
                        const result = next.call(this);
                        // Our additions run inside Obsidian's render loop — a throw here would break the
                        // menu, so degrade gracefully to the original render instead (#304 S2).
                        try {
                            that.triggerWorkspaceEvent("canvas:popup-menu", this.canvas);
                            next.call(this) // Re-Center the popup menu
                        } catch (e) {
                            log.error("ZettelFlow: canvas popup-menu enhancement failed at runtime", e)
                            that.status.markDegraded("popup-menu-render")
                        }
                        return result;
                    }
                });
                this.status[menuPatched ? "markAttached" : "markDegraded"]("popup-menu")
                if (!menuPatched) log.warn("ZettelFlow: could not patch the canvas popup menu (internals changed)")
            } else {
                this.status.markDegraded("popup-menu")
                log.warn("ZettelFlow: canvas popup menu not found; skipping that patch")
            }

            // Patch canvas view (guarded — patchPrototype returns null if the methods are gone)
            const viewPatched = PatchHelper.patchPrototype<CanvasView>(this.plugin, canvasView, {
                getViewData: PatchHelper.OverrideExisting<CanvasView, "getViewData", string>(next => function (this: CanvasView): string {
                    const canvasData = this.canvas.getData()

                    try {
                        const stringified = JSONSS(canvasData, { space: 2 })
                        if (stringified === undefined) throw new Error('Failed to stringify canvas data using json-stable-stringify')

                        return stringified
                    } catch (e) {
                        log.error('Failed to stringify canvas data using json-stable-stringify:', e)

                        try {
                            return JSON.stringify(canvasData, null, 2)
                        } catch (e) {
                            log.error('Failed to stringify canvas data using JSON.stringify:', e)
                            return next.call(this)
                        }
                    }
                }),
                setViewData: PatchHelper.OverrideExisting<CanvasView, "setViewData", void>(next => function (this: CanvasView, json: string): void {
                    json = json !== '' ? json : '{}'

                    let result
                    try {
                        result = next.call(this, json)
                    } catch (e) {
                        log.error('Invalid JSON, repairing through the canvas parser:', e)

                        // Try to parse it with trailing commas
                        json = JSON.stringify(JSONC.parse(json), null, 2)
                        result = next.call(this, json)
                    }

                    // A throwing event handler must not corrupt the save (setViewData) itself — the data
                    // is already written; the enhancements are best-effort (#304 S2).
                    try {
                        that.triggerWorkspaceEvent("zettelflow-node-connection-drop-menu", this.canvas)
                        // Signal a canvas (re)render so the workflow-legibility extension can re-apply
                        // its cosmetic block-kind styling (#151).
                        that.triggerWorkspaceEvent("zettelflow-canvas-render", this.canvas)
                    } catch (e) {
                        log.error("ZettelFlow: canvas render enhancement failed at runtime", e)
                        that.status.markDegraded("view-render-events")
                    }
                    return result
                })
            })

            if (!viewPatched) {
                this.status.markDegraded("view-data")
                this.notifyCanvasUnavailable('the canvas view data methods were not found')
                return
            }
            this.status.markAttached("view-data")

            // Canvases already open when Obsidian started rendered BEFORE this patch installed, so the
            // injection events never fired for them and the plugin's canvas options never attached
            // (#234). Re-fire them once, now, for every open canvas leaf. Safe: the patched setViewData
            // fires these on every canvas change and the handlers are idempotent (addCardMenuOption
            // removes any same-id element first; the restyle clears before re-applying).
            await this.reapplyToOpenCanvases()

            // Self-check (#304 S3): a single line reporting which patches attached vs. degraded.
            log.info(`ZettelFlow: ${this.status.describe()}`)
        } catch (e) {
            log.error("ZettelFlow: failed to initialize the canvas integration", e)
            this.notifyDegradedOnce()
        }
    }

    /**
     * Re-fire the canvas injection events for every currently-open canvas leaf, so canvases restored
     * open at startup get the plugin's card-menu options and workflow styling without a manual
     * reopen/restart (#234). Guarded per leaf — a single bad view never aborts the rest.
     */
    private async reapplyToOpenCanvases() {
        const leaves = this.plugin.app.workspace.getLeavesOfType('canvas')
        for (const leaf of leaves) {
            try {
                if (requireApiVersion('1.7.2')) await leaf.loadIfDeferred()
                const canvas = (leaf.view as CanvasView)?.canvas
                if (!canvas) continue
                this.triggerWorkspaceEvent("zettelflow-node-connection-drop-menu", canvas)
                this.triggerWorkspaceEvent("zettelflow-canvas-render", canvas)
            } catch (e) {
                log.warn("ZettelFlow: could not re-apply canvas options to an open canvas", e)
            }
        }
    }

    private notifyCanvasUnavailable(reason: string) {
        log.error(`ZettelFlow: canvas integration unavailable — ${reason}. Obsidian's canvas internals may have changed.`)
        this.status.markDegraded("canvas-view")
        this.notifyDegradedOnce()
    }

    private triggerWorkspaceEvent(event: string, ...args: unknown[]) {
        this.plugin.app.workspace.trigger(event, ...args)
    }
}