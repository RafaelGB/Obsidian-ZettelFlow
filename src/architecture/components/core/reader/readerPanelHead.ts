import { setIcon, setTooltip, type Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";

type LocaleKey = Parameters<typeof t>[0];

/** A side panel's own way out (#777): its name, and what closing it does. */
export interface PanelClose {
    label: LocaleKey;
    onClose(): void;
    scope: Component;
}

/**
 * The × at the end of a panel's head row (#777 FR-1): the panel closes from the panel, so the
 * Reader's own exit is never the nearest thing that looks like it.
 */
export function panelClose(parent: HTMLElement, close: PanelClose): HTMLElement {
    const button = parent.createEl("button", {
        cls: ["clickable-icon", c("reader-panel-close")].join(" "),
        attr: { type: "button", "aria-label": t(close.label) },
    });
    setIcon(button, "x");
    setTooltip(button, t(close.label), { placement: "bottom" });
    close.scope.registerDomEvent(button, "click", () => close.onClose());
    return button;
}

/** A panel's head row: its title, and its × when it has one. */
export function panelHead(host: HTMLElement, title: LocaleKey, close?: PanelClose): HTMLElement {
    const head = host.createDiv({ cls: c("reader-panel-head") });
    head.createDiv({ cls: c("reader-panel-title"), text: t(title) });
    if (close) panelClose(head, close);
    return head;
}
