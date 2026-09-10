import { afterEach, describe, expect, it } from '@jest/globals';
import { InquiryPanel, type InquiryPanelDependencies } from 'architecture/components/core/cultivate/InquiryPanel';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';
import { FakeElement } from '../../../../support/dom';

const runtime = InquiryRuntime.getInstance();
afterEach(() => runtime.dispose());
describe('actual inquiry controls', () => {
    it('supports consulted context, snapshots, pause and clear without inventing a response', async () => {
        let storage: unknown; let captured = 0; const opened: string[] = [];
        runtime.init({ load: () => undefined, persist: async value => { storage = value; }, now: () => 1, id: () => 'one', inScope: () => true, available: () => true, link: path => `[note](${path})`, writeOperation: async op => ({ status: 'created', path: op.path }) }); runtime.start();
        const root = new FakeElement();
        const context = { materials: [{ path: 'a.md', selected: true }, { path: 'b.md', selected: false }], candidates: [{ path: 'b.md', reason: { from: 'a.md', to: 'b.md', type: 'supports' } }], relations: [{ from: 'a.md', to: 'b.md', type: 'supports' }], evidence: [{ path: 'a.md', claim: 'recorded claim', source: 'citation' }], unavailable: [], inspected: 3, truncated: true, method: 'neighbors' as const };
        const deps: InquiryPanelDependencies = { runtime, pick: fn => fn('a.md'), capture: () => { captured++; }, open: async path => { opened.push(path); }, canUse: path => path !== 'missing.md', confirm: (_key, fn) => void fn(), context: () => ({ status: 'ready', value: context }) };
        const panel = new InquiryPanel(root as any, deps); panel.load();
        const button = (key: string) => root.find(el => el.attrs['data-inquiry'] === key)!;
        button('choose').fire('click'); button('add-context').fire('click'); button('open').fire('click'); button('consult').fire('click');
        expect(runtime.getSnapshot().current?.consultedPaths).toContain('a.md'); expect(opened).toContain('a.md');
        button('capture').fire('click'); expect(captured).toBe(1);
        const response = button('response'); response.value = 'My own conclusion'; response.fire('input');
        const gaps = button('gaps'); gaps.value = 'Missing evidence'; gaps.fire('input');
        const walk = (el: FakeElement): FakeElement[] => [el, ...el.children.flatMap(walk)];
        for (const select of walk(root).filter(el => el.tag === 'select')) {
            select.value = select.children.some(el => el.value === 'high') ? 'high' : select.children.some(el => el.value === 'stop') ? 'stop' : 'neighbors'; select.fire('change');
        }
        button('outcome').fire('click'); for (let i = 0; i < 8; i++)await Promise.resolve();
        expect(runtime.getSnapshot().current?.receipt).toBeDefined();
        button('open-outcome').fire('click'); expect(opened.some(path => path.startsWith('Inquiry'))).toBe(true);
        button('pause').fire('click'); for (let i = 0; i < 4; i++)await Promise.resolve();
        button('resume').fire('click'); button('reopen').fire('click'); button('retry').fire('click'); for (let i = 0; i < 4; i++)await Promise.resolve();
        runtime.update({ kind: 'select', path: 'missing.md' }); runtime.update({ kind: 'consult', path: 'missing.md', consulted: true });
        button('unconsult').fire('click'); button('remove').fire('click');
        button('abandon').fire('click'); for (let i = 0; i < 4; i++)await Promise.resolve();
        button('clear').fire('click'); for (let i = 0; i < 4; i++)await Promise.resolve();
        expect(storage).toEqual({ version: 1, current: null }); panel.unload();
    });
    it('keeps focused drafts and selection across context refresh, and records only explicit resolution', async () => {
        let saved: unknown;
        runtime.init({ load: () => undefined, persist: async value => { saved = value; }, now: () => 1, id: () => 'one' });
        runtime.start();
        const root = new FakeElement(); let opens = 0;
        const deps: InquiryPanelDependencies = { runtime, pick: fn => fn('my untagged.md'), capture: () => { }, open: async () => { opens++; }, canUse: () => true, confirm: (_key, fn) => void fn(), context: () => ({ status: 'loading' }) };
        const panel = new InquiryPanel(root as any, deps); panel.load();
        const button = (key: string) => root.find(el => el.attrs['data-inquiry'] === key)!;
        const input = button('purpose'); input.value = 'Why?'; input.focus(); input.selectionStart = 2; input.fire('input');
        panel.refreshContext();
        expect(button('purpose')).toBe(input); expect(FakeElement.active).toBe(input); expect(input.selectionStart).toBe(2);
        button('choose').fire('click');
        expect(runtime.getSnapshot().current?.focusPath).toBe('my untagged.md');
        button('resolve').fire('click');
        expect(runtime.getSnapshot().current?.resolution).toBe('sufficient-for-now');
        input.value = 'Changed'; input.fire('input');
        expect(runtime.getSnapshot().current?.resolution).toBe('unresolved');
        button('save').fire('click'); await Promise.resolve(); await Promise.resolve();
        expect(saved).toBeDefined(); expect(opens).toBe(0);
        panel.unload(); const old = root.children.length;
        runtime.update({ kind: 'text', field: 'purpose', value: 'after unmount' });
        expect(root.children.length).toBe(old);
    });
    it('offers a recoverable empty entry, distinguishes loading, and never marks opening as consulted', () => {
        runtime.init({ load: () => undefined, persist: async () => { }, now: () => 1, id: () => 'one' });
        const root = new FakeElement();
        const deps: InquiryPanelDependencies = { runtime, pick: fn => fn('a.md'), capture: () => { }, open: async () => { }, canUse: () => true, confirm: (_key, fn) => void fn(), context: () => ({ status: 'loading' }) };
        const panel = new InquiryPanel(root as any, deps); panel.load();
        root.find(el => el.attrs['data-inquiry'] === 'start')!.fire('click');
        root.find(el => el.attrs['data-inquiry'] === 'choose')!.fire('click');
        expect(runtime.getSnapshot().current?.consultedPaths).toEqual([]);
        expect(root.find(el => el.textContent.includes('local index'))).toBeDefined();
        panel.unload();
    });
});