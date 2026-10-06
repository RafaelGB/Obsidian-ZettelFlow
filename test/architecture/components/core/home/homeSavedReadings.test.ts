import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FakeElement } from '../../../../support/dom';
import { __setMockObsidianApi } from 'architecture';
import { HomeModeRenderer } from 'architecture/components/core/home/HomeModeRenderer';
import { resetReaderWorkspace } from 'architecture/components/core/reader/openReader';
jest.mock('architecture/plugin', () => ({
    ...jest.requireActual<object>('architecture/plugin/services/ViewActivation'),
    DevelopmentJournal: { getInstance: () => ({ dailyCounts: () => ({}) }) },
}));

const reading = (n: number) => ({ id: `r${n}`, name: `Reading ${n}`, kind: 'selection', seed: `n${n}.md`, paths: [`n${n}.md`, 'm.md'], at: n });

function render(readerSaved: unknown) {
    __setMockObsidianApi({ ownPlugin: { registerEvent: () => undefined, register: () => undefined, settings: { readerSaved } } });
    const states: unknown[] = [];
    const fresh = { setViewState: async (state: unknown) => { states.push(state); } };
    const app = {
        workspace: {
            leftSplit: { collapsed: false, collapse() { }, expand() { } },
            rightSplit: { collapsed: false, collapse() { }, expand() { } },
            getMostRecentLeaf: () => null,
            getLeavesOfType: () => [],
            getLeaf: () => fresh,
            revealLeaf: async () => undefined,
            iterateAllLeaves: () => undefined,
            setActiveLeaf: () => undefined,
        },
    };
    const root = new FakeElement();
    const renderer = new HomeModeRenderer(root as any, app as any);
    Object.assign(renderer, { state: 'ready', home: { thinkingDays: 0, fleetingCount: 0, fleetingReady: [], newIdeas: [], mainConcepts: [], reviewDue: [] }, recommendations: [], pinnedCards: [] });
    (renderer as any).render();
    return { root, states };
}

afterEach(() => {
    __setMockObsidianApi({ ownPlugin: { registerEvent: () => undefined, register: () => undefined } });
    resetReaderWorkspace();
});

describe('saved readings on Home (#672)', () => {
    it('lists the newest five under the fold, each one click back into the Reader', async () => {
        const { root, states } = render([6, 5, 4, 3, 2, 1].map(reading));
        const heading = root.find(el => el.tag === 'h5' && el.textContent === 'Saved readings');
        expect(heading).toBeDefined();
        const walk = (el: FakeElement): FakeElement[] => [el, ...el.children.flatMap(walk)];
        const names = walk(root).filter(el => el.textContent.startsWith('Reading ') && el.attrs.role === 'link').map(el => el.textContent);
        expect(names).toEqual(['Reading 6', 'Reading 5', 'Reading 4', 'Reading 3', 'Reading 2']);
        root.find(el => el.textContent === 'Reading 6' && el.attrs.role === 'link')!.fire('keydown', { key: 'Enter', preventDefault: () => { } });
        await Promise.resolve();
        await Promise.resolve();
        expect(states).toContainEqual(expect.objectContaining({
            type: 'zettelflow-reader',
            state: expect.objectContaining({ seed: 'n6.md', kind: 'selection', paths: ['n6.md', 'm.md'], name: 'Reading 6' }),
        }));
    });

    it('is silent when nothing was kept', () => {
        const { root } = render(undefined);
        expect(root.find(el => el.textContent === 'Saved readings')).toBeUndefined();
    });
});
