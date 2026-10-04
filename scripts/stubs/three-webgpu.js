// Build-time stand-in for `three/webgpu` (esbuild alias in esbuild.config.mjs).
//
// `three-render-objects` (under 3d-force-graph) imports the WebGPU renderer statically, but only
// constructs it when `rendererConfig.useWebGPU` is set — which ZettelFlow never does: the graph
// lens draws with WebGL. Bundling the real module cost ~580 KB of main.js for code that cannot run.
export class WebGPURenderer {
    constructor() {
        throw new Error("ZettelFlow does not bundle the three.js WebGPU renderer; the graph uses WebGL.");
    }
}
