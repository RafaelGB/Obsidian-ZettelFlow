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
    it('keeps populated Home sections and routes entries through the same surfaces', async () => {
        runtime.init({ load: () => undefined, persist: async () => { }, now: () => 1, id: () => 'one' }); runtime.start();
        const states: unknown[] = []; const opens: string[] = [];
        const app = { workspace: { getLeavesOfType: () => [], getLeaf: () => ({ setViewState: async (state: unknown) => { states.push(state); } }), revealLeaf: () => { }, openLinkText: async (path: string) => { opens.push(path); } } };
        const root = new FakeElement(); const renderer = new HomeModeRenderer(root as any, app as any);
        Object.assign(renderer, { state: 'ready', home: { thinkingDays: 2, fleetingCount: 1, fleetingReady: ['a.md'], newIdeas: ['a.md'], mainConcepts: ['b.md'], reviewDue: [], suggestedConnections: [{ a: 'a.md', b: 'b.md' }] }, recommendations: [{ reason: 'orphan', target: ['a.md'] }], pinnedCards: [{ label: 'My query', query: 'orphan', count: 1 }] });
        (renderer as any).render();
        const walk = (el: FakeElement): FakeElement[] => [el, ...el.children.flatMap(walk)];
        const original = walk(root);
        for (const el of original.filter(el => el.tag === 'button' && el.textContent !== 'Refresh')) el.fire('click');
        for (const el of original.filter(el => el.attrs.role === 'link')) el.fire('keydown', { key: 'Enter', preventDefault: () => { } });
        await Promise.resolve();
        expect(states).toContainEqual(expect.objectContaining({ type: 'zettelflow-home', state: { mode: 'cultivate', inquiry: 'resume' } }));
        expect(states).toContainEqual(expect.objectContaining({ type: 'zettelflow-home', state: { mode: 'cultivate', inquiry: 'ordinary' } }));
        expect(states).toContainEqual(expect.objectContaining({ type: 'zettelflow-discovery' }));
        expect(opens).toContain('a.md');
        (renderer as any).recommendations = []; (renderer as any).home.suggestedConnections = []; (renderer as any).render();
        expect(root.find(el => el.textContent.includes('My query'))).toBeDefined();
        (renderer as any).state = 'error'; (renderer as any).render();
        expect(root.find(el => el.textContent === 'Resume my inquiry')).toBeDefined();
    });
    it('Home exposes own-material entry while indexing and for an empty vault', () => {
        runtime.init({ load: () => undefined, persist: async () => { }, now: () => 1, id: () => 'one' });
        const root = new FakeElement(); const renderer = new HomeModeRenderer(root as any, {} as any);
        for (const state of ['indexing', 'empty']) {
            (renderer as any).state = state; (renderer as any).render();
            expect(root.find(el => el.tag === 'button' && el.textContent === 'Start with my material')).toBeDefined();
            expect(root.find(el => el.tag === 'button' && el.textContent === 'Cultivate without a purpose')).toBeDefined();
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