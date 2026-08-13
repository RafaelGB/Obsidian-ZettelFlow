import { describe, it, expect, jest } from "@jest/globals";
import { ConceptualTimeline, TimelineHost } from "architecture/plugin/timeline/ConceptualTimeline";
import type { Snapshot } from "architecture/knowledge/timeline/recordSnapshot";
import { idea } from "../../../actions/knowledge/support/knowledgeFixture";

function fakeHost(enabled: boolean, snapshots: Record<string, Snapshot[]> = {}): TimelineHost & { saveSettings: jest.Mock } {
    return { settings: { timeline: { enabled, snapshots } }, saveSettings: jest.fn() };
}

describe("ConceptualTimeline subsystem (#168, FR-1/FR-4/FR-5, AC-2)", () => {
    it("captures a snapshot into the note's history when enabled", () => {
        const host = fakeHost(true);
        const timeline = ConceptualTimeline.getInstance();
        timeline.init(host);
        timeline.capture(idea("n.md", "fleeting", [], { claims: [{ text: "c1" }] }), 100);
        expect(host.settings.timeline.snapshots["n.md"]).toEqual([{ at: 100, state: "fleeting", claims: ["c1"] }]);
    });

    it("writes nothing when disabled", () => {
        const host = fakeHost(false);
        const timeline = ConceptualTimeline.getInstance();
        timeline.init(host);
        timeline.capture(idea("n.md", "fleeting", [], { claims: [{ text: "c1" }] }), 100);
        expect(host.settings.timeline.snapshots).toEqual({});
    });

    it("does not grow the history on an unchanged capture", () => {
        const host = fakeHost(true, { "n.md": [{ at: 1, state: "fleeting", claims: ["c1"] }] });
        const timeline = ConceptualTimeline.getInstance();
        timeline.init(host);
        timeline.capture(idea("n.md", "fleeting", [], { claims: [{ text: "c1" }] }), 200);
        expect(host.settings.timeline.snapshots["n.md"]).toEqual([{ at: 1, state: "fleeting", claims: ["c1"] }]);
    });

    it("prunes a note's timeline on delete and re-keys it on rename", () => {
        const host = fakeHost(true, { "old.md": [{ at: 1, state: "fleeting", claims: [] }], "keep.md": [{ at: 2, state: "permanent", claims: [] }] });
        const timeline = ConceptualTimeline.getInstance();
        timeline.init(host);
        timeline.rekey("old.md", "new.md");
        expect(host.settings.timeline.snapshots["new.md"]).toEqual([{ at: 1, state: "fleeting", claims: [] }]);
        expect("old.md" in host.settings.timeline.snapshots).toBe(false);
        timeline.prune("keep.md");
        expect("keep.md" in host.settings.timeline.snapshots).toBe(false);
    });

    it("snapshotsFor returns the stored array or [] and flush persists", () => {
        const host = fakeHost(true, { "n.md": [{ at: 1, state: "fleeting", claims: [] }] });
        const timeline = ConceptualTimeline.getInstance();
        timeline.init(host);
        expect(timeline.snapshotsFor("n.md")).toEqual([{ at: 1, state: "fleeting", claims: [] }]);
        expect(timeline.snapshotsFor("missing.md")).toEqual([]);
        timeline.flush();
        expect(host.saveSettings).toHaveBeenCalled();
    });
});
