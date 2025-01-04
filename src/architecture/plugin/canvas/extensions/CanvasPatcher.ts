import ZettelFlow from "main";
import { requireApiVersion } from "obsidian";
import { CanvasView } from "obsidian/canvas";
import PatchHelper from "./utils/PatchHelper";

export default class CanvasPatcher {

    constructor(private plugin: ZettelFlow) {
        this.patch();
    }

    public async patch() {
        const that = this

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

        console.log('Patching canvas view:', canvasView)

        // Patch canvas popup menu
        PatchHelper.patchObjectPrototype(this.plugin, canvasView.canvas.menu, {
            render: (next: any) => function (...args: any) {
                const result = next.call(this, ...args);
                that.triggerWorkspaceEvent("canvas:popup-menu", this.canvas);
                next.call(this) // Re-Center the popup menu
                return result;
            }
        })
    }

    private triggerWorkspaceEvent(event: string, ...args: any) {
        this.plugin.app.workspace.trigger(event, ...args)
    }
}