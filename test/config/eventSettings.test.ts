import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { WIRED_EVENTS, EVENT_LABEL_KEY } from "architecture/plugin/events/vocabulary";

const SETTINGS_KEYS = [
    "settings_events_heading",
    "settings_events_intro",
    "settings_events_enable_name",
    "settings_events_enable_desc",
    "settings_events_binding_list_empty",
    "settings_events_binding_remove_tooltip",
    "settings_events_binding_enabled_name",
];

describe("event-driven workflows settings (AC-3, AC-8)", () => {
    it("event-driven execution is OFF by default (AC-3)", () => {
        expect(DEFAULT_SETTINGS.events).toBeDefined();
        expect(DEFAULT_SETTINGS.events?.enabled).toBe(false);
    });

    it("defines all 11 new i18n keys in both en and es, non-empty (AC-8)", () => {
        const keys = [...SETTINGS_KEYS, ...WIRED_EVENTS.map((event) => EVENT_LABEL_KEY[event])];
        expect(keys.length).toBe(11);
        const enMap = en as Record<string, string>;
        const esMap = es as Record<string, string>;
        for (const key of keys) {
            expect(typeof enMap[key]).toBe("string");
            expect(enMap[key].length).toBeGreaterThan(0);
            expect(typeof esMap[key]).toBe("string");
            expect(esMap[key].length).toBeGreaterThan(0);
        }
    });
});
