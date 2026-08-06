export const zfCompletions = [];

export const integrationsCompletions = [
    { label: 'dv', type: 'object', info: 'API to interact with the Dataview plugin' },
    { label: 'tp', type: 'object', info: 'API to interact with the Templater plugin' },
];

export const internalVaultCompletions = [
    { label: 'resolveTFolder', type: 'method', info: '(path: string): TFolder => Resolves a path to a TFolder. root in case of do not be found' },
    { label: 'obtainFilesFrom', type: 'method', info: '(folder: TFolder, extensions: string[] = ["md", "canvas"]): TFile[] => Obtains all the files from a folder' },
];

// `zf.internal.user` exposes the JavaScript functions the user defines in their scripts folder.
// Those are dynamic (resolved at runtime), so we surface the namespace itself as a hint rather
// than trying to enumerate user-defined function names statically.
export const internalUserCompletions = [
    { label: 'user', type: 'namespace', info: 'Your own JS functions from the ZettelFlow scripts folder (dynamic)' },
];
