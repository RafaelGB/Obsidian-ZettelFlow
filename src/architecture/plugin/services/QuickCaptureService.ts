import { TFolder, type Vault } from 'obsidian';
import { FileService, type CreateFileResult } from './FileService';
import type { InquiryOperation } from 'architecture/knowledge/inquiry/inquiryState';

/** Shared by the existing quick-capture command and inquiry; never overwrites an existing note. */
export class QuickCaptureService {
    constructor(private readonly vault: Pick<Vault, 'getAbstractFileByPath' | 'read' | 'create' | 'createFolder'>, private readonly allowed: (path: string) => boolean = () => true) {}
    plan(title: string, id: string): InquiryOperation {
        const clean = title.replace(/[\r\n]/g, ' ').trim();
        const name = clean.replace(/[\\/:*?"<>|#^[\]]/g, ' ').trim().replace(/[. ]+$/, '');
        if (!name || name.length > 180 || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid capture');
        let path = `Inbox/${name}.md`;
        if (this.vault.getAbstractFileByPath(path)) path = `Inbox/${name} ${id}.md`;
        return {id, kind: 'capture', path, revision: 0, references: [], content: `---\nstate: fleeting\n---\n\n# ${clean}\n\n<!-- zf-capture:${id} -->\n`};
    }
    async write(operation: InquiryOperation): Promise<CreateFileResult> {
        if (!this.allowed(operation.path)) return {status:'failed', path:operation.path};
        try {
            if (!this.vault.getAbstractFileByPath('Inbox')) {
                try { await this.vault.createFolder('Inbox'); }
                catch { if (!(this.vault.getAbstractFileByPath('Inbox') instanceof TFolder)) return {status:'failed',path:operation.path}; }
            }
            return await FileService.createFileOnce(this.vault, operation, this.allowed);
        } catch { return {status:'failed',path:operation.path}; }
    }
}