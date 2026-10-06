/**
 * Minimal manual mock of the Obsidian API for unit tests.
 *
 * Obsidian is provided by the host app at runtime and is marked `external` in the build,
 * so it is not a real runnable module. This stub lets pure logic (and, later, lightly
 * Obsidian-coupled code) be unit-tested. Extend it as tests need more surface.
 */

export type HexString = string;
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export class Notice {
  constructor(public message?: string) { }
  setMessage(message: string): this {
    this.message = message;
    return this;
  }
  hide(): void { }
}

export class Plugin {
  registerBasesView(_viewId: string, _registration: unknown): boolean { return true; }
}
export class Component {
  private cleanups: (() => void)[] = [];
  private children: Component[] = [];
  onload(): void { } onunload(): void { }
  load(): void { this.onload(); }
  unload(): void { this.onunload(); for (const child of this.children) child.unload(); for (const fn of this.cleanups) fn(); this.cleanups = []; }
  addChild<T extends Component>(child: T): T { this.children.push(child); child.load(); return child; }
  removeChild<T extends Component>(child: T): T { this.children = this.children.filter(x => x !== child); child.unload(); return child; }
  register(fn: () => void): void { this.cleanups.push(fn); }
  registerEvent(_event: unknown): void { }
  // The real thing: attach, and drop it again on unload. Renderers register their header
  // controls this way (#577), so a fake without it would make every migrated header throw.
  registerDomEvent(el: any, type: string, handler: (event: any) => void, options?: unknown): void {
    el.addEventListener(type, handler, options);
    this.cleanups.push(() => el.removeEventListener(type, handler, options));
  }
}
/**
 * A leaf and a view, small enough to construct a sidebar view under jest (#640). The test hands the
 * leaf its `app` and a `contentEl` (a `DomNode`), and reads back what the view drew there.
 */
export class WorkspaceLeaf {
  view: any = null;
  constructor(public app?: any, public contentEl?: any) { }
  async setViewState(_state: unknown): Promise<void> { }
}
/**
 * Obsidian's Markdown renderer, recorded (#668): a test reads which markdown was rendered, for which
 * source path, and sees it drawn as plain text in the element it was handed.
 */
export class MarkdownRenderer {
  static calls: { markdown: string; sourcePath: string }[] = [];
  static async render(_app: unknown, markdown: string, el: any, sourcePath: string, _component: unknown): Promise<void> {
    MarkdownRenderer.calls.push({ markdown, sourcePath });
    // Obsidian hides a note's properties itself: the renderer is handed the raw note.
    markdown = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    // Each paragraph becomes a <p>; a [[link]] becomes Obsidian's own anchor — a.internal-link with
    // data-href (and is-unresolved when no note answers it), so link handling is tested on that shape.
    const host = el.createDiv?.({ cls: "rendered-markdown" });
    if (!host) return;
    for (const block of markdown.split(/\n\s*\n/)) {
      const p = host.createEl("p");
      const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(block))) {
        if (m.index > last) p.createSpan({ text: block.slice(last, m.index) });
        const unresolved = m[1].startsWith("missing");
        p.createEl("a", {
          cls: unresolved ? "internal-link is-unresolved" : "internal-link",
          text: m[2] ?? m[1],
          attr: { "data-href": m[1], href: m[1] },
        });
        last = m.index + m[0].length;
      }
      if (last < block.length) p.createSpan({ text: block.slice(last) });
    }
  }
}
/**
 * Obsidian's keymap scope, as the real one matches (#667): a handler's modifiers are compared as a
 * whole (`[]` is "none", `null` is "any"), its key case-insensitively. `handleKey` is what
 * Obsidian's window-level keydown calls for the active leaf's view — returning `false` means handled.
 */
export class Scope {
  keys: { modifiers: string | null; key: string | null; func: (evt: any, ctx: any) => any }[] = [];
  constructor(public parent?: Scope) { }
  register(modifiers: string[] | null, key: string | null, func: (evt: any, ctx: any) => any): any {
    const handler = { modifiers: modifiers === null ? null : [...modifiers].sort().join(","), key, func };
    this.keys.push(handler);
    return handler;
  }
  unregister(handler: any): void { this.keys = this.keys.filter((k) => k !== handler); }
  handleKey(evt: any, ctx: { modifiers: string; key: string }): any {
    for (const handler of this.keys) {
      if (handler.modifiers !== null && handler.modifiers !== ctx.modifiers) continue;
      if (handler.key !== null && handler.key.toLowerCase() !== ctx.key.toLowerCase()) continue;
      const result = handler.func(evt, ctx);
      if (result !== undefined || handler.key !== null || handler.modifiers !== null) return result;
    }
    return this.parent?.handleKey(evt, ctx);
  }
}
export class ItemView extends Component {
  app: any;
  containerEl: any;
  contentEl: any;
  scope: Scope | null = null;
  constructor(public leaf: any) {
    super();
    this.app = leaf?.app;
    this.contentEl = leaf?.contentEl;
    this.containerEl = leaf?.contentEl;
    // As in Obsidian, the leaf knows its view — the keymap reaches the view's scope through it.
    if (leaf && typeof leaf === "object") leaf.view = this;
    // Fake-only: what a test drew into can find the view whose keys it presses.
    if (this.contentEl && typeof this.contentEl === "object") this.contentEl.ownerView = this;
  }
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  getIcon(): string { return ""; }
  getState(): Record<string, unknown> { return {}; }
  async setState(_state: unknown, _result: unknown): Promise<void> { }
  setEphemeralState(_state: unknown): void { }
}
export class Modal {
  /** What `setTitle` was given — a test reads the title the user would see. */
  titleText = "";
  constructor(public app?: any) { }
  onOpen(): void { } onClose(): void { }
  open(): void { this.onOpen(); }
  close(): void { this.onClose(); }
  setTitle(title: string): this { this.titleText = title; return this; }
}

/** Obsidian's native context menu, recorded: a test reads the items and clicks one. */
export class MenuItem {
  title = ""; icon = ""; checked = false; disabled = false; warning = false;
  private handler: ((evt: any) => void) | null = null;
  setTitle(title: string): this { this.title = title; return this; }
  setIcon(icon: string): this { this.icon = icon; return this; }
  setChecked(on: boolean): this { this.checked = on; return this; }
  setDisabled(on: boolean): this { this.disabled = on; return this; }
  setWarning(on: boolean): this { this.warning = on; return this; }
  setSection(_section: string): this { return this; }
  onClick(handler: (evt: any) => void): this { this.handler = handler; return this; }
  click(evt: any = {}): void { this.handler?.(evt); }
}
export class Menu {
  /** The menu most recently shown. */
  static last: Menu | null = null;
  items: MenuItem[] = [];
  separators = 0;
  addItem(build: (item: MenuItem) => void): this { const item = new MenuItem(); build(item); this.items.push(item); return this; }
  addSeparator(): this { this.separators++; return this; }
  showAtMouseEvent(_evt: unknown): this { Menu.last = this; return this; }
  showAtPosition(_pos: unknown): this { Menu.last = this; return this; }
  item(title: string): MenuItem {
    const found = this.items.find((item) => item.title === title);
    if (!found) throw new Error(`no menu item "${title}" in [${this.items.map((i) => i.title).join(", ")}]`);
    return found;
  }
}

/** `Keymap.isModEvent`: Ctrl/Meta asks for a new tab, as in Obsidian. */
export const Keymap = {
  isModEvent: (evt?: { ctrlKey?: boolean; metaKey?: boolean } | null): boolean | "tab" =>
    evt?.ctrlKey || evt?.metaKey ? "tab" : false,
};
export class TAbstractFile {
  path = "";
  name = "";
}
export class TFile extends TAbstractFile {
  extension = "md";
  basename = "";
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function getLanguage(): string {
  return "en";
}

// --- Bases API stubs (epic #622) ---------------------------------------------------------------
// The typed `Value` lattice + the Bases view surface, enough for the dashboard boundary tests
// (instanceof + toString/isTruthy). Mirrors obsidian.d.ts @since 1.10.

export class Value {
  toString(): string { return ""; }
  isTruthy(): boolean { return false; }
  renderTo(_el: unknown): void { }
}
export class NotNullValue extends Value { }
export class PrimitiveValue<T> extends NotNullValue {
  constructor(public value: T) { super(); }
  toString(): string { return String(this.value); }
  isTruthy(): boolean { return Boolean(this.value); }
}
export class NumberValue extends PrimitiveValue<number> { }
export class StringValue extends PrimitiveValue<string> { }
export class BooleanValue extends PrimitiveValue<boolean> { }
export class LinkValue extends StringValue { }
export class DateValue extends NotNullValue {
  constructor(public iso: string) { super(); }
  toString(): string { return this.iso; }
  isTruthy(): boolean { return true; }
  dateOnly(): this { return this; }
  relative(): string { return this.iso; }
}
export class ListValue extends NotNullValue {
  constructor(public values: unknown[] = []) { super(); }
  toString(): string { return this.values.join(", "); }
  isTruthy(): boolean { return this.values.length > 0; }
}
export class ObjectValue extends NotNullValue {
  toString(): string { return "[object]"; }
  isTruthy(): boolean { return true; }
}
export class NullValue extends Value {
  static value = new NullValue();
  toString(): string { return ""; }
  isTruthy(): boolean { return false; }
}
export class ErrorValue extends Value {
  constructor(public message = "error") { super(); }
  toString(): string { return this.message; }
  isTruthy(): boolean { return false; }
}

export class QueryController extends Component { }

export class BasesEntry {
  constructor(public file: TFile, private values: Record<string, Value | null> = {}) { }
  getValue(id: string): Value | null { return this.values[id] ?? null; }
}

export class BasesQueryResult {
  constructor(public data: BasesEntry[] = [], private _properties: string[] = []) { }
  get groupedData(): { key: Value | undefined; entries: BasesEntry[]; hasKey: () => boolean }[] {
    return [{ key: undefined, entries: this.data, hasKey: () => false }];
  }
  get properties(): string[] { return this._properties; }
  getSummaryValue(): Value { return NullValue.value; }
}

export class BasesView extends Component {
  type = "";
  app: Record<string, unknown> = {};
  config: unknown = undefined;
  allProperties: string[] = [];
  data: BasesQueryResult | undefined = undefined;
  constructor(_controller?: unknown) { super(); }
  onDataUpdated(): void { }
  createFileForView(): Promise<void> { return Promise.resolve(); }
}

export class SuggestModal<T> {
  constructor(public app?: unknown) { }
  setPlaceholder(_text: string): void { }
  getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: unknown): void { }
  onChooseSuggestion(_value: T): void { }
  open(): void { }
}

export function requireApiVersion(_version: string): boolean {
  return true;
}

// UI-surface stubs — enough for modules that build settings/suggesters to *load* under jest
// (they are never rendered in unit tests). The real classes come from Obsidian at runtime.
export class AbstractInputSuggest<T> {
  constructor(_app?: unknown, _inputEl?: unknown) { }
  getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: unknown): void { }
  selectSuggestion(_value: T): void { }
  setValue(_value: string): this {
    return this;
  }
  onSelect(_cb: unknown): this {
    return this;
  }
}

/**
 * Opt-in capture (#632 tests): with it on, a `Setting` builds real child elements in its container
 * and **runs** the component callbacks with recording fakes, so a test can pick a dropdown option or
 * flip a toggle the way a user would. Off (the default), `Setting` stays the chainable no-op every
 * other suite relies on.
 */
let settingCapture: ((setting: Setting) => void) | null = null;
export function __captureSettings(onSetting: ((setting: Setting) => void) | null): void {
  settingCapture = onSetting;
}

export class FakeDropdown {
  options: [string, string][] = []; value = ""; private cb: ((v: string) => void) | null = null;
  addOption(value: string, label: string): this { this.options.push([value, label]); return this; }
  setValue(value: string): this { this.value = value; return this; }
  getValue(): string { return this.value; }
  onChange(cb: (v: string) => void): this { this.cb = cb; return this; }
  select(value: string): void { this.value = value; this.cb?.(value); }
}
export class FakeText {
  value = ""; placeholder = ""; private cb: ((v: string) => void) | null = null;
  /** The input Obsidian gives a text control: a type, attributes and classes a row may set (#663). */
  inputEl: any = {
    type: "text", attrs: {} as Record<string, string>, classes: new Set<string>(),
    setAttribute(name: string, value: string) { this.attrs[name] = value; },
    addClass(...names: string[]) { for (const name of names) this.classes.add(name); },
  };
  setValue(value: string): this { this.value = value; return this; }
  getValue(): string { return this.value; }
  setPlaceholder(text: string): this { this.placeholder = text; return this; }
  onChange(cb: (v: string) => void): this { this.cb = cb; return this; }
  type(value: string): void { this.value = value; this.cb?.(value); }
}
export class FakeToggle {
  value = false; private cb: ((v: boolean) => void) | null = null;
  /** As Obsidian's: a change of value calls onChange (read from the 1.14.4 ToggleComponent, #659). */
  setValue(on: boolean): this { const changed = this.value !== on; this.value = on; if (changed) this.cb?.(on); return this; }
  getValue(): boolean { return this.value; }
  onChange(cb: (v: boolean) => void): this { this.cb = cb; return this; }
  flip(on = !this.value): void { this.value = on; this.cb?.(on); }
}
export class FakeSearch {
  value = ""; placeholder = "";
  /** The search's input: listeners recorded, so a test can blur it or press Enter in it (#659). */
  inputEl: any = {
    listeners: {} as Record<string, ((event: any) => void)[]>,
    addEventListener(type: string, fn: (event: any) => void) { (this.listeners[type] ??= []).push(fn); },
    fire(type: string, event: any = {}) { for (const fn of this.listeners[type] ?? []) fn(event); },
  };
  private cb: ((v: string) => void) | null = null;
  setValue(value: string): this { this.value = value; return this; }
  getValue(): string { return this.value; }
  setPlaceholder(text: string): this { this.placeholder = text; return this; }
  onChange(cb: (v: string) => void): this { this.cb = cb; return this; }
  type(value: string): void { this.value = value; this.cb?.(value); }
}
/** A slider with the element Obsidian gives it, so a test can drag it (fire "input") or release it. */
export class FakeSlider {
  value = 0; min = 0; max = 100; step = 1; sliderEl: any = null;
  private cb: ((v: number) => void) | null = null;
  setLimits(min: number, max: number, step: number): this { this.min = min; this.max = max; this.step = step; return this; }
  setValue(value: number): this { this.value = value; return this; }
  getValue(): number { return this.value; }
  setDynamicTooltip(): this { return this; }
  onChange(cb: (v: number) => void): this { this.cb = cb; return this; }
  /** Drag: the element's input event, then the release that fires onChange. */
  slide(value: number): void { this.value = value; this.sliderEl?.fire?.("input"); this.cb?.(value); }
}
export class FakeButton {
  text = ""; icon = ""; tooltip = ""; cta = false; private cb: (() => void) | null = null;
  setButtonText(text: string): this { this.text = text; return this; }
  setIcon(icon: string): this { this.icon = icon; return this; }
  setTooltip(tip: string): this { this.tooltip = tip; return this; }
  setCta(): this { this.cta = true; return this; }
  setWarning(): this { return this; }
  setDisabled(): this { return this; }
  onClick(cb: () => void): this { this.cb = cb; return this; }
  click(): void { this.cb?.(); }
}

/**
 * The plugin settings tab (#659): the shape a test needs to construct one. Rendering its definitions
 * the way Obsidian does is test/support/settingsRenderer's job; `update` and `refreshDomState` are
 * replaced by that renderer's.
 */
export class PluginSettingTab {
  containerEl: any = null;
  constructor(public app?: any, public plugin?: any) { }
  getSettingDefinitions(): unknown[] { return []; }
  display(): void { }
  hide(): void { }
  update(): void { }
  refreshDomState(): void { }
  async setControlValue(_key: string, _value: unknown): Promise<void> { }
}

/** Chainable no-op stub of Obsidian's declarative Setting builder (with an opt-in capture above). */
export class Setting {
  name = ""; desc = ""; heading = false;
  settingEl: any; infoEl: any; nameEl: any; descEl: any; controlEl: any;
  dropdowns: FakeDropdown[] = []; texts: FakeText[] = []; toggles: FakeToggle[] = [];
  buttons: FakeButton[] = []; extraButtons: FakeButton[] = [];
  searches: FakeSearch[] = []; sliders: FakeSlider[] = [];
  constructor(containerEl?: any) {
    if (!settingCapture) return;
    this.settingEl = containerEl?.createDiv ? containerEl.createDiv({ cls: "setting-item" }) : undefined;
    // The same anatomy as Obsidian's row: an info column (name + description) and a control column.
    this.infoEl = this.settingEl?.createDiv ? this.settingEl.createDiv({ cls: "setting-item-info" }) : undefined;
    this.nameEl = this.infoEl?.createDiv ? this.infoEl.createDiv({ cls: "setting-item-name" }) : undefined;
    this.descEl = this.infoEl?.createDiv ? this.infoEl.createDiv({ cls: "setting-item-description" }) : undefined;
    this.controlEl = this.settingEl?.createDiv ? this.settingEl.createDiv({ cls: "setting-item-control" }) : undefined;
    settingCapture(this);
  }
  setName(name?: unknown): this {
    if (typeof name === "string") this.name = name;
    return this;
  }
  setDesc(desc?: unknown): this {
    if (typeof desc === "string") this.desc = desc;
    return this;
  }
  setHeading(): this {
    this.heading = true;
    return this;
  }
  setClass(): this {
    return this;
  }
  setDisabled(): this {
    return this;
  }
  addText(build?: (text: FakeText) => void): this {
    if (settingCapture && build) { const text = new FakeText(); build(text); this.texts.push(text); }
    return this;
  }
  addTextArea(): this {
    return this;
  }
  addToggle(build?: (toggle: FakeToggle) => void): this {
    if (settingCapture && build) { const toggle = new FakeToggle(); build(toggle); this.toggles.push(toggle); }
    return this;
  }
  addDropdown(build?: (dropdown: FakeDropdown) => void): this {
    if (settingCapture && build) { const dropdown = new FakeDropdown(); build(dropdown); this.dropdowns.push(dropdown); }
    return this;
  }
  addButton(build?: (button: FakeButton) => void): this {
    if (settingCapture && build) { const button = new FakeButton(); build(button); this.buttons.push(button); }
    return this;
  }
  addExtraButton(build?: (button: FakeButton) => void): this {
    if (settingCapture && build) { const button = new FakeButton(); build(button); this.extraButtons.push(button); }
    return this;
  }
  addSlider(build?: (slider: FakeSlider) => void): this {
    if (settingCapture && build) {
      const slider = new FakeSlider();
      slider.sliderEl = this.controlEl?.createEl ? this.controlEl.createEl("input", { attr: { type: "range" } }) : null;
      build(slider);
      this.sliders.push(slider);
    }
    return this;
  }
  addSearch(build?: (search: FakeSearch) => void): this {
    if (settingCapture && build) { const search = new FakeSearch(); build(search); this.searches.push(search); }
    return this;
  }
  then(): this {
    return this;
  }
}

/** Records the icon on the element (#642), so a test can tell one kind's icon from another's. */
export function setIcon(el: unknown, icon: string): void {
  (el as { setAttribute?: (name: string, value: string) => void } | null)?.setAttribute?.("data-icon", icon);
}

export function setTooltip(_el: unknown, _tooltip: string, _options?: unknown): void { }

/** Mutable platform flags so tests can exercise the desktop/mobile default + the bug-report mapping. */
export const Platform = {
  isMobile: false,
  isAndroidApp: false,
  isIosApp: false,
  isMacOS: false,
  isWin: true,
  isLinux: false,
};

/** The running Obsidian API version (bug-report env, #301). */
export const apiVersion = "1.13.1";

/** Response shape a test can return from a mocked `requestUrl`. */
export interface RequestUrlResponse {
  status: number;
  json: unknown;
  text?: string;
}

// Settable `requestUrl` so AI-provider tests inject a fake without a real network call (#317 E2).
let _requestUrl: (opts: unknown) => Promise<RequestUrlResponse> = async () => ({ status: 200, json: {} });
export function __setRequestUrl(fn: (opts: unknown) => Promise<RequestUrlResponse>): void {
  _requestUrl = fn;
}
export function requestUrl(opts: unknown): Promise<RequestUrlResponse> {
  return _requestUrl(opts);
}
export function request(_opts: unknown): Promise<string> {
  return Promise.resolve("");
}

/**
 * Minimal YAML parser covering the subset ZettelFlow uses:
 *  - flat `key: value` (booleans, numbers, strings, quoted strings)
 *  - one level of nested objects (`key:\n  nested: value`)
 * Not a general YAML engine, but sufficient for FrontmatterService and
 * YamlService tests (isRoot, getZettelFlowSettings, zettelFlowSettings.root).
 */
function parseScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!yaml) return result;
  // An indent stack, so nesting is not limited to one level (#419 declares `satellite.relation.type`).
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: -1, obj: result },
  ];

  for (const rawLine of yaml.split("\n")) {
    if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) continue;
    // Skip YAML list items (arrays not needed for these tests)
    if (rawLine.trimStart().startsWith("-")) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (raw === "") {
      const nested: Record<string, unknown> = {};
      parent[key] = nested;
      stack.push({ indent, obj: nested });
    } else {
      parent[key] = parseScalar(raw);
    }
  }
  return result;
}

/** Minimal counterpart to `parseYaml` — serialises a flat record to `key: value` lines. */
export function stringifyYaml(value: Record<string, unknown>): string {
  if (!value) return "";
  return Object.entries(value)
    .map(([key, val]) => `${key}: ${String(val)}`)
    .join("\n")
    .concat("\n");
}

/** Obsidian's re-exported moment, as small as the views need: relative time and a month name. */
export const moment = (_at?: unknown) => ({ fromNow: () => "3 days ago", format: () => "Sep" });
