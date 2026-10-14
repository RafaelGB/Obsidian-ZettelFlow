import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { setIcon } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import type { CommunityAction, CommunityStepSettings } from "config";
import type ZettelFlow from "main";
import { ContributeTab } from "../components/ContributeTab";
import { InstalledTemplatesManagement } from "../components/InstalledTemplatesManagement";
import type { RoomHandle, RoomRenderer, RoomRenderers } from "./communityRoomHost";

/**
 * **Interim** (#798 FR-8): until S5 and S6 replace them one room at a time, each room hosts the
 * panel it hosted in the modal, so no capability is lost while the shell changes. Systems is native
 * since #799 (`systemsRoom.ts`), Learn since #801 (`learnRoom.ts`). S6 deletes this file, and with
 * it the last React root the Community view mounts.
 */
function reactRoom(draw: (plugin: ZettelFlow) => React.ReactElement): RoomRenderer {
    return {
        mount(el, host) {
            const body = el.createDiv({ cls: c("community-room-body") });
            const root = createRoot(body);
            root.render(draw(host.plugin));
            return { dispose: () => root.unmount() };
        },
    };
}

/** Installed: today's management, with the clipboard import the manage-installed modal carried. */
const installedRoom: RoomRenderer = {
    mount(el, host): RoomHandle {
        const { plugin } = host;
        const body = el.createDiv({ cls: c("community-room-body") });
        let root: Root | null = null;
        const draw = () => {
            root?.unmount();
            body.empty();
            const saved = plugin.settings.communitySettings.clipboardTemplate;
            if (saved) {
                const bar = body.createDiv({ cls: c("community-installed-bar") });
                const button = bar.createEl("button", { cls: "mod-cta", attr: { type: "button" } });
                setIcon(button.createSpan({ cls: c("community-installed-bar-icon") }), "clipboard-paste");
                button.createSpan({ text: t("community_installed_from_clipboard") });
                button.addEventListener("click", () => {
                    if (saved.template_type === "step") {
                        plugin.settings.installedTemplates.steps[saved.id] = saved as CommunityStepSettings;
                    } else if (saved.template_type === "action") {
                        plugin.settings.installedTemplates.actions[saved.id] = saved as CommunityAction;
                    }
                    delete plugin.settings.communitySettings.clipboardTemplate;
                    void plugin.saveSettings();
                    draw();
                });
            }
            root = createRoot(body.createDiv());
            root.render(<InstalledTemplatesManagement plugin={plugin} />);
        };
        draw();
        return {
            count: () => {
                const { steps, actions } = plugin.settings.installedTemplates;
                return Object.keys(steps).length + Object.keys(actions).length;
            },
            dispose: () => root?.unmount(),
        };
    },
};

export const LEGACY_ROOMS: Omit<RoomRenderers, "systems" | "learn"> = {
    contribute: reactRoom((plugin) => <ContributeTab plugin={plugin} />),
    installed: installedRoom,
};
