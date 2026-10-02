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
  registerDomEvent(el: any, type: string, handler: (event: any) => void): void {
    el.addEventListener(type, handler);
    this.cleanups.push(() => el.removeEventListener(type, handler));
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
export class ItemView extends Component {
  app: any;
  containerEl: any;
  contentEl: any;
  constructor(public leaf: any) {
    super();
    this.app = leaf?.app;
    this.contentEl = leaf?.contentEl;
    this.containerEl = leaf?.contentEl;
  }
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  getIcon(): string { return ""; }
  getState(): Record<string, unknown> { return {}; }
  async setState(_state: unknown, _result: unknown): Promise<void> { }
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
  setValue(value: string): this { this.value = value; return this; }
  getValue(): string { return this.value; }
  setPlaceholder(text: string): this { this.placeholder = text; return this; }
  onChange(cb: (v: string) => void): this { this.cb = cb; return this; }
  type(value: string): void { this.value = value; this.cb?.(value); }
}
export class FakeToggle {
  value = false; private cb: ((v: boolean) => void) | null = null;
  setValue(on: boolean): this { this.value = on; return this; }
  getValue(): boolean { return this.value; }
  onChange(cb: (v: boolean) => void): this { this.cb = cb; return this; }
  flip(on = !this.value): void { this.value = on; this.cb?.(on); }
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

/** Chainable no-op stub of Obsidian's declarative Setting builder (with an opt-in capture above). */
export class Setting {
  name = ""; desc = ""; heading = false;
  settingEl: any; controlEl: any;
  dropdowns: FakeDropdown[] = []; texts: FakeText[] = []; toggles: FakeToggle[] = [];
  buttons: FakeButton[] = []; extraButtons: FakeButton[] = [];
  constructor(containerEl?: any) {
    if (!settingCapture) return;
    this.settingEl = containerEl?.createDiv ? containerEl.createDiv({ cls: "setting-item" }) : undefined;
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
  addSlider(): this {
    return this;
  }
  then(): this {
    return this;
  }
}

export function setIcon(_el: unknown, _icon: string): void { }

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
