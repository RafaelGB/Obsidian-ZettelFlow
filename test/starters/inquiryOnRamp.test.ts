import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FakeElement } from '../support/dom';
import { HomeModeRenderer } from 'architecture/components/core/home/HomeModeRenderer';
import { QuickCaptureModal } from 'zettelkasten/modals/QuickCaptureModal';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';
jest.mock('architecture/plugin', () => ({
    ...jest.requireActual<object>('architecture/plugin/services/ViewActivation'),
    DevelopmentJournal: { getInstance: () => ({ dailyCounts: () => ({}) }) },
}));

const runtime = InquiryRuntime.getInstance();
afterEach(() => runtime.dispose());
describe('first-use entry without a setup ritual', () => {
    it('routes Home entries through the same surfaces (#703)', async () => {
        const states: unknown[] = []; const opens: string[] = [];
        const app = { workspace: { getLeavesOfType: () => [], getLeaf: () => ({ setViewState: async (state: unknown) => { states.push(state); } }), revealLeaf: () => { }, openLinkText: async (path: string) => { opens.push(path); }, getLastOpenFiles: () => [] }, vault: { getAbstractFileByPath: () => null } };
        const root = new FakeElement(); const renderer = new HomeModeRenderer(root as any, app as any);
        Object.assign(renderer, { state: 'ready', idea: { path: 'a.md', title: 'a', claim: 'A claim', stateKey: null, created: 1 }, pinnedCards: [{ label: 'My query', query: 'orphan', count: 1 }] });
        (renderer as any).render();
        const walk = (el: FakeElement): FakeElement[] => [el, ...el.children.flatMap(walk)];
        const original = walk(root);
        for (const el of original.filter(el => el.tag === 'button')) el.fire('click');
        for (const el of original.filter(el => el.attrs.role === 'link')) el.fire('keydown', { key: 'Enter', preventDefault: () => { } });
        await Promise.resolve();
        // One idea to tend opens Cultivate on that idea; a pinned question asks it again in Explore.
        expect(states).toContainEqual(expect.objectContaining({ type: 'zettelflow-home', state: { mode: 'cultivate', target: 'a.md' } }));
        expect(states).toContainEqual(expect.objectContaining({ type: 'zettelflow-explore', state: { mode: 'explore', query: 'orphan' } }));
        expect(opens).toContain('a.md');
        expect(root.find(el => el.textContent.includes('My query'))).toBeDefined();
    });
    it('lets you write before the index is ready, and offers three ways in on the first day (#703)', () => {
        const root = new FakeElement(); const renderer = new HomeModeRenderer(root as any, { workspace: {} } as any);
        (renderer as any).state = 'indexing'; (renderer as any).render();
        expect(root.find(el => el.tag === 'textarea')).toBeDefined();
        (renderer as any).state = 'empty'; (renderer as any).render();
        expect(root.find(el => el.tag === 'textarea')).toBeDefined();
        for (const way of ['Write a first note', 'Read something you have', 'Just think']) {
            expect(root.find(el => el.textContent === way)).toBeDefined();
        }
    });
    it('capture keeps its title until acknowledgement and coalesces repeat submits', async () => {
        let done!: (value: boolean) => void;
        const capture = jest.fn(() => new Promise<boolean>(resolve => { done = resolve; }));
        const modal = new QuickCaptureModal({ app: {} } as any, { capture }); const root = new FakeElement();
        (modal as any).contentEl = root; const close = jest.spyOn(modal, 'close'); modal.onOpen();
        const input = root.find(el => el.tag === 'input')!; input.value = 'My thought';
        const button = root.find(el => el.tag === 'button')!; button.fire('click'); button.fire('click');
        expect(capture).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
        done(false); await Promise.resolve(); await Promise.resolve();
        expect(input.value).toBe('My thought'); expect(close).not.toHaveBeenCalled();
        button.fire('click'); done(true); await Promise.resolve(); await Promise.resolve();
        expect(close).toHaveBeenCalledTimes(1);
    });
});