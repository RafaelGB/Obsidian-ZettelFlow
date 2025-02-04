import ZettelFlow from "main";
import { requireApiVersion } from "obsidian";
import { CanvasView } from "obsidian/canvas";
import PatchHelper from "./utils/PatchHelper";
import JSONSS from "json-stable-stringify"
import JSONC from "tiny-jsonc"

export default class CanvasPatcher {

    constructor(private plugin: ZettelFlow) {
        this.patch();
    }

    public async patch() {
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
            const event = this.plugin.app.workspace.on('layout-change', async () => {
                const newCanvasView = await getCanvasView()
                if (!newCanvasView) return

                resolve(newCanvasView)
                this.plugin.app.workspace.offref(event)
            })

            this.plugin.registerEvent(event)
        })

        const that = this;

        // Patch canvas popup menu
        PatchHelper.patchObjectPrototype(this.plugin, canvasView.canvas.menu, {
            render: (next: any) => function (this: any, ...args: any) {
                const result = next.call(this, ...args);
                that.triggerWorkspaceEvent("canvas:popup-menu", this.canvas);
                next.call(this) // Re-Center the popup menu
                return result;
            }
        });

        // Patch canvas view
        PatchHelper.patchPrototype<CanvasView>(this.plugin, canvasView, {
            getViewData: PatchHelper.OverrideExisting(next => function (...args: any): string {
                const canvasData = this.canvas.getData()

                try {
                    const stringified = JSONSS(canvasData, { space: 2 })
                    if (stringified === undefined) throw new Error('Failed to stringify canvas data using json-stable-stringify')

                    return stringified
                } catch (e) {
                    console.error('Failed to stringify canvas data using json-stable-stringify:', e)

                    try {
                        return JSON.stringify(canvasData, null, 2)
                    } catch (e) {
                        console.error('Failed to stringify canvas data using JSON.stringify:', e)
                        return next.call(this, ...args)
                    }
                }
            }),
            setViewData: PatchHelper.OverrideExisting(next => function (json: string, ...args: any): void {
                json = json !== '' ? json : '{}'

                let result
                try {
                    result = next.call(this, json, ...args)
                } catch (e) {
                    console.error('Invalid JSON, repairing through Advanced Canvas:', e)

                    // Invalid JSON
                    //that.plugin.createFileSnapshot(this.file.path, json)

                    // Try to parse it with trailing commas
                    json = JSON.stringify(JSONC.parse(json), null, 2)
                    result = next.call(this, json, ...args)
                }

                that.triggerWorkspaceEvent("zettelflow-node-connection-drop-menu", this.canvas)
                return result
            })
        })
    }

    private triggerWorkspaceEvent(event: string, ...args: any) {
        this.plugin.app.workspace.trigger(event, ...args)
    }
}