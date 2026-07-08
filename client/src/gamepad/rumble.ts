import type { GunDef } from "../../../shared/defs/gameObjects/gunDefs.ts";
import { controllerManager, type HapticKeyframe } from "./controllerManager.ts";

/*
 Semantic haptics layer.

 Effects are authored as device-independent envelopes (attack transient +
 low-frequency body + tail, optionally granular) rather than flat
 strength/duration pairs, so weapon classes and materials have distinct
 tactile signatures. The controller manager mixes the envelopes each frame
 and reduces them to what the connected hardware supports:
   - Steam Controller (triton): drive speed + per-channel dB gain over the
     raw HID rumble report, which keeps weak levels smooth and preserves
     envelope shape well at the ~40ms hardware refresh rate.
   - Generic gamepads: dual-rumble magnitudes, periodically re-issued.
 If a richer waveform interface becomes available, only the manager's
 dispatch needs to change; everything here is already authored as shaped
 envelopes.
*/

function clamp01(x: number) {
    return Math.min(Math.max(x, 0), 1);
}

// Per-ammo feel: mag is overall strength, balance goes from 0 (heavy
// low-frequency thump) to 1 (sharp high-frequency crack).
const AmmoFeel: Record<string, { mag: number; balance: number }> = {
    "9mm": { mag: 0.32, balance: 0.7 },
    "45acp": { mag: 0.38, balance: 0.6 },
    "556mm": { mag: 0.45, balance: 0.55 },
    "762mm": { mag: 0.55, balance: 0.4 },
    "308sub": { mag: 0.85, balance: 0.3 },
    "12gauge": { mag: 0.95, balance: 0.2 },
    "50AE": { mag: 0.8, balance: 0.35 },
    flare: { mag: 0.5, balance: 0.3 },
    potato_ammo: { mag: 0.5, balance: 0.45 },
};
const DefaultAmmoFeel = { mag: 0.4, balance: 0.5 };

// Fraction of the weapon's fire period a shot pulse may occupy. This is
// the single source of truth for both guarantees: (a) consecutive rounds
// have a silent gap of at least (1 - ShotMaxDutyCycle) of the period, and
// (b) because shot pulses share one replacing channel (no stacking), all
// firing rumble stops within ShotMaxDutyCycle * fireDelay of the final
// round.
const ShotMaxDutyCycle = 0.45;

// Exactly one crisp kick per round fired by the local player (addShot is
// invoked once per round via the server's shotFx flag, so shotgun pellets
// don't multiply this).
//
// Requirements: the pulse must read as a discrete per-round event even at
// maximum fire rate, and nothing may linger after the trigger releases.
// So pulses are hard-edged (instant attack, short square body, sharp
// cutoff), capped by ShotMaxDutyCycle, and played on a replacing channel
// so a new round always supersedes the previous pulse. Weapon identity
// comes from the pulse's waveform (low/high channel split and
// crack-vs-slam staging) and strength, not from stretching duration.
export function rumbleShot(weapDef: GunDef) {
    const feel = AmmoFeel[weapDef.ammo] || DefaultAmmoFeel;

    const fireDelayMs = (weapDef.fireDelay || 0.1) * 1000;
    const heavy = weapDef.fireDelay >= 1.2;
    // Class cap on pulse length; the duty-cycle rule below dominates for
    // fast weapons.
    let cap = 60;
    if (weapDef.fireMode == "auto" || weapDef.fireMode == "burst") {
        cap = 35;
    }
    if (heavy) {
        cap = 90;
    }
    const durationMs = Math.max(Math.min(fireDelayMs * ShotMaxDutyCycle, cap), 20);

    // Short pulses carry less energy; compensate so fast automatics still
    // thump per round.
    let mag = feel.mag;
    if (durationMs < 45) {
        mag = clamp01(mag * 1.2);
    }
    if (heavy) {
        mag = clamp01(mag * 1.15);
    }

    const low = clamp01(mag * (1.1 - feel.balance * 0.8));
    const high = clamp01(mag * (0.3 + feel.balance * 0.8));
    const holdMs = durationMs * 0.7;

    if (heavy) {
        // Slow, deliberate weapons: 10ms muzzle crack, then the recoil
        // slam, still ending in a hard cutoff.
        controllerManager.playHaptic(
            [
                { t: 0, low: low * 0.5, high },
                { t: 10, low, high: high * 0.35 },
                { t: holdMs, low: low * 0.75, high: high * 0.2 },
                { t: durationMs, low: 0, high: 0 },
            ],
            0,
            "shot",
        );
        return;
    }

    // Square kick: full amplitude instantly, hold, sharp release
    controllerManager.playHaptic(
        [
            { t: 0, low, high },
            { t: holdMs, low, high },
            { t: durationMs, low: 0, high: 0 },
        ],
        0,
        "shot",
    );
}

// Empty melee swing: barely-there whiff of air
export function rumbleMeleeSwing() {
    controllerManager.playHaptic([
        { t: 0, low: 0.015, high: 0.08 },
        { t: 18, low: 0.01, high: 0.04 },
        { t: 40, low: 0, high: 0 },
    ]);
}

// Melee connecting; the tactile signature follows the material of what was
// hit (derived from the same sound the hit plays).
export function rumbleMeleeHit(material: string) {
    switch (material) {
        case "flesh": // soft attack, dull low body
            controllerManager.playHaptic([
                { t: 0, low: 0.3, high: 0.25 },
                { t: 16, low: 0.55, high: 0.18 },
                { t: 110, low: 0, high: 0 },
            ]);
            break;
        case "wood": // mid thunk with a slightly fibrous tail
            controllerManager.playHaptic(
                [
                    { t: 0, low: 0.25, high: 0.45 },
                    { t: 10, low: 0.42, high: 0.2 },
                    { t: 85, low: 0, high: 0 },
                ],
                0.15,
            );
            break;
        case "stone": // hard, deep thud
            controllerManager.playHaptic([
                { t: 0, low: 0.5, high: 0.3 },
                { t: 12, low: 0.72, high: 0.15 },
                { t: 100, low: 0, high: 0 },
            ]);
            break;
        case "metal": // sharp strike with a ringing high-frequency tail
            controllerManager.playHaptic([
                { t: 0, low: 0.2, high: 0.85 },
                { t: 10, low: 0.3, high: 0.55 },
                { t: 60, low: 0.12, high: 0.32 },
                { t: 150, low: 0, high: 0 },
            ]);
            break;
        case "glass": // brittle crack, granular shatter tail
            controllerManager.playHaptic(
                [
                    { t: 0, low: 0.1, high: 0.9 },
                    { t: 8, low: 0.15, high: 0.5 },
                    { t: 90, low: 0, high: 0 },
                ],
                0.3,
            );
            break;
        case "soft": // muted, damped
            controllerManager.playHaptic([
                { t: 0, low: 0.15, high: 0.12 },
                { t: 70, low: 0, high: 0 },
            ]);
            break;
        default:
            controllerManager.playHaptic([
                { t: 0, low: 0.35, high: 0.4 },
                { t: 12, low: 0.45, high: 0.22 },
                { t: 90, low: 0, high: 0 },
            ]);
            break;
    }
}

// Maps a melee punch/bullet-hit sound name to a rumble material.
export function materialFromHitSound(sound: string | undefined) {
    if (!sound) {
        return "default";
    }
    if (sound.includes("wood") || sound.includes("tree") || sound.includes("crate")) {
        return "wood";
    }
    if (
        sound.includes("stone") || sound.includes("brick") || sound.includes("concrete")
    ) {
        return "stone";
    }
    if (
        sound.includes("barrel") || sound.includes("metal") || sound.includes("silo")
        || sound.includes("oven") || sound.includes("fridge") || sound.includes("locker")
    ) {
        return "metal";
    }
    if (sound.includes("glass") || sound.includes("window")) {
        return "glass";
    }
    if (
        sound.includes("cloth") || sound.includes("bush") || sound.includes("organic")
        || sound.includes("squash") || sound.includes("pumpkin")
    ) {
        return "soft";
    }
    return "default";
}

// Explosion at a distance: initial crack, big low-frequency body, granular
// debris tail. Strength falls off quadratically with distance from the
// player, mirroring how the blast sounds.
const ExplosionRumbleRange = 60;

export function rumbleExplosion(dist: number, strength = 1) {
    const falloff = clamp01(1 - dist / ExplosionRumbleRange);
    const s = falloff * falloff * clamp01(strength);
    if (s < 0.02) {
        return;
    }
    controllerManager.playHaptic(
        [
            { t: 0, low: 0.35 * s, high: 0.95 * s },
            { t: 14, low: s, high: 0.4 * s },
            { t: 90, low: 0.55 * s, high: 0.15 * s },
            { t: 330, low: 0, high: 0 },
        ],
        0.35,
    );
}

// NOTE: there is intentionally no generic screen-shake -> rumble pairing.
// Events that shake the screen get their own bespoke shaped effects
// (e.g. rumbleExplosion), and future events should do the same.

// Airstrike/airdrop plane fly-over: a continuous engine drone that swells
// on approach, peaks as the plane passes the player, and fades as it
// leaves, following the same distance curve as the engine sound.
export function rumblePlaneSource(intensity: number) {
    const t = clamp01(intensity);
    controllerManager.setRumbleSource("plane", t * 0.85, t * 0.35);
}

// Airdrop crate slamming into the ground nearby
export function rumbleAirdropLand(dist: number) {
    const t = clamp01(1 - dist / 60);
    if (t < 0.02) {
        return;
    }
    controllerManager.playHaptic(
        [
            { t: 0, low: 0.5 * t, high: 0.6 * t },
            { t: 15, low: 0.95 * t, high: 0.3 * t },
            { t: 120, low: 0.4 * t, high: 0.1 * t },
            { t: 260, low: 0, high: 0 },
        ],
        0.25,
    );
}

// Tiny mechanism-like ticks for menu navigation
export function rumbleUiTick() {
    controllerManager.playHaptic([
        { t: 0, low: 0, high: 0.15 },
        { t: 12, low: 0, high: 0 },
    ]);
}

export function rumbleUiClick() {
    controllerManager.playHaptic([
        { t: 0, low: 0.12, high: 0.4 },
        { t: 20, low: 0, high: 0 },
    ]);
}

export type { HapticKeyframe };
