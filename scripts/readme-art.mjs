#!/usr/bin/env node
/**
 * The README's animated art — generated, never hand-edited.
 *
 *   node scripts/readme-art.mjs
 *
 * GitHub runs no JavaScript in a README, but it does render an SVG through `<img>` — CSS keyframes
 * and SMIL included. So the JavaScript lives here, at build time, and writes:
 *
 *   docs/resources/readme/banner-dark.svg   the masthead, for a dark GitHub theme
 *   docs/resources/readme/banner-light.svg  the same masthead, for a light one
 *   docs/resources/readme/reader-hero.svg   the Reader and the Library, in one continuous shot
 *
 * Every animation settles into a readable still frame under `prefers-reduced-motion`, uses only
 * system fonts (an `<img>` SVG cannot load a web font), and loops quietly.
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "resources", "readme");
const SANS = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Charter, 'Iowan Old Style', Georgia, 'Times New Roman', serif";
const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LOGO = `<rect width="64" height="64" rx="14" fill="url(#logo)"/>
<path d="M17 18 H47 L17 46 H47" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
<circle cx="17" cy="18" r="5.5" fill="#fff"/><circle cx="47" cy="18" r="5.5" fill="#fff"/>
<circle cx="17" cy="46" r="5.5" fill="#fff"/><circle cx="47" cy="46" r="5.5" fill="#e0a351"/>`;

const THEMES = {
    dark: {
        bg0: "#1b1a26", bg1: "#121119", glow: "#7f6df2", glowOp: 0.30,
        text: "#efeefa", muted: "#a3a1b8", faint: "#6c6a80",
        card: "#22212e", card2: "#2a2938", stroke: "#3a3850", grid: "#2a2938",
        accent: "#8f7ff5", accentText: "#ffffff", amber: "#e0a351", green: "#5cc98a", blue: "#5aa9f0", red: "#f06a6f",
        chip: "#272637", chipStroke: "#3d3b54",
    },
    light: {
        bg0: "#fbfaff", bg1: "#efedfa", glow: "#7f6df2", glowOp: 0.16,
        text: "#1d1b2b", muted: "#58556e", faint: "#8f8ca6",
        card: "#ffffff", card2: "#f6f4ff", stroke: "#d9d5ee", grid: "#e4e1f3",
        accent: "#6a57e8", accentText: "#ffffff", amber: "#c98425", green: "#2f9e62", blue: "#2f7fd0", red: "#d9474d",
        chip: "#ffffff", chipStroke: "#d9d5ee",
    },
};

/** Text width estimate for chips — good enough for a sans at the given size. */
const textWidth = (s, size) => s.length * size * 0.5;

function chip(x, y, label, t, { dot } = {}) {
    const w = textWidth(label, 14) + (dot ? 38 : 28);
    const dotEl = dot ? `<circle cx="${x + 17}" cy="${y + 17}" r="4.5" fill="${dot}"/>` : "";
    return {
        w,
        svg: `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="34" rx="17" fill="${t.chip}" stroke="${t.chipStroke}"/>${dotEl}
<text x="${x + (dot ? 29 : 14)}" y="${y + 22}" fill="${t.text}" font-family="${SANS}" font-size="14" font-weight="550">${esc(label)}</text>`,
    };
}

// ─── The masthead ────────────────────────────────────────────────────────────────────────────────

function banner(name) {
    const t = THEMES[name];
    const W = 1280;
    const H = 420;

    // The scene on the right: a Canvas flow, a pulse walking it, the note it makes, the book it opens.
    const nodes = [
        { id: "a", x: 720, y: 92, label: "Capture", color: t.red },
        { id: "b", x: 720, y: 186, label: "Classify", color: t.amber },
        { id: "c", x: 720, y: 280, label: "Connect", color: t.green },
    ];
    const nodeSvg = nodes
        .map(
            (n, i) => `<g class="node n${i}">
<rect x="${n.x}" y="${n.y}" width="150" height="52" rx="10" fill="${t.card}" stroke="${t.stroke}" stroke-width="1.5"/>
<rect x="${n.x}" y="${n.y}" width="5" height="52" rx="2.5" fill="${n.color}"/>
<text x="${n.x + 20}" y="${n.y + 31}" fill="${t.text}" font-family="${SANS}" font-size="16" font-weight="650">${n.label}</text>
<rect class="ring" x="${n.x - 4}" y="${n.y - 4}" width="158" height="60" rx="13" fill="none" stroke="${t.accent}" stroke-width="2"/>
</g>`
        )
        .join("\n");

    const flowPath = "M795 144 V186 M795 238 V280";
    const toNote = "M870 306 C 905 306, 905 210, 940 210";

    const noteLines = [
        { w: 150, c: t.faint, mono: "---" },
        { w: 170, c: t.muted, mono: "state: fleeting" },
        { w: 170, c: t.accent, mono: "type: concept" },
        { w: 90, c: t.muted, mono: "links: 3" },
        { w: 150, c: t.faint, mono: "---" },
    ];
    const noteSvg = noteLines
        .map(
            (l, i) =>
                `<text class="ln l${i}" x="962" y="${158 + i * 21}" fill="${l.c}" font-family="ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace" font-size="13.5">${esc(l.mono)}</text>`
        )
        .join("\n");

    // The open book, bottom right, with a highlight sweeping one line.
    const book = `<g class="book" transform="translate(0 -12)">
<path d="M960 300 q60 -14 120 0 v86 q-60 -14 -120 0 z" fill="${t.card}" stroke="${t.stroke}" stroke-width="1.5"/>
<path d="M1080 300 q60 -14 120 0 v86 q-60 -14 -120 0 z" fill="${t.card}" stroke="${t.stroke}" stroke-width="1.5"/>
<line x1="1080" y1="300" x2="1080" y2="386" stroke="${t.stroke}" stroke-width="1.5"/>
${[0, 1, 2, 3].map((i) => `<rect x="972" y="${310 + i * 15}" width="${i === 3 ? 60 : 94}" height="4" rx="2" fill="${t.faint}" opacity="0.55"/>`).join("")}
${[0, 1, 2, 3].map((i) => `<rect x="1092" y="${310 + i * 15}" width="${i === 3 ? 50 : 94}" height="4" rx="2" fill="${t.faint}" opacity="0.55"/>`).join("")}
<rect class="hl" x="1089" y="322" width="100" height="10" rx="3" fill="${t.amber}" opacity="0.55"/>
</g>`;

    const chipsRow = [];
    let cx = 64;
    for (const [label, dot] of [
        ["Canvas workflows", t.red],
        ["Reader & Library", t.amber],
        ["Practice loops", t.green],
        ["Offline-first", t.blue],
    ]) {
        const c = chip(cx, 318, label, t, { dot });
        chipsRow.push(c.svg);
        cx += c.w + 10;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="ZettelFlow — draw your note workflow on a Canvas once, then read, think and practise with every note it makes.">
<title>ZettelFlow</title>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/></linearGradient>
<linearGradient id="logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7ff5"/><stop offset="1" stop-color="#5b45d6"/></linearGradient>
<linearGradient id="word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.text}"/><stop offset="1" stop-color="${t.accent}"/></linearGradient>
<radialGradient id="glow" cx="0.78" cy="0.45" r="0.5"><stop offset="0" stop-color="${t.glow}" stop-opacity="${t.glowOp}"/><stop offset="1" stop-color="${t.glow}" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="${t.grid}"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.faint}"/></marker>
</defs>
<style>
.node .ring{opacity:0}
.n0 .ring{animation:ring 6s infinite 0.2s}
.n1 .ring{animation:ring 6s infinite 1.2s}
.n2 .ring{animation:ring 6s infinite 2.2s}
@keyframes ring{0%{opacity:0}6%{opacity:1}18%{opacity:0}100%{opacity:0}}
.edge{stroke-dasharray:6 6;animation:march 1.2s linear infinite}
@keyframes march{to{stroke-dashoffset:-24}}
.note{animation:rise 6s infinite}
@keyframes rise{0%,40%{opacity:0;transform:translateY(8px)}50%,92%{opacity:1;transform:none}100%{opacity:0}}
.ln{opacity:0}
.l0{animation:type 6s infinite 0s}.l1{animation:type 6s infinite .15s}.l2{animation:type 6s infinite .3s}.l3{animation:type 6s infinite .45s}.l4{animation:type 6s infinite .6s}
@keyframes type{0%,50%{opacity:0}56%,92%{opacity:1}100%{opacity:0}}
.hl{transform-box:fill-box;transform-origin:left;animation:sweep 6s infinite}
@keyframes sweep{0%,62%{transform:scaleX(0)}74%,94%{transform:scaleX(1)}100%{transform:scaleX(0)}}
.cursor{animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion: reduce){
*{animation:none!important}
.ln,.note{opacity:1}
.hl{transform:none}
.pulse{display:none}
}
</style>
<rect width="${W}" height="${H}" rx="20" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="20" fill="url(#glow)"/>
<rect x="680" y="40" width="560" height="340" rx="16" fill="url(#dots)" stroke="${t.grid}"/>

<g transform="translate(64 64) scale(1.25)">${LOGO}</g>
<text x="64" y="216" fill="url(#word)" font-family="${SANS}" font-size="72" font-weight="800" letter-spacing="-2">ZettelFlow</text>
<text x="66" y="260" fill="${t.text}" font-family="${SANS}" font-size="23" font-weight="600">Draw your note workflow on a Canvas once —</text>
<text x="66" y="292" fill="${t.muted}" font-family="${SANS}" font-size="23" font-weight="500">then read, think and practise with every note it makes.</text>
${chipsRow.join("\n")}

<path class="edge" d="${flowPath}" fill="none" stroke="${t.faint}" stroke-width="2" marker-end="url(#arr)"/>
<path class="edge" d="${toNote}" fill="none" stroke="${t.accent}" stroke-width="2" marker-end="url(#arr)"/>
${nodeSvg}
<circle class="pulse" r="6" fill="${t.accent}">
<animateMotion dur="6s" repeatCount="indefinite" keyPoints="0;0.5;1;1" keyTimes="0;0.33;0.55;1" calcMode="linear" path="M795 118 V212 V306 H870 C 905 306, 905 210, 940 210"/>
<animate attributeName="opacity" dur="6s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;0.55;0.58;1"/>
</circle>

<g class="note">
<rect x="944" y="96" width="250" height="168" rx="12" fill="${t.card}" stroke="${t.accent}" stroke-width="1.5"/>
<text x="962" y="128" fill="${t.text}" font-family="${SANS}" font-size="16" font-weight="700">Ideas as debt</text>
<rect x="1114" y="112" width="64" height="22" rx="11" fill="${t.accent}"/>
<text x="1146" y="127" fill="${t.accentText}" font-family="${SANS}" font-size="11.5" font-weight="650" text-anchor="middle">New note</text>
${noteSvg}
</g>
${book}
</svg>
`;
}

// ─── The Reader and the Library ──────────────────────────────────────────────────────────────────

function readerHero() {
    const t = THEMES.dark;
    const W = 1200;
    const H = 660;
    const paper = "#f4efe3";
    const ink = "#2b2722";
    const inkSoft = "#6b6358";

    // Original prose — no quotation from any real book.
    const left = [
        "A note you never return to is a note",
        "you only kept. The shelf remembers",
        "where you stopped, but it cannot",
        "remember what you thought there.",
        "",
        "So the margin matters more than the",
        "page. What you mark is a question you",
        "asked the author; what you write",
        "beside it is the beginning of an",
        "answer that belongs to you.",
    ];
    const right = [
        "Reading slowly is not reading less.",
        "Each chapter is a set of claims, and a",
        "claim is only yours once you can say it",
        "back in your own words — without",
        "looking.",
        "",
        "That is why the book stops at the end",
        "of a chapter and asks what survived:",
        "not to test you, but to give the one",
        "idea worth keeping a note of its own.",
    ];
    const lineY = (i) => 178 + i * 27;
    const leftSvg = left
        .map((s, i) => (s ? `<text x="252" y="${lineY(i)}" fill="${ink}" font-family="${SERIF}" font-size="17">${esc(s)}</text>` : ""))
        .join("\n");
    const rightSvg = right
        .map((s, i) => (s ? `<text x="572" y="${lineY(i)}" fill="${ink}" font-family="${SERIF}" font-size="17">${esc(s)}</text>` : ""))
        .join("\n");

    // The shelf rail on the left: covers.
    const covers = [
        { y: 108, fill: "#4a7fd6", title: "Smart notes" },
        { y: 214, fill: "#c4524f", title: "Data systems" },
        { y: 320, fill: "#7f6df2", title: "A reading path" },
        { y: 426, fill: "#e8e3d6", title: "Paper · PDF", dark: true },
    ];
    const coverSvg = covers
        .map(
            (c, i) => `<g class="cover c${i}">
<rect x="56" y="${c.y}" width="72" height="96" rx="5" fill="${c.fill}"/>
<rect x="56" y="${c.y}" width="7" height="96" rx="3" fill="#000" opacity="0.18"/>
<text x="96" y="${c.y + 84}" fill="${c.dark ? "#3a352d" : "#fff"}" font-family="${SERIF}" font-size="10" font-weight="700" text-anchor="middle">${esc(c.title)}</text>
${i === 0 ? `<rect x="56" y="${c.y + 92}" width="44" height="4" rx="2" fill="${t.accent}"/>` : ""}
</g>`
        )
        .join("\n");

    // The waveform in the bar while Listen reads aloud.
    const bars = Array.from({ length: 9 }, (_, i) => `<rect class="wave w${i % 3}" x="${472 + i * 7}" y="603" width="4" height="18" rx="2" fill="${t.accent}"/>`).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The ZettelFlow Reader: your Library shelf on the left, a book open as a two-page spread, a sentence highlighted, a question written in the margin with the pen, the thought landing in Think, notes from your vault Alongside the page, and Listen reading the chapter aloud.">
<title>The Reader and the Library</title>
<defs>
<linearGradient id="page" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${paper}"/><stop offset="0.92" stop-color="${paper}"/><stop offset="1" stop-color="#e3dccb"/></linearGradient>
<linearGradient id="page2" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${paper}"/><stop offset="0.92" stop-color="${paper}"/><stop offset="1" stop-color="#e3dccb"/></linearGradient>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity="0.45"/></filter>
</defs>
<style>
.hl{transform-box:fill-box;transform-origin:left;animation:sweep 9s infinite}
@keyframes sweep{0%,8%{transform:scaleX(0)}20%,100%{transform:scaleX(1)}}
.pop{opacity:0;animation:pop 9s infinite}
@keyframes pop{0%,20%{opacity:0;transform:translateY(6px)}24%,34%{opacity:1;transform:none}38%,100%{opacity:0}}
.ink{stroke-dasharray:420;stroke-dashoffset:420;animation:draw 9s infinite}
@keyframes draw{0%,36%{stroke-dashoffset:420}50%,100%{stroke-dashoffset:0}}
.inkword{opacity:0;animation:fadein 9s infinite}
@keyframes fadein{0%,46%{opacity:0}52%,100%{opacity:1}}
.fly{opacity:0;animation:fly 9s infinite}
@keyframes fly{0%,54%{opacity:0;transform:translate(-90px,40px) scale(.9)}64%,100%{opacity:1;transform:none}}
.al1{animation:al .8s ease-out both .4s}.al2{animation:al .8s ease-out both .7s}
@keyframes al{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
.wave{transform-box:fill-box;transform-origin:center;animation:wave 1.1s ease-in-out infinite}
.w1{animation-delay:.2s}.w2{animation-delay:.45s}
@keyframes wave{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.voice{opacity:.16;animation:voice 9s infinite}
@keyframes voice{0%,100%{opacity:.0}10%,90%{opacity:.18}}
@media (prefers-reduced-motion: reduce){
*{animation:none!important}
.pop{opacity:0}.voice{opacity:.16}.ink{stroke-dashoffset:0}.inkword,.fly,.al1,.al2{opacity:1}.hl{transform:none}
}
</style>
<rect width="${W}" height="${H}" rx="16" fill="#141319"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="12" fill="#1c1b22" stroke="#34323f" stroke-width="1.5"/>
<path d="M16 28 a12 12 0 0 1 12 -12 h${W - 56} a12 12 0 0 1 12 12 v22 h-${W - 32} z" fill="#24232c"/>
<circle cx="38" cy="33" r="5" fill="#fb464c"/><circle cx="56" cy="33" r="5" fill="#e0de71"/><circle cx="74" cy="33" r="5" fill="#44cf6e"/>
<text x="${W / 2}" y="38" fill="#8b8a98" font-family="${SANS}" font-size="12.5" text-anchor="middle">My vault — Obsidian</text>
<line x1="16" y1="50" x2="${W - 16}" y2="50" stroke="#34323f"/>
<rect x="16" y="50" width="420" height="3" fill="${t.accent}"/>

<!-- The Library rail -->
<rect x="32" y="66" width="120" height="560" rx="10" fill="#211f29" stroke="#2f2d3a"/>
<text x="56" y="92" fill="#a3a1b8" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.2">LIBRARY</text>
${coverSvg}
<text x="92" y="550" fill="#6c6a80" font-family="${SANS}" font-size="11" text-anchor="middle">PDF · EPUB</text>
<text x="92" y="566" fill="#6c6a80" font-family="${SANS}" font-size="11" text-anchor="middle">Web Clipper</text>

<!-- The book -->
<g filter="url(#shadow)">
<rect x="228" y="90" width="320" height="470" rx="4" fill="url(#page)"/>
<rect x="548" y="90" width="320" height="470" rx="4" fill="url(#page2)"/>
</g>
<line x1="548" y1="92" x2="548" y2="558" stroke="#cfc6b2" stroke-width="1.5"/>
<text x="252" y="128" fill="${inkSoft}" font-family="${SANS}" font-size="10.5" font-weight="700" letter-spacing="1.4">CHAPTER 3 · THE MARGIN</text>
<text x="844" y="128" fill="${inkSoft}" font-family="${SANS}" font-size="10.5" text-anchor="end">42 / 310</text>
<rect class="voice" x="244" y="160" width="296" height="110" rx="6" fill="${t.accent}"/>
${leftSvg}
<rect class="hl" x="569" y="${lineY(6) - 17}" width="276" height="23" rx="3" fill="#f2c45a" opacity="0.55"/>
<rect class="hl" x="569" y="${lineY(7) - 17}" width="252" height="23" rx="3" fill="#f2c45a" opacity="0.55"/>
${rightSvg}

<!-- The selection popover -->
<g class="pop">
<rect x="612" y="${lineY(6) - 62}" width="236" height="36" rx="9" fill="#2a2936" stroke="#3d3b54"/>
<text x="632" y="${lineY(6) - 39}" fill="#efeefa" font-family="${SANS}" font-size="13" font-weight="600">Highlight</text>
<text x="706" y="${lineY(6) - 39}" fill="#a3a1b8" font-family="${SANS}" font-size="13">Claim</text>
<text x="756" y="${lineY(6) - 39}" fill="#a3a1b8" font-family="${SANS}" font-size="13">Cite</text>
<text x="796" y="${lineY(6) - 39}" fill="#a3a1b8" font-family="${SANS}" font-size="13">Note</text>
</g>

<!-- Ink in the margin -->
<path class="ink" d="M850 ${lineY(6) - 20} c 7 -5 12 -3 12 5 v 40 c 0 7 -6 10 -12 7 M856 ${lineY(7) + 12} C 852 470, 820 482, 790 478" fill="none" stroke="#5b45d6" stroke-width="2.5" stroke-linecap="round"/>
<text class="inkword" x="640" y="486" fill="#5b45d6" font-family="${HAND}" font-size="19" transform="rotate(-4 640 486)">why only one?</text>

<!-- Alongside / Think panel -->
<rect x="904" y="66" width="264" height="560" rx="10" fill="#211f29" stroke="#2f2d3a"/>
<text x="924" y="92" fill="#a3a1b8" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.2">ALONGSIDE · FROM YOUR VAULT</text>
<g class="al1">
<rect x="920" y="108" width="232" height="72" rx="9" fill="#2a2936" stroke="#3d3b54"/>
<circle cx="938" cy="128" r="4.5" fill="${t.green}"/>
<text x="950" y="133" fill="#efeefa" font-family="${SANS}" font-size="14" font-weight="650">Atomic notes</text>
<text x="936" y="156" fill="#a3a1b8" font-family="${SANS}" font-size="12">supports this paragraph</text>
<text x="936" y="172" fill="#6c6a80" font-family="${SANS}" font-size="11.5">links 3 of your notes</text>
</g>
<g class="al2">
<rect x="920" y="192" width="232" height="72" rx="9" fill="#2a2936" stroke="#3d3b54"/>
<circle cx="938" cy="212" r="4.5" fill="${t.red}"/>
<text x="950" y="217" fill="#efeefa" font-family="${SANS}" font-size="14" font-weight="650">Collect everything</text>
<text x="936" y="240" fill="#a3a1b8" font-family="${SANS}" font-size="12">argues with it</text>
<text x="936" y="256" fill="#6c6a80" font-family="${SANS}" font-size="11.5">Look at both · Not related</text>
</g>

<text x="924" y="300" fill="#a3a1b8" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.2">THINK</text>
<g class="fly">
<rect x="920" y="314" width="232" height="132" rx="10" fill="#26233a" stroke="${t.accent}" stroke-width="1.5"/>
<rect x="934" y="328" width="4" height="40" rx="2" fill="#f2c45a"/>
<text x="946" y="342" fill="#d9d6ea" font-family="${SERIF}" font-size="13" font-style="italic">“the book stops at the end</text>
<text x="946" y="362" fill="#d9d6ea" font-family="${SERIF}" font-size="13" font-style="italic">of a chapter and asks…”</text>
<text x="936" y="392" fill="#8f7ff5" font-family="${HAND}" font-size="15">why only one?</text>
<text x="936" y="430" fill="#6c6a80" font-family="${SANS}" font-size="11.5">p. 42 · goes back to its paragraph</text>
</g>
<rect x="920" y="462" width="232" height="148" rx="10" fill="none" stroke="#3d3b54" stroke-dasharray="4 5"/>
<text x="1036" y="520" fill="#8b8a98" font-family="${SANS}" font-size="13" font-weight="600" text-anchor="middle">End of chapter</text>
<text x="1036" y="542" fill="#efeefa" font-family="${SERIF}" font-size="18" text-anchor="middle">What survived?</text>
<text x="1036" y="568" fill="#6c6a80" font-family="${SANS}" font-size="11.5" text-anchor="middle">write a note · or turn the page</text>

<!-- The Reader bar -->
<rect x="246" y="586" width="604" height="52" rx="12" fill="#26252f" stroke="#3a3847"/>
<text x="270" y="617" fill="#a3a1b8" font-family="${SANS}" font-size="13">‹  Chapter 3 / 12</text>
<rect x="388" y="610" width="70" height="4" rx="2" fill="#3a3847"/><rect x="388" y="610" width="30" height="4" rx="2" fill="${t.accent}"/>
${bars}
<text x="544" y="617" fill="#efeefa" font-family="${SANS}" font-size="13" font-weight="600">Listen</text>
<text x="604" y="617" fill="#a3a1b8" font-family="${SANS}" font-size="13">Overview</text>
<text x="680" y="617" fill="#a3a1b8" font-family="${SANS}" font-size="13">Look up</text>
<text x="748" y="617" fill="#a3a1b8" font-family="${SANS}" font-size="13">Aa</text>
<text x="784" y="617" fill="#a3a1b8" font-family="${SANS}" font-size="13">12 min ›</text>
</svg>
`;
}

writeFileSync(join(OUT, "banner-dark.svg"), banner("dark"));
writeFileSync(join(OUT, "banner-light.svg"), banner("light"));
writeFileSync(join(OUT, "reader-hero.svg"), readerHero());
console.log("readme art written to", OUT);
