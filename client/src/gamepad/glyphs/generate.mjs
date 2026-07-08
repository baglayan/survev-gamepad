import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = dirname(fileURLToPath(import.meta.url));
mkdirSync(outDir, { recursive: true });

const STROKE = 1.6;

function svgWrap(inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" style="vertical-align:middle;transform:translateY(-0.06em)" aria-hidden="true">${inner}</svg>\n`;
}

function textEl(label, fontSize, x = 12, y = 12.5, maxWidth = 0) {
    const fit = maxWidth > 0
        ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`
        : "";
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" `
        + `font-size="${fontSize}" font-weight="bold" font-family="inherit" fill="currentColor"${fit}>${label}</text>`;
}

function circleGlyph(label) {
    const multiChar = label.length > 1;
    return svgWrap(
        `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + textEl(label, multiChar ? 9 : 11, 12, 12.5, multiChar ? 12 : 0),
    );
}

function bumperGlyph(label) {
    return svgWrap(
        `<rect x="2" y="7" width="20" height="11" rx="4" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + textEl(label, 9, 12, 12.5, 14),
    );
}

function triggerGlyph(label) {
    return svgWrap(
        `<path d="M4 21 v-9 a8 8 0 0 1 16 0 v9 z" fill="none" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round"/>`
            + textEl(label, 9, 12, 14.5, 12),
    );
}

function dpadGlyph(dir) {
    const cross =
        `<path d="M9 2 h6 v7 h7 v6 h-7 v7 h-6 v-7 H2 V9 h7 z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`;
    const arrows = {
        up: `<path d="M12 4.2 l2.6 3.6 h-5.2 z" fill="currentColor"/>`,
        down: `<path d="M12 19.8 l-2.6 -3.6 h5.2 z" fill="currentColor"/>`,
        left: `<path d="M4.2 12 l3.6 -2.6 v5.2 z" fill="currentColor"/>`,
        right: `<path d="M19.8 12 l-3.6 -2.6 v5.2 z" fill="currentColor"/>`,
    };
    return svgWrap(cross + arrows[dir]);
}

function menuGlyph() {
    return svgWrap(
        `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + `<path d="M8 9 h8 M8 12 h8 M8 15 h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
    );
}

function viewGlyph() {
    return svgWrap(
        `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + `<rect x="7.5" y="7.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.3"/>`
            + `<rect x="10.5" y="10.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.3"/>`,
    );
}

function guideGlyph() {
    return svgWrap(
        `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + `<circle cx="12" cy="12" r="3.5" fill="currentColor"/>`,
    );
}

function qamGlyph() {
    return svgWrap(
        `<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + `<circle cx="7.5" cy="12" r="1.4" fill="currentColor"/>`
            + `<circle cx="12" cy="12" r="1.4" fill="currentColor"/>`
            + `<circle cx="16.5" cy="12" r="1.4" fill="currentColor"/>`,
    );
}

function trackpadGlyph(label) {
    return svgWrap(
        `<rect x="3" y="3" width="18" height="18" rx="4.5" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>`
            + textEl(label, 9, 12, 10.5)
            + `<circle cx="12" cy="17" r="1.5" fill="currentColor"/>`,
    );
}

const files = {
    "a.svg": circleGlyph("A"),
    "b.svg": circleGlyph("B"),
    "x.svg": circleGlyph("X"),
    "y.svg": circleGlyph("Y"),
    "lb.svg": bumperGlyph("LB"),
    "rb.svg": bumperGlyph("RB"),
    "lt.svg": triggerGlyph("LT"),
    "rt.svg": triggerGlyph("RT"),
    "view.svg": viewGlyph(),
    "menu.svg": menuGlyph(),
    "guide.svg": guideGlyph(),
    "l3.svg": circleGlyph("L3"),
    "r3.svg": circleGlyph("R3"),
    "dpad-up.svg": dpadGlyph("up"),
    "dpad-down.svg": dpadGlyph("down"),
    "dpad-left.svg": dpadGlyph("left"),
    "dpad-right.svg": dpadGlyph("right"),
    "qam.svg": qamGlyph(),
    "l4.svg": circleGlyph("L4"),
    "r4.svg": circleGlyph("R4"),
    "l5.svg": circleGlyph("L5"),
    "r5.svg": circleGlyph("R5"),
    "pad-l.svg": trackpadGlyph("L"),
    "pad-r.svg": trackpadGlyph("R"),
};

for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(outDir, name), content);
}
console.log(`Wrote ${Object.keys(files).length} glyphs to ${outDir}`);
