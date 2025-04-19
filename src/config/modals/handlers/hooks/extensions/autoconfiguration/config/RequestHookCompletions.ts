import { Completion } from "architecture/components/core";

export const requestHookCompletions: Completion[] = [
    {
        label: "oldValue",
        type: "property",
        info: "The previous value of the changed property",
        detail: "✨ ZettelFlow Hook",
        boost: 1
    },
    {
        label: "newValue",
        type: "property",
        info: "The new value of the property",
        detail: "✨ ZettelFlow Hook",
        boost: 1
    },
    {
        label: "property",
        type: "property",
        info: "The name of the property that changed",
        detail: "✨ ZettelFlow Hook",
        boost: 2
    }
];