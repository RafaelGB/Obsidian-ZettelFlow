import { describe, expect, it } from '@jest/globals';
import { FileService } from 'architecture/plugin/services/FileService';
import { FakeVault } from '../../../support/harness';

describe('create-only writes', () => {
    it('creates once, recognizes an exact retry and refuses modified content', async () => {
        const vault = new FakeVault(); const op = {path: 'out.md', content: 'owned snapshot'};
        expect((await FileService.createFileOnce(vault as any, op)).status).toBe('created');
        expect((await FileService.createFileOnce(vault as any, op)).status).toBe('already-created');
        await vault.modify(vault.getFileByPath('out.md')!, 'my changed prose');
        expect((await FileService.createFileOnce(vault as any, op)).status).toBe('conflict');
        expect(vault.contentOf('out.md')).toBe('my changed prose');
    });
    it('reconciles create-then-throw and racing creates without overwriting', async () => {
        const vault = new FakeVault(); const create = vault.create.bind(vault);
        vault.create = async (path, content) => { await create(path, content); throw new Error('ambiguous'); };
        const op = {path: 'out.md', content: 'owned'};
        expect((await FileService.createFileOnce(vault as any, op)).status).toBe('already-created');
        expect(vault.entries.size).toBe(1);
    });
    it('rejects unsafe paths and folder collisions, before writing or reading excluded content', async () => {
        const vault = new FakeVault(); await vault.createFolder('folder.md');
        for (const path of ['../out.md', '/out.md', '.obsidian/out.md', 'CON.md', 'a\\b.md', 'folder.md']) {
            expect(['conflict', 'failed']).toContain((await FileService.createFileOnce(vault as any, {path,content:'new'})).status);
        }
        vault.add('hidden.md', {body:'secret'});
        let reads = 0; vault.read = async () => { reads++; return 'secret'; };
        expect((await FileService.createFileOnce(vault as any, {path:'hidden.md',content:'secret'}, () => false)).status).toBe('failed');
        expect(reads).toBe(0);
    });
});