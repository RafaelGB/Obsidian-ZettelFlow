import { describe, it, expect, jest } from "@jest/globals";
import { Component } from "obsidian";
import { DomNode } from "../../../../support/dashboardDom";
import { renderEvent, type RowContext } from "architecture/components/core/noteCompanion/storyRows";

const NOW = Date.UTC(2026, 9, 6);

function ctx(): RowContext {
    return {
        app: {
            workspace: { openLinkText: jest.fn(), trigger: jest.fn() },
            vault: { getAbstractFileByPath: () => ({}) },
            metadataCache: {},
        } as never,
        owner: new Component(),
        now: NOW,
        on: jest.fn(),
        forget: jest.fn(),
    };
}

describe("the note's story tells a change of mind as a pair (#679)", () => {
    it("says you changed your mind, with the passage then and what you think now in Think", () => {
        const list = new DomNode("ol");
        renderEvent(
            list as never,
            { at: NOW, kind: "thought", thought: { id: "n", at: NOW, path: "Lab/n.md", revises: "stores changes, not state" } },
            ctx()
        );
        const text = list.textContent;
        expect(text).toContain("Changed your mind");
        expect(list.byClass("note-story-diff")).toHaveLength(1);
        expect(text).toContain("Before");
        expect(text).toContain("stores changes, not state");
        expect(text).toContain("What you think now, in Think");
    });

    it("leaves an ordinary highlight row as it was", () => {
        const list = new DomNode("ol");
        renderEvent(
            list as never,
            { at: NOW, kind: "thought", thought: { id: "h", at: NOW, path: "Lab/h.md", quote: "stores changes" } },
            ctx()
        );
        expect(list.textContent).toContain("Highlight");
        expect(list.byClass("note-story-diff")).toHaveLength(0);
    });
});
