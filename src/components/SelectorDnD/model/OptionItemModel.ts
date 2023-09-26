export type OptionItemProps = {
    frontmatter: string,
    label: string,
    index: number,
    deleteOptionCallback: (index: number) => void,
    updateOptionInfoCallback: (index: number, frontmatter: string, label: string) => void
}