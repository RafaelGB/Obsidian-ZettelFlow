import { describe, expect, it } from '@jest/globals';
import { FileService } from 'architecture/plugin/services/FileService';
import { FakeVault } from '../../support/harness';
import { readFileSync } from 'fs';
import { join } from 'path';
const files=[{path:'Flows/Tour/main.canvas',content:'canvas'},{path:'Flows/Tour/step.md',content:'step'}];
describe('canonical gallery create-only installation',()=>{
    it('keeps the existing three tour entry points and points to own-material work',()=>{
        const tour=JSON.parse(readFileSync(join(__dirname,'../../../docs/systems/zettelflow-tour.zftemplate'),'utf8'));
        expect(tour.steps).toHaveLength(3);
        expect(tour.steps.every((step:{content:string})=>step.content.includes('root: true'))).toBe(true);
        expect(tour.description).toContain('Start with my material');
        expect(tour.description).toContain('do not prove understanding');
    });
    it('creates fresh files and retries an identical installation without rewriting',async()=>{
        const vault=new FakeVault();
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
    });
    it('preflights all customized collisions before creating any files',async()=>{
        const vault=new FakeVault();vault.add(files[1].path,{body:'My custom step'});
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('conflict');
        expect(vault.entries.size).toBe(1);
        expect(vault.contentOf(files[1].path)).toBe('My custom step');
    });
    it('makes partial completion explicit and resumes only missing files',async()=>{
        const vault=new FakeVault();const create=vault.create.bind(vault);let fail=true;
        vault.create=async(path,content)=>{if(fail && path.endsWith('step.md'))throw new Error('disk failed');return create(path,content);};
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('partial');
        expect(vault.entries.size).toBe(1);fail=false;
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('complete');
        expect(vault.entries.size).toBe(2);
    });
    it('does not overwrite racing customized creations or traverse unsafe folders',async()=>{
        const vault=new FakeVault();const create=vault.create.bind(vault);
        vault.create=async(path,_content)=>{await create(path,'racing prose');throw new Error('exists');};
        expect(await FileService.createFilesOnce(vault as any,files)).toBe('partial');
        expect(vault.contentOf(files[0].path)).toBe('racing prose');
        expect(await FileService.createFilesOnce(vault as any,[{path:'../bad.md',content:'bad'}])).toBe('conflict');
    });
});