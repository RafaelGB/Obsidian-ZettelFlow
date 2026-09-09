/**
 * Minimal ambient declaration for the three.js classes the 3D graph builds directly (#280) — glow
 * sprites for hubs and translucent cluster hulls. `three` ships no resolvable types in our setup and
 * we use it via a dynamic `import("three")`; three is **deduped** (a single instance shared with
 * 3d-force-graph) so the objects render in the same context. Only the surface we touch is declared.
 */
declare module "three" {
    export const AdditiveBlending: number;
    export const BackSide: number;

    export class Color {
        constructor(color?: string | number);
        set(color: string | number): this;
    }

    export class Texture {
        needsUpdate: boolean;
    }
    export class CanvasTexture extends Texture {
        constructor(canvas: HTMLCanvasElement);
    }

    interface Vec3Like {
        set(x: number, y: number, z: number): void;
        setScalar(s: number): void;
    }
    export class Object3D {
        position: Vec3Like;
        scale: Vec3Like;
        visible: boolean;
        add(object: Object3D): void;
        remove(object: Object3D): void;
    }

    export class SpriteMaterial {
        constructor(params?: Record<string, unknown>);
        color: Color;
        opacity: number;
        map: Texture | null;
        dispose(): void;
    }
    export class Sprite extends Object3D {
        constructor(material?: SpriteMaterial);
        material: SpriteMaterial;
    }
    export class Group extends Object3D { }

    export class MeshBasicMaterial {
        constructor(params?: Record<string, unknown>);
        color: Color;
        opacity: number;
        dispose(): void;
    }
    export class SphereGeometry {
        constructor(radius?: number, widthSegments?: number, heightSegments?: number);
        dispose(): void;
    }
    export class Mesh extends Object3D {
        constructor(geometry?: SphereGeometry, material?: MeshBasicMaterial);
        material: MeshBasicMaterial;
        geometry: SphereGeometry;
    }
    export class Scene extends Object3D { }

    // A1 (#384) — the immersive starfield backdrop is a single `Points` object (one draw call).
    export class Vector2 {
        constructor(x?: number, y?: number);
        x: number;
        y: number;
    }
    export class BufferAttribute {
        constructor(array: ArrayLike<number>, itemSize: number);
    }
    export class BufferGeometry {
        setAttribute(name: string, attribute: BufferAttribute): this;
        dispose(): void;
    }
    export class PointsMaterial {
        constructor(params?: Record<string, unknown>);
        color: Color;
        opacity: number;
        size: number;
        dispose(): void;
    }
    export class Points extends Object3D {
        constructor(geometry?: BufferGeometry, material?: PointsMaterial);
        geometry: BufferGeometry;
        material: PointsMaterial;
    }
}

// A1 (#384) — best-effort selective bloom. `three` ships no resolvable types for the examples/jsm
// post-processing passes; we load this one lazily via `import(...)` inside a try/catch, so only the
// surface we touch is declared. A load/wire failure degrades to lit spheres, never a blank graph.
declare module "three/examples/jsm/postprocessing/UnrealBloomPass.js" {
    import type { Vector2 } from "three";
    export class UnrealBloomPass {
        constructor(resolution: Vector2, strength: number, radius: number, threshold: number);
        enabled: boolean;
        strength: number;
        radius: number;
        threshold: number;
        dispose?(): void;
    }
}
