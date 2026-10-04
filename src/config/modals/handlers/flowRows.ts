import { setIcon, setTooltip } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import {
    ASSIGNABLE_ROLES,
    FLOW_ROLE_LABEL_KEY,
    isExclusive,
    type FlowRole,
} from "architecture/plugin/canvas/flowRole";

type LocaleKey = Parameters<typeof t>[0];

/**
 * The flows list, drawn as objects (#661, epic #659) — kept apart from the settings group that
 * mounts it so it can be drawn (and tested) without the modals and services the group reaches.
 */

export interface FlowWithRole {
    path: string;
    role: FlowRole;
}

/** The icon each role wears in the list, so a role reads before its label does (#661). */
export const FLOW_ROLE_ICON: Record<Exclude<FlowRole, "none">, string> = {
    create: "file-plus",
    edit: "pencil",
    folder: "folder",
    event: "zap",
    hook: "webhook",
};

/** What a flow row can do, injected so the list can be drawn and tested without a vault. */
export interface FlowRowActions {
    changeRole(flow: FlowWithRole, role: FlowRole): void;
    removeRole(flow: FlowWithRole): void;
    open(flow: FlowWithRole): void;
}

/**
 * One row per flow, drawn as an object (#661): the role as a coloured tile and its icon, the name,
 * the path, then the role to change, the way to drop an exclusive role, and the way to open it.
 */
export function renderFlowRows(host: HTMLElement, flows: FlowWithRole[], actions: FlowRowActions): void {
    host.empty();
    if (flows.length === 0) {
        host.createDiv({ cls: c("flows-empty"), text: t("settings_flows_empty") });
        return;
    }

    for (const flow of flows) {
        if (flow.role === "none") continue;
        const name = (flow.path.split("/").pop() ?? flow.path).replace(/\.canvas$/, "");
        const row = host.createDiv({ cls: [c("settings-flow"), c(`settings-flow--${flow.role}`)].join(" ") });

        const tile = row.createDiv({ cls: c("settings-flow-tile") });
        setIcon(tile, FLOW_ROLE_ICON[flow.role]);

        const words = row.createDiv({ cls: c("settings-flow-words") });
        words.createDiv({ cls: c("settings-flow-name"), text: name });
        words.createDiv({ cls: c("settings-flow-path"), text: flow.path });

        const select = row.createEl("select", {
            cls: ["dropdown", c("settings-flow-role")].join(" "),
            attr: { "aria-label": t("settings_flows_role_label", name) },
        });
        for (const role of [flow.role, ...ASSIGNABLE_ROLES.filter((other) => other !== flow.role)]) {
            const option = select.createEl("option", { text: t(FLOW_ROLE_LABEL_KEY[role] as LocaleKey) });
            option.value = role;
        }
        select.value = flow.role;
        select.addEventListener("change", () => {
            const chosen = select.value as FlowRole;
            // The list keeps showing the truth until the assignment is confirmed and redraws it.
            select.value = flow.role;
            if (chosen !== flow.role) actions.changeRole(flow, chosen);
        });

        if (isExclusive(flow.role)) {
            const remove = row.createEl("button", {
                cls: ["clickable-icon", c("settings-flow-remove")].join(" "),
                attr: { type: "button", "aria-label": t("flow_role_none") },
            });
            setIcon(remove, "x");
            setTooltip(remove, t("flow_role_none"));
            remove.addEventListener("click", () => actions.removeRole(flow));
        }

        const open = row.createEl("button", {
            cls: ["clickable-icon", c("settings-flow-open")].join(" "),
            attr: { type: "button", "aria-label": t("settings_flows_open") },
        });
        setIcon(open, "external-link");
        setTooltip(open, t("settings_flows_open"));
        open.addEventListener("click", () => actions.open(flow));
    }
}
