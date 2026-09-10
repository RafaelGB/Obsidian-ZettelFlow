import { describe, expect, it } from '@jest/globals';
import { createInquiry } from 'architecture/knowledge/inquiry/inquiryState';
import { renderInquiryOutcome, type InquiryOutcomeLabels } from 'architecture/knowledge/inquiry/inquiryOutcome';

export const labels: InquiryOutcomeLabels = {
    purpose: 'Purpose', response: 'Response', gaps: 'Gaps', references: 'Consulted material', empty: 'No evidence consulted',
    authored: 'User-authored', accepted: 'Accepted proposal', modified: 'Modified proposal', confidence: 'Confidence',
    unresolved: 'Unresolved', sufficient: 'Sufficient for now', continue: 'Continue', insufficient: 'Insufficient evidence', stop: 'Stop for now', unavailable: 'Unavailable',
};
describe('portable inquiry outcome', () => {
    it('renders only consulted exact paths, retaining uncertainty and literal authored prose', () => {
        const inquiry = { ...createInquiry('one'), response: 'My **own** response', gaps: 'Still uncertain', selectedPaths: ['candidate.md'], consultedPaths: ['folder/a (1).md'] };
        const text = renderInquiryOutcome({ inquiry, operationId: 'op1', references: [{ path: 'folder/a (1).md', link: '[a](folder/a%20%281%29.md)' }] }, labels);
        expect(text).toContain('My **own** response');
        expect(text).toContain('Still uncertain');
        expect(text).toContain('folder/a%20%281%29.md');
        expect(text).not.toContain('candidate.md');
        expect(text).not.toContain('Confidence');
        expect(text).toContain('User-authored');
        expect(text).toContain('<!-- zf-inquiry:op1:end -->');
    });
    it('accepts an honest empty outcome but never launders unapproved machine text', () => {
        const inquiry = createInquiry('one');
        expect(renderInquiryOutcome({ inquiry, operationId: 'op', references: [] }, labels)).toContain('No evidence consulted');
        for (const verdict of ['rejected', undefined]) {
            expect(() => renderInquiryOutcome({ inquiry: { ...inquiry, provenance: { origin: 'ai', verdict } } as any, operationId: 'op', references: [] }, labels)).toThrow();
        }
        expect(renderInquiryOutcome({ inquiry: { ...inquiry, provenance: { origin: 'derived', verdict: 'modified' } }, operationId: 'op', references: [] }, labels)).toContain('Modified proposal');
        expect(() => renderInquiryOutcome({ inquiry, operationId: 'op', references: [{ path: 'unconsulted.md', link: 'bad' }] }, labels)).toThrow();
    });
});