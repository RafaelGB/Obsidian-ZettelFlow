export const CSS_PREFIX = 'zettelkasten-flow';

export function c(...classes: string[]): string {
    const wrappedClasses: string[] = [];
    classes.forEach((cls) => {
        wrappedClasses.push(`${CSS_PREFIX}__${cls}`);
    });
    return wrappedClasses.join(' ');
}