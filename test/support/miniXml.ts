/**
 * A small XML parser for tests (#675): enough of `DOMParser` to read the EPUB files the Library
 * parses — elements, attributes, text, CDATA, comments, entities — into nodes shaped like the DOM's
 * (`nodeType`, `nodeName`, `localName`, `getAttribute`, `attributes`, `childNodes`, `textContent`).
 *
 * The app parses with the platform's `DOMParser`; jest runs in node, which has none. This is not a
 * conforming parser: it exists so a test can be written as the hostile XHTML it is about.
 */

export interface MiniNode {
    nodeType: number;
    nodeName: string;
    localName: string | null;
    namespaceURI: string | null;
    data?: string;
    attributes: { name: string; value: string }[];
    childNodes: MiniNode[];
    parentNode: MiniNode | null;
    readonly textContent: string;
    getAttribute(name: string): string | null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
        if (name[0] === "#") return String.fromCodePoint(name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10));
        return ENTITIES[name] ?? whole;
    });
}

function node(nodeType: number, nodeName: string, parent: MiniNode | null): MiniNode {
    const colon = nodeName.indexOf(":");
    const n: MiniNode = {
        nodeType,
        nodeName,
        localName: nodeType === 1 ? (colon >= 0 ? nodeName.slice(colon + 1) : nodeName) : null,
        namespaceURI: null,
        attributes: [],
        childNodes: [],
        parentNode: parent,
        get textContent(): string {
            if (n.nodeType === 3 || n.nodeType === 4) return n.data ?? "";
            if (n.nodeType === 8) return "";
            return n.childNodes.map((child) => child.textContent).join("");
        },
        getAttribute(name: string): string | null {
            return n.attributes.find((a) => a.name === name)?.value ?? null;
        },
    };
    return n;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const MATH_NS = "http://www.w3.org/1998/Math/MathML";

export function parseXml(text: string): { documentElement: MiniNode | null } {
    const doc = node(9, "#document", null);
    let current = doc;
    let at = 0;
    const re = /<!--([\s\S]*?)-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        if (match.index > at) {
            const t = node(3, "#text", current);
            t.data = decode(text.slice(at, match.index));
            current.childNodes.push(t);
        }
        at = re.lastIndex;
        if (match[1] !== undefined) {
            const c = node(8, "#comment", current);
            c.data = match[1];
            current.childNodes.push(c);
        } else if (match[2] !== undefined) {
            const c = node(4, "#cdata-section", current);
            c.data = match[2];
            current.childNodes.push(c);
        } else if (match[3]) {
            if (current.parentNode) current = current.parentNode;
        } else if (match[4]) {
            const el = node(1, match[4], current);
            for (const [, name, quoted] of match[5].matchAll(/([\w:.-]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
                el.attributes.push({ name, value: decode(quoted.slice(1, -1)) });
            }
            const xmlns = el.getAttribute("xmlns");
            el.namespaceURI = xmlns ?? (el.localName === "svg" ? SVG_NS : el.localName === "math" ? MATH_NS : current.namespaceURI ?? XHTML_NS);
            current.childNodes.push(el);
            if (!match[6]) current = el;
        }
    }
    return { documentElement: doc.childNodes.find((child) => child.nodeType === 1) ?? null };
}

/** A `DOMParser`-shaped parse for code that takes one. */
export const miniParse = (text: string): { documentElement: MiniNode | null } => parseXml(text);
