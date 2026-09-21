import { Notice } from "obsidian";
import { c } from "architecture/styles/helper";
import { t } from "architecture/lang";
import { filterWrites, touchedProperties } from "application/writes/vaultWriteLog";
import { offerState, UNDO_OFFER_MS, worthOffering } from "application/writes/undoOffer";
import { hasWork, planUndo } from "application/writes/undoPlan";
import { applyUndo, obsidianUndoVault, readVaultFacts, rememberUndone } from "./applyUndo";
import { bufferedWrites } from "./recordVaultWrite";

/**
 * The undo a hook's change carries with it (#455, epic #451).
 *
 * A notice, not a modal: ignoring it is the normal case, and a hook that stops your typing to ask
 * about a property is worse than the property. It lives for thirty seconds and then goes quietly —
 * no second notice, no badge, no counter. The same undo is still in the record afterwards.
 */
export function offerUndo(batch: string, notePath: string): void {
    const writes = filterWrites(bufferedWrites(), { batch });
    if (!worthOffering(writes)) return;

    const properties = [...new Set(writes.flatMap(touchedProperties))];
    const name = notePath.split("/").pop() ?? notePath;
    const offeredAt = Date.now();

    const notice = new Notice("", UNDO_OFFER_MS);
    const fragment = createFragment();
    const wrapper = fragment.createDiv({ cls: c("undo-offer") });
    // Says what changed, not just that something did — a notice you cannot read is a notice.
    wrapper.createDiv({
        cls: c("undo-offer-what"),
        text:
            properties.length > 0
                ? t("undo_offer_properties", properties.join(", "), name)
                : t("undo_offer_changed", name),
    });
    const button = wrapper.createEl("button", {
        cls: c("undo-offer-button"),
        text: t("changes_undo"),
        attr: { type: "button" },
    });
    button.addEventListener("click", () => {
        notice.hide();
        if (offerState(offeredAt, Date.now()) === "expired") return;
        void takeItBack(batch);
    });
    notice.setMessage(fragment);
}

async function takeItBack(batch: string): Promise<void> {
    const writes = filterWrites(bufferedWrites(), { batch });
    const plan = planUndo(writes, readVaultFacts(writes));
    if (!hasWork(plan)) {
        new Notice(t("changes_nothing_to_undo"));
        return;
    }
    const outcome = await applyUndo(plan, obsidianUndoVault);
    if (outcome.failed.length === 0 && plan.possible) rememberUndone(batch, Date.now());
    new Notice(
        outcome.failed.length > 0
            ? t("changes_undo_partial_done", String(outcome.done), outcome.failed.join(", "))
            : t("changes_undo_done", String(outcome.done))
    );
}
