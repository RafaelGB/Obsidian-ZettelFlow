import ZettelFlow from "main"

export default abstract class CanvasExtension {
    plugin: ZettelFlow

    abstract init(): void

    constructor(plugin: ZettelFlow) {
        this.plugin = plugin;
        this.init()
    }
}