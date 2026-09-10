import { describe, expect, it } from '@jest/globals';
import { SerializedSettingsWriter } from 'architecture/plugin/services/SerializedSettingsWriter';

describe('one acknowledged settings writer', () => {
    it('freezes snapshots, serializes calls and continues after failure', async () => {
        const writes: number[] = [];
        let release!: () => void;
        let active = 0;
        let maximum = 0;
        const writer = new SerializedSettingsWriter(async (raw) => {
            active++; maximum = Math.max(active, maximum);
            writes.push((raw as {n:number}).n);
            if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
            active--;
            if (writes.length === 1) throw new Error('failure');
        });
        const value = { n: 1 };
        const one = writer.save(value);
        const rejection = expect(one).rejects.toThrow('failure');
        value.n = 9;
        const two = writer.save({n: 2});
        await Promise.resolve();
        expect(writes).toEqual([1]);
        release();
        await rejection; await two;
        expect(writes).toEqual([1, 2]);
        expect(maximum).toBe(1);
    });
});