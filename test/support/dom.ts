/** Minimal eventful Obsidian DOM double, not a browser or accessibility certification. */
export class FakeElement {
    children: FakeElement[] = [];
    attrs: Record<string, string> = {};
    listeners: Record<string, ((event: any) => void)[]> = {};
    textContent = ''; value = ''; disabled = false; hidden = false; placeholder = ''; selectionStart = 0; selectionEnd = 0;
    static active: FakeElement | null = null;
    constructor(public tag = 'div') { }
    createEl(tag: string, options: any = {}): FakeElement {
        const el = new FakeElement(tag); el.textContent = options.text ?? ''; el.value = options.value ?? '';
        el.attrs = { ...options.attr }; if (options.cls) el.attrs.class = options.cls;
        this.children.push(el); return el;
    }
    createDiv(options: any = {}): FakeElement { return this.createEl('div', options); }
    createSpan(options: any = {}): FakeElement { return this.createEl('span', options); }
    empty(): void { this.children = []; this.textContent = ''; }
    setText(text: string): void { this.textContent = text; }
    setAttribute(name: string, value: string): void { this.attrs[name] = value; }
    addClass(...names: string[]): void { this.attrs.class = `${this.attrs.class ?? ''} ${names.join(' ')}`; }
    addEventListener(name: string, fn: (event: any) => void): void { (this.listeners[name] ??= []).push(fn); }
    removeEventListener(name: string, fn: (event: any) => void): void { this.listeners[name] = (this.listeners[name] ?? []).filter(x => x !== fn); }
    fire(name: string, event: any = {}): void { for (const fn of this.listeners[name] ?? []) fn(event); }
    focus(): void { FakeElement.active = this; }
    find(predicate: (el: FakeElement) => boolean): FakeElement | undefined { if (predicate(this)) return this; for (const child of this.children) { const found = child.find(predicate); if (found) return found; } return undefined; }
}