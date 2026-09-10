import { describe, expect, it } from '@jest/globals';
import { QuickCaptureService } from 'architecture/plugin/services/QuickCaptureService';
import { FakeVault } from '../../../support/harness';
describe('canonical first capture', () => {
    it('preserves fleeting Inbox behavior and a stable retry path', async () => {
        const vault = new FakeVault(); const service = new QuickCaptureService(vault as any);
        const op = service.plan('A thought', 'op1');
        expect((await service.write(op)).status).toBe('created');
        expect((await service.write(op)).status).toBe('already-created');
        expect(vault.contentOf(op.path)).toContain('state: fleeting');
        expect(op.path).toBe('Inbox/A thought.md');
        expect(service.plan('A thought', 'op2').path).toBe('Inbox/A thought op2.md');
    });
    it('rejects blank sanitized names and never widens excluded scope', async () => {
        const vault = new FakeVault(); const service = new QuickCaptureService(vault as any, () => false);
        expect(() => service.plan('///', 'op1')).toThrow();
        expect((await service.write(service.plan('Idea', 'op1'))).status).toBe('failed');
        expect(vault.entries.size).toBe(0);
    });
});