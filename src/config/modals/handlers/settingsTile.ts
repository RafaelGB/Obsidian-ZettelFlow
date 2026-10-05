import { setIcon, type Setting } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { descContainer } from "architecture/components/settings/settingContainer";

type LocaleKey = Parameters<typeof t>[0];

/**
 * Draw a row as a tile of a tile grid (#662): the name, what it does, its switch, and — for the
 * privacy tiles — a lock line that says exactly what is stored. Still a declarative row with its own
 * name, so Obsidian's settings search finds it.
 */
export function asTile(setting: Setting, lockKey?: LocaleKey): void {
    setting.settingEl.addClass(c("settings-tile"));
    if (!lockKey) return;
    const lock = descContainer(setting, "settings-lock-line");
    setIcon(lock.createSpan({ cls: c("settings-lock-icon") }), "lock");
    lock.createSpan({ text: t(lockKey) });
}
