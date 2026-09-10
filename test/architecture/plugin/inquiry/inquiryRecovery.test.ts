import { afterEach, describe, expect, it } from '@jest/globals';
import { InquiryRuntime, type InquiryHost } from 'architecture/plugin/inquiry/InquiryRuntime';
import { FileService } from 'architecture/plugin/services/FileService';
import { createInquiry, type InquiryStorage } from 'architecture/knowledge/inquiry/inquiryState';
import { FakeVault } from '../../../support/harness';

const labels = { purpose:'Purpose',response:'Response',gaps:'Gaps',references:'Sources',empty:'None',authored:'Authored',accepted:'Accepted',modified:'Modified',confidence:'Confidence',unresolved:'Unresolved',sufficient:'Sufficient',continue:'Continue',insufficient:'Insufficient',stop:'Stop',unavailable:'Unavailable' };
const runtime = InquiryRuntime.getInstance();
afterEach(() => runtime.dispose());
function setup() {
    const vault = new FakeVault();
    const writes: string[] = [];
    let disk: unknown;
    let saves = 0;
    let failAt = 0;
    const excluded = new Set<string>();
    const host: InquiryHost = {
        load: () => disk,
        persist: async data => { saves++; if (saves === failAt) throw new Error('save failed'); disk = JSON.parse(JSON.stringify(data)); },
        now: () => 1, id: () => 'op1',
        inScope: path => !excluded.has(path), available: path => !!vault.getFileByPath(path),
        link: path => `[${path}](${path})`,
        writeOperation: async op => { writes.push(op.path); return FileService.createFileOnce(vault as any, op, path => !excluded.has(path)); },
    };
    runtime.init(host); runtime.start(); runtime.update({kind:'text',field:'response',value:'My response'});
    return {vault,host,writes,excluded,disk:()=>disk,fail:(n:number)=>{failAt=n;}};
}
describe('inquiry write protocol and references', () => {
    it('never creates before pending intent is acknowledged', async () => {
        const h = setup(); h.fail(1);
        expect(await runtime.saveOutcome(labels,'out.md')).toBe(false);
        expect(h.writes).toEqual([]);
        expect(runtime.getSnapshot().current?.pending?.path).toBe('out.md');
    });
    it('recovers created-file/failed-receipt across restart using the same identity', async () => {
        const h = setup(); h.fail(2);
        expect(await runtime.saveOutcome(labels,'out.md')).toBe(false);
        expect(runtime.getSnapshot().status).toBe('partial');
        expect(h.vault.entries.size).toBe(1);
        runtime.dispose(); runtime.init(h.host); h.fail(0);
        expect(await runtime.saveOutcome(labels,'another.md')).toBe(true);
        expect(h.vault.entries.size).toBe(1);
        expect(runtime.getSnapshot().current?.receipt?.path).toBe('out.md');
        expect(await runtime.saveOutcome(labels,'another.md')).toBe(true);
        expect(h.vault.entries.size).toBe(1);
    });
    it('retains edits during I/O and blocks destructive bookkeeping until it settles', async () => {
        const h = setup(); let release!: () => void;
        const writer = h.host.writeOperation!;
        h.host.writeOperation = async op => { await new Promise<void>(resolve => { release=resolve; }); return writer(op); };
        const saving = runtime.saveOutcome(labels,'out.md');
        await Promise.resolve(); await Promise.resolve();
        runtime.update({kind:'text',field:'response',value:'New input'});
        expect(await runtime.clear(true)).toBe(false);
        release(); await saving;
        expect(runtime.getSnapshot().current?.response).toBe('New input');
        expect(h.vault.contentOf('out.md')).toContain('My response');
        expect(h.vault.contentOf('out.md')).not.toContain('New input');
    });
    it('refuses excluded references on a pending retry without reading them', async () => {
        const h = setup(); h.vault.add('source.md');
        runtime.update({kind:'consult',path:'source.md',consulted:true}); h.fail(1);
        await runtime.saveOutcome(labels,'out.md');
        h.fail(0); h.excluded.add('source.md');
        expect(await runtime.saveOutcome(labels,'out.md')).toBe(false);
        expect(h.writes).toEqual([]);
        expect(runtime.getSnapshot().status).toBe('conflict');
    });
    it('does not confuse offline rename or a recreated path with the original reference', async () => {
        setup(); runtime.update({kind:'focus',path:'old.md'}); runtime.update({kind:'consult',path:'old.md',consulted:true});
        runtime.rename('old.md','new.md',true);
        expect(runtime.getSnapshot().current?.consultedPaths).toEqual(['new.md']);
        runtime.markMissing('new.md');
        runtime.rename('new.md','guess.md',false);
        expect(runtime.getSnapshot().current?.focusPath).toBe('new.md');
        expect(runtime.getSnapshot().current?.missingPaths).toContain('new.md');
        runtime.update({kind:'focus',path:'replacement.md'});
        expect(runtime.getSnapshot().current?.consultedPaths).not.toContain('replacement.md');
    });
    it('retains inquiry state regardless of more than 500 unrelated judgements', async () => {
        const data = {inquiry:{version:1,current:createInquiry('one')},judgements:{enabled:false,log:Array.from({length:700},()=>({verdict:'accepted'}))}};
        runtime.init({load:()=>data.inquiry,persist:async value=>{data.inquiry=value as typeof data.inquiry;},now:()=>1,id:()=> 'one'});
        runtime.update({kind:'text',field:'gaps',value:'independent'}); await runtime.save();
        data.judgements.log=[]; runtime.dispose(); runtime.init({load:()=>data.inquiry,persist:async (_value:InquiryStorage)=>{},now:()=>1,id:()=> 'one'});
        expect(runtime.getSnapshot().current?.gaps).toBe('independent');
    });
});