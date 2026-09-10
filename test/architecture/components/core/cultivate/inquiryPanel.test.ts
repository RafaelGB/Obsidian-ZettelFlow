import { afterEach, describe, expect, it } from '@jest/globals';
import { InquiryPanel, type InquiryPanelDependencies } from 'architecture/components/core/cultivate/InquiryPanel';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';
import { FakeElement } from '../../../../support/dom';

const runtime = InquiryRuntime.getInstance();
afterEach(() => runtime.dispose());
describe('actual inquiry controls', () => {
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