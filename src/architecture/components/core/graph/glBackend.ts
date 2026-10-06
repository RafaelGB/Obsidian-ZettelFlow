import { log } from "architecture";
import { focalLength } from "./graphCamera";
import type { FrameInput, GraphBackend } from "./graphFrame";

/**
 * The WebGL2 renderer (#693, epic #692): **five draw calls a frame, whatever the size of the vault**.
 *
 * The view it replaces drew one mesh per note, a cylinder and a cone per link, particles and a
 * sprite per label — roughly `n + 2·links` draw calls, about nine thousand at two thousand notes,
 * through `3d-force-graph` and `three` (1 MB, 31 % of the plugin). Here every note is one instance
 * of the same quad, every link one instance of the same strip:
 *
 * 1. the nebulae — one soft billboard per region (#697);
 * 2. the stars — only under a dark sky;
 * 3. the links — screen-space strips, dashed or lit in the fragment shader;
 * 4. the halos — the same note quads, larger, blended additively on a dark sky;
 * 5. the notes — discs, depth-tested so a near note covers a far one.
 *
 * Colours arrive premultiplied, so one blend function serves light and dark themes alike. Every
 * shader is `highp`: a uniform both stages declare must agree on precision, or the program does not
 * link (found by rendering it, not by reading it).
 */

const NODE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
layout(location=2) in vec4 a_color;
layout(location=3) in float a_size;
layout(location=4) in float a_glow;
uniform mat4 u_m;
uniform vec2 u_view;
uniform float u_focal;
uniform float u_flat;
uniform float u_glowPass;
out vec2 v_uv;
out vec4 v_color;
out float v_glow;
void main() {
    vec4 clip = u_m * vec4(a_pos, 1.0);
    float scale = u_flat > 0.5 ? u_focal : u_focal / max(clip.w, 1.0);
    float r = a_size * (u_flat > 0.5 ? clamp(scale * 1.05, 0.55, 1.5) : clamp(scale * 1.15, 0.45, 1.7));
    if (u_glowPass > 0.5) r *= 1.0 + 3.6 * a_glow;
    if (a_color.a < 0.004 || r < 0.05 || (u_glowPass > 0.5 && a_glow <= 0.0) || (u_flat < 0.5 && clip.w < 4.0)) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec2 offset = a_corner * r * 2.0 / u_view;
    gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
    v_uv = a_corner;
    v_color = a_color;
    v_glow = a_glow;
}`;

const NODE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in float v_glow;
uniform float u_glowPass;
uniform float u_dark;
out vec4 o;
void main() {
    float d = length(v_uv);
    if (d > 1.0) discard;
    if (u_glowPass > 0.5) {
        float g = exp(-d * d * 4.5) * (1.0 - smoothstep(0.7, 1.0, d));
        float a = g * v_color.a * (u_dark > 0.5 ? 0.62 : 0.3) * min(1.0, v_glow);
        o = u_dark > 0.5 ? vec4(v_color.rgb * a, 0.0) : vec4(v_color.rgb * a, a);
        return;
    }
    float a = (1.0 - smoothstep(0.76, 1.0, d)) * v_color.a;
    if (a < 0.01) discard;
    o = vec4(v_color.rgb * a, a);
}`;

const EDGE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_a;
layout(location=2) in vec3 a_b;
layout(location=3) in vec4 a_color;
layout(location=4) in float a_width;
layout(location=5) in float a_flags;
uniform mat4 u_m;
uniform vec2 u_view;
uniform float u_flat;
out vec4 v_color;
out float v_t;
out float v_len;
out float v_side;
out float v_half;
out float v_flags;
out float v_seed;
void main() {
    vec4 ca = u_m * vec4(a_a, 1.0);
    vec4 cb = u_m * vec4(a_b, 1.0);
    // Behind the camera is a 3D notion: the flat sheet's w is always 1.
    if (a_color.a < 0.004 || a_width <= 0.0 || (u_flat < 0.5 && (ca.w < 4.0 || cb.w < 4.0))) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    vec2 half_view = u_view * 0.5;
    vec2 sa = ca.xy / ca.w * half_view;
    vec2 sb = cb.xy / cb.w * half_view;
    vec2 dir = sb - sa;
    float len = max(length(dir), 0.0001);
    dir /= len;
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = a_width * 0.5 + 1.0;
    vec2 s = mix(sa, sb, a_corner.x) + nrm * a_corner.y * w;
    float z = mix(ca.z / ca.w, cb.z / cb.w, a_corner.x);
    gl_Position = vec4(s / half_view, z, 1.0);
    v_color = a_color;
    v_t = a_corner.x;
    v_len = len;
    v_side = a_corner.y * w;
    v_half = a_width * 0.5;
    v_flags = a_flags;
    v_seed = float(gl_InstanceID);
}`;

const EDGE_FS = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_t;
in float v_len;
in float v_side;
in float v_half;
in float v_flags;
in float v_seed;
uniform float u_time;
uniform vec3 u_light;
out vec4 o;
void main() {
    float dashed = mod(v_flags, 2.0);
    float travel = mod(floor(v_flags / 2.0), 2.0);
    float alpha = v_color.a * (1.0 - smoothstep(v_half, v_half + 0.9, abs(v_side)));
    if (dashed > 0.5 && mod(v_t * v_len, 9.0) > 4.5) discard;
    vec3 rgb = v_color.rgb;
    if (travel > 0.5) {
        float u1 = fract(u_time / 2600.0 + v_seed * 0.137);
        float u2 = fract(u1 + 0.5);
        float k = v_len / 10.0;
        float glow = exp(-pow((v_t - u1) * k, 2.0)) + exp(-pow((v_t - u2) * k, 2.0));
        rgb = mix(rgb, u_light, clamp(glow, 0.0, 1.0) * 0.65);
        alpha = min(1.0, alpha + glow * 0.55);
    }
    if (alpha < 0.004) discard;
    o = vec4(rgb * alpha, alpha);
}`;

const NEBULA_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_centre;
layout(location=2) in float a_radius;
layout(location=3) in vec4 a_color;
uniform mat4 u_m;
uniform vec2 u_view;
uniform float u_focal;
uniform float u_flat;
out vec2 v_uv;
out vec4 v_color;
void main() {
    vec4 clip = u_m * vec4(a_centre, 1.0);
    if ((u_flat < 0.5 && clip.w < 4.0) || a_color.a < 0.002 || a_radius <= 0.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    float scale = u_flat > 0.5 ? u_focal : u_focal / clip.w;
    vec2 offset = a_corner * a_radius * scale * 2.0 / u_view;
    gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
    v_uv = a_corner;
    v_color = a_color;
}`;

const NEBULA_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
uniform float u_dark;
out vec4 o;
void main() {
    float d = length(v_uv);
    if (d > 1.0) discard;
    float a = v_color.a * exp(-d * d * 2.4) * (1.0 - smoothstep(0.72, 1.0, d));
    o = u_dark > 0.5 ? vec4(v_color.rgb * a, 0.0) : vec4(v_color.rgb * a, a);
}`;

const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_star;
uniform mat4 u_m;
uniform vec3 u_target;
uniform float u_dpr;
out float v_b;
void main() {
    gl_Position = u_m * vec4(a_star.xyz + u_target, 1.0);
    gl_PointSize = (a_star.w < 0.9 ? 1.0 : 1.7) * u_dpr;
    v_b = 0.12 + a_star.w * 0.3;
}`;

const STAR_FS = `#version 300 es
precision highp float;
in float v_b;
uniform vec3 u_star;
out vec4 o;
void main() {
    o = vec4(u_star * v_b, 0.0);
}`;

const STAR_COUNT = 260;

type Uniforms = Record<string, WebGLUniformLocation | null>;

interface Program {
    program: WebGLProgram;
    uniforms: Uniforms;
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, names: string[]): Program {
    const shader = (type: number, source: string): WebGLShader => {
        const s = gl.createShader(type);
        if (!s) throw new Error("could not create a shader");
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error(`shader: ${info ?? "unknown error"}`);
        }
        return s;
    };
    const v = shader(gl.VERTEX_SHADER, vs);
    const f = shader(gl.FRAGMENT_SHADER, fs);
    const program = gl.createProgram();
    if (!program) throw new Error("could not create a program");
    gl.attachShader(program, v);
    gl.attachShader(program, f);
    gl.linkProgram(program);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`program: ${gl.getProgramInfoLog(program) ?? "unknown error"}`);
    }
    const uniforms: Uniforms = {};
    for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
    return { program, uniforms };
}

/** Stars on a shell around the scene — a fixed pattern, so the sky never flickers between frames. */
function starField(count: number, radius: number): Float32Array {
    const out = new Float32Array(count * 4);
    let seed = 99;
    const r = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
        const theta = r() * Math.PI * 2;
        const phi = Math.acos(2 * r() - 1);
        const rr = radius * (1 + r() * 0.7);
        out[i * 4] = Math.cos(theta) * Math.sin(phi) * rr;
        out[i * 4 + 1] = Math.cos(phi) * rr;
        out[i * 4 + 2] = Math.sin(theta) * Math.sin(phi) * rr;
        out[i * 4 + 3] = r();
    }
    return out;
}

/** WebGL2, or `null` when the device has none (the caller falls back to the 2D canvas). */
export function createGlBackend(canvas: HTMLCanvasElement): GraphBackend | null {
    let gl: WebGL2RenderingContext | null = null;
    try {
        gl = canvas.getContext("webgl2", { antialias: true, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    } catch (error) {
        log.warn("[Graph] WebGL2 unavailable", error);
    }
    if (!gl) return null;
    try {
        return new GlBackend(canvas, gl);
    } catch (error) {
        log.warn("[Graph] WebGL2 setup failed; using the 2D canvas", error);
        return null;
    }
}

class GlBackend implements GraphBackend {
    readonly kind = "webgl2" as const;
    drawCalls = 0;
    private readonly nodes: Program;
    private readonly edges: Program;
    private readonly nebula: Program;
    private readonly star: Program;
    private readonly buffers: WebGLBuffer[] = [];
    private readonly vaoNodes: WebGLVertexArrayObject;
    private readonly vaoEdges: WebGLVertexArrayObject;
    private readonly vaoNebula: WebGLVertexArrayObject;
    private readonly vaoStars: WebGLVertexArrayObject;
    private readonly bPos: WebGLBuffer;
    private readonly bColor: WebGLBuffer;
    private readonly bSize: WebGLBuffer;
    private readonly bGlow: WebGLBuffer;
    private readonly bEdgeA: WebGLBuffer;
    private readonly bEdgeB: WebGLBuffer;
    private readonly bEdgeColor: WebGLBuffer;
    private readonly bEdgeWidth: WebGLBuffer;
    private readonly bEdgeFlags: WebGLBuffer;
    private readonly bNebCentre: WebGLBuffer;
    private readonly bNebRadius: WebGLBuffer;
    private readonly bNebColor: WebGLBuffer;
    private readonly bStars: WebGLBuffer;
    private starCount = 0;
    private seen = { positions: -1, paint: -1, edges: -1, nebulae: -1, n: -1 };
    private edgeA = new Float32Array(0);
    private edgeB = new Float32Array(0);
    private lost = false;
    private readonly onLost = (event: Event) => {
        event.preventDefault();
        this.lost = true;
        log.warn("[Graph] the WebGL context was lost; the view redraws when it comes back");
    };

    constructor(readonly canvas: HTMLCanvasElement, private readonly gl: WebGL2RenderingContext) {
        this.nodes = compile(gl, NODE_VS, NODE_FS, ["u_m", "u_view", "u_focal", "u_flat", "u_glowPass", "u_dark"]);
        this.edges = compile(gl, EDGE_VS, EDGE_FS, ["u_m", "u_view", "u_flat", "u_time", "u_light"]);
        this.nebula = compile(gl, NEBULA_VS, NEBULA_FS, ["u_m", "u_view", "u_focal", "u_flat", "u_dark"]);
        this.star = compile(gl, STAR_VS, STAR_FS, ["u_m", "u_target", "u_dpr", "u_star"]);

        const buffer = (): WebGLBuffer => {
            const b = gl.createBuffer();
            if (!b) throw new Error("could not create a buffer");
            this.buffers.push(b);
            return b;
        };
        const vao = (): WebGLVertexArrayObject => {
            const v = gl.createVertexArray();
            if (!v) throw new Error("could not create a vertex array");
            return v;
        };

        const quad = buffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const strip = buffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, strip);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);

        const attr = (location: number, b: WebGLBuffer, size: number, divisor: number) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            gl.vertexAttribDivisor(location, divisor);
        };

        this.bPos = buffer();
        this.bColor = buffer();
        this.bSize = buffer();
        this.bGlow = buffer();
        this.vaoNodes = vao();
        gl.bindVertexArray(this.vaoNodes);
        attr(0, quad, 2, 0);
        attr(1, this.bPos, 3, 1);
        attr(2, this.bColor, 4, 1);
        attr(3, this.bSize, 1, 1);
        attr(4, this.bGlow, 1, 1);

        this.bEdgeA = buffer();
        this.bEdgeB = buffer();
        this.bEdgeColor = buffer();
        this.bEdgeWidth = buffer();
        this.bEdgeFlags = buffer();
        this.vaoEdges = vao();
        gl.bindVertexArray(this.vaoEdges);
        attr(0, strip, 2, 0);
        attr(1, this.bEdgeA, 3, 1);
        attr(2, this.bEdgeB, 3, 1);
        attr(3, this.bEdgeColor, 4, 1);
        attr(4, this.bEdgeWidth, 1, 1);
        attr(5, this.bEdgeFlags, 1, 1);

        this.bNebCentre = buffer();
        this.bNebRadius = buffer();
        this.bNebColor = buffer();
        this.vaoNebula = vao();
        gl.bindVertexArray(this.vaoNebula);
        attr(0, quad, 2, 0);
        attr(1, this.bNebCentre, 3, 1);
        attr(2, this.bNebRadius, 1, 1);
        attr(3, this.bNebColor, 4, 1);

        this.bStars = buffer();
        this.vaoStars = vao();
        gl.bindVertexArray(this.vaoStars);
        attr(0, this.bStars, 4, 0);
        gl.bindVertexArray(null);

        canvas.addEventListener("webglcontextlost", this.onLost);
    }

    get isLost(): boolean {
        return this.lost;
    }

    resize(width: number, height: number, dpr: number): void {
        const w = Math.max(1, Math.round(width * dpr));
        const h = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
    }

    private upload(frame: FrameInput): void {
        const { gl } = this;
        const { n, positions, paint, edgeIndex } = frame;
        const edgeCount = edgeIndex.length / 2;
        const sizesChanged = this.seen.n !== n || this.seen.edges !== frame.edgeVersion;
        if (this.edgeA.length !== edgeCount * 3) {
            this.edgeA = new Float32Array(edgeCount * 3);
            this.edgeB = new Float32Array(edgeCount * 3);
        }
        if (sizesChanged || this.seen.positions !== frame.positionsVersion) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos);
            gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, n * 3), gl.DYNAMIC_DRAW);
            for (let e = 0; e < edgeCount; e++) {
                const a = edgeIndex[e * 2] * 3, b = edgeIndex[e * 2 + 1] * 3;
                this.edgeA[e * 3] = positions[a];
                this.edgeA[e * 3 + 1] = positions[a + 1];
                this.edgeA[e * 3 + 2] = positions[a + 2];
                this.edgeB[e * 3] = positions[b];
                this.edgeB[e * 3 + 1] = positions[b + 1];
                this.edgeB[e * 3 + 2] = positions[b + 2];
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bEdgeA);
            gl.bufferData(gl.ARRAY_BUFFER, this.edgeA, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bEdgeB);
            gl.bufferData(gl.ARRAY_BUFFER, this.edgeB, gl.DYNAMIC_DRAW);
            this.seen.positions = frame.positionsVersion;
        }
        if (sizesChanged || this.seen.paint !== frame.paintVersion) {
            const put = (b: WebGLBuffer, data: Float32Array) => {
                gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            };
            put(this.bColor, paint.nodeColor.subarray(0, n * 4));
            put(this.bSize, paint.nodeSize.subarray(0, n));
            put(this.bGlow, paint.nodeGlow.subarray(0, n));
            put(this.bEdgeColor, paint.edgeColor.subarray(0, edgeCount * 4));
            put(this.bEdgeWidth, paint.edgeWidth.subarray(0, edgeCount));
            put(this.bEdgeFlags, paint.edgeFlags.subarray(0, edgeCount));
            this.seen.paint = frame.paintVersion;
        }
        if (this.seen.nebulae !== frame.nebulae.version) {
            const neb = frame.nebulae;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bNebCentre);
            gl.bufferData(gl.ARRAY_BUFFER, neb.centre.subarray(0, neb.count * 3), gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bNebRadius);
            gl.bufferData(gl.ARRAY_BUFFER, neb.radius.subarray(0, neb.count), gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.bNebColor);
            gl.bufferData(gl.ARRAY_BUFFER, neb.color.subarray(0, neb.count * 4), gl.DYNAMIC_DRAW);
            this.seen.nebulae = neb.version;
        }
        this.seen.n = n;
        this.seen.edges = frame.edgeVersion;
    }

    render(frame: FrameInput): void {
        if (this.lost) return;
        const { gl } = this;
        this.upload(frame);
        const { theme, camera, matrix } = frame;
        const view = [frame.width, frame.height] as const;
        const focal = focalLength(camera, frame.width, frame.height);
        const flat = camera.flat ? 1 : 0;
        const dark = theme.dark ? 1 : 0;
        const edgeCount = frame.edgeIndex.length / 2;
        let calls = 0;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(theme.bg[0], theme.bg[1], theme.bg[2], 1);
        gl.clearDepth(1);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);

        if (frame.nebulae.count > 0) {
            gl.useProgram(this.nebula.program);
            gl.uniformMatrix4fv(this.nebula.uniforms.u_m, false, matrix);
            gl.uniform2f(this.nebula.uniforms.u_view, view[0], view[1]);
            gl.uniform1f(this.nebula.uniforms.u_focal, focal);
            gl.uniform1f(this.nebula.uniforms.u_flat, flat);
            gl.uniform1f(this.nebula.uniforms.u_dark, dark);
            gl.bindVertexArray(this.vaoNebula);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.nebulae.count);
            calls++;
        }

        if (frame.stars && dark && !flat) {
            if (this.starCount === 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.bStars);
                gl.bufferData(gl.ARRAY_BUFFER, starField(STAR_COUNT, 1500), gl.STATIC_DRAW);
                this.starCount = STAR_COUNT;
            }
            gl.useProgram(this.star.program);
            gl.uniformMatrix4fv(this.star.uniforms.u_m, false, matrix);
            gl.uniform3f(this.star.uniforms.u_target, camera.tx, camera.ty, camera.tz);
            gl.uniform1f(this.star.uniforms.u_dpr, frame.dpr);
            gl.uniform3f(this.star.uniforms.u_star, theme.text[0], theme.text[1], theme.text[2]);
            gl.bindVertexArray(this.vaoStars);
            gl.drawArrays(gl.POINTS, 0, this.starCount);
            calls++;
        }

        if (edgeCount > 0) {
            gl.useProgram(this.edges.program);
            gl.uniformMatrix4fv(this.edges.uniforms.u_m, false, matrix);
            gl.uniform2f(this.edges.uniforms.u_view, view[0], view[1]);
            gl.uniform1f(this.edges.uniforms.u_flat, flat);
            gl.uniform1f(this.edges.uniforms.u_time, frame.time);
            gl.uniform3f(this.edges.uniforms.u_light, theme.text[0], theme.text[1], theme.text[2]);
            gl.bindVertexArray(this.vaoEdges);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, edgeCount);
            calls++;
        }

        if (frame.n > 0) {
            gl.useProgram(this.nodes.program);
            gl.uniformMatrix4fv(this.nodes.uniforms.u_m, false, matrix);
            gl.uniform2f(this.nodes.uniforms.u_view, view[0], view[1]);
            gl.uniform1f(this.nodes.uniforms.u_focal, focal);
            gl.uniform1f(this.nodes.uniforms.u_flat, flat);
            gl.uniform1f(this.nodes.uniforms.u_dark, dark);
            gl.bindVertexArray(this.vaoNodes);
            // Halos first, without depth, so they glow behind every disc.
            gl.uniform1f(this.nodes.uniforms.u_glowPass, 1);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.n);
            calls++;
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.uniform1f(this.nodes.uniforms.u_glowPass, 0);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.n);
            calls++;
            gl.disable(gl.DEPTH_TEST);
        }
        gl.bindVertexArray(null);
        this.drawCalls = calls;
    }

    dispose(): void {
        const { gl } = this;
        this.canvas.removeEventListener("webglcontextlost", this.onLost);
        for (const b of this.buffers) gl.deleteBuffer(b);
        for (const v of [this.vaoNodes, this.vaoEdges, this.vaoNebula, this.vaoStars]) gl.deleteVertexArray(v);
        for (const p of [this.nodes, this.edges, this.nebula, this.star]) gl.deleteProgram(p.program);
        // Give the context back now rather than when the garbage collector gets round to it: a
        // browser keeps only a handful of live WebGL contexts, and a reopened view needs one.
        gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
}
