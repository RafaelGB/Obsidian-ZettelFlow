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
 *   docs/resources/readme/hero.svg          How it works: the Canvas walked, the wizard filled, the graph it lands in
 *   docs/resources/readme/first-flow.svg    Your first flow: every click from an empty canvas to a note
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

// ─── How it works: the Canvas, the wizard, the graph ─────────────────────────────────────────────

/** A seeded random, so the graph is the same graph every time the art is written. */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function flowHero() {
    const t = THEMES.dark;
    const W = 1200;
    const H = 640;
    const D = 14; // seconds per loop
    const MONO = "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace";
    const panel = "#211f29";
    const panelStroke = "#2f2d3a";
    const card = "#2a2936";
    const cardStroke = "#3d3b54";
    const pink = "#e87fc0";

    // One timeline, in percent of the loop. Everything below reads from it.
    const T = {
        capture: [3, 22], classify: [26, 44], concept: [48, 60], connect: [64, 97],
        edges: [[22, 26], [44, 48], [60, 64]],
        type: [6, 16], title: 16, pick: 33, kind: 38, tag1: 51, tag2: 54, tags: 56, sug1: 66, sug2: 68, links: 71,
        press: 77, fly: [78, 85], land: 85, link1: 86, link2: 89, caption: 91, end: 97,
    };

    // A class that animates, and the keyframes it animates with. The base style of every element is
    // its final frame, so a still render — and prefers-reduced-motion — shows the finished story.
    const css = [];
    const anim = (cls, frames, base = "") => css.push(`.${cls}{${base}animation:${cls} ${D}s infinite}\n@keyframes ${cls}{${frames}}`);
    const window_ = (cls, [a, b], base = "opacity:0;") =>
        anim(cls, `0%,${a - 1.5}%{opacity:0}${a}%,${b}%{opacity:1}${b + 1.5}%,100%{opacity:0}`, base);
    const from = (cls, a, base = "") => anim(cls, `0%,${a - 1.5}%{opacity:0;transform:translateX(-6px)}${a}%,${T.end}%{opacity:1;transform:none}100%{opacity:0}`, base);

    // ── The Canvas ──
    const nodes = [
        { id: "capture", x: 102, y: 116, w: 160, label: "Capture", sub: "Prompt · the idea", color: t.red, root: true },
        { id: "classify", x: 102, y: 210, w: 160, label: "Classify", sub: "Selector · its kind", color: t.amber },
        { id: "concept", x: 48, y: 316, w: 128, label: "Concept", sub: "Tags", color: t.green },
        { id: "source", x: 188, y: 316, w: 128, label: "Source", sub: "Backlink", color: "#e0de71" },
        { id: "connect", x: 102, y: 420, w: 160, label: "Connect", sub: "Suggest link", color: t.blue },
    ];
    const edges = [
        "M182 166 V208", "M160 260 L114 314", "M204 260 L250 314", "M112 366 L158 418", "M252 366 L206 418",
    ];
    const walked = ["M182 166 V208", "M160 260 L114 314", "M112 366 L158 418"];
    const nodeSvg = nodes
        .map((n) => {
            const active = T[n.id];
            const ring = active ? `<rect class="ring-${n.id}" x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="58" rx="12" fill="none" stroke="${t.accent}" stroke-width="2"/>` : "";
            const done = active && n.id !== "connect" ? `<rect class="done-${n.id}" x="${n.x}" y="${n.y}" width="${n.w}" height="50" rx="9" fill="none" stroke="${t.accent}" stroke-opacity="0.45" stroke-width="1.5"/>` : "";
            const root = n.root
                ? `<rect x="${n.x + n.w - 46}" y="${n.y + 9}" width="36" height="17" rx="8.5" fill="${t.accent}"/><text x="${n.x + n.w - 28}" y="${n.y + 21.5}" fill="#fff" font-family="${SANS}" font-size="10" font-weight="700" text-anchor="middle">Root</text>`
                : "";
            return `<g class="${n.id === "source" ? "untaken" : ""}">
<rect x="${n.x}" y="${n.y}" width="${n.w}" height="50" rx="9" fill="${card}" stroke="${cardStroke}" stroke-width="1.5"/>
<rect x="${n.x}" y="${n.y}" width="5" height="50" rx="2.5" fill="${n.color}"/>
<text x="${n.x + 18}" y="${n.y + 22}" fill="${t.text}" font-family="${SANS}" font-size="14" font-weight="650">${n.label}</text>
<text x="${n.x + 18}" y="${n.y + 39}" fill="${t.faint}" font-family="${SANS}" font-size="11.5">${esc(n.sub)}</text>
${root}${done}${ring}
</g>`;
        })
        .join("\n");
    for (const n of nodes) {
        const active = T[n.id];
        if (!active) continue;
        if (n.id === "connect") {
            anim(`ring-${n.id}`, `0%,${active[0] - 1.5}%{opacity:0}${active[0]}%,${active[1]}%{opacity:1}100%{opacity:0}`);
        } else {
            window_(`ring-${n.id}`, active);
            anim(`done-${n.id}`, `0%,${active[1]}%{opacity:0}${active[1] + 1.5}%,${T.end}%{opacity:1}100%{opacity:0}`);
        }
    }
    anim("untaken", `0%,${T.edges[1][0]}%{opacity:1}${T.edges[1][1]}%,${T.end}%{opacity:.38}100%{opacity:1}`, "opacity:.38;");
    // The walked path stays lit once the pulse has crossed it.
    walked.forEach((d, i) => {
        const [a, b] = T.edges[i];
        anim(`lit${i}`, `0%,${a}%{stroke-dashoffset:80}${b}%,${T.end}%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}`, "stroke-dasharray:80;");
    });
    const pulses = walked
        .map((d, i) => {
            const [a, b] = T.edges[i].map((p) => p / 100);
            return `<circle class="pulse" r="4.5" fill="${t.accent}" opacity="0"><animateMotion dur="${D}s" repeatCount="indefinite" path="${d}" keyPoints="0;0;1;1" keyTimes="0;${a};${b};1" calcMode="linear"/><animate attributeName="opacity" dur="${D}s" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;${(a - 0.004).toFixed(3)};${a};${b};${(b + 0.004).toFixed(3)};1"/></circle>`;
        })
        .join("\n");

    // ── The wizard ──
    const WX = 360;
    const WW = 416;
    const IL = WX + 20;
    const IR = WX + WW - 20;
    const steps = ["Capture", "Classify", "Concept", "Connect"];
    let sx = IL;
    const stepChips = steps
        .map((label, i) => {
            const w = textWidth(label, 12.5) + 26;
            const id = label.toLowerCase();
            const svg = `<rect x="${sx}" y="122" width="${w}" height="26" rx="13" fill="#1c1b22" stroke="${cardStroke}"/>
<rect class="chip-${id}" x="${sx}" y="122" width="${w}" height="26" rx="13" fill="${t.accent}"/>
<text x="${sx + w / 2}" y="139.5" fill="${t.text}" font-family="${SANS}" font-size="12.5" font-weight="550" text-anchor="middle">${label}</text>
${i < steps.length - 1 ? `<text x="${sx + w + 9}" y="140" fill="${t.faint}" font-family="${SANS}" font-size="14" text-anchor="middle">›</text>` : ""}`;
            sx += w + 18;
            return svg;
        })
        .join("\n");
    for (const s of steps) {
        const id = s.toLowerCase();
        if (id === "connect") anim(`chip-${id}`, `0%,${T[id][0] - 1.5}%{opacity:0}${T[id][0]}%,${T.end}%{opacity:1}100%{opacity:0}`);
        else window_(`chip-${id}`, T[id]);
    }
    const stepNo = steps
        .map((s, i) => `<text class="no-${s.toLowerCase()}" x="${IR}" y="96" fill="${t.muted}" font-family="${SANS}" font-size="12.5" text-anchor="end">Step ${i + 1} of 4</text>`)
        .join("");
    for (const s of steps) {
        const id = s.toLowerCase();
        if (id === "connect") anim(`no-${id}`, `0%,${T[id][0] - 1.5}%{opacity:0}${T[id][0]}%,${T.end}%{opacity:1}100%{opacity:0}`);
        else window_(`no-${id}`, T[id]);
    }

    const q = (y, s) => `<text x="${IL}" y="${y}" fill="${t.text}" font-family="${SANS}" font-size="17" font-weight="650">${esc(s)}</text>`;
    const hint = (y, s) => `<text x="${IL}" y="${y}" fill="${t.faint}" font-family="${SANS}" font-size="12">${esc(s)}</text>`;
    const input = (y, h = 40) => `<rect x="${IL}" y="${y}" width="${IR - IL}" height="${h}" rx="8" fill="#1c1b22" stroke="${t.accent}" stroke-width="1.5"/>`;

    const typedW = 112;
    const gCapture = `<g class="g-capture">
${q(190, "What’s the idea?")}
${input(206)}
<text x="${IL + 14}" y="232" fill="${t.text}" font-family="${SANS}" font-size="16">Ideas as debt</text>
<rect class="typing" x="${IL + 12}" y="212" width="${typedW}" height="28" fill="#1c1b22"/>
<g class="caret"><rect class="caret-blink" x="${IL + 13}" y="215" width="2" height="22" fill="${t.accent}"/></g>
${hint(270, "Prompt · it becomes the title and the file name")}
</g>`;
    window_("g-capture", T.capture);
    anim("typing", `0%,${T.type[0]}%{transform:scaleX(1);animation-timing-function:steps(13,end)}${T.type[1]}%,100%{transform:scaleX(0)}`, "transform-box:fill-box;transform-origin:right;transform:scaleX(0);");
    anim("caret", `0%,${T.type[0]}%{transform:translateX(0);animation-timing-function:steps(13,end)}${T.type[1]}%,100%{transform:translateX(${typedW}px)}`, `transform:translateX(${typedW}px);`);

    const options = ["Concept — an idea in my own words", "Source — something I read", "Question — something I want to know"];
    const gClassify = `<g class="g-classify">
${q(190, "What kind of note is it?")}
${options
    .map(
        (o, i) => `<rect x="${IL}" y="${204 + i * 42}" width="${IR - IL}" height="34" rx="8" fill="#1c1b22" stroke="${cardStroke}" stroke-width="1.5"/>
${i === 0 ? `<rect class="picked" x="${IL}" y="204" width="${IR - IL}" height="34" rx="8" fill="${t.accent}"/>` : ""}
<text x="${IL + 14}" y="${226 + i * 42}" fill="${t.text}" font-family="${SANS}" font-size="14" font-weight="${i === 0 ? 600 : 400}">${esc(o)}</text>`
    )
    .join("\n")}
</g>`;
    window_("g-classify", T.classify);
    anim("picked", `0%,${T.pick - 0.5}%{opacity:0}${T.pick}%,100%{opacity:1}`);

    const tagChip = (x, label, cls) =>
        `<g class="${cls}"><rect x="${x}" y="215" width="${textWidth(label, 13) + 22}" height="22" rx="11" fill="#2d2945" stroke="${t.accent}"/><text x="${x + 11}" y="230.5" fill="#cfc8ff" font-family="${SANS}" font-size="13" font-weight="550">${label}</text></g>`;
    const gConcept = `<g class="g-concept">
${q(190, "Tags")}
${input(206)}
${tagChip(IL + 10, "#debt", "tag1")}
${tagChip(IL + 76, "#writing", "tag2")}
${hint(270, "Suggested from your vault:")}
<text x="${IL + 160}" y="270" fill="${t.muted}" font-family="${SANS}" font-size="12">#finance   #zettelkasten</text>
</g>`;
    window_("g-concept", T.concept);
    for (const [cls, at] of [["tag1", T.tag1], ["tag2", T.tag2]])
        anim(cls, `0%,${at - 1}%{opacity:0;transform:scale(.6)}${at}%{opacity:1;transform:scale(1.08)}${at + 1}%,100%{opacity:1;transform:none}`, "transform-box:fill-box;transform-origin:center;");

    const suggestion = (y, title, why, dot, cls) => `<g class="${cls}">
<rect x="${IL}" y="${y}" width="${IR - IL}" height="38" rx="8" fill="${card}" stroke="${cardStroke}"/>
<circle cx="${IL + 16}" cy="${y + 19}" r="4.5" fill="${dot}"/>
<text x="${IL + 30}" y="${y + 24}" fill="${t.text}" font-family="${SANS}" font-size="14" font-weight="600">${esc(title)}</text>
<text x="${IR - 14}" y="${y + 24}" fill="${t.muted}" font-family="${SANS}" font-size="12" text-anchor="end">${esc(why)}</text>
</g>`;
    const gConnect = `<g class="g-connect">
${q(190, "Links you might want to add")}
${hint(210, "Suggest link · ranked from your own graph · offline, no AI")}
${suggestion(224, "Atomic notes", "co-cited by 3 of your notes", "#5aa9f0", "sug1")}
${suggestion(270, "Compound interest", "shares 2 sources", t.green, "sug2")}
</g>`;
    anim("g-connect", `0%,${T.connect[0] - 1.5}%{opacity:0}${T.connect[0]}%,${T.end}%{opacity:1}100%{opacity:0}`);
    from("sug1", T.sug1);
    from("sug2", T.sug2);

    // The live preview fills in as each step answers.
    const pre = [
        { y: 410, s: "---", c: t.faint },
        { y: 429, s: "type: concept", c: "#b3a8ff", at: T.kind },
        { y: 448, s: "tags: [debt, writing]", c: t.muted, at: T.tags },
        { y: 467, s: "links: [[Atomic notes]] [[Compound interest]]", c: t.muted, at: T.links },
        { y: 486, s: "---", c: t.faint },
        { y: 507, s: "# Ideas as debt", c: t.text, at: T.title, bold: true },
    ];
    const preview = pre
        .map((l, i) => {
            if (l.at) from(`pl${i}`, l.at);
            return `<text class="${l.at ? `pl${i}` : ""}" x="${IL + 14}" y="${l.y}" fill="${l.c}" font-family="${MONO}" font-size="12.5"${l.bold ? ' font-weight="700"' : ""}>${esc(l.s)}</text>`;
        })
        .join("\n");

    anim("press", `0%,${T.press - 1}%{opacity:0}${T.press}%{opacity:1}${T.press + 2}%,100%{opacity:0}`, "opacity:0;");

    // The pointer: picks the kind, then presses Create.
    const pick = [IL + 190, 222];
    const create = [IR - 44, 538];
    anim(
        "pointer",
        `0%,${T.pick - 6}%{opacity:0;transform:translate(${pick[0] + 60}px,${pick[1] + 70}px)}` +
            `${T.pick - 3}%{opacity:1;transform:translate(${pick[0]}px,${pick[1]}px)}` +
            `${T.pick - 0.5}%{transform:translate(${pick[0]}px,${pick[1]}px) scale(1)}${T.pick}%{transform:translate(${pick[0]}px,${pick[1]}px) scale(.82)}${T.pick + 0.8}%{transform:translate(${pick[0]}px,${pick[1]}px) scale(1)}` +
            `${T.pick + 5}%{opacity:1;transform:translate(${pick[0]}px,${pick[1]}px)}${T.pick + 7}%{opacity:0;transform:translate(${pick[0]}px,${pick[1]}px)}` +
            `${T.press - 6}%{opacity:0;transform:translate(${create[0] - 120}px,${create[1] - 90}px)}` +
            `${T.press - 3}%{opacity:1;transform:translate(${create[0]}px,${create[1]}px)}` +
            `${T.press - 0.5}%{transform:translate(${create[0]}px,${create[1]}px) scale(1)}${T.press}%{transform:translate(${create[0]}px,${create[1]}px) scale(.82)}${T.press + 0.8}%{opacity:1;transform:translate(${create[0]}px,${create[1]}px) scale(1)}` +
            `${T.press + 3}%,100%{opacity:0;transform:translate(${create[0]}px,${create[1]}px)}`,
        "opacity:0;"
    );

    // ── The graph ──
    const GX = 800;
    const GW = 368;
    const GY = 66;
    const GH = 490;
    const L = { x: 984, y: 318 }; // where the new note lands
    const regions = [
        { name: "Writing", color: "#5aa9f0", cx: 884, cy: 222, n: 24, named: { label: "Atomic notes", x: 918, y: 256 } },
        { name: "Systems", color: t.amber, cx: 1084, cy: 196, n: 18 },
        { name: "Learning", color: t.green, cx: 1078, cy: 408, n: 24, named: { label: "Compound interest", x: 1048, y: 378 } },
        { name: "Attention", color: pink, cx: 872, cy: 420, n: 16 },
    ];
    const r = rng(522);
    const nebulae = [];
    const graphEdges = [];
    const graphNodes = [];
    const labels = [];
    let total = 0;
    for (const [ri, g] of regions.entries()) {
        nebulae.push(`<radialGradient id="neb${ri}"><stop offset="0" stop-color="${g.color}" stop-opacity="0.24"/><stop offset="0.55" stop-color="${g.color}" stop-opacity="0.08"/><stop offset="1" stop-color="${g.color}" stop-opacity="0"/></radialGradient>`);
        const pts = [{ x: g.cx, y: g.cy, hub: true }];
        if (g.named) pts.push({ x: g.named.x, y: g.named.y, named: g.named.label });
        while (pts.length < g.n) {
            // Denser at the core, thinning towards the rim — how a real region looks.
            const a = r() * Math.PI * 2;
            const d = Math.pow(r(), 0.8);
            pts.push({ x: g.cx + Math.cos(a) * d * 64, y: g.cy + Math.sin(a) * d * 48 });
        }
        total += pts.length;
        pts.forEach((p, i) => {
            if (i === 0) return;
            // Link to the nearest earlier point, and now and then to the hub — a small-world cluster.
            let best = 0;
            let bd = Infinity;
            for (let j = 0; j < i; j++) {
                const d = (pts[j].x - p.x) ** 2 + (pts[j].y - p.y) ** 2;
                if (d < bd) [bd, best] = [d, j];
            }
            graphEdges.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${pts[best].x.toFixed(1)}" y2="${pts[best].y.toFixed(1)}"/>`);
            if (best !== 0 && (r() < 0.45 || p.named)) graphEdges.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${g.cx}" y2="${g.cy}"/>`);
        });
        for (const p of pts) {
            const rad = p.hub ? 5.5 : p.named ? 4.5 : 1.8 + r() * 2;
            graphNodes.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${g.color}"${p.hub || p.named ? "" : ` opacity="${(0.55 + r() * 0.45).toFixed(2)}"`}/>`);
            if (p.named) {
                const cls = ri === 0 ? "target1" : "target2";
                graphNodes.push(`<circle class="${cls}" cx="${p.x}" cy="${p.y}" r="9" fill="none" stroke="${g.color}" stroke-width="1.5"/>`);
                const above = p.x < L.x;
                labels.push(`<text x="${p.x - 10}" y="${p.y + (above ? -8 : 20)}" fill="#d9d6ea" stroke="#18171e" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke" font-family="${SANS}" font-size="11.5" font-weight="600" text-anchor="end">${esc(p.named)}</text>`);
            }
        }
        labels.push(`<text x="${g.cx}" y="${g.cy - 66}" fill="${g.color}" font-family="${SANS}" font-size="10.5" font-weight="700" letter-spacing="1.4" text-anchor="middle" opacity="0.85">${g.name.toUpperCase()}</text>`);
    }
    // Two old bridges between regions, faint: the graph already had a shape before this note.
    graphEdges.push(`<line x1="${regions[0].cx}" y1="${regions[0].cy}" x2="${regions[1].cx}" y2="${regions[1].cy}" stroke-dasharray="3 4"/>`);
    graphEdges.push(`<line x1="${regions[2].cx}" y1="${regions[2].cy}" x2="${regions[3].cx}" y2="${regions[3].cy}" stroke-dasharray="3 4"/>`);
    const stars = Array.from({ length: 80 }, (_, i) => {
        const x = GX + 6 + r() * (GW - 12);
        const y = GY + 34 + r() * (GH - 40);
        const s = r() < 0.15 ? 1.6 : 1;
        return `<rect${i % 9 === 0 ? ` class="tw tw${i % 3}"` : ""} x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s}" height="${s}" fill="#dadada" fill-opacity="${(0.12 + r() * 0.3).toFixed(2)}"/>`;
    }).join("");

    const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const A = regions[0].named;
    const B = regions[2].named;
    const lA = Math.ceil(len(L, A));
    const lB = Math.ceil(len(L, B));
    anim("link1", `0%,${T.link1}%{stroke-dashoffset:${lA}}${T.link1 + 3}%,${T.end}%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}`, `stroke-dasharray:${lA};`);
    anim("link2", `0%,${T.link2}%{stroke-dashoffset:${lB}}${T.link2 + 3}%,${T.end}%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}`, `stroke-dasharray:${lB};`);
    for (const [cls, at] of [["target1", T.link1 + 3], ["target2", T.link2 + 3]])
        anim(cls, `0%,${at - 0.5}%{opacity:0;transform:scale(.6)}${at}%{opacity:1}${at + 5}%,100%{opacity:0;transform:scale(2.2)}`, "opacity:0;transform-box:fill-box;transform-origin:center;");
    anim("star", `0%,${T.land - 0.5}%{opacity:0;transform:scale(.2)}${T.land + 2}%{opacity:1;transform:scale(1.3)}${T.land + 4}%,${T.end}%{opacity:1;transform:none}100%{opacity:0}`, "transform-box:fill-box;transform-origin:center;");
    anim("burst", `0%,${T.land - 0.5}%{opacity:0;transform:scale(.5)}${T.land + 1}%{opacity:.9}${T.land + 8}%,100%{opacity:0;transform:scale(4.5)}`, "opacity:0;transform-box:fill-box;transform-origin:center;");
    from("starlabel", T.land + 3);
    anim("caption", `0%,${T.caption - 1.5}%{opacity:0;transform:translateY(8px)}${T.caption}%,${T.end}%{opacity:1;transform:none}100%{opacity:0}`);
    anim("cam", `0%,${T.fly[0]}%{transform:scale(1)}${T.caption}%,${T.end}%{transform:scale(1.06)}100%{transform:scale(1)}`, `transform-origin:${L.x}px ${L.y}px;`);
    anim("count0", `0%,${T.land}%{opacity:1}${T.land + 0.5}%,${T.end}%{opacity:0}100%{opacity:1}`, "opacity:0;");
    anim("count1", `0%,${T.land}%{opacity:0}${T.land + 0.5}%,${T.end}%{opacity:1}100%{opacity:0}`);
    const fly0 = [create[0] - L.x, create[1] - L.y];
    anim(
        "fly",
        `0%,${T.fly[0] - 0.5}%{opacity:0;transform:translate(${fly0[0]}px,${fly0[1]}px) scale(1)}${T.fly[0]}%{opacity:1;transform:translate(${fly0[0]}px,${fly0[1]}px) scale(1);animation-timing-function:cubic-bezier(.5,0,.2,1)}` +
            `${T.fly[1]}%{opacity:1;transform:translate(0,0) scale(.3)}${T.fly[1] + 1.5}%,100%{opacity:0;transform:translate(0,0) scale(.2)}`,
        "opacity:0;transform-box:fill-box;transform-origin:center;"
    );

    // ── The bar: three beats of one shot ──
    const beats = [
        { label: "Draw it once", sub: "a Canvas is the workflow", span: [0, 24] },
        { label: "Walk it for every note", sub: "a wizard, step by step", span: [24, 78] },
        { label: "It lands in your graph", sub: "linked, in its region", span: [78, 100] },
    ];
    const barX = 200;
    const barW = 800;
    const beatSvg = beats
        .map((b, i) => {
            const cx = barX + barW / 6 + (i * barW) / 3;
            const cls = `beat${i}`;
            if (i === 2) anim(cls, `0%,${b.span[0] - 1}%{opacity:0}${b.span[0]}%,${T.end}%{opacity:1}100%{opacity:0}`);
            else anim(cls, `0%{opacity:${i === 0 ? 1 : 0}}${b.span[0] + (i === 0 ? 0 : 1)}%,${b.span[1] - 1}%{opacity:1}${b.span[1]}%,100%{opacity:0}`, "opacity:0;");
            return `<circle cx="${cx - textWidth(b.label, 13.5) / 2 - 18}" cy="583" r="9" fill="#2d2b3a" stroke="${cardStroke}"/>
<text x="${cx - textWidth(b.label, 13.5) / 2 - 18}" y="587" fill="${t.muted}" font-family="${SANS}" font-size="11" font-weight="700" text-anchor="middle">${i + 1}</text>
<text x="${cx}" y="588" fill="${t.muted}" font-family="${SANS}" font-size="13.5" font-weight="600" text-anchor="middle">${esc(b.label)}</text>
<g class="${cls}"><circle cx="${cx - textWidth(b.label, 13.5) / 2 - 18}" cy="583" r="9" fill="${t.accent}"/>
<text x="${cx - textWidth(b.label, 13.5) / 2 - 18}" y="587" fill="#fff" font-family="${SANS}" font-size="11" font-weight="700" text-anchor="middle">${i + 1}</text>
<text x="${cx}" y="588" fill="${t.text}" font-family="${SANS}" font-size="13.5" font-weight="600" text-anchor="middle">${esc(b.label)}</text></g>
<text x="${cx}" y="603" fill="${t.faint}" font-family="${SANS}" font-size="11" text-anchor="middle">${esc(b.sub)}</text>`;
        })
        .join("\n");
    anim("progress", `0%{transform:scaleX(0)}${T.end}%{transform:scaleX(1)}100%{transform:scaleX(1);opacity:0}`, "transform-box:fill-box;transform-origin:left;");

    const label = (x, y, s) => `<text x="${x}" y="${y}" fill="${t.muted}" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.2">${esc(s)}</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="How ZettelFlow works, in one continuous shot: a Canvas flow is walked step by step — Capture, Classify, then the Concept branch, then Connect — while the wizard it drives asks for the idea, its kind, its tags and the links your graph suggests, and the live preview fills in. Create, and the new note flies into your graph, lands between two regions and draws its links, becoming a bridge.">
<title>How it works: the Canvas, the wizard, your graph</title>
<defs>
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#2a2938"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.faint}"/></marker>
<marker id="arrA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${t.accent}"/></marker>
<radialGradient id="starglow"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.25" stop-color="${t.accent}" stop-opacity="0.75"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
${nebulae.join("\n")}
<clipPath id="graphclip"><rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" rx="10"/></clipPath>
</defs>
<style>
${css.join("\n")}
.caret-blink{animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.march{stroke-dasharray:5 5;animation:march 1.2s linear infinite}
@keyframes march{to{stroke-dashoffset:-20}}
.neb{animation:breathe 7s ease-in-out infinite alternate}
.neb1{animation-delay:-2s}.neb2{animation-delay:-4s}.neb3{animation-delay:-5.5s}
@keyframes breathe{from{opacity:.75}to{opacity:1}}
.tw{animation:tw 3.2s ease-in-out infinite}.tw1{animation-delay:-1.1s}.tw2{animation-delay:-2.2s}
@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){
*{animation:none!important}
.pulse{display:none}
}
</style>
<rect width="${W}" height="${H}" rx="16" fill="#141319"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="12" fill="#1c1b22" stroke="#34323f" stroke-width="1.5"/>
<path d="M16 28 a12 12 0 0 1 12 -12 h${W - 56} a12 12 0 0 1 12 12 v22 h-${W - 32} z" fill="#24232c"/>
<circle cx="38" cy="33" r="5" fill="#fb464c"/><circle cx="56" cy="33" r="5" fill="#e0de71"/><circle cx="74" cy="33" r="5" fill="#44cf6e"/>
<text x="${W / 2}" y="38" fill="#8b8a98" font-family="${SANS}" font-size="12.5" text-anchor="middle">My vault — Obsidian</text>
<line x1="16" y1="50" x2="${W - 16}" y2="50" stroke="#34323f"/>

<!-- The Canvas -->
<rect x="32" y="66" width="304" height="490" rx="10" fill="${panel}" stroke="${panelStroke}"/>
<rect x="33" y="100" width="302" height="455" fill="url(#dots)"/>
${label(52, 92, "CANVAS")}
<text x="316" y="92" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="end">Zettel flow.canvas</text>
<path d="${edges.join(" ")}" fill="none" stroke="${t.faint}" stroke-width="1.8" marker-end="url(#arr)"/>
${walked.map((d, i) => `<path class="lit${i}" d="${d}" fill="none" stroke="${t.accent}" stroke-width="2.2"/>`).join("\n")}
<text x="128" y="294" fill="${t.faint}" font-family="${SANS}" font-size="11" text-anchor="end">if concept</text>
<text x="236" y="294" fill="${t.faint}" font-family="${SANS}" font-size="11">if source</text>
${nodeSvg}
${pulses}
<text x="184" y="508" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="middle">a card is a step · an arrow, the order</text>
<text x="184" y="526" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="middle">a branch is a choice</text>

<path class="march" d="M340 312 H354" fill="none" stroke="${t.accent}" stroke-width="2" marker-end="url(#arrA)"/>

<!-- The wizard -->
<rect x="${WX}" y="66" width="${WW}" height="490" rx="10" fill="#26252f" stroke="#3a3847"/>
<text x="${IL}" y="96" fill="${t.text}" font-family="${SANS}" font-size="14.5" font-weight="700">Create note</text>
${stepNo}
<text x="${IL}" y="113" fill="${t.faint}" font-family="${SANS}" font-size="11.5">Will be created at Zettel/</text>
${stepChips}
<line x1="${WX}" y1="162" x2="${WX + WW}" y2="162" stroke="#3a3847"/>
${gCapture}
${gClassify}
${gConcept}
${gConnect}
<rect x="${IL}" y="364" width="${IR - IL}" height="152" rx="8" fill="#1c1b22" stroke="${cardStroke}"/>
<text x="${IL + 14}" y="386" fill="${t.muted}" font-family="${SANS}" font-size="11" font-weight="700" letter-spacing="1.2">LIVE PREVIEW</text>
<text x="${IR - 14}" y="386" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="end">Ideas as debt.md</text>
${preview}
<rect x="${IL}" y="525" width="64" height="26" rx="6" fill="none" stroke="${cardStroke}"/>
<text x="${IL + 32}" y="542.5" fill="${t.muted}" font-family="${SANS}" font-size="12.5" text-anchor="middle">Back</text>
<rect x="${IR - 88}" y="525" width="88" height="26" rx="6" fill="${t.accent}"/>
<rect class="press" x="${IR - 92}" y="521" width="96" height="34" rx="9" fill="none" stroke="#cfc8ff" stroke-width="2"/>
<text x="${IR - 44}" y="542.5" fill="#fff" font-family="${SANS}" font-size="12.5" font-weight="650" text-anchor="middle">Create</text>

<path class="march" d="M780 312 H794" fill="none" stroke="${t.accent}" stroke-width="2" marker-end="url(#arrA)"/>

<!-- The graph -->
<rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" rx="10" fill="#18171e" stroke="${panelStroke}"/>
<g clip-path="url(#graphclip)">
${stars}
<g class="cam">
${regions.map((g, i) => `<circle class="neb neb${i}" cx="${g.cx}" cy="${g.cy}" r="140" fill="url(#neb${i})"/>`).join("\n")}
<g stroke="#8b8e94" stroke-opacity="0.3" stroke-width="1">
${graphEdges.join("\n")}
</g>
${graphNodes.join("\n")}
<line x1="${L.x}" y1="${L.y}" x2="${A.x}" y2="${A.y}" stroke="#d9d6ea" stroke-opacity="0.12" stroke-width="5" class="link1"/>
<line class="link1" x1="${L.x}" y1="${L.y}" x2="${A.x}" y2="${A.y}" stroke="#d9d6ea" stroke-opacity="0.85" stroke-width="1.6"/>
<line x1="${L.x}" y1="${L.y}" x2="${B.x}" y2="${B.y}" stroke="${t.accent}" stroke-opacity="0.3" stroke-width="7" class="link2"/>
<line class="link2" x1="${L.x}" y1="${L.y}" x2="${B.x}" y2="${B.y}" stroke="${t.accent}" stroke-width="2"/>
${labels.join("\n")}
<circle class="burst" cx="${L.x}" cy="${L.y}" r="8" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<g class="star"><circle cx="${L.x}" cy="${L.y}" r="20" fill="url(#starglow)"/><circle cx="${L.x}" cy="${L.y}" r="5.5" fill="#fff"/></g>
<g class="starlabel">
<rect x="${L.x + 14}" y="${L.y - 30}" width="128" height="24" rx="12" fill="#2d2945" stroke="${t.accent}"/>
<text x="${L.x + 26}" y="${L.y - 13.5}" fill="#fff" font-family="${SANS}" font-size="12.5" font-weight="650">Ideas as debt</text>
<text x="${L.x + 130}" y="${L.y - 13.5}" fill="#cfc8ff" font-family="${SANS}" font-size="10" font-weight="700" text-anchor="end">NEW</text>
</g>
</g>
</g>
${label(GX + 20, 92, "EXPLORE · YOUR GRAPH")}
<text class="count0" x="${GX + GW - 20}" y="92" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="end">4 regions · ${total} notes</text>
<text class="count1" x="${GX + GW - 20}" y="92" fill="${t.faint}" font-family="${SANS}" font-size="11.5" text-anchor="end">4 regions · ${total + 1} notes</text>
<g class="caption">
<rect x="${GX + 14}" y="${GY + GH - 58}" width="${GW - 28}" height="44" rx="9" fill="#26233a" stroke="${t.accent}" stroke-opacity="0.7"/>
<circle cx="${GX + 32}" cy="${GY + GH - 36}" r="5" fill="#fff"/>
<text x="${GX + 46}" y="${GY + GH - 40}" fill="${t.text}" font-family="${SANS}" font-size="13" font-weight="650">Ideas as debt · linked to 2 notes</text>
<text x="${GX + 46}" y="${GY + GH - 23}" fill="${t.muted}" font-family="${SANS}" font-size="11.5">a new bridge between Writing and Learning</text>
</g>

<!-- The fly: the note leaves the wizard for the graph -->
<g class="fly">
<rect x="${L.x - 62}" y="${L.y - 16}" width="124" height="32" rx="9" fill="#2d2945" stroke="${t.accent}" stroke-width="1.5"/>
<text x="${L.x}" y="${L.y + 5}" fill="#fff" font-family="${SANS}" font-size="13" font-weight="650" text-anchor="middle">Ideas as debt</text>
</g>

<!-- The pointer -->
<g class="pointer"><path d="M0 0 L0 17 L4.5 13 L7.5 20 L10.5 18.6 L7.6 12 L13 12 Z" fill="#fff" stroke="#141319" stroke-width="1.2" stroke-linejoin="round"/></g>

<!-- Three beats of one shot -->
<rect x="${barX}" y="566" width="${barW}" height="48" rx="12" fill="#26252f" stroke="#3a3847"/>
${beatSvg}
<rect x="${barX + 12}" y="611" width="${barW - 24}" height="2" rx="1" fill="#3a3847"/>
<rect class="progress" x="${barX + 12}" y="611" width="${barW - 24}" height="2" rx="1" fill="${t.accent}"/>
</svg>
`;
}

// ─── Your first flow: from an empty canvas to a note, every click shown ──────────────────────────

function firstFlow() {
    const t = THEMES.dark;
    const W = 1200;
    const H = 640;
    const D = 18;
    const panel = "#211f29";
    const panelStroke = "#2f2d3a";
    const card = "#2a2936";
    const cardStroke = "#3d3b54";
    const modal = "#26252f";
    const field = "#1c1b22";
    const END = 97;

    const css = [];
    const anim = (cls, frames, base = "") => css.push(`.${cls}{${base}animation:${cls} ${D}s infinite}\n@keyframes ${cls}{${frames}}`);
    /** Visible between a and b; hidden in the still frame unless `keep`. */
    const win = (cls, a, b, keep = false) =>
        anim(cls, `0%,${a - 1}%{opacity:0;transform:translateY(6px)}${a}%,${b}%{opacity:1;transform:none}${b + 1}%,100%{opacity:0}`, keep ? "" : "opacity:0;");
    /** Appears at a and stays until the loop resets; part of the still frame. */
    const from = (cls, a) => anim(cls, `0%,${a - 1}%{opacity:0;transform:translateY(4px)}${a}%,${END}%{opacity:1;transform:none}100%{opacity:0}`);
    /** A press: a ring that flashes on the control at a. */
    const press = (cls, a) => anim(cls, `0%,${a - 0.6}%{opacity:0}${a}%{opacity:1}${a + 1.6}%,100%{opacity:0}`, "opacity:0;");
    /** Typing: a cover that steps off the text between a and b. */
    const typing = (cls, a, b, chars) =>
        anim(cls, `0%,${a}%{transform:scaleX(1);animation-timing-function:steps(${chars},end)}${b}%,100%{transform:scaleX(0)}`, "transform-box:fill-box;transform-origin:right;transform:scaleX(0);");

    const text = (x, y, s, { size = 13, color = t.text, weight = 400, anchor = "start", family = SANS, cls = "" } = {}) =>
        `<text${cls ? ` class="${cls}"` : ""} x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}"${weight !== 400 ? ` font-weight="${weight}"` : ""}${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${esc(s)}</text>`;
    const btn = (x, y, w, label, cta = false, h = 28) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${cta ? t.accent : card}" stroke="${cta ? t.accent : cardStroke}"/>${text(x + w / 2, y + h / 2 + 4.5, label, { size: 12.5, color: cta ? "#fff" : t.text, weight: cta ? 650 : 500, anchor: "middle" })}`;
    const ring = (cls, x, y, w, h, rx = 8) => `<rect class="${cls}" x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="${rx + 2}" fill="none" stroke="#cfc8ff" stroke-width="2"/>`;
    const shade = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0b0a10" opacity="0.5"/>`;

    // Clicks — the pointer's whole path is one list, so its moves and the presses agree.
    const C = {
        rowClick: 6, menuClick: 13, roleClick: 24, firstClick: 34, kindClick: 40, editClick: 48,
        addClick: 53, tileClick: 57, closeClick: 69, ribbonClick: 72, createClick: 76, confirmClick: 91,
    };
    const P = [
        [0, 520, 420], [C.rowClick - 3, 160, 128], [C.rowClick, 160, 128, true],
        [C.menuClick - 3, 310, 238], [C.menuClick, 310, 238, true],
        [C.roleClick - 4, 880, 352], [C.roleClick, 880, 352, true],
        [C.firstClick - 4, 664, 366], [C.firstClick, 664, 366, true],
        [C.kindClick - 3, 740, 280], [C.kindClick, 740, 280, true],
        [C.editClick - 3, 742, 192], [C.editClick, 742, 192, true],
        [C.addClick - 3, 688, 190], [C.addClick, 688, 190, true],
        [C.tileClick - 3, 706, 246], [C.tileClick, 706, 246, true],
        [C.closeClick - 4, 1128, 92], [C.closeClick, 1128, 92, true],
        [C.ribbonClick - 2.5, 37, 150], [C.ribbonClick, 37, 150, true],
        [C.createClick - 3, 140, 190], [C.createClick, 140, 190, true],
        [C.confirmClick - 4, 912, 436], [C.confirmClick, 912, 436, true],
        [95, 980, 520],
    ];
    const frames = [];
    for (const [p, x, y, click] of P) {
        if (click) {
            frames.push(`${(p - 0.5).toFixed(1)}%{transform:translate(${x}px,${y}px) scale(1)}`);
            frames.push(`${p}%{transform:translate(${x}px,${y}px) scale(.8)}`);
            frames.push(`${(p + 0.7).toFixed(1)}%{transform:translate(${x}px,${y}px) scale(1)}`);
        } else frames.push(`${p}%{transform:translate(${x}px,${y}px)}`);
    }
    anim("ptr", `${frames.join("")}96%{opacity:1}97%,100%{opacity:0;transform:translate(980px,520px)}`, "opacity:0;");

    // ── The window: ribbon, file explorer, the canvas ──
    const RX = 16, EX = 58, MX = 278;
    const ribbonIcons = [66, 102, 150, 186]
        .map((y, i) =>
            i === 2
                ? `<rect x="${RX + 9}" y="${y - 12}" width="24" height="24" rx="6" fill="url(#logo)"/><path d="M${RX + 15} ${y - 6} H${RX + 27} L${RX + 15} ${y + 6} H${RX + 27}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
                : `<rect x="${RX + 12}" y="${y - 9}" width="18" height="18" rx="4" fill="none" stroke="#6c6a80" stroke-width="1.5"/>`
        )
        .join("");
    const row = (y, label, { indent = 0, icon = "", muted = false, cls = "" } = {}) =>
        `<g${cls ? ` class="${cls}"` : ""}>${icon ? `<rect x="${EX + 22 + indent}" y="${y - 10}" width="12" height="12" rx="2.5" fill="none" stroke="${icon}" stroke-width="1.4"/>` : ""}${text(EX + (icon ? 42 : 20) + indent, y, label, { size: 13, color: muted ? t.muted : "#d9d6ea" })}</g>`;

    const explorer = `<rect x="${EX}" y="50" width="${MX - EX}" height="510" fill="${panel}"/>
<line x1="${MX}" y1="50" x2="${MX}" y2="560" stroke="${panelStroke}"/>
${text(EX + 18, 78, "MY VAULT", { size: 11, color: t.muted, weight: 700 })}
${row(104, "▾ flows", { muted: true })}
<rect class="rowhl" x="${EX + 6}" y="114" width="${MX - EX - 12}" height="24" rx="5" fill="#34314a"/>
${row(131, "Daily note.canvas", { indent: 10, icon: t.accent })}
${row(160, "▾ Journal", { muted: true })}
${row(186, "2026-10-12.md", { indent: 10, icon: "#6c6a80" })}
<g class="newnote"><rect x="${EX + 6}" y="196" width="${MX - EX - 12}" height="24" rx="5" fill="#2d2945" stroke="${t.accent}" stroke-opacity="0.6"/>${row(213, "What went well.md", { indent: 10, icon: t.green })}</g>
${row(242, "Welcome.md", { icon: "#6c6a80" })}`;
    anim("rowhl", `0%,${C.rowClick - 0.5}%{opacity:0}${C.rowClick}%,${C.menuClick + 1}%{opacity:1}${C.menuClick + 2}%,100%{opacity:0}`, "opacity:0;");
    from("newnote", 93);

    const canvasArea = `<rect x="${MX}" y="50" width="${1184 - MX}" height="34" fill="#24232c"/>
<rect x="${MX + 10}" y="56" width="170" height="28" rx="7" fill="#1c1b22"/>
${text(MX + 26, 75, "Daily note", { size: 12.5, color: "#d9d6ea" })}
<rect x="${MX}" y="84" width="${1184 - MX}" height="476" fill="url(#dots)"/>`;

    // ── Beat 1: the canvas's menu, and the role ──
    const menuX = 190, menuY = 124;
    const ctx = `<g class="ctx">
<rect x="${menuX}" y="${menuY}" width="250" height="126" rx="8" fill="#2a2936" stroke="#45425e" filter="url(#lift)"/>
${["Open in new tab", "Rename…", "Move file to…"].map((s, i) => text(menuX + 34, menuY + 24 + i * 26, s, { size: 13, color: "#d9d6ea" })).join("")}
<line x1="${menuX + 8}" y1="${menuY + 90}" x2="${menuX + 242}" y2="${menuY + 90}" stroke="#45425e"/>
<rect class="ctxhl" x="${menuX + 5}" y="${menuY + 96}" width="240" height="24" rx="5" fill="${t.accent}" opacity="0.85"/>
<rect x="${menuX + 12}" y="${menuY + 101}" width="14" height="14" rx="3" fill="none" stroke="#fff" stroke-width="1.4"/>
${text(menuX + 34, menuY + 113, "Use this canvas to create notes", { size: 13, color: "#fff", weight: 600 })}
</g>`;
    win("ctx", C.rowClick + 0.5, C.menuClick + 0.5);
    anim("ctxhl", `0%,${C.menuClick - 3.5}%{opacity:0}${C.menuClick - 3}%,100%{opacity:.85}`, "opacity:0;");

    const dX = 511, dY = 196, dW = 440, dH = 186;
    const dialog = `<g class="dialog">
${shade(MX, 84, 1184 - MX, 476)}
<rect x="${dX}" y="${dY}" width="${dW}" height="${dH}" rx="12" fill="${modal}" stroke="#45425e" filter="url(#lift)"/>
${text(dX + 24, dY + 38, "Give this canvas a role", { size: 17, weight: 700 })}
<rect x="${dX + 24}" y="${dY + 56}" width="${dW - 48}" height="34" rx="7" fill="${field}" stroke="${cardStroke}"/>
${text(dX + 38, dY + 78, "flows/Daily note.canvas", { size: 13, color: "#d9d6ea", family: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace" })}
<rect x="${dX + dW - 140}" y="${dY + 62}" width="104" height="22" rx="11" fill="#2d2945" stroke="${t.accent}"/>
${text(dX + dW - 88, dY + 77.5, "Creates notes", { size: 12, color: "#cfc8ff", weight: 600, anchor: "middle" })}
${text(dX + 24, dY + 118, "The ribbon icon and the create command will open it.", { size: 13, color: t.muted })}
${btn(dX + dW - 236, dY + dH - 50, 76, "Cancel")}
${btn(dX + dW - 150, dY + dH - 50, 126, "Give it the role", true)}
${ring("pr-role", dX + dW - 150, dY + dH - 50, 126, 28, 6)}
</g>`;
    win("dialog", C.menuClick + 1, C.roleClick + 1.5);
    press("pr-role", C.roleClick);

    // ── Beat 2: the empty flow, and its first step ──
    const eX = 521, eY = 200, eW = 420;
    const empty = `<g class="empty">
<rect x="${eX}" y="${eY}" width="${eW}" height="196" rx="12" fill="${modal}" stroke="#45425e" filter="url(#lift)"/>
<circle cx="${eX + eW / 2}" cy="${eY + 40}" r="18" fill="#2d2945"/>
<path d="M${eX + eW / 2 - 8} ${eY + 46} c 0 -10 16 -2 16 -12" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linecap="round"/>
<circle cx="${eX + eW / 2 - 8}" cy="${eY + 47}" r="2.5" fill="${t.accent}"/><circle cx="${eX + eW / 2 + 8}" cy="${eY + 33}" r="2.5" fill="${t.accent}"/>
${text(eX + eW / 2, eY + 86, "This canvas has no steps yet", { size: 16, weight: 700, anchor: "middle" })}
${text(eX + eW / 2, eY + 110, "A step is a note or a card the wizard walks. Start with one,", { size: 12.5, color: t.muted, anchor: "middle" })}
${text(eX + eW / 2, eY + 128, "or install a system that already works.", { size: 12.5, color: t.muted, anchor: "middle" })}
${btn(eX + 50, eY + 148, 180, "+  Create the first step", true, 30)}
${btn(eX + 242, eY + 148, 128, "Browse systems", false, 30)}
${ring("pr-first", eX + 50, eY + 148, 180, 30, 6)}
</g>`;
    win("empty", C.roleClick + 2, C.firstClick + 1);
    press("pr-first", C.firstClick);

    const kX = 531, kY = 196, kW = 400;
    const kinds = ["Note — file with frontmatter (recommended)", "Text card (inline, legacy)", "Group (inline, legacy)"];
    const kind = `<g class="kind">
${shade(MX, 84, 1184 - MX, 476)}
<rect x="${kX}" y="${kY}" width="${kW}" height="196" rx="12" fill="${modal}" stroke="#45425e" filter="url(#lift)"/>
${text(kX + 24, kY + 38, "What kind of step?", { size: 17, weight: 700 })}
${kinds.map((s, i) => `<rect x="${kX + 24}" y="${kY + 62 + i * 40}" width="${kW - 48}" height="32" rx="7" fill="${i === 0 ? "#2d2945" : field}" stroke="${i === 0 ? t.accent : cardStroke}"/>${text(kX + 38, kY + 83 + i * 40, s, { size: 13, color: i === 0 ? "#fff" : "#d9d6ea", weight: i === 0 ? 600 : 400 })}`).join("\n")}
${ring("pr-kind", kX + 24, kY + 62, kW - 48, 32, 7)}
</g>`;
    win("kind", C.firstClick + 1.5, C.kindClick + 1.5);
    press("pr-kind", C.kindClick);

    // The step on the canvas: it starts the flow by itself.
    const sX = 616, sY = 216, sW = 250;
    const step = `<g class="step">
<rect x="${sX}" y="${sY}" width="${sW}" height="118" rx="10" fill="${card}" stroke="${cardStroke}" stroke-width="1.5"/>
<rect x="${sX}" y="${sY}" width="${sW}" height="30" rx="10" fill="#302e40"/><rect x="${sX}" y="${sY + 20}" width="${sW}" height="10" fill="#302e40"/>
${text(sX + 14, sY + 20, "Step.md", { size: 12, color: t.muted })}
<rect x="${sX + sW - 112}" y="${sY + 7}" width="100" height="18" rx="9" fill="${t.accent}"/>
${text(sX + sW - 62, sY + 20, "Starts the flow", { size: 10.5, color: "#fff", weight: 700, anchor: "middle" })}
${text(sX + 16, sY + 62, "# Step", { size: 15, weight: 700 })}
<g class="stepask">${text(sX + 16, sY + 88, "Ask for text · What went well today?", { size: 12, color: t.muted })}</g>
</g>
<g class="sel">
<rect x="${sX - 4}" y="${sY - 4}" width="${sW + 8}" height="126" rx="12" fill="none" stroke="${t.accent}" stroke-width="2"/>
<rect x="${sX + sW / 2 - 70}" y="${sY - 44}" width="140" height="30" rx="8" fill="#2a2936" stroke="#45425e"/>
${text(sX + sW / 2 - 50, sY - 24, "⋯", { size: 13, color: t.muted })}
<rect x="${sX + sW / 2 - 34}" y="${sY - 40}" width="98" height="22" rx="5" fill="#34314a"/>
${text(sX + sW / 2 + 15, sY - 25, "Edit step", { size: 12.5, color: "#fff", weight: 600, anchor: "middle" })}
${ring("pr-edit", sX + sW / 2 - 34, sY - 40, 98, 22, 5)}
</g>`;
    from("step", C.kindClick + 1.5);
    win("sel", C.kindClick + 4, C.editClick + 1);
    press("pr-edit", C.editClick);
    from("stepask", C.closeClick + 1);

    // ── Beat 3: the step editor ──
    const zX = 560, zY = 66, zW = 600, zH = 482;
    const L0 = zX + 28;
    const tiles = ["Ask for text", "Ask for a number", "Pick a date", "Choose an option", "Add tags", "Link a note"];
    const editor = `<g class="editor">
${shade(MX, 84, 1184 - MX, 476)}
<rect x="${zX}" y="${zY}" width="${zW}" height="${zH}" rx="12" fill="${modal}" stroke="#45425e" filter="url(#lift)"/>
${text(L0, zY + 40, "Step", { size: 19, weight: 700 })}
${text(zX + zW - 32, zY + 32, "✕", { size: 15, color: t.muted, anchor: "middle" })}
${ring("pr-close", zX + zW - 44, zY + 16, 24, 24, 6)}
<rect x="${L0}" y="${zY + 54}" width="78" height="22" rx="11" fill="${card}" stroke="${cardStroke}"/>${text(L0 + 39, zY + 69, "Step note", { size: 11.5, color: "#d9d6ea", anchor: "middle" })}
<rect x="${L0 + 86}" y="${zY + 54}" width="104" height="22" rx="11" fill="#2d2945" stroke="${t.accent}"/>${text(L0 + 138, zY + 69, "Starts the flow", { size: 11.5, color: "#cfc8ff", weight: 600, anchor: "middle" })}
<rect x="${L0}" y="${zY + 92}" width="${zW - 56}" height="${zH - 196}" rx="10" fill="${field}" stroke="${cardStroke}"/>
${text(L0 + 18, zY + 120, "What does this step ask?", { size: 14.5, weight: 700 })}
<g class="meta0">${text(zX + zW - 46, zY + 120, "nothing yet", { size: 12, color: t.faint, anchor: "end" })}</g>
<g class="meta1">${text(zX + zW - 46, zY + 120, "1 action", { size: 12, color: t.muted, anchor: "end" })}</g>
<g class="addbtn">${btn(L0 + 18, zY + 108 + 26, 130, "+  Add an action")}${ring("pr-add", L0 + 18, zY + 134, 130, 28, 6)}</g>
<g class="grid">
${tiles.map((s, i) => {
        const x = L0 + 18 + (i % 3) * 176;
        const y = zY + 172 + Math.floor(i / 3) * 52;
        return `<rect x="${x}" y="${y}" width="166" height="44" rx="8" fill="${i === 0 ? "#2d2945" : card}" stroke="${i === 0 ? t.accent : cardStroke}"/>${text(x + 14, y + 27, s, { size: 13, color: "#fff", weight: i === 0 ? 650 : 500 })}`;
    }).join("\n")}
${ring("pr-tile", L0 + 18, zY + 172, 166, 44, 8)}
</g>
<g class="acard">
<rect x="${L0 + 18}" y="${zY + 134}" width="${zW - 92}" height="${zH - 254}" rx="9" fill="${card}" stroke="${cardStroke}"/>
${text(L0 + 34, zY + 160, "⠿", { size: 13, color: t.faint })}
${text(L0 + 54, zY + 160, "Ask for text", { size: 14, weight: 650 })}
${text(L0 + 34, zY + 182, "A text field. The answer is written to the note.", { size: 12, color: t.muted })}
${text(L0 + 34, zY + 212, "Question", { size: 13, color: "#d9d6ea", weight: 600 })}
<rect x="${L0 + 180}" y="${zY + 196}" width="${zW - 290}" height="26" rx="6" fill="${field}" stroke="${t.accent}"/>
${text(L0 + 192, zY + 213.5, "What went well today?", { size: 13 })}
<rect class="typeq" x="${L0 + 190}" y="${zY + 199}" width="160" height="20" fill="${field}"/>
${text(L0 + 34, zY + 250, "Where it writes", { size: 13, color: "#d9d6ea", weight: 600 })}
<rect x="${L0 + 180}" y="${zY + 234}" width="130" height="26" rx="6" fill="${field}" stroke="${cardStroke}"/>
${text(L0 + 192, zY + 251.5, "Body", { size: 13 })}${text(L0 + 296, zY + 251.5, "▾", { size: 11, color: t.muted, anchor: "end" })}
</g>
<rect x="${L0}" y="${zY + zH - 92}" width="${zW - 56}" height="34" rx="9" fill="${field}" stroke="${cardStroke}"/>
${text(L0 + 18, zY + zH - 70, "▸  When does it appear?", { size: 13.5, weight: 600 })}
${text(zX + zW - 46, zY + zH - 70, "starts the flow", { size: 12, color: "#cfc8ff", anchor: "end" })}
<rect x="${L0}" y="${zY + zH - 50}" width="${zW - 56}" height="34" rx="9" fill="${field}" stroke="${cardStroke}"/>
${text(L0 + 18, zY + zH - 28, "▸  Where does it go?", { size: 13.5, weight: 600 })}
</g>`;
    win("editor", C.editClick + 1, C.closeClick + 1);
    press("pr-close", C.closeClick);
    anim("meta0", `0%,${C.tileClick}%{opacity:1}${C.tileClick + 0.5}%,100%{opacity:0}`);
    anim("meta1", `0%,${C.tileClick}%{opacity:0}${C.tileClick + 0.5}%,100%{opacity:1}`, "opacity:0;");
    anim("addbtn", `0%,${C.addClick + 0.8}%{opacity:1}${C.addClick + 1}%,100%{opacity:0}`, "opacity:0;");
    press("pr-add", C.addClick);
    win("grid", C.addClick + 1, C.tileClick + 0.5);
    press("pr-tile", C.tileClick);
    anim("acard", `0%,${C.tileClick + 0.5}%{opacity:0;transform:translateY(6px)}${C.tileClick + 1.5}%,100%{opacity:1;transform:none}`);
    typing("typeq", 60, 65, 21);

    // ── Beat 4: the ribbon, and the wizard ──
    const rmX = 62, rmY = 128;
    const rmenu = `<g class="rmenu">
<rect x="${rmX}" y="${rmY}" width="260" height="160" rx="8" fill="#2a2936" stroke="#45425e" filter="url(#lift)"/>
${text(rmX + 34, rmY + 24, "Think — open your thinking space", { size: 13, color: "#d9d6ea" })}
<rect x="${rmX + 5}" y="${rmY + 36}" width="250" height="24" rx="5" fill="${t.accent}" opacity="0.85"/>
${text(rmX + 34, rmY + 53, "Create note", { size: 13, color: "#fff", weight: 600 })}
<line x1="${rmX + 8}" y1="${rmY + 70}" x2="${rmX + 252}" y2="${rmY + 70}" stroke="#45425e"/>
${["Community", "Run the current canvas as a flow", "Open canvas"].map((s, i) => text(rmX + 34, rmY + 92 + i * 26, s, { size: 13, color: "#d9d6ea" })).join("")}
</g>`;
    win("rmenu", C.ribbonClick + 0.5, C.createClick + 0.5);

    const wX = 420, wY = 120, wW = 560, wH = 356;
    const wizard = `<g class="wizard">
${shade(MX, 84, 1184 - MX, 476)}
<rect x="${wX}" y="${wY}" width="${wW}" height="${wH}" rx="12" fill="${modal}" stroke="#45425e" filter="url(#lift)"/>
${text(wX + 28, wY + 38, "Step", { size: 13, color: t.muted, weight: 600 })}
<rect x="${wX + 28}" y="${wY + 50}" width="${wW - 56}" height="3" rx="1.5" fill="#3a3847"/><rect x="${wX + 28}" y="${wY + 50}" width="${wW - 56}" height="3" rx="1.5" fill="${t.accent}"/>
${text(wX + 28, wY + 96, "What went well today?", { size: 20, weight: 700 })}
<rect x="${wX + 28}" y="${wY + 114}" width="${wW - 56}" height="110" rx="8" fill="${field}" stroke="${t.accent}" stroke-width="1.5"/>
${text(wX + 44, wY + 142, "Drew my first flow, and it worked.", { size: 15 })}
<rect class="typea" x="${wX + 42}" y="${wY + 126}" width="250" height="22" fill="${field}"/>
<line x1="${wX}" y1="${wY + wH - 66}" x2="${wX + wW}" y2="${wY + wH - 66}" stroke="#3a3847"/>
${btn(wX + 28, wY + wH - 48, 70, "Back")}
${btn(wX + wW - 128, wY + wH - 48, 100, "Confirm", true)}
${ring("pr-confirm", wX + wW - 128, wY + wH - 48, 100, 28, 6)}
</g>`;
    win("wizard", C.createClick + 1, C.confirmClick + 1);
    typing("typea", 80, 86, 34);
    press("pr-confirm", C.confirmClick);
    press("pr-ribbon", C.ribbonClick);

    // ── The bar: four beats, the words you will see ──
    const beats = [
        { label: "Give the canvas its role", sub: "right-click it → Use this canvas to create notes", span: [0, 27] },
        { label: "Create the first step", sub: "it starts the flow on its own", span: [27, 49] },
        { label: "Say what it asks", sub: "Edit step → Add an action → Ask for text", span: [49, 71] },
        { label: "Create a note", sub: "ribbon → Create note: the wizard walks it", span: [71, 100] },
    ];
    const bX = 28, bW = 1144, segW = bW / 4;
    const beatSvg = beats
        .map((b, i) => {
            const x = bX + i * segW + 20;
            const cls = `beat${i}`;
            const [s0, s1] = [b.span[0], Math.min(b.span[1], END)];
            anim(cls, i === 0 ? `0%,${s1 - 0.5}%{opacity:1}${s1}%,100%{opacity:0}` : `0%,${s0}%{opacity:0}${s0 + 0.5}%,${s1 - 0.5}%{opacity:1}${s1}%,100%{opacity:0}`, "opacity:0;");
            return `<circle cx="${x + 10}" cy="586" r="10" fill="#2d2b3a" stroke="${cardStroke}"/>${text(x + 10, 590, String(i + 1), { size: 11, color: t.muted, weight: 700, anchor: "middle" })}
${text(x + 28, 590, b.label, { size: 13.5, color: "#d9d6ea", weight: 650 })}
${text(x + 28, 607, b.sub, { size: 11, color: t.faint })}
<g class="${cls}"><circle cx="${x + 10}" cy="586" r="10" fill="${t.accent}"/>${text(x + 10, 590, String(i + 1), { size: 11, color: "#fff", weight: 700, anchor: "middle" })}${text(x + 28, 590, b.label, { size: 13.5, color: "#fff", weight: 650 })}</g>`;
        })
        .join("\n");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your first flow, from an empty canvas to a note: right-click the canvas and choose Use this canvas to create notes, give it the role, press Create the first step and pick a note step, which starts the flow on its own; Edit step, Add an action, Ask for text, write the question; then the ribbon's Create note opens the wizard, which asks it and creates the note.">
<title>Your first flow</title>
<defs>
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#2a2938"/></pattern>
<linearGradient id="logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7ff5"/><stop offset="1" stop-color="#5b45d6"/></linearGradient>
<filter id="lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.5"/></filter>
</defs>
<style>
${css.join("\n")}
@media (prefers-reduced-motion: reduce){
*{animation:none!important}
}
</style>
<rect width="${W}" height="${H}" rx="16" fill="#141319"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="12" fill="#1c1b22" stroke="#34323f" stroke-width="1.5"/>
<path d="M16 28 a12 12 0 0 1 12 -12 h${W - 56} a12 12 0 0 1 12 12 v22 h-${W - 32} z" fill="#24232c"/>
<circle cx="38" cy="33" r="5" fill="#fb464c"/><circle cx="56" cy="33" r="5" fill="#e0de71"/><circle cx="74" cy="33" r="5" fill="#44cf6e"/>
${text(W / 2, 38, "My vault — Obsidian", { size: 12.5, color: "#8b8a98", anchor: "middle" })}
<line x1="16" y1="50" x2="${W - 16}" y2="50" stroke="#34323f"/>
<rect x="${RX}" y="50" width="${EX - RX}" height="510" fill="#1a1920"/>
${ribbonIcons}
${ring("pr-ribbon", RX + 9, 138, 24, 24, 6)}
${explorer}
${canvasArea}
${step}
${empty}
${kind}
${dialog}
${editor}
${wizard}
${ctx}
${rmenu}
<line x1="16" y1="560" x2="${W - 16}" y2="560" stroke="#34323f"/>
${beatSvg}
<g class="ptr"><path d="M0 0 L0 17 L4.5 13 L7.5 20 L10.5 18.6 L7.6 12 L13 12 Z" fill="#fff" stroke="#141319" stroke-width="1.2" stroke-linejoin="round"/></g>
</svg>
`;
}

writeFileSync(join(OUT, "hero.svg"), flowHero());
writeFileSync(join(OUT, "first-flow.svg"), firstFlow());
writeFileSync(join(OUT, "banner-dark.svg"), banner("dark"));
writeFileSync(join(OUT, "banner-light.svg"), banner("light"));
writeFileSync(join(OUT, "reader-hero.svg"), readerHero());
console.log("readme art written to", OUT);
