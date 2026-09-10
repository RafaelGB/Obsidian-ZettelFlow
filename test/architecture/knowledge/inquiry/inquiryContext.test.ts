import { describe, expect, it } from '@jest/globals';
import { KnowledgeModel } from 'architecture/knowledge/model/KnowledgeModel';
import { deriveIdea } from 'architecture/knowledge/model/Idea';
import { createInquiry, parseInquiryStorage } from 'architecture/knowledge/inquiry/inquiryState';
import { buildInquiryContext } from 'architecture/knowledge/inquiry/inquiryContext';
import { openQuestions } from 'architecture/knowledge/questions/openQuestions';

function idea(path: string, relations: {type: string; from: string; to: string}[] = []) {
    return { ...deriveIdea({ path, title: path, created: 0, modified: 0, frontmatter: {}, tags: [], outgoingLinks: [], inlineFields: [] }), relations };
}
describe('bounded inquiry context', () => {
    it('defaults to selected material; purpose text is not a semantic search', () => {
        const model = new KnowledgeModel();
        model.build([idea('a.md', [{from: 'a.md', to: 'b.md', type: 'supports'}]), idea('b.md', [{from: 'b.md', to: 'c.md', type: 'supports'}]), idea('c.md')]);
        const q = { ...createInquiry('one'), focusPath: 'a.md', selectedPaths: ['a.md'] };
        expect(buildInquiryContext(model, q).materials.map(x => x.path)).toEqual(['a.md']);
        const expanded = buildInquiryContext(model, { ...q, scope: 'neighbors' });
        expect(expanded.materials.map(x => x.path)).toEqual(['a.md', 'b.md']);
        expect(expanded.candidates[0].reason).toEqual({ from: 'a.md', to: 'b.md', type: 'supports' });
        expect(buildInquiryContext(model, { ...q, scope: 'neighbors', purpose: 'totally unrelated' })).toEqual(expanded);
        expect(q.consultedPaths).toEqual([]);
    });
    it('excludes endpoints and linked sources and does not mutate the indexed ideas', () => {
        const model = new KnowledgeModel();
        const a = idea('a.md', [{from: 'a.md', to: 'secret/b.md', type: 'contradicts'}]);
        a.claims = [{text: 'claim', sources: [{ref: 'secret/b.md', kind: 'link'}, {ref: 'doi:ok', kind: 'text'}]}];
        model.build([a, idea('secret/b.md')]);
        const before = JSON.stringify(model.all());
        const result = buildInquiryContext(model, { ...createInquiry('one'), selectedPaths: ['a.md'], scope: 'neighbors' }, ['secret']);
        expect(result.materials.map(x => x.path)).toEqual(['a.md']);
        expect(JSON.stringify(result.evidence)).not.toContain('secret/b.md');
        expect(result.evidence).toHaveLength(1);
        expect(JSON.stringify(model.all())).toBe(before);
    });
    it('bounds inspected records, not just displayed rows', () => {
        const model = new KnowledgeModel();
        const a = idea('a.md', Array.from({length: 3000}, (_, n) => ({ from: 'a.md', to: `b${n}.md`, type: 'supports' })));
        model.build([a, ...Array.from({length: 3000}, (_, n) => idea(`b${n}.md`))]);
        const result = buildInquiryContext(model, { ...createInquiry('one'), selectedPaths: ['a.md'], scope: 'neighbors' });
        expect(result.inspected).toBeLessThanOrEqual(1000);
        expect(result.materials.length).toBeLessThanOrEqual(200);
        expect(result.candidates.length).toBeLessThanOrEqual(50);
        expect(result.truncated).toBe(true);
    });
    it('preserves human unresolved status when the structural query drops a supported question', () => {
        const model = new KnowledgeModel();
        model.build([idea('a.md', [{from: 'a.md', to: 'q.md', type: 'question'}]), idea('q.md')]);
        expect(openQuestions(model)).toHaveLength(1);
        model.upsert(idea('b.md', [{from: 'b.md', to: 'q.md', type: 'supports'}]));
        expect(openQuestions(model)).toHaveLength(0);
        const q = { ...createInquiry('one'), selectedPaths: ['q.md'], focusPath: 'q.md' };
        buildInquiryContext(model, q);
        expect(parseInquiryStorage({version: 1, current: q}).current?.resolution).toBe('unresolved');
    });
});