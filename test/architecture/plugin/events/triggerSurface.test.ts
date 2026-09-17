import { describe, it, expect } from "@jest/globals";
import { triggerSurface } from "architecture/plugin/events/triggerSurface";
import type { FlowRole } from "architecture/plugin/canvas/flowRole";

const OTHER_ROLES: FlowRole[] = ["create", "edit", "folder", "hook", "none"];

describe("a trigger is offered where it can fire (#436)", () => {
    it("gives the root of an event flow the whole section", () => {
        expect(triggerSurface({ role: "event", isRoot: true, hasTrigger: false })).toBe("full");
        expect(triggerSurface({ role: "event", isRoot: true, hasTrigger: true })).toBe("full");
    });

    it("tells a non-root step of an event flow that the start owns it", () => {
        expect(triggerSurface({ role: "event", isRoot: false, hasTrigger: false })).toBe("make-root");
    });

    it("offers nothing on a canvas that is not an event flow", () => {
        for (const role of OTHER_ROLES) {
            expect(triggerSurface({ role, isRoot: true, hasTrigger: false })).toBe("none");
            expect(triggerSurface({ role, isRoot: false, hasTrigger: false })).toBe("none");
        }
    });

    it("never hides a trigger someone already wrote", () => {
        for (const role of OTHER_ROLES) {
            expect(triggerSurface({ role, isRoot: true, hasTrigger: true })).toBe("orphan");
            expect(triggerSurface({ role, isRoot: false, hasTrigger: true })).toBe("orphan");
        }
        expect(triggerSurface({ role: "event", isRoot: false, hasTrigger: true })).toBe("orphan");
    });

    it("keeps the offer on a step note, where the canvas cannot be known", () => {
        // A step note can be the root of an event flow we cannot see from the file menu, so the
        // rule that applies is the one the engine also checks: the root's.
        expect(triggerSurface({ role: "unknown", isRoot: true, hasTrigger: false })).toBe("full");
        expect(triggerSurface({ role: "unknown", isRoot: false, hasTrigger: false })).toBe("none");
        expect(triggerSurface({ role: "unknown", isRoot: false, hasTrigger: true })).toBe("orphan");
    });
});
