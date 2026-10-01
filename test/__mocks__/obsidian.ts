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
export class Modal {
  constructor(public app?: any) { }
  onOpen(): void { } onClose(): void { }
  open(): void { this.onOpen(); }
  close(): void { this.onClose(); }
}
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

/** Chainable no-op stub of Obsidian's declarative Setting builder. */
export class Setting {
  constructor(_containerEl?: unknown) { }
  setName(): this {
    return this;
  }
  setDesc(): this {
    return this;
  }
  setHeading(): this {
    return this;
  }
  setClass(): this {
    return this;
  }
  setDisabled(): this {
    return this;
  }
  addText(): this {
    return this;
  }
  addTextArea(): this {
    return this;
  }
  addToggle(): this {
    return this;
  }
  addDropdown(): this {
    return this;
  }
  addButton(): this {
    return this;
  }
  addExtraButton(): this {
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
