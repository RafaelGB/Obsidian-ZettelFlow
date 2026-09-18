import { describe, expect, it } from '@jest/globals';
import { CreateOnlyWriter } from 'architecture/plugin/services/CreateOnlyWriter';
import { FakeVault } from '../../../support/harness';
/**
 * The create-only write seam for a **reviewed inquiry outcome** (#401).
 *
 * It was quick capture's writer until #475 moved capture into the Lab. The behaviour it
 * guards is unchanged and still load-bearing for inquiry: never overwrite, a stable retry
 * path, and no widening of scope.
 */
describe('create-only writing for a reviewed outcome', () => {
    it('creates once, and a retry of the same operation is not a second note', async () => {
        const vault = new FakeVault(); const service = new CreateOnlyWriter(vault as any);
        const op = service.plan('A thought', 'op1');
        expect((await service.write(op)).status).toBe('created');
        expect((await service.write(op)).status).toBe('already-created');
        expect(vault.contentOf(op.path)).toContain('state: fleeting');
        expect(op.path).toBe('Inbox/A thought.md');
        expect(service.plan('A thought', 'op2').path).toBe('Inbox/A thought op2.md');
    });
    it('rejects blank sanitized names and never widens excluded scope', async () => {
        const vault = new FakeVault(); const service = new CreateOnlyWriter(vault as any, () => false);
        expect(() => service.plan('///', 'op1')).toThrow();
        expect((await service.write(service.plan('Idea', 'op1'))).status).toBe('failed');
        expect(vault.entries.size).toBe(0);
    });
});