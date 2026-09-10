import { App, SuggestModal, TFile } from 'obsidian';
import { KnowledgeIndex } from 'architecture/knowledge';
import { t } from 'architecture/lang';

/** Literal title/path picker, using the existing index, never a body or natural-language search. */
export class InquiryNoteSuggest extends SuggestModal<TFile> {
    constructor(app: App, private readonly selected: (path: string) => void) { super(app); this.setPlaceholder(t('inquiry_choose_note')); }
    getSuggestions(query: string): TFile[] {
        const index = KnowledgeIndex.getInstance(); const term = query.toLocaleLowerCase(); const result: TFile[] = [];
        for (const idea of index.getModel().all()) {
            if (!index.inScope(idea.path) || (!idea.path.toLocaleLowerCase().includes(term) && !idea.title.toLocaleLowerCase().includes(term))) continue;
            const file = this.app.vault.getFileByPath(idea.path);
            if (file instanceof TFile) result.push(file);
            if (result.length >= 50) break;
        }
        return result;
    }
    renderSuggestion(file: TFile, el: HTMLElement): void { el.createDiv({ text: file.path }); }
    onChooseSuggestion(file: TFile): void {
        if (KnowledgeIndex.getInstance().inScope(file.path) && this.app.vault.getFileByPath(file.path) === file) this.selected(file.path);
    }
}