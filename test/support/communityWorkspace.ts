/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A workspace that holds leaves by view type (#798): enough to prove an opener reuses the one leaf
 * it should, and opens a new tab only when there is none. `setViewState` records what it was given
 * and hands the state to the leaf's view, as Obsidian does once the view exists.
 */
export class FakeLeaf {
    viewType: string | null = null;
    state: Record<string, unknown> | null = null;
    active = false;
    view: { setState?: (state: unknown, result: unknown) => Promise<void> } | null = null;
    readonly calls: Record<string, unknown>[] = [];
    async setViewState(viewState: { type: string; state?: Record<string, unknown>; active?: boolean }): Promise<void> {
        this.calls.push(viewState as Record<string, unknown>);
        this.viewType = viewState.type;
        this.state = viewState.state ?? {};
        this.active = viewState.active === true;
        await this.view?.setState?.(this.state, {});
    }
}

export interface CommunityWorkspace {
    app: any;
    leaves: FakeLeaf[];
    revealed: FakeLeaf[];
    /** A leaf of `type` already open, as a restored workspace would have it. */
    open(type: string, state?: Record<string, unknown>): FakeLeaf;
}

export function communityWorkspace(): CommunityWorkspace {
    const leaves: FakeLeaf[] = [];
    const revealed: FakeLeaf[] = [];
    const workspace = {
        getLeavesOfType: (type: string) => leaves.filter((leaf) => leaf.viewType === type),
        getLeaf: (_kind?: unknown) => {
            const leaf = new FakeLeaf();
            leaves.push(leaf);
            return leaf;
        },
        revealLeaf: async (leaf: FakeLeaf) => {
            revealed.push(leaf);
        },
        requestSaveLayout: () => undefined,
        on: () => ({}),
        getActiveFile: () => null,
    };
    const app = { workspace, setting: { close: () => undefined } };
    return {
        app,
        leaves,
        revealed,
        open(type, state = {}) {
            const leaf = new FakeLeaf();
            leaf.viewType = type;
            leaf.state = state;
            leaves.push(leaf);
            return leaf;
        },
    };
}
