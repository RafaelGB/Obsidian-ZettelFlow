import { afterEach, describe, expect, it } from '@jest/globals';
import { InquiryRuntime, type InquiryHost } from 'architecture/plugin/inquiry/InquiryRuntime';
import type { InquiryStorage } from 'architecture/knowledge/inquiry/inquiryState';

const runtime = InquiryRuntime.getInstance();
afterEach(() => runtime.dispose());
function host(raw?: unknown): InquiryHost & { disk?: unknown } {
    const value = { disk: raw, load: () => value.disk, persist: async (data: InquiryStorage) => { value.disk = JSON.parse(JSON.stringify(data)); }, now: () => 1, id: () => 'one' };
    return value;
}
describe('durable inquiry owner', () => {
    it('keeps unsaved input out of settings and survives restart independent of activity history', async () => {
        const h = host(); runtime.init(h); runtime.start();
        runtime.update({kind: 'text', field: 'purpose', value: 'My question'});
        expect(h.disk).toBeUndefined();
        expect(await runtime.pause()).toBe(true);
        runtime.dispose(); runtime.init(h);
        expect(runtime.getSnapshot().current).toMatchObject({purpose: 'My question', paused: true});
        expect(runtime.getSnapshot().status).toBe('saved');
    });
    it('acknowledges only the saved revision and retains newer editable text', async () => {
        const h = host(); let release!: () => void;
        h.persist = async value => { await new Promise<void>(resolve => { release = resolve; }); h.disk = value; };
        runtime.init(h); runtime.start();
        runtime.update({kind: 'text', field: 'purpose', value: 'old'});
        const saving = runtime.save();
        runtime.update({kind: 'text', field: 'purpose', value: 'new'});
        release(); await saving;
        expect((h.disk as InquiryStorage).current?.purpose).toBe('old');
        expect(runtime.getSnapshot()).toMatchObject({status: 'dirty', current: {purpose: 'new'}});
    });
    it('reports failure, preserves drafts, requires explicit reset and never deletes notes', async () => {
        const h = host({version: 99}); runtime.init(h);
        expect(runtime.getSnapshot().status).toBe('unsupported');
        expect(runtime.start()).toBe(false);
        expect(await runtime.clear(false)).toBe(false);
        expect(h.disk).toEqual({version:99});
        expect(await runtime.clear(true)).toBe(true);
        runtime.start(); runtime.update({kind: 'text', field: 'gaps', value: 'Keep me'});
        h.persist = async () => { throw new Error('secret'); };
        expect(await runtime.save()).toBe(false);
        expect(runtime.getSnapshot()).toMatchObject({status:'error', current:{gaps:'Keep me'}});
    });
    it('does not let disposed persistence overwrite a new runtime', async () => {
        const old = host(); let release!: () => void;
        old.persist = () => new Promise(resolve => { release = resolve; });
        runtime.init(old); runtime.start(); const saving = runtime.save();
        runtime.dispose(); const fresh = host(); runtime.init(fresh); runtime.start();
        runtime.update({kind:'text',field:'purpose',value:'fresh'});
        release(); await saving;
        expect(runtime.getSnapshot().current?.purpose).toBe('fresh');
    });
});