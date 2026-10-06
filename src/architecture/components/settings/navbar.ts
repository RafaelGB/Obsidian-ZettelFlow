import { c } from "architecture";
import { Action } from "architecture/api";
import { t } from "architecture/lang";
import { CommunityAction } from "config";
import { Notice, setIcon } from "obsidian";
import { ActionBuilderMapper } from "zettelkasten";
import { AbstractStepModal } from "zettelkasten/modals/AbstractStepModal";
import { InstalledActionEditorModal } from "zettelkasten/modals/InstalledActionEditorModal";

/**
 * The head of an action's settings form (#685): one line saying what the action does, and two
 * quiet, named controls — copy it, save it as a template.
 *
 * Inside a step the action's card already carries its name, so the form no longer opens with a
 * second `h2` and a navbar of accent icons nested in the first one. Where the form stands alone —
 * the installed-action editor passes `disableNavbar` — the name is the form's only title, so it is
 * kept, as a heading, and the controls are not offered.
 */
export function navbarAction(
    contentEl: HTMLElement,
    name: string,
    description: string,
    action: Action,
    modal: AbstractStepModal,
    disableNavbar: boolean = false
): void {
    const head = contentEl.createDiv({ cls: c("action-settings-head") });
    if (disableNavbar) head.createEl("h3", { cls: c("action-settings-title"), text: name });
    head.createEl("p", { cls: c("action-settings-description"), text: description });

    if (disableNavbar) return;

    const controls = head.createDiv({ cls: c("action-settings-controls") });

    const copy = controls.createEl("button", {
        cls: "clickable-icon",
        attr: { type: "button", "aria-label": t("step_builder_action_copy") },
    });
    setIcon(copy, "copy");
    copy.addEventListener("click", () => {
        void (async () => {
            const communityAction: CommunityAction = {
                ...action,
                template_type: "action",
                author: t("step_template_default_author"),
                title: t("step_template_default_title"),
                description: action.description || t("step_template_default_description"),
            };
            void navigator.clipboard.writeText(JSON.stringify(communityAction, null, 2));
            modal.getPlugin().settings.communitySettings.clipboardTemplate = communityAction;
            await modal.getPlugin().saveSettings();
            new Notice(t("step_builder_action_copied"));
        })();
    });

    const save = controls.createEl("button", {
        cls: "clickable-icon",
        attr: { type: "button", "aria-label": t("step_builder_action_save_template") },
    });
    setIcon(save, "bookmark-plus");
    save.addEventListener("click", () => {
        const template = ActionBuilderMapper.Action2CommunityActionSettings(action, {
            title: t("step_template_default_title"),
            description: t("step_template_default_description"),
        });
        modal.getPlugin().settings.installedTemplates.actions[template.id] = template;
        void modal.getPlugin().saveSettings();
        new InstalledActionEditorModal(modal.getPlugin(), template).open();
    });
}
