/**
 * The transform engine (pure, Obsidian-free). Applies an ordered pipeline over a snapshot's rows
 * and returns a new derived snapshot. Every produced field is virtual — in memory only, never
 * written to a note (§XII). Reuses `dashboards/panels.aggregate` for reductions (subtraction).
 */
import { aggregate, type AggregateFn } from "dashboards/panels";
import type { DataStoreSnapshot, FieldType, Row, SchemaField, TaggedCell } from "dashboards/datastore";
import type { CalcOp, FilterOp, TransformStep } from "./types";

interface Table {
    fields: SchemaField[];
    rows: Row[];
}

function fmt(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}
function numberCell(value: number): TaggedCell {
    return { kind: "number", display: fmt(value), raw: value };
}
function categoryCell(value: string): TaggedCell {
    return { kind: "category", display: value, raw: value };
}
function numOf(cell: TaggedCell | undefined): number | null {
    return cell && typeof cell.raw === "number" ? cell.raw : null;
}
function withField(fields: SchemaField[], id: string, name: string, type: FieldType): SchemaField[] {
    const rest = fields.filter((field) => field.id !== id);
    return [...rest, { id, name, type }];
}

const DAY_MS = 86_400_000;

/** A local `YYYY-MM-DD` — the same day key a date cell's raw value starts with. */
function dayKey(time: number): string {
    const d = new Date(time);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A date cell's day key, or null when the cell is not a date. */
function dateOf(cell: TaggedCell | undefined): string | null {
    return cell?.kind === "date" && typeof cell.raw === "string" && cell.raw.length >= 10 ? cell.raw.slice(0, 10) : null;
}

function compare(cell: TaggedCell | undefined, op: FilterOp, value: string | undefined, now: number): boolean {
    const display = cell?.display ?? "";
    const target = value ?? "";
    const num = numOf(cell);
    const targetNum = Number(target);
    const numeric = num !== null && target !== "" && !Number.isNaN(targetNum);
    // Dates order as their day keys: `> 2026-01-01` works the way it reads.
    const day = dateOf(cell);
    const targetDay = /^\d{4}-\d{2}-\d{2}/.test(target) ? target.slice(0, 10) : null;
    const dated = day !== null && targetDay !== null;
    switch (op) {
        case "eq":
            return display === target;
        case "neq":
            return display !== target;
        case "contains":
            return display.toLowerCase().includes(target.toLowerCase());
        case "gt":
            return dated ? day > targetDay : numeric && num > targetNum;
        case "gte":
            return dated ? day >= targetDay : numeric && num >= targetNum;
        case "lt":
            return dated ? day < targetDay : numeric && num < targetNum;
        case "lte":
            return dated ? day <= targetDay : numeric && num <= targetNum;
        case "lastDays": {
            const days = Math.floor(targetNum);
            if (day === null || !Number.isFinite(days) || days < 1) return false;
            return day >= dayKey(now - (days - 1) * DAY_MS) && day <= dayKey(now);
        }
    }
}

function calc(left: number, op: CalcOp, right: number): number {
    switch (op) {
        case "add":
            return left + right;
        case "sub":
            return left - right;
        case "mul":
            return left * right;
        case "div":
            return right === 0 ? 0 : left / right;
    }
}

function applyStep(table: Table, step: TransformStep, now: number): Table {
    switch (step.type) {
        case "filter": {
            if (!step.field || !step.op) return table;
            const op = step.op as FilterOp;
            return { fields: table.fields, rows: table.rows.filter((row) => compare(row[step.field as string], op, step.value, now)) };
        }
        case "sort": {
            if (!step.field) return table;
            const field = step.field;
            const dir = step.direction === "desc" ? -1 : 1;
            const rows = [...table.rows].sort((a, b) => {
                const an = numOf(a[field]);
                const bn = numOf(b[field]);
                if (an !== null && bn !== null) return (an - bn) * dir;
                return (a[field]?.display ?? "").localeCompare(b[field]?.display ?? "") * dir;
            });
            return { fields: table.fields, rows };
        }
        case "groupBy": {
            if (!step.field) return table;
            const groupField = step.field;
            const valueField = step.field2;
            const fn: AggregateFn = step.aggregate ?? "count";
            const groups = new Map<string, Row[]>();
            const order: string[] = [];
            for (const row of table.rows) {
                const key = row[groupField]?.display ?? "";
                if (!groups.has(key)) {
                    groups.set(key, []);
                    order.push(key);
                }
                groups.get(key)?.push(row);
            }
            const valueId = valueField ?? "value";
            const rows: Row[] = order.map((key) => ({
                [groupField]: categoryCell(key),
                [valueId]: numberCell(aggregate(groups.get(key) ?? [], valueField, fn)),
            }));
            const fields = [
                { id: groupField, name: groupField, type: "category" as FieldType },
                { id: valueId, name: valueId, type: "number" as FieldType },
            ];
            return { fields, rows };
        }
        case "aggregate": {
            if (!step.field) return table;
            const fn: AggregateFn = step.aggregate ?? "sum";
            const id = step.newField ?? step.field;
            return {
                fields: [{ id, name: id, type: "number" }],
                rows: [{ [id]: numberCell(aggregate(table.rows, step.field, fn)) }],
            };
        }
        case "bin": {
            if (!step.field) return table;
            const size = Number(step.value) || 1;
            const id = step.newField ?? `${step.field}_bin`;
            const rows = table.rows.map((row) => {
                const value = numOf(row[step.field as string]);
                if (value === null) return row;
                const low = Math.floor(value / size) * size;
                return { ...row, [id]: categoryCell(`${fmt(low)}–${fmt(low + size)}`) };
            });
            return { fields: withField(table.fields, id, id, "category"), rows };
        }
        case "calculate": {
            if (!step.field || !step.op) return table;
            const op = step.op as CalcOp;
            const id = step.newField ?? "calc";
            const constant = Number(step.value);
            const rows = table.rows.map((row) => {
                const left = numOf(row[step.field as string]);
                const right = step.field2 ? numOf(row[step.field2]) : constant;
                if (left === null || right === null || Number.isNaN(right)) return row;
                return { ...row, [id]: numberCell(calc(left, op, right)) };
            });
            return { fields: withField(table.fields, id, id, "number"), rows };
        }
        case "normalize": {
            if (!step.field) return table;
            const field = step.field;
            const values = table.rows.map((row) => numOf(row[field])).filter((v): v is number => v !== null);
            if (values.length === 0) return table;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const span = max - min;
            const rows = table.rows.map((row) => {
                const value = numOf(row[field]);
                if (value === null) return row;
                return { ...row, [field]: numberCell(span === 0 ? 0 : (value - min) / span) };
            });
            return { fields: table.fields, rows };
        }
        case "movingAverage": {
            if (!step.field) return table;
            const window = Math.max(1, Number(step.value) || 3);
            const id = step.newField ?? `${step.field}_ma`;
            const buffer: number[] = [];
            const rows = table.rows.map((row) => {
                const value = numOf(row[step.field as string]);
                if (value !== null) {
                    buffer.push(value);
                    if (buffer.length > window) buffer.shift();
                }
                const average = buffer.length ? buffer.reduce((a, b) => a + b, 0) / buffer.length : 0;
                return { ...row, [id]: numberCell(average) };
            });
            return { fields: withField(table.fields, id, id, "number"), rows };
        }
        case "cumulative": {
            if (!step.field) return table;
            const id = step.newField ?? `${step.field}_cum`;
            let running = 0;
            const rows = table.rows.map((row) => {
                const value = numOf(row[step.field as string]);
                if (value !== null) running += value;
                return { ...row, [id]: numberCell(running) };
            });
            return { fields: withField(table.fields, id, id, "number"), rows };
        }
    }
}

/**
 * The fields a pipeline yields, computed from the schema alone (no rows). Lets the config form offer
 * virtual fields (a `calculate` output, a `groupBy` value) in its channel pickers without data.
 */
export function effectiveFields(fields: SchemaField[], steps: TransformStep[]): SchemaField[] {
    let current = fields;
    for (const step of steps) {
        switch (step.type) {
            case "groupBy": {
                if (!step.field) break;
                const valueId = step.field2 ?? "value";
                current = [
                    { id: step.field, name: step.field, type: "category" },
                    { id: valueId, name: valueId, type: "number" },
                ];
                break;
            }
            case "aggregate": {
                if (!step.field) break;
                const id = step.newField ?? step.field;
                current = [{ id, name: id, type: "number" }];
                break;
            }
            case "bin": {
                if (!step.field) break;
                const id = step.newField ?? `${step.field}_bin`;
                current = withField(current, id, id, "category");
                break;
            }
            case "calculate": {
                const id = step.newField ?? "calc";
                current = withField(current, id, id, "number");
                break;
            }
            case "movingAverage": {
                if (!step.field) break;
                const id = step.newField ?? `${step.field}_ma`;
                current = withField(current, id, id, "number");
                break;
            }
            case "cumulative": {
                if (!step.field) break;
                const id = step.newField ?? `${step.field}_cum`;
                current = withField(current, id, id, "number");
                break;
            }
            default:
                break; // filter / sort / normalize leave the field set unchanged
        }
    }
    return current;
}

/** `now` is injectable so a relative filter ("last 7 days") is testable; it defaults to the clock. */
export function applyTransforms(snapshot: DataStoreSnapshot, steps: TransformStep[], now: number = Date.now()): DataStoreSnapshot {
    if (!steps || steps.length === 0) return snapshot;
    let table: Table = { fields: snapshot.schema.fields, rows: snapshot.rows };
    for (const step of steps) table = applyStep(table, step, now);
    const byId: Record<string, SchemaField> = {};
    for (const field of table.fields) byId[field.id] = field;
    return {
        schema: { fields: table.fields, byId },
        rows: table.rows,
        indexes: {},
        rowCount: table.rows.length,
        signature: `${snapshot.signature}|t${steps.length}`,
    };
}
