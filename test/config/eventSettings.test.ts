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
    it("event-driven execution is opt-in, one flow at a time (AC-3)", () => {
        // The master switch is gone (3.4, breaking): a flow reacts to events because it lives in
        // the events folder, and a fresh install has no such folder contents at all. The default
        // is therefore "nothing fires", expressed as a home rather than as a boolean.
        expect(DEFAULT_SETTINGS.eventFlowsPath).toBe("_ZettelFlow/events");
        expect("events" in DEFAULT_SETTINGS).toBe(false);
    });

    it("defines every event i18n key in both en and es, non-empty (AC-8)", () => {
        const keys = [...SETTINGS_KEYS, ...WIRED_EVENTS.map((event) => EVENT_LABEL_KEY[event])];
        // Five wired events since #563 wired `review.due`, plus the three settings strings.
        expect(keys.length).toBe(8);
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
