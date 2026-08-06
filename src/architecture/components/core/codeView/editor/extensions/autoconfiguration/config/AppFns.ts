// Curated members of Obsidian's `app` object, surfaced when the user types `app.` in a script.
// These are the entry points scripts most commonly reach for; deeper members fall through to the
// editor's default JavaScript completion.
export const appCompletions = [
    { label: 'vault', type: 'object', info: 'app.vault: Vault => read/create/modify files and folders' },
    { label: 'workspace', type: 'object', info: 'app.workspace: Workspace => active leaf, open files, layout' },
    { label: 'metadataCache', type: 'object', info: 'app.metadataCache: MetadataCache => tags, links, frontmatter cache' },
    { label: 'fileManager', type: 'object', info: 'app.fileManager: FileManager => processFrontMatter, safe renames' },
    { label: 'keymap', type: 'object', info: 'app.keymap: Keymap => key handling utilities' },
];
