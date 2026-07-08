import { GamepadButton } from "./gamepadButtons.ts";
import glyphA from "./glyphs/a.svg?raw";
import glyphB from "./glyphs/b.svg?raw";
import glyphDpadDown from "./glyphs/dpad-down.svg?raw";
import glyphDpadLeft from "./glyphs/dpad-left.svg?raw";
import glyphDpadRight from "./glyphs/dpad-right.svg?raw";
import glyphDpadUp from "./glyphs/dpad-up.svg?raw";
import glyphGuide from "./glyphs/guide.svg?raw";
import glyphL3 from "./glyphs/l3.svg?raw";
import glyphL4 from "./glyphs/l4.svg?raw";
import glyphL5 from "./glyphs/l5.svg?raw";
import glyphLb from "./glyphs/lb.svg?raw";
import glyphLt from "./glyphs/lt.svg?raw";
import glyphMenu from "./glyphs/menu.svg?raw";
import glyphPadL from "./glyphs/pad-l.svg?raw";
import glyphPadR from "./glyphs/pad-r.svg?raw";
import glyphQam from "./glyphs/qam.svg?raw";
import glyphR3 from "./glyphs/r3.svg?raw";
import glyphR4 from "./glyphs/r4.svg?raw";
import glyphR5 from "./glyphs/r5.svg?raw";
import glyphRb from "./glyphs/rb.svg?raw";
import glyphRt from "./glyphs/rt.svg?raw";
import glyphView from "./glyphs/view.svg?raw";
import glyphX from "./glyphs/x.svg?raw";
import glyphY from "./glyphs/y.svg?raw";

// The glyphs are shared between the Steam Controller and generic gamepads.
// Paddle, QAM, and trackpad glyphs are Steam Controller-only.
const GamepadButtonGlyphs: Record<number, string> = {
    [GamepadButton.A]: glyphA,
    [GamepadButton.B]: glyphB,
    [GamepadButton.X]: glyphX,
    [GamepadButton.Y]: glyphY,
    [GamepadButton.LeftBumper]: glyphLb,
    [GamepadButton.RightBumper]: glyphRb,
    [GamepadButton.LeftTrigger]: glyphLt,
    [GamepadButton.RightTrigger]: glyphRt,
    [GamepadButton.Back]: glyphView,
    [GamepadButton.Start]: glyphMenu,
    [GamepadButton.Guide]: glyphGuide,
    [GamepadButton.LeftStick]: glyphL3,
    [GamepadButton.RightStick]: glyphR3,
    [GamepadButton.DpadUp]: glyphDpadUp,
    [GamepadButton.DpadDown]: glyphDpadDown,
    [GamepadButton.DpadLeft]: glyphDpadLeft,
    [GamepadButton.DpadRight]: glyphDpadRight,
    [GamepadButton.QuickAccess]: glyphQam,
    [GamepadButton.LeftPaddle1]: glyphL4,
    [GamepadButton.RightPaddle1]: glyphR4,
    [GamepadButton.LeftPaddle2]: glyphL5,
    [GamepadButton.RightPaddle2]: glyphR5,
    [GamepadButton.LeftTouchpadClick]: glyphPadL,
    [GamepadButton.RightTouchpadClick]: glyphPadR,
};

export function getGamepadButtonGlyph(button: number, size = 20): string | null {
    const glyph = GamepadButtonGlyphs[button];
    if (!glyph) {
        return null;
    }
    if (size == 20) {
        return glyph;
    }
    return glyph.replace(`width="20" height="20"`, `width="${size}" height="${size}"`);
}
