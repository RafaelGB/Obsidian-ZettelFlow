import { Completion } from "architecture/components/core";

export const responseHookCompletions: Completion[] = [
    {
        label: "frontmatter",
        type: "object",
        info: "Record of property/value pairs to update/add to the frontmatter",
        detail: "✨ ZettelFlow Hook",
        boost: 1
    },
    {
        label: "removeProperties",
        type: "array",
        info: "Array of properties to delete from the frontmatter",
        detail: "✨ ZettelFlow Hook",
        boost: 1
    }
];