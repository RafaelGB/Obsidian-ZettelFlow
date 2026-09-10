import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FakeElement } from '../support/dom';
import { HomeModeRenderer } from 'architecture/components/core/home/HomeModeRenderer';
import { QuickCaptureModal } from 'zettelkasten/modals/QuickCaptureModal';
import { InquiryRuntime } from 'architecture/plugin/inquiry/InquiryRuntime';

const runtime=InquiryRuntime.getInstance();
afterEach(()=>runtime.dispose());
describe('first-use entry without a setup ritual',()=>{
    it('Home exposes own-material entry while indexing and for an empty vault',()=>{
        runtime.init({load:()=>undefined,persist:async()=>{},now:()=>1,id:()=> 'one'});
        const root=new FakeElement();const renderer=new HomeModeRenderer(root as any,{} as any);
        for(const state of ['indexing','empty']){
            (renderer as any).state=state;(renderer as any).render();
            expect(root.find(el=>el.tag==='button' && el.textContent==='Start with my material')).toBeDefined();
            expect(root.find(el=>el.tag==='button' && el.textContent==='Cultivate without a purpose')).toBeDefined();
        }
    });
    it('capture keeps its title until acknowledgement and coalesces repeat submits',async()=>{
        let done!:(value:boolean)=>void;
        const capture=jest.fn(()=>new Promise<boolean>(resolve=>{done=resolve;}));
        const modal=new QuickCaptureModal({app:{}} as any,{capture});const root=new FakeElement();
        (modal as any).contentEl=root;const close=jest.spyOn(modal,'close');modal.onOpen();
        const input=root.find(el=>el.tag==='input')!;input.value='My thought';
        const button=root.find(el=>el.tag==='button')!;button.fire('click');button.fire('click');
        expect(capture).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
        done(false);await Promise.resolve();await Promise.resolve();
        expect(input.value).toBe('My thought');expect(close).not.toHaveBeenCalled();
        button.fire('click');done(true);await Promise.resolve();await Promise.resolve();
        expect(close).toHaveBeenCalledTimes(1);
    });
});