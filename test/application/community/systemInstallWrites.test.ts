import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// The confirmation dialog the install used to open (#799 AC-8): constructed, it would be counted.
const confirmed = jest.fn();
jest.mock('architecture/components/settings', () => ({ ConfirmModal: class { constructor() { confirmed(); } open() { } } }));

import { FileService } from 'architecture/plugin/services/FileService';
import { bufferedWrites, replaceBufferedWrites } from 'architecture/plugin/writes/recordVaultWrite';
import { installSystem } from 'application/community/installSystem';
import { canonicalHash } from 'application/community/installRecord';
import { FakeVault, wireHarness } from '../../support/harness';
import { branching, scripted } from '../../support/systemsFixtures';
import { readFileSync } from 'fs';
import { join } from 'path';

const REF = '/docs/systems/zettelkasten-v2.zftemplate';

/** A plugin over an in-memory vault, with every create and every settings save in one call log. */
function installHarness(settings: Record<string, unknown> = {}) {
    const harness = wireHarness({ settings: { foldersFlowsPath: 'ZettelFlow/Folders', ...settings } });
    const calls: string[] = [];
    const create = harness.vault.create.bind(harness.vault);
    harness.vault.create = async (path: string, content: string) => { calls.push(`create:${path}`); return create(path, content); };
    const createFolder = harness.vault.createFolder.bind(harness.vault);
    harness.vault.createFolder = async (path: string) => { calls.push(`folder:${path}`); return createFolder(path); };
    harness.plugin.saveSettings = async () => { calls.push('save'); };
    return { ...harness, calls };
}

beforeEach(() => {
    confirmed.mockClear();
    replaceBufferedWrites([]);
});

describe('installing a system in one click, no dialog (#799 AC-8, AC-9)', () => {
    it('writes every file in one install batch, then the role setting, then the record', async () => {
        const { plugin, vault, calls, settings } = installHarness();
        const outcome = await installSystem(plugin as never, branching(), REF, { role: 'create', targetFolder: 'Flows/Zettelkasten v2' });
        expect(outcome.kind).toBe('installed');
        if (outcome.kind !== 'installed') return;
        expect(outcome.canvasPath).toBe('Flows/Zettelkasten v2/Zettelkasten v2.canvas');
        expect(vault.entries.has(outcome.canvasPath)).toBe(true);
        // One batch, of kind install, holding every file written.
        const writes = bufferedWrites();
        expect(writes.map((write) => write.origin.kind)).toEqual(['install']);
        expect(new Set(writes.map((write) => write.batch)).size).toBe(1);
        expect(outcome.record.batch).toBe(writes[0].batch);
        // The setting is written once the files exist, not before.
        expect(calls.indexOf('save')).toBeGreaterThan(calls.lastIndexOf(`create:${outcome.canvasPath}`));
        expect(settings.ribbonCanvas).toBe(outcome.canvasPath);
        expect(confirmed).not.toHaveBeenCalled();
    });

    it('records the install: its ref, role, the previous setting, each file with its hash, the folders it made', async () => {
        const { plugin, settings } = installHarness({ ribbonCanvas: 'Old/flow.canvas' });
        const outcome = await installSystem(plugin as never, branching(), REF, { role: 'create', targetFolder: 'Flows/Zettelkasten v2' });
        if (outcome.kind !== 'installed') throw new Error(outcome.kind);
        const list = settings.installedSystems as typeof outcome.record[];
        expect(list).toHaveLength(1);
        const record = list[0];
        expect(record).toMatchObject({ ref: REF, name: 'Zettelkasten v2', role: 'create', folder: 'Flows/Zettelkasten v2' });
        expect(record.setting).toEqual({ key: 'ribbonCanvas', previous: 'Old/flow.canvas', value: outcome.canvasPath });
        expect(record.files.map((file) => file.path)).toEqual([outcome.canvasPath]);
        expect(record.files[0]).toEqual({
            path: outcome.canvasPath,
            hash: canonicalHash(outcome.canvasPath, branching().canvas.content),
            size: branching().canvas.content.length,
        });
        expect(record.folders).toEqual(['Flows', 'Flows/Zettelkasten v2']);
    });

    it('writes a scripted system and every one of its steps', async () => {
        const { plugin, vault } = installHarness();
        const outcome = await installSystem(plugin as never, scripted(), '/docs/systems/weekly-focus.zftemplate', { role: 'none', targetFolder: 'Flows/Weekly focus' });
        expect(outcome.kind).toBe('installed');
        expect([...vault.entries.keys()].sort()).toEqual(['Flows/Weekly focus/Weekly focus.canvas', 'Flows/Weekly focus/Weekly focus.md']);
    });

    it('refuses an invalid template inline, writing nothing', async () => {
        const { plugin, vault, calls } = installHarness();
        const broken = { ...branching(), canvas: { filename: '../escape.canvas', content: '{' } };
        const outcome = await installSystem(plugin as never, broken, REF, { role: 'none', targetFolder: 'Flows/x' });
        expect(outcome.kind).toBe('invalid');
        expect(vault.entries.size).toBe(0);
        expect(calls).toEqual([]);
    });

    it('says a role problem before any write: a folder flow with no folder (AC-9)', async () => {
        const { plugin, vault, calls, settings } = installHarness();
        const before = JSON.stringify(settings);
        const outcome = await installSystem(plugin as never, branching(), REF, { role: 'folder', targetFolder: 'Flows/x', folder: '' });
        expect(outcome).toEqual({ kind: 'role-problem', problem: 'folder-required' });
        expect(vault.entries.size).toBe(0);
        expect(vault.folders.size).toBe(0);
        expect(calls).toEqual([]);
        expect(JSON.stringify(settings)).toBe(before);
    });

    it('reports a conflict and changes no setting when a destination holds something else', async () => {
        const { plugin, vault, calls, settings } = installHarness();
        vault.add('Flows/Zettelkasten v2/Zettelkasten v2.canvas', { body: 'my own canvas' });
        const outcome = await installSystem(plugin as never, branching(), REF, { role: 'create', targetFolder: 'Flows/Zettelkasten v2' });
        expect(outcome).toEqual({ kind: 'conflict' });
        expect(calls).not.toContain('save');
        expect(settings.ribbonCanvas).toBeUndefined();
        expect(settings.installedSystems).toBeUndefined();
    });
});
const files = [{ path: 'Flows/Tour/main.canvas', content: 'canvas' }, { path: 'Flows/Tour/step.md', content: 'step' }];
describe('canonical gallery create-only installation', () => {
    it('keeps the existing three tour entry points and points to own-material work', () => {
        const tour = JSON.parse(readFileSync(join(__dirname, '../../../docs/systems/zettelflow-tour.zftemplate'), 'utf8'));
        expect(tour.steps).toHaveLength(3);
        expect(tour.steps.every((step: { content: string }) => step.content.includes('root: true'))).toBe(true);
        expect(tour.description).toContain('Start with my material');
        expect(tour.description).toContain('do not prove understanding');
    });
    it('creates fresh files and retries an identical installation without rewriting', async () => {
        const vault = new FakeVault();
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
    });
    it('preflights all customized collisions before creating any files', async () => {
        const vault = new FakeVault(); vault.add(files[1].path, { body: 'My custom step' });
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('conflict');
        expect(vault.entries.size).toBe(1);
        expect(vault.contentOf(files[1].path)).toBe('My custom step');
    });
    it('makes partial completion explicit and resumes only missing files', async () => {
        const vault = new FakeVault(); const create = vault.create.bind(vault); let fail = true;
        vault.create = async (path, content) => { if (fail && path.endsWith('step.md')) throw new Error('disk failed'); return create(path, content); };
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('partial');
        expect(vault.entries.size).toBe(1); fail = false;
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
    });
    it('does not overwrite racing customized creations or traverse unsafe folders', async () => {
        const vault = new FakeVault(); const create = vault.create.bind(vault);
        vault.create = async (path, _content) => { await create(path, 'racing prose'); throw new Error('exists'); };
        expect(await FileService.createFilesOnce(vault as any, files)).toBe('partial');
        expect(vault.contentOf(files[0].path)).toBe('racing prose');
        expect(await FileService.createFilesOnce(vault as any, [{ path: '../bad.md', content: 'bad' }])).toBe('conflict');
    });
});