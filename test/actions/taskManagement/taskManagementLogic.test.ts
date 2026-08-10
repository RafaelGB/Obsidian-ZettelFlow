import { describe, it, expect } from "@jest/globals";
import { rolloverUnfinishedTodos } from "actions/taskManagement/taskManagementLogic";

const join = (...lines: string[]) => lines.join("\n");

describe("rolloverUnfinishedTodos", () => {
    it("collects only the unfinished todos under the rollover header", () => {
        const contents = join(
            "- [ ] before-header",
            "## Tasks",
            "- [ ] a",
            "- [x] done",
            "- [ ] b"
        );
        const { collected } = rolloverUnfinishedTodos(contents, "## Tasks");
        expect(collected).toEqual(["- [ ] a", "- [ ] b"]);
    });

    it("does NOT delete unfinished todos outside the rollover section (regression: data loss)", () => {
        const contents = join("- [ ] before-header", "## Tasks", "- [ ] a");
        const { newContents } = rolloverUnfinishedTodos(contents, "## Tasks");
        expect(newContents).toContain("- [ ] before-header");
        expect(newContents).not.toContain("- [ ] a");
    });

    it("falls back to the whole file when the header is absent", () => {
        const contents = join("- [ ] a", "- [x] done", "- [ ] b");
        const { collected, newContents } = rolloverUnfinishedTodos(contents, "## Tasks");
        expect(collected).toEqual(["- [ ] a", "- [ ] b"]);
        expect(newContents).not.toContain("- [ ] a");
        expect(newContents).not.toContain("- [ ] b");
        expect(newContents).toContain("- [x] done");
    });
});
