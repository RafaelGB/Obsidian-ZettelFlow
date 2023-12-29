export const zfCompletions = [];

export const integrationsCompletions = [
    { label: 'dv', type: 'object', info: 'API to interact with the Dataview plugin' },
    { label: 'tp', type: 'object', info: 'API to interact with the Templater plugin' },
];

export const internalVaultCompletions = [
    { label: 'resolveTFolder', type: 'method', info: '(path: string): TFolder => Resolves a path to a TFolder. root in case of do not be found' },
    { label: 'obtainFilesFrom', type: 'method', info: '(folder: TFolder, extensions: string[] = ["md", "canvas"]): TFile[] => Obtains all the files from a folder' },
];