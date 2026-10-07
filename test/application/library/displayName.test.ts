import { describe, it, expect } from "@jest/globals";
import { displayName } from "application/library/displayName";

const library = {
    "Books/dokumen_pub_a_philosophy_of_software_design_2nd_edition_2nbsped.epub": {
        size: 1,
        mtime: 1,
        title: "A Philosophy of Software Design, 2nd Edition",
    },
};

describe("displayName — what a row calls a note or a source", () => {
    it("calls a book by the title the Library read from it, not its file name", () => {
        // Think and Home showed `about dokumen_pub_…_2nbsped.epub`, and it ran out of its card.
        expect(displayName("Books/dokumen_pub_a_philosophy_of_software_design_2nd_edition_2nbsped.epub", library)).toBe(
            "A Philosophy of Software Design, 2nd Edition"
        );
    });

    it("drops the folders and the extension otherwise", () => {
        expect(displayName("Papers/Manual de desarrollo.pdf", library)).toBe("Manual de desarrollo");
        expect(displayName("Notes/Event sourcing.md", undefined)).toBe("Event sourcing");
        expect(displayName("Plain", undefined)).toBe("Plain");
    });
});
