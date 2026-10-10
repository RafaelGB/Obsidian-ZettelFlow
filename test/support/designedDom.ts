/* eslint-disable @typescript-eslint/no-explicit-any */
import { DomNode } from "./dashboardDom";

/**
 * **What a designed page asks of the platform** (#771), as the smallest stand-ins that keep it honest:
 * a constructed `CSSStyleSheet` that records what it was given and parses it into top-level rules (so
 * the second check can delete one), a `ShadowRoot` whose prototype has `adoptedStyleSheets` (what the
 * feature detection reads), `FontFace` and the document's `fonts`. Node jest has no style engine: that
 * the cascade stops at the root is the platform's, and is walked in the real app.
 */
export class FakeSheet {
    static made: FakeSheet[] = [];
    text = "";
    cssRules: { cssText: string }[] = [];
    constructor() {
        FakeSheet.made.push(this);
    }
    replaceSync(text: string): void {
        this.text = text;
        this.cssRules = topLevelRules(text).map((cssText) => ({ cssText }));
    }
    deleteRule(index: number): void {
        this.cssRules.splice(index, 1);
    }
}

export class FakeFontFace {
    static made: FakeFontFace[] = [];
    constructor(
        public family: string,
        public source: unknown,
        public descriptors: Record<string, string> = {}
    ) {
        FakeFontFace.made.push(this);
    }
    load(): Promise<FakeFontFace> {
        return Promise.resolve(this);
    }
}

/** Every rule at the top of a sheet, by brace depth. */
function topLevelRules(text: string): string[] {
    const rules: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
            depth--;
            if (depth === 0) {
                rules.push(text.slice(start, i + 1).trim());
                start = i + 1;
            }
        } else if (text[i] === ";" && depth === 0) {
            const rule = text.slice(start, i + 1).trim();
            if (rule) rules.push(rule);
            start = i + 1;
        }
    }
    return rules.filter(Boolean);
}

export interface DesignedPlatform {
    fonts: Set<FakeFontFace>;
    document: { adoptedStyleSheets: unknown[] };
    undo(): void;
}

/** Install the stand-ins; `supported: false` leaves `adoptedStyleSheets` off the prototype. */
export function installDesignedPlatform(options: { supported?: boolean } = {}): DesignedPlatform {
    const g = globalThis as any;
    const proto = DomNode.prototype as any;
    const before = { CSSStyleSheet: g.CSSStyleSheet, FontFace: g.FontFace, ShadowRoot: g.ShadowRoot, document: g.document };
    const hadDoc = Object.prototype.hasOwnProperty.call(proto, "doc");
    FakeSheet.made = [];
    FakeFontFace.made = [];
    const fonts = new Set<FakeFontFace>();
    const document = { adoptedStyleSheets: [] as unknown[], fonts };
    g.CSSStyleSheet = FakeSheet;
    g.FontFace = FakeFontFace;
    g.ShadowRoot = class {};
    if (options.supported !== false) Object.defineProperty(g.ShadowRoot.prototype, "adoptedStyleSheets", { value: [], configurable: true });
    g.document = { ...(before.document ?? {}), ...document };
    Object.defineProperty(proto, "doc", { configurable: true, get: () => g.document });
    return {
        fonts,
        document: g.document,
        undo() {
            for (const key of Object.keys(before) as (keyof typeof before)[]) {
                if (before[key] === undefined) delete g[key];
                else g[key] = before[key];
            }
            if (!hadDoc) delete proto.doc;
        },
    };
}

/** Every node of a tree, the shadow roots' too. */
export function everyNode(root: DomNode, out: DomNode[] = []): DomNode[] {
    for (const child of root.children) {
        out.push(child);
        everyNode(child, out);
    }
    const shadow = root.shadowRoot;
    if (shadow) everyNode(shadow, out);
    return out;
}
