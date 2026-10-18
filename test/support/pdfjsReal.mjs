// The real pdf.js, out of jest's process (#842): jest cannot load pdf.js's ES modules, so a suite runs
// this with `node` and talks to it in JSON. It is the published build closest to the one Obsidian 1.14.4
// ships (5.3.31 against 5.3.34), a devDependency only: nothing under src/ ever imports it.
//
//   node test/support/pdfjsReal.mjs <request.json>   →   prints one line, `@@zf <json>`
//
// Requests:
//   { op: "pages", pdf, pages }            → for each page index: its text items, styles and view
//   { op: "save", pdf, payloads }          → the bytes saveDocument() writes with the payloads set
//   { op: "read", pdf, pages }             → for each page index: its annotations, as the share reads them
import { readFileSync } from "fs";

// pdf.js's legacy build asks for a DOMMatrix at import when no native canvas is installed.
if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class {
        constructor() {
            Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        }
    };
}
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
const bytes = new Uint8Array(Buffer.from(request.pdf, "base64"));
const open = (data) => pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
const out = {};
const doc = await open(bytes.slice());
try {
    if (request.op === "pages") {
        out.pages = [];
        for (const index of request.pages) {
            const page = await doc.getPage(index + 1);
            const content = await page.getTextContent();
            out.pages.push({ index, view: page.view, rotate: page.rotate, items: content.items.filter((item) => typeof item.str === "string").map(({ str, transform, width, height, fontName }) => ({ str, transform, width, height, fontName })), styles: content.styles });
        }
    } else if (request.op === "save") {
        request.payloads.forEach((payload, key) => {
            const value = { ...payload };
            if (value.quadPoints) value.quadPoints = new Float32Array(value.quadPoints);
            if (value.outlines) value.outlines = value.outlines.map((outline) => new Float32Array(outline));
            doc.annotationStorage.setValue(`pdfjs_internal_editor_${key}`, value);
        });
        out.saved = Buffer.from(await doc.saveDocument()).toString("base64");
    } else if (request.op === "read") {
        out.pages = {};
        for (const index of request.pages) {
            const annotations = await (await doc.getPage(index + 1)).getAnnotations({ intent: "display" });
            out.pages[index] = annotations.map((a) => ({ subtype: a.subtype, contents: a.contentsObj?.str ?? "", title: a.titleObj?.str ?? "", color: a.color ? [...a.color] : null }));
        }
    }
} finally {
    await doc.destroy();
}
process.stdout.write(`@@zf ${JSON.stringify(out)}\n`);
