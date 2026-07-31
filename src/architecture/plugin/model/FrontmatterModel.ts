/**
 * Any frontmatter value. Frontmatter is dynamic user data, so a `Literal` must be
 * narrowed (typeof/Array.isArray/type-guards) before use — hence `unknown` rather
 * than a wide union that would collapse to `unknown` anyway.
 */
export type Literal = unknown;
/** A `Literal` that is known to be non-null/undefined (an "informed" value). */
export type InformedLiteral = string | number | boolean | Array<Literal> | object;