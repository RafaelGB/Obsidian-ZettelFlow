/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A small, eventful stand-in for Obsidian's augmented DOM, rich enough to render the Base dashboard
 * (#632/#635) under node jest: classes, attributes, children, events, `querySelector('.x')`. Not a
 * browser — layout, focus and styles are not modelled. Assert on what a user would see or do.
 */
export class DomNode {
    tag: string;
    children: DomNode[] = [];
    parent: DomNode | null = null;
    attrs: Record<string, string> = {};
    classes = new Set<string>();
    text = "";
    value = "";
    checked = false;
    disabled = false;
    draggable = false;
    tabIndex = -1;
    /** `<details>` disclosure state (#640). */
    open = false;
    /** Obsidian's `el.win`: the window the element lives in — one window here. */
    get win(): Window {
        // Obsidian answers with the window the element is in; a test that fakes `activeWindow` means it.
        return this.ownWin ?? (((globalThis as any).activeWindow ?? (globalThis as any).window) as Window);
    }
    /** A test may hand an element its own window (a fake clock, a reduced-motion query). */
    set win(win: Window) {
        this.ownWin = win;
    }
    private ownWin: Window | undefined;
    /** Every `scrollIntoView` / `scrollTo` call, with its options — hand-overs are asserted on these. */
    scrolls: any[] = [];
    /** No layout here: a container's scroll position and an element's size are what a test sets. */
    scrollTop = 0;
    offsetHeight = 0;
    offsetWidth = 0;
    clientWidth = 0;
    href = "";
    type = "";
    listeners: Record<string, ((event: any) => void)[]> = {};
    /** What `setCssProps` was handed — custom properties the stylesheet reads (#667). */
    cssProps: Record<string, string> = {};
    private detached = false;

    /** The element's namespace (#770): XHTML, unless made by `createSvg` (or set by a test). */
    namespaceURI: string | null = "http://www.w3.org/1999/xhtml";

    constructor(tag = "div") {
        this.tag = tag;
    }

    get className(): string {
        return [...this.classes].join(" ");
    }
    /** Obsidian's `cls` takes a string or an array of class names; both land here. */
    set className(value: string | string[]) {
        const names = Array.isArray(value) ? value : value.split(/\s+/);
        this.classes = new Set(names.filter(Boolean));
    }
    get textContent(): string {
        return this.text + this.children.map((child) => child.textContent).join("");
    }
    get childElementCount(): number {
        return this.children.length;
    }
    get isConnected(): boolean {
        let node: DomNode | null = this;
        while (node) {
            if (node.detached) return false;
            node = node.parent;
        }
        return true;
    }

    createEl(tag: string, options: any = {}): any {
        const el = new DomNode(tag);
        if (options.cls) el.className = options.cls;
        if (options.text !== undefined) el.text = String(options.text);
        if (options.href) el.href = options.href;
        for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
        el.parent = this;
        this.children.push(el);
        return el;
    }
    /** Obsidian's `createSvg`: the same as createEl, marked as SVG so a test can tell (#643). */
    createSvg(tag: string, options: any = {}): any {
        // Obsidian adds `cls` with classList.add — one token per entry. A space-joined string throws
        // InvalidCharacterError in the app (#639), so it throws here too.
        if (typeof options.cls === "string" && /\s/.test(options.cls.trim())) {
            throw new Error(`InvalidCharacterError: createSvg cls "${options.cls}" contains a space`);
        }
        const el = this.createEl(tag, { ...options, cls: Array.isArray(options.cls) ? options.cls.join(" ") : options.cls });
        el.svg = true;
        el.namespaceURI = "http://www.w3.org/2000/svg";
        // Like Obsidian: only HTML elements have isShown(); an SVG element does not.
        el.isShown = undefined;
        return el;
    }
    /** True for a node made by {@link createSvg}. */
    svg = false;
    createDiv(options: any = {}): any {
        return this.createEl("div", options);
    }
    createSpan(options: any = {}): any {
        return this.createEl("span", options);
    }
    empty(): void {
        for (const child of this.children) child.parent = null;
        this.children = [];
        this.text = "";
    }
    setCssProps(props: Record<string, string>): void {
        Object.assign(this.cssProps, props);
    }
    setText(text: string): void {
        this.empty();
        this.text = text;
    }
    addClass(...names: string[]): void {
        for (const name of names) for (const one of name.split(/\s+/).filter(Boolean)) this.classes.add(one);
    }
    removeClass(...names: string[]): void {
        for (const name of names) this.classes.delete(name);
    }
    removeClasses(names: string[]): void {
        this.removeClass(...names);
    }
    toggleClass(name: string, force?: boolean): void {
        const on = force ?? !this.classes.has(name);
        if (on) this.classes.add(name);
        else this.classes.delete(name);
    }
    hasClass(name: string): boolean {
        return this.classes.has(name);
    }
    setAttribute(name: string, value: string): void {
        if (name === "class") this.className = value;
        else if (name === "type") this.type = value;
        else this.attrs[name] = value;
    }
    removeAttribute(name: string): void {
        delete this.attrs[name];
    }
    getAttribute(name: string): string | null {
        return this.attrs[name] ?? null;
    }
    /** Obsidian's `setAttr`. */
    setAttr(name: string, value: string): void {
        this.setAttribute(name, value);
    }
    get id(): string {
        return this.attrs.id ?? "";
    }
    set id(value: string) {
        this.attrs.id = value;
    }
    /** The options each listener was added with, by event — `capture` is how a link is caught first. */
    listenerOptions: Record<string, unknown[]> = {};
    addEventListener(name: string, fn: (event: any) => void, options?: unknown): void {
        (this.listeners[name] ??= []).push(fn);
        (this.listenerOptions[name] ??= []).push(options);
    }
    removeEventListener(name: string, fn: (event: any) => void): void {
        this.listeners[name] = (this.listeners[name] ?? []).filter((other) => other !== fn);
    }
    /** Dispatch `name` to this node's listeners (no bubbling — fire on the node you mean). */
    fire(name: string, event: any = {}): any {
        const evt = {
            preventDefault: () => (evt.defaultPrevented = true),
            defaultPrevented: false,
            stopPropagation: () => (evt.propagationStopped = true),
            propagationStopped: false,
            target: this,
            ...event,
        };
        for (const fn of [...(this.listeners[name] ?? [])]) fn(evt);
        return evt;
    }
    click(event: any = {}): any {
        return this.fire("click", event);
    }
    appendChild(child: DomNode): DomNode {
        if (child.parent) child.parent.children = child.parent.children.filter((other) => other !== child);
        child.parent = this;
        child.detached = false;
        this.children.push(child);
        return child;
    }
    /** The DOM's `replaceWith(node)`: `node` takes this one's place among its siblings. */
    replaceWith(node: DomNode): void {
        const parent = this.parent;
        if (!parent) return;
        if (node.parent) node.parent.children = node.parent.children.filter((other) => other !== node);
        const at = parent.children.indexOf(this);
        parent.children.splice(at, 1, node);
        node.parent = parent;
        node.detached = false;
        this.parent = null;
        this.detached = true;
    }
    remove(): void {
        if (this.parent) this.parent.children = this.parent.children.filter((other) => other !== this);
        this.parent = null;
        this.detached = true;
    }
    /** The DOM's own `parentElement`: what `after()` and `closest()` walk. */
    get parentElement(): DomNode | null {
        return this.parent;
    }
    /** Nearest self-or-ancestor matching `selector`, as `Element.closest`. */
    closest(selector: string): DomNode | null {
        const match = matcher(selector);
        for (let cur: DomNode | null = this; cur; cur = cur.parent) if (match(cur)) return cur;
        return null;
    }
    /** Insert `node` right after this one, as `Element.after` — moving it if it is elsewhere. */
    after(node: DomNode): void {
        if (!this.parent) throw new Error("after() on a node with no parent");
        if (node.parent) node.parent.children = node.parent.children.filter((other) => other !== node);
        const siblings = this.parent.children;
        siblings.splice(siblings.indexOf(this) + 1, 0, node);
        node.parent = this.parent;
        node.detached = false;
    }
    /** The DOM's `classList`, over the same set (#686: the canvas extensions toggle with it). */
    get classList(): { add(...n: string[]): void; remove(...n: string[]): void; contains(n: string): boolean } {
        return {
            add: (...names: string[]) => this.addClass(...names),
            remove: (...names: string[]) => this.removeClass(...names),
            contains: (name: string) => this.classes.has(name),
        };
    }
    get lastElementChild(): DomNode | null {
        return this.children[this.children.length - 1] ?? null;
    }
    get firstElementChild(): DomNode | null {
        return this.children[0] ?? null;
    }
    /** The next sibling, as `insertBefore(node, el.nextSibling)` reads it (#750: a chapter's sheet). */
    get nextSibling(): DomNode | null {
        const siblings = this.parent?.children ?? [];
        return siblings[siblings.indexOf(this) + 1] ?? null;
    }
    /** The DOM's `insertBefore(node, ref)`: before `ref`, or last when there is none (#686). */
    insertBefore(node: DomNode, ref: DomNode | null | undefined): DomNode {
        if (node.parent) node.parent.children = node.parent.children.filter((other) => other !== node);
        const at = ref ? this.children.indexOf(ref) : -1;
        if (at === -1) this.children.push(node);
        else this.children.splice(at, 0, node);
        node.parent = this;
        node.detached = false;
        return node;
    }
    /** The DOM's `prepend(node)`. */
    prepend(node: DomNode): void {
        this.insertBefore(node, this.children[0]);
    }
    /** Obsidian's `insertAfter(node, ref)`: after `ref`, or first when there is none (#686). */
    insertAfter(node: DomNode, ref: DomNode | null | undefined): DomNode {
        if (node.parent) node.parent.children = node.parent.children.filter((other) => other !== node);
        const at = ref ? this.children.indexOf(ref) + 1 : 0;
        this.children.splice(at, 0, node);
        node.parent = this;
        node.detached = false;
        return node;
    }
    contains(node: DomNode | null): boolean {
        for (let cur: DomNode | null = node; cur; cur = cur.parent) if (cur === this) return true;
        return false;
    }
    getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
        return { left: 0, top: 0, width: 100, height: 100 };
    }
    focus(): void { }
    select(): void { }
    /** Obsidian's HTMLElement.isShown — absent on SVG nodes (see createSvg). */
    isShown(): boolean {
        return this.isConnected;
    }
    scrollIntoView(options?: any): void {
        this.scrolls.push(options);
    }
    scrollTo(options?: any): void {
        this.scrolls.push(options);
    }

    find(predicate: (el: DomNode) => boolean): DomNode | undefined {
        for (const child of this.children) {
            if (predicate(child)) return child;
            const found = child.find(predicate);
            if (found) return found;
        }
        return undefined;
    }
    findAll(predicate: (el: DomNode) => boolean, out: DomNode[] = []): DomNode[] {
        for (const child of this.children) {
            if (predicate(child)) out.push(child);
            child.findAll(predicate, out);
        }
        return out;
    }
    /** `.a`, `.a.b` or a tag name — the selectors the dashboard uses. */
    querySelector(selector: string): DomNode | null {
        // `:scope > .x` — a direct child only, as the real DOM reads it (rowContainer relies on it).
        if (selector.startsWith(":scope > ")) {
            return this.children.find(matcher(selector.slice(":scope > ".length))) ?? null;
        }
        return this.find(matcher(selector)) ?? null;
    }
    querySelectorAll(selector: string): DomNode[] {
        return this.findAll(matcher(selector));
    }
    /** Every element carrying the dashboard class `zettelkasten-flow__<name>`. */
    byClass(name: string): DomNode[] {
        return this.findAll((el) => el.classes.has(`zettelkasten-flow__${name}`) || el.classes.has(name));
    }
    oneByClass(name: string): DomNode {
        const found = this.byClass(name)[0];
        if (!found) throw new Error(`no element with class ${name}`);
        return found;
    }
    byText(text: string): DomNode | undefined {
        return this.find((el) => el.text === text);
    }
}

/**
 * `.a`, `.a.b`, a tag, `tag.class`, or a comma list of those — what `querySelector` and `closest`
 * are asked for. Anything richer throws rather than silently matching nothing.
 */
function matcher(selector: string): (el: DomNode) => boolean {
    const parts = selector.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
        const each = parts.map(matcher);
        return (el) => each.some((match) => match(el));
    }
    const one = parts[0] ?? "";
    if (one.startsWith("#")) return (el) => el.id === one.slice(1);
    // `[name="value"]` / `[name]`: one attribute, as the reader asks for an element a link names.
    const attr = /^\[([\w:-]+)(?:="([^"]*)")?\]$/.exec(one);
    if (attr) return (el) => (attr[2] === undefined ? el.getAttribute(attr[1]) !== null : el.getAttribute(attr[1]) === attr[2]);
    if (/[\s>+~\[\]:]/.test(one)) throw new Error(`DomNode cannot match selector "${one}"`);
    const [tag, ...classes] = one.split(".");
    return (el) => (tag === "" || el.tag === tag) && classes.every((cls) => el.classes.has(cls));
}

/** Browser globals the dashboard touches, as the smallest stand-ins that keep it honest. */
export function installBrowserGlobals(): void {
    const g = globalThis as any;
    g.ResizeObserver ??= class {
        observe(): void { }
        disconnect(): void { }
    };
    g.requestAnimationFrame = (cb: () => void) => {
        cb();
        return 1;
    };
    g.cancelAnimationFrame = () => undefined;
    g.getComputedStyle ??= () => ({ getPropertyValue: () => "" });
    g.Node ??= DomNode;
}

/** Let pending promise chains (an async render, a lazy import) settle. */
export async function flush(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Settle until `done()` holds, a tick at a time, up to `max` ticks. For async chains whose length
 * depends on the runner (a resolver over several rows): a fixed number of ticks passed locally and
 * flaked on CI, so wait for the outcome instead.
 */
export async function settle(done: () => boolean, max = 200, maxMs = 1000): Promise<void> {
    // At least `max` turns, and on a loaded CI runner keep going until `maxMs` has passed (#689).
    const start = Date.now();
    for (let i = 0; !done() && (i < max || Date.now() - start < maxMs); i++) await new Promise((resolve) => setImmediate(resolve));
}
