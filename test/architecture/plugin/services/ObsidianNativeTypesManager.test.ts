import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { __setMockObsidianApi } from "architecture";
import { ObsidianNativeTypesManager } from "architecture/plugin/services/ObsidianNativeTypesManager";

function wireVault(typesJson: Record<string, string>) {
    const read = jest
        .fn<() => Promise<string>>()
        .mockResolvedValue(JSON.stringify({ types: typesJson }));
    const vault = {
        configDir: ".obsidian",
        adapter: {
            exists: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
            read,
        },
    };
    __setMockObsidianApi({ vault: vault as never });
    return { read, vault };
}

describe("ObsidianNativeTypesManager caching", () => {
    beforeEach(() => {
        ObsidianNativeTypesManager.invalidateTypesCache();
    });

    it("reads types.json only once across repeated getTypes() calls (cache hit)", async () => {
        const { read } = wireVault({ author: "text", rating: "number" });

        await ObsidianNativeTypesManager.getTypes();
        await ObsidianNativeTypesManager.getTypes();
        await ObsidianNativeTypesManager.getTypes();

        expect(read).toHaveBeenCalledTimes(1);
    });

    it("re-reads after the cache is invalidated", async () => {
        const { read } = wireVault({ author: "text" });

        await ObsidianNativeTypesManager.getAllTypes();
        ObsidianNativeTypesManager.invalidateTypesCache();
        await ObsidianNativeTypesManager.getAllTypes();

        expect(read).toHaveBeenCalledTimes(2);
    });

    it("returns a fresh copy so callers mutating the result do not corrupt the cache", async () => {
        wireVault({ author: "text", tags: "multitext" });

        const first = await ObsidianNativeTypesManager.getAllTypes();
        delete first["author"]; // mutate the returned object

        const second = await ObsidianNativeTypesManager.getAllTypes();
        expect(second.author).toBe("text"); // cache untouched
    });

    it("getTypes() strips the unique tags/aliases keys", async () => {
        wireVault({ author: "text", tags: "multitext", aliases: "multitext" });

        const types = await ObsidianNativeTypesManager.getTypes();
        expect(types.author).toBe("text");
        expect(types.tags).toBeUndefined();
        expect(types.aliases).toBeUndefined();
    });
});
