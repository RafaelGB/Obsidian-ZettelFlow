export const contentCompletions = [
    { label: 'add', type: 'method', info: 'add(content: string) => Add new content to the note' },
    { label: 'get', type: 'method', info: 'get():string => get the content of the note' },
    { label: 'modify', type: 'method', info: 'modify(key: string, result: string) => Substitute a substring of the content with the result' },
    { label: 'addTag', type: 'method', info: '(tag: string) => add a tag to the note (frontmatter)' },
    { label: 'addTags', type: 'method', info: '(tags: string[]) => add tags to the note (frontmatter)' },
    { label: 'getTags', type: 'method', info: '():string[] => get the tags of the note (frontmatter)' },
    { label: 'addFrontMatter', type: 'method', info: '(frontmatter: Record<string, Literal>) => add properties to the frontmatter' },
    { label: 'getFrontMatter', type: 'method', info: '():Record<string, Literal> => get the frontmatter of the note' },
];