import { describe, it, expect } from "@jest/globals";
import { DEFAULT_SETTINGS } from "config/typing";
import en from "architecture/lang/locale/en";
import es from "architecture/lang/locale/es";
import { WIRED_EVENTS, EVENT_LABEL_KEY } from "architecture/plugin/events/vocabulary";

const SETTINGS_KEYS = [
    // #440 merged the events section into *Your flows*: the triggers list is a fact about your
    // flows, not a section of its own, so the section's heading and intro are gone.
    "settings_events_binding_list_empty",
    "settings_events_binding_remove_tooltip",
    "settings_events_binding_enabled_name",
];

describe("event-driven workflows settings (AC-3, AC-8)", () => {
    it("event-driven execution is OFF by default (AC-3)", () => {
        // #436 retired the global toggle — a flow binds by living in the events folder — but the
        // flag stays, off, as the gate for triggers still sitting in the legacy folder.
        expect(DEFAULT_SETTINGS.events).toBeDefined();
        expect(DEFAULT_SETTINGS.events?.enabled).toBe(false);
    });

    it("defines every event i18n key in both en and es, non-empty (AC-8)", () => {
        const keys = [...SETTINGS_KEYS, ...WIRED_EVENTS.map((event) => EVENT_LABEL_KEY[event])];
        expect(keys.length).toBe(7);
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
