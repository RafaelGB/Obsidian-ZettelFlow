import { inquiryErrors, type Inquiry } from './inquiryState';

export interface InquiryOutcomeLabels {
    purpose: string; response: string; gaps: string; references: string; empty: string;
    authored: string; accepted: string; modified: string; confidence: string; unresolved: string;
    sufficient: string; continue: string; insufficient: string; stop: string; unavailable: string;
}
export interface InquiryOutcomeSnapshot {
    inquiry: Inquiry;
    operationId: string;
    /** Exact links produced at the Vault boundary. Unavailable history has no link. */
    references: { path: string; link?: string }[];
}
export function renderInquiryOutcome({ inquiry: q, operationId, references }: InquiryOutcomeSnapshot, labels: InquiryOutcomeLabels): string {
    if (inquiryErrors(q).length || !/^[a-zA-Z0-9-]{1,80}$/.test(operationId) || references.some(ref => !q.consultedPaths.includes(ref.path))) throw new Error('Invalid inquiry outcome');
    const provenance = q.provenance.origin === 'human' ? labels.authored : `${q.provenance.verdict === 'accepted' ? labels.accepted : labels.modified} (${q.provenance.origin})`;
    const refs = q.consultedPaths.map(path => {
        const ref = references.find(item => item.path === path);
        // Unavailable paths are prose, not ambiguous wikilinks or invented citations.
        return `- ${ref?.link ?? `${labels.unavailable}: ${path.replace(/[[\]<>*_`]/g, '\\$&')}`}`;
    });
    return [
        `<!-- zf-inquiry:${operationId}:start -->`,
        `# ${labels.purpose}`, q.purpose, `## ${labels.response}`, provenance,
        q.response, q.resolution === 'sufficient-for-now' ? labels.sufficient : labels.unresolved,
        labels[q.disposition], ...(q.confidence ? [`${labels.confidence}: ${q.confidence}`] : []),
        `## ${labels.references}`, refs.length ? refs.join('\n') : labels.empty,
        `## ${labels.gaps}`, q.gaps, `<!-- zf-inquiry:${operationId}:end -->`, '',
    ].join('\n\n');
}