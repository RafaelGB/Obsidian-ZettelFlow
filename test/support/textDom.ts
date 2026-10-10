/**
 * A tiny DOM with real **text nodes** (#671), for code that walks and splits text the way a browser
 * does — `dashboardDom`'s `DomNode` keeps text as a property and has no text nodes. Only what the
 * reader's mark drawing needs: childNodes, splitText, insertBefore, appendChild, removeChild,
 * normalize, textContent — plus classes and events, so it can stand in for a chapter's body.
 */
export class FakeText {
    nodeType = 3;
    parentNode: FakeEl | null = null;
    constructor(public data: string) {}

    splitText(offset: number): FakeText {
        const rest = new FakeText(this.data.slice(offset));
        this.data = this.data.slice(0, offset);
        const parent = this.parentNode;
        if (parent) {
            const i = parent.childNodes.indexOf(this);
            parent.childNodes.splice(i + 1, 0, rest);
            rest.parentNode = parent;
        }
        return rest;
    }

    get textContent(): string {
        return this.data;
    }
}

export type FakeNode = FakeText | FakeEl;

export class FakeEl {
    nodeType = 1;
    parentNode: FakeEl | null = null;
    childNodes: FakeNode[] = [];
    attrs: Record<string, string> = {};
    classes = new Set<string>();
    listeners: Record<string, ((event: unknown) => void)[]> = {};
    constructor(
        public tag: string,
        children: (FakeNode | string)[] = [],
        public cls = ""
    ) {
        for (const child of children) this.appendChild(typeof child === "string" ? new FakeText(child) : child);
    }

    /** The DOM's own name for the element, upper-cased as the DOM gives it. */
    get nodeName(): string {
        return this.tag.toUpperCase();
    }

    get firstChild(): FakeNode | null {
        return this.childNodes[0] ?? null;
    }

    get textContent(): string {
        return this.childNodes.map((child) => child.textContent).join("");
    }

    private detach(node: FakeNode): void {
        const old = node.parentNode;
        if (old) old.childNodes.splice(old.childNodes.indexOf(node), 1);
    }

    appendChild(node: FakeNode): FakeNode {
        this.detach(node);
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    insertBefore(node: FakeNode, ref: FakeNode | null): FakeNode {
        if (!ref) return this.appendChild(node);
        this.detach(node);
        node.parentNode = this;
        this.childNodes.splice(this.childNodes.indexOf(ref), 0, node);
        return node;
    }

    removeChild(node: FakeNode): FakeNode {
        this.childNodes.splice(this.childNodes.indexOf(node), 1);
        node.parentNode = null;
        return node;
    }

    normalize(): void {
        const merged: FakeNode[] = [];
        for (const child of this.childNodes) {
            const last = merged[merged.length - 1];
            if (child instanceof FakeText && last instanceof FakeText) last.data += child.data;
            else if (child instanceof FakeText && child.data === "") continue;
            else merged.push(child);
        }
        this.childNodes = merged;
        for (const child of merged) child.parentNode = this;
    }

    addClass(...names: string[]): void {
        for (const name of names) this.classes.add(name);
    }

    removeClass(...names: string[]): void {
        for (const name of names) this.classes.delete(name);
    }

    hasClass(name: string): boolean {
        return this.classes.has(name);
    }

    getAttribute(name: string): string | null {
        return this.attrs[name] ?? null;
    }

    addEventListener(name: string, fn: (event: unknown) => void): void {
        (this.listeners[name] ??= []).push(fn);
    }

    removeEventListener(name: string, fn: (event: unknown) => void): void {
        this.listeners[name] = (this.listeners[name] ?? []).filter((x) => x !== fn);
    }

    fire(name: string, event: Record<string, unknown> = {}): Record<string, unknown> {
        const evt: Record<string, unknown> = {
            preventDefault: () => (evt.defaultPrevented = true),
            stopPropagation: () => (evt.propagationStopped = true),
            ...event,
        };
        for (const fn of this.listeners[name] ?? []) fn(evt);
        return evt;
    }

    getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    /** Every element below this one with `tag`, in order. */
    all(tag: string): FakeEl[] {
        const out: FakeEl[] = [];
        for (const child of this.childNodes) {
            if (child instanceof FakeEl) {
                if (child.tag === tag) out.push(child);
                out.push(...child.all(tag));
            }
        }
        return out;
    }
}
