import { Completion } from "architecture/components/core";

export const noteCompletions: Completion[] = [
    {
        label: 'setTitle',
        type: 'method',
        info: '(title: string):NoteDTO => update the title of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'getTitle',
        type: 'method',
        info: '():string => get the title of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'setTargetFolder',
        type: 'method',
        info: '(folder: string):NoteDTO => update the target folder of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'getTargetFolder',
        type: 'method',
        info: '():string => get the target folder of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
];