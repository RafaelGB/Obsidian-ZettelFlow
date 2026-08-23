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
}
