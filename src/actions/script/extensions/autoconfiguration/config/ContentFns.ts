import { Completion } from "architecture/components/core";

export const contentCompletions: Completion[] = [
    {
        label: 'add',
        type: 'method',
        info: 'add(content: string) => Add new content to the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'get',
        type: 'method',
        info: 'get():string => get the content of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'modify',
        type: 'method',
        info: 'modify(key: string, result: string) => Substitute a substring of the content with the result',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'addTag',
        type: 'method',
        info: '(tag: string) => add a tag to the note (frontmatter)',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'addTags',
        type: 'method',
        info: '(tags: string[]) => add tags to the note (frontmatter)',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'getTags',
        type: 'method',
        info: '():string[] => get the tags of the note (frontmatter)',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'addFrontMatter',
        type: 'method',
        info: '(frontmatter: Record<string, Literal>) => add properties to the frontmatter',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
    {
        label: 'getFrontMatter',
        type: 'method',
        info: '():Record<string, Literal> => get the frontmatter of the note',
        detail: '✨ ZettelFlow Script Action',
        boost: 1
    },
];