// The formats paper (epic #836) as a real PDF, for walking the reading view by hand:
//   node scripts/pdf-formats-sample.mjs "<vault>/Formats sample.pdf"
// It writes the layout the tests read (test/fixtures/pdf/formats.json) with the 14 standard fonts,
// so what a person sees in Obsidian is the page the jest suites reflow. Dev tooling, never bundled.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const out = process.argv[2];
if (!out) {
    console.error('usage: node scripts/pdf-formats-sample.mjs "<vault>/Formats sample.pdf"');
    process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const layout = JSON.parse(readFileSync(join(here, "..", "test", "fixtures", "pdf", "formats.json"), "utf8"));
const fontKeys = Object.keys(layout.fonts);
// WinAnsi: the bullet is 0x95; everything else in the sample is Latin-1.
const encode = (s) => s.replace(/•/g, "\x95").replace(/[()\\]/g, (m) => "\\" + m);

const objs = [];
const add = (body) => objs.push(body) && objs.length;
const catalog = add("");
const pages = add("");
const fontRefs = Object.fromEntries(fontKeys.map((key) => [key, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${layout.fonts[key]} /Encoding /WinAnsiEncoding >>`)]));
const fonts = fontKeys.map((key) => `/${key} ${fontRefs[key]} 0 R`).join(" ");
const pageRefs = layout.pages.map(() => add(""));
layout.pages.forEach((page, i) => {
    const content = page.ops.map((op) => `BT /${op.font} ${op.size} Tf ${op.x} ${op.y} Td (${encode(op.str)}) Tj ET`).join("\n");
    const contents = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const annots = (page.links ?? []).map((link) => {
        const action = link.url ? `/A << /S /URI /URI (${link.url}) >>` : `/Dest [${pageRefs[link.dest]} 0 R /XYZ 0 ${layout.height} 0]`;
        return add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(" ")}] /Border [0 0 0] ${action} >>`);
    });
    objs[pageRefs[i] - 1] =
        `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${layout.width} ${layout.height}] /Resources << /Font << ${fonts} >> >> /Contents ${contents} 0 R` +
        (annots.length ? ` /Annots [${annots.map((n) => `${n} 0 R`).join(" ")}]` : "") +
        " >>";
});
objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
objs[pages - 1] = `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
const offsets = objs.map((body, i) => {
    const at = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
});
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(out, Buffer.from(pdf, "latin1"));
console.log(`wrote ${out}`);
