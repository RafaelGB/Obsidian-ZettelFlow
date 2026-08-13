import { describe, it, expect } from "@jest/globals";
import {
    WORKFLOW_EVENTS,
    WIRED_EVENTS,
    isWorkflowEvent,
    isWiredEvent,
    EVENT_LABEL_KEY,
} from "architecture/plugin/events/vocabulary";

describe("workflow-trigger event vocabulary (FR-1)", () => {
    it("WORKFLOW_EVENTS is exactly the eight closed tokens", () => {
        expect([...WORKFLOW_EVENTS]).toEqual([
            "note.created",
            "note.modified",
            "note.linked",
            "note.unlinked",
            "property.changed",
            "tag.added",
            "workflow.completed",
            "review.due",
        ]);
    });

    it("WIRED_EVENTS is exactly the four v1 tokens (deferred four excluded)", () => {
        expect([...WIRED_EVENTS]).toEqual([
            "note.created",
            "note.modified",
            "property.changed",
            "tag.added",
        ]);
        for (const deferred of [
            "note.linked",
            "note.unlinked",
            "workflow.completed",
            "review.due",
        ]) {
            expect(WIRED_EVENTS as readonly string[]).not.toContain(deferred);
        }
    });

    it("isWorkflowEvent accepts the eight tokens and rejects junk", () => {
        for (const event of WORKFLOW_EVENTS) expect(isWorkflowEvent(event)).toBe(true);
        for (const junk of ["", "note", "foo.bar", 42, null, undefined, {}]) {
            expect(isWorkflowEvent(junk)).toBe(false);
        }
    });

    it("isWiredEvent accepts the four wired and rejects deferred + junk", () => {
        for (const event of WIRED_EVENTS) expect(isWiredEvent(event)).toBe(true);
        for (const notWired of ["note.linked", "review.due", "workflow.completed", "foo", null]) {
            expect(isWiredEvent(notWired)).toBe(false);
        }
    });

    it("EVENT_LABEL_KEY has an i18n key for every wired event", () => {
        for (const event of WIRED_EVENTS) {
            expect(typeof EVENT_LABEL_KEY[event]).toBe("string");
            expect(EVENT_LABEL_KEY[event].length).toBeGreaterThan(0);
        }
    });
});
