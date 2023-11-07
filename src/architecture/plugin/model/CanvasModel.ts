export type ZettelNode = {
    id: string;
    tooltip?: string;
    file?: string;
    color?: string;
    children?: ZettelNode[];
}

export type ZettelNodeSource = {
    file: string;
    color: string;
    children: ZettelNode[];
} & ZettelNode
