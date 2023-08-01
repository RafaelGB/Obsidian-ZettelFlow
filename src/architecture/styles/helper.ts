export const CSS_PREFIX = 'zettelkasten-flow';

export function c(className: string): string {
    const wrappedClasses: string[] = [];
    className.split(' ').forEach((cls) => {
        wrappedClasses.push(`${CSS_PREFIX}__${cls}`);
    });
    return wrappedClasses.join(' ');
}