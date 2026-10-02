/** Table panel (pure): columns + display rows over the snapshot, and a pure sort. Epic #622, S4. */
import { rowPath, type DataStoreSnapshot } from "dashboards/datastore";
import type { PanelConfig } from "../types";

export interface TableColumn {
    id: string;
    name: string;
}

export interface TableModel {
    columns: TableColumn[];
    rows: string[][];
    /** The note each row came from (parallel to `rows`) — what a click on the row opens. */
    paths: (string | undefined)[];
}

export function buildTable(snapshot: DataStoreSnapshot, config: PanelConfig): TableModel {
    const ids =
        config.mapping.columns && config.mapping.columns.length > 0
            ? config.mapping.columns
            : snapshot.schema.fields.map((field) => field.id);
    const columns = ids.map((id) => ({ id, name: snapshot.schema.byId[id]?.name ?? id }));
    const rows = snapshot.rows.map((row) => columns.map((col) => row[col.id]?.display ?? ""));
    return { columns, rows, paths: snapshot.rows.map(rowPath) };
}

/** Sort rows by a column — numeric when both cells parse as numbers, else locale string. Pure. */
export function sortTable(model: TableModel, columnIndex: number, dir: 1 | -1): TableModel {
    if (columnIndex < 0 || columnIndex >= model.columns.length) return model;
    const order = model.rows.map((_, index) => index).sort((ai, bi) => {
        const av = model.rows[ai][columnIndex] ?? "";
        const bv = model.rows[bi][columnIndex] ?? "";
        const an = Number(av);
        const bn = Number(bv);
        const cmp =
            av !== "" && bv !== "" && !Number.isNaN(an) && !Number.isNaN(bn)
                ? an - bn
                : av.localeCompare(bv);
        return cmp * dir;
    });
    return {
        columns: model.columns,
        rows: order.map((index) => model.rows[index]),
        paths: order.map((index) => model.paths[index]),
    };
}
