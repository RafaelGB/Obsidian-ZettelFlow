/* eslint-disable @typescript-eslint/no-explicit-any */
import { DomNode } from "./dashboardDom";

/**
 * Real text nodes in `DomNode` (#761). `DomNode` keeps an element's text as a property; the Reader's
 * places, bookmarks and the *you are here* mark read a chapter by its text nodes (`chapterText`,
 * `wrapSpan`). With `withTextNodes()` on, `appendText` — what a book's chapter is drawn with — makes a
 * `#text` node, and every `DomNode` answers the few members a text walk needs. Returns the undo.
 */
export function withTextNodes(): () => void {
    const proto = DomNode.prototype as any;
    const added: Record<string, PropertyDescriptor> = {
        nodeType: { configurable: true, get(this: DomNode) { return this.tag === "#text" ? 3 : 1; } },
        nodeName: { configurable: true, get(this: DomNode) { return this.tag.toUpperCase(); } },
        childNodes: { configurable: true, get(this: DomNode) { return this.children; } },
        parentNode: { configurable: true, get(this: DomNode) { return this.parent; } },
        firstChild: { configurable: true, get(this: DomNode) { return this.children[0] ?? null; } },
        data: {
            configurable: true,
            get(this: DomNode) { return this.text; },
            set(this: DomNode, value: string) { this.text = value; },
        },
    };
    const methods: Record<string, (this: DomNode, ...args: any[]) => unknown> = {
        appendText(this: DomNode, text: string) {
            const node = new DomNode("#text");
            node.text = text;
            this.appendChild(node);
        },
        splitText(this: DomNode, offset: number) {
            const rest = new DomNode("#text");
            rest.text = this.text.slice(offset);
            this.text = this.text.slice(0, offset);
            const parent = this.parent;
            if (parent) parent.insertAfter(rest, this);
            return rest;
        },
        removeChild(this: DomNode, node: DomNode) {
            node.remove();
            return node;
        },
        normalize(this: DomNode) {
            const merged: DomNode[] = [];
            for (const child of this.children) {
                const last = merged[merged.length - 1];
                if (child.tag === "#text" && last?.tag === "#text") last.text += child.text;
                else merged.push(child);
            }
            this.children = merged;
        },
    };
    const saved: Record<string, PropertyDescriptor | undefined> = {};
    for (const key of [...Object.keys(added), ...Object.keys(methods)]) saved[key] = Object.getOwnPropertyDescriptor(proto, key);
    for (const [key, descriptor] of Object.entries(added)) Object.defineProperty(proto, key, descriptor);
    for (const [key, fn] of Object.entries(methods)) Object.defineProperty(proto, key, { configurable: true, writable: true, value: fn });
    return () => {
        for (const [key, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(proto, key, descriptor);
            else delete proto[key];
        }
    };
}
