import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/**
 * Cultivate takes a note handed over by name (#672): the Reader's end card opens it on the thesis.
 * The renderer's constructor reaches singletons the jest mock does not carry, so the seam is read.
 */
describe('Cultivate takes a note handed over by name (#672)', () => {
    it('starts on the view state\'s target, and only on a non-empty one', () => {
        const renderer = read('src/architecture/components/core/cultivate/CultivateModeRenderer.ts');
        const ctor = renderer.slice(renderer.indexOf('constructor('), renderer.indexOf('\n    }', renderer.indexOf('constructor(')));
        expect(ctor).toContain("typeof state?.target === 'string' && state.target.length > 0");
        expect(ctor).toContain('this.targetPath = state.target');
    });

    it('is what the Reader sends', () => {
        expect(read('src/architecture/components/core/reader/ReaderView.ts')).toContain(
            'activateSurface(this.app, "zettelflow-home", "cultivate", { target: thesis })'
        );
    });
});
