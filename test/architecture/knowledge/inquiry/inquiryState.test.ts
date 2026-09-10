import { describe, expect, it } from '@jest/globals';
import { createInquiry, updateInquiry, parseInquiryStorage, inquiryErrors } from 'architecture/knowledge/inquiry/inquiryState';

describe('human-owned inquiry', () => {
    it('keeps purpose optional and only resolves through an explicit human decision', () => {
        let value = createInquiry('one');
        value = updateInquiry(value, { kind: 'focus', path: 'my note.md' }, 1);
        value = updateInquiry(value, { kind: 'text', field: 'response', value: 'Not enough evidence' }, 2);
        value = updateInquiry(value, { kind: 'text', field: 'gaps', value: 'A counterexample' }, 3);
        value = updateInquiry(value, { kind: 'resolve', sufficient: true }, 4);
        expect(value.resolution).toBe('sufficient-for-now');
        value = updateInquiry(value, { kind: 'text', field: 'purpose', value: 'A new question' }, 5);
        expect(value).toMatchObject({ resolution: 'unresolved', focusPath: 'my note.md', response: 'Not enough evidence', gaps: 'A counterexample', lastDecision: { at: 4, sufficient: true, purpose: '' } });
        value = updateInquiry(value, { kind: 'pause', paused: true }, 6);
        expect(value.lastDecision?.at).toBe(4);
        value = updateInquiry(value, { kind: 'text', field: 'purpose', value: '' }, 7);
        expect(value.purpose).toBe('');
    });
    it('keeps consulted material separate from selection and reconciles explicitly', () => {
        const initial = createInquiry('one');
        const selected = updateInquiry(initial, { kind: 'focus', path: 'a.md' }, 1);
        expect(initial.selectedPaths).toEqual([]);
        expect(selected.consultedPaths).toEqual([]);
        const consulted = updateInquiry(selected, { kind: 'consult', path: 'a.md', consulted: true }, 2);
        const replaced = updateInquiry(consulted, { kind: 'focus', path: 'b.md' }, 3);
        expect(replaced.consultedPaths).toEqual(['a.md']);
        expect(replaced.consultedPaths).not.toContain('b.md');
    });
    it('distinguishes absent, corrupt and unsupported data without discarding it', () => {
        expect(parseInquiryStorage(undefined)).toEqual({ status: 'empty', current: null });
        expect(parseInquiryStorage({ version: 2, current: null }).status).toBe('unsupported');
        expect(parseInquiryStorage({ version: 1, current: { id: 'oops' } }).status).toBe('corrupt');
        const value = createInquiry('one');
        expect(parseInquiryStorage({ version: 1, current: value })).toEqual({ status: 'ready', current: value });
        for (const bad of [{ revision: NaN }, { selectedPaths: [2] }, { resolution: 'auto' }, { provenance: { origin: 'ai', verdict: 'rejected' } }, { pending: { path: '../outside.md' } }]) {
            expect(parseInquiryStorage({ version: 1, current: { ...value, ...bad } }).status).toBe('corrupt');
        }
    });
    it('reports limits without slicing the editable response', () => {
        const value = updateInquiry(createInquiry('one'), { kind: 'text', field: 'response', value: 'x'.repeat(64001) }, 1);
        expect(value.response.length).toBe(64001);
        expect(inquiryErrors(value)).toContain('response');
        expect(parseInquiryStorage({ version: 1, current: value }).status).toBe('corrupt');
    });
});