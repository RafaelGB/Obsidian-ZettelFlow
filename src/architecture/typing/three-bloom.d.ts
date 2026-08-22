/**
 * Minimal ambient declaration for the one three.js post-processing pass the 3D graph uses (#280).
 * `three` ships no resolvable types for this path in our setup, and we only need the constructor —
 * `UnrealBloomPass` internally reads `resolution.x/.y`, so a plain point suffices (no `three` import).
 */
declare module "three/examples/jsm/postprocessing/UnrealBloomPass.js" {
    export class UnrealBloomPass {
        constructor(resolution?: { x: number; y: number }, strength?: number, radius?: number, threshold?: number);
    }
}
