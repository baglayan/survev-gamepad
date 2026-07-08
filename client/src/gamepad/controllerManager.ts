import type { ConfigManager } from "../config.ts";
import { GamepadButton } from "./gamepadButtons.ts";
import { GenericGamepadDriver } from "./genericGamepad.ts";
import { SteamTritonDriver, type TouchpadState } from "./steamTritonDriver.ts";

export type GyroMode = "stickTouch" | "padTouch" | "always" | "off";

// A point on a haptic envelope: time in ms from effect start, low/high
// channel intensities 0..1. Interpolated linearly between keyframes.
export interface HapticKeyframe {
    t: number;
    low: number;
    high: number;
}

const TriggerPressThreshold = 0.35;
const TriggerReleaseThreshold = 0.2;
const StickActivityThreshold = 0.25;

interface Vec2Like {
    x: number;
    y: number;
}

// Aggregates the Steam Controller (WebHID) driver and the generic Gamepad
// API fallback into one normalized, per-frame controller state.
class ControllerManager {
    triton = new SteamTritonDriver();
    generic = new GenericGamepadDriver();

    onChange: (() => void) | null = null;

    // Config-backed tuning
    stickDeadzone = 0.15;
    gyroSensitivity = 1;
    gyroInvert = false;
    gyroMode: GyroMode = "stickTouch";
    trackpadSensitivity = 1;

    // Timestamp (performance.now()) of the last controller input of any kind.
    lastActivityTime = -Infinity;

    // While released, the game ignores the controller entirely and the
    // Steam Controller reverts to desktop mode (lizard-mode refresh
    // stops). Reacquired automatically when the window regains focus.
    released = false;
    // Timestamp of the last keyboard/mouse input, for hint swapping.
    lastKbmTime = 0;

    // Normalized controller aim direction while the controller owns the aim;
    // set by the game each frame, consumed by rendering (local player
    // rotation). Null when the mouse owns the aim.
    localAimDir: Vec2Like | null = null;

    private buttons: Record<number, boolean> = {};
    private buttonsOld: Record<number, boolean> = {};
    private leftTriggerHeld = false;
    private rightTriggerHeld = false;

    leftStick: Vec2Like = { x: 0, y: 0 };
    rightStick: Vec2Like = { x: 0, y: 0 };
    leftTrigger = 0;
    rightTrigger = 0;

    // Steam Controller extras (null when unavailable)
    leftTouchpad: TouchpadState | null = null;
    rightTouchpad: TouchpadState | null = null;
    leftStickTouched = false;
    rightStickTouched = false;
    // True while the gyro is currently engaged (its capacitive activation
    // gate is satisfied); drives the aim indicator (crosshair vs aim line).
    gyroActive = false;

    private gyroDelta: Vec2Like = { x: 0, y: 0 };
    private rightPadDelta: Vec2Like = { x: 0, y: 0 };
    private rightPadWasTouched = false;
    private rightPadLast: Vec2Like = { x: 0, y: 0 };

    private config: ConfigManager | null = null;
    private initialized = false;

    get webHidSupported() {
        return SteamTritonDriver.supported;
    }

    get steamConnected() {
        return this.triton.state.connected;
    }

    get steamGranted() {
        return this.triton.deviceGranted;
    }

    // A granted Steam Controller interface could not be opened (commonly:
    // Steam is claiming the controller, or missing hidraw permissions).
    get steamOpenFailed() {
        return this.triton.openError;
    }

    // A controller (of either kind) is currently attached.
    get connected() {
        return this.triton.state.connected || this.generic.state.connected;
    }

    // Whether UI hints should show controller glyphs (a controller is
    // connected and was used more recently than the keyboard/mouse).
    get gamepadHintsActive() {
        return this.connected && !this.released
            && this.lastActivityTime >= this.lastKbmTime;
    }

    private releaseTime = 0;

    release() {
        if (this.released) {
            return;
        }
        this.released = true;
        this.releaseTime = performance.now();
        this.triton.suspended = true;
        // Silence any active rumble immediately
        this.hapticEffects.length = 0;
        this.rumbleSources.clear();
        this.onChange?.();
    }

    reacquire() {
        if (!this.released) {
            return;
        }
        // Ignore the input burst that triggered the release itself
        if (performance.now() - this.releaseTime < 300) {
            return;
        }
        this.released = false;
        this.triton.suspended = false;
        this.lastActivityTime = performance.now();
        this.onChange?.();
    }

    init(config: ConfigManager) {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.config = config;
        this.readConfig();
        config.addModifiedListener(() => {
            this.readConfig();
        });
        this.triton.onChange = () => {
            this.onChange?.();
        };
        window.addEventListener("gamepadconnected", () => {
            this.onChange?.();
        });
        window.addEventListener("gamepaddisconnected", () => {
            this.onChange?.();
        });
        // On-the-fly glyph swapping
        const onKbmInput = () => {
            this.lastKbmTime = performance.now();
        };
        window.addEventListener("keydown", onKbmInput);
        window.addEventListener("mousedown", onKbmInput);
        window.addEventListener("mousemove", onKbmInput);
        window.addEventListener("wheel", onKbmInput, { passive: true });
        window.addEventListener("focus", () => {
            this.reacquire();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState == "visible") {
                this.reacquire();
            }
        });
        window.addEventListener("pointerdown", () => {
            this.reacquire();
        });
        this.triton.init();
    }

    private readConfig() {
        const config = this.config;
        if (!config) {
            return;
        }
        this.stickDeadzone = config.get("gamepadStickDeadzone") ?? 0.15;
        this.gyroSensitivity = config.get("gamepadGyroSensitivity") ?? 1;
        this.gyroInvert = !!config.get("gamepadGyroInvert");
        this.gyroMode = (config.get("gamepadGyroMode") as GyroMode) || "stickTouch";
        this.trackpadSensitivity = config.get("gamepadTrackpadSensitivity") ?? 1;
    }

    // WebHID permission prompt; must be triggered by a user gesture.
    requestSteamController() {
        return this.triton.requestDevice();
    }

    private applyDeadzone(x: number, y: number, out: Vec2Like) {
        const len = Math.sqrt(x * x + y * y);
        if (len <= this.stickDeadzone) {
            out.x = 0;
            out.y = 0;
            return;
        }
        // Rescale so the deadzone edge maps to 0 and full deflection to 1.
        const scaled = Math.min((len - this.stickDeadzone) / (1 - this.stickDeadzone), 1);
        out.x = (x / len) * scaled;
        out.y = (y / len) * scaled;
    }

    // Call once per frame, before game input assembly.
    update() {
        this.buttonsOld = Object.assign({}, this.buttons);

        this.triton.suspended = this.released;
        this.triton.update();
        this.generic.poll();

        if (this.released) {
            // Drop all input and keep rumble silenced while released
            this.buttons = {};
            this.buttonsOld = {};
            this.leftStick.x = this.leftStick.y = 0;
            this.rightStick.x = this.rightStick.y = 0;
            this.leftTrigger = this.rightTrigger = 0;
            this.leftTriggerHeld = this.rightTriggerHeld = false;
            this.leftTouchpad = null;
            this.rightTouchpad = null;
            this.leftStickTouched = false;
            this.rightStickTouched = false;
            this.gyroActive = false;
            this.gyroDelta.x = this.gyroDelta.y = 0;
            this.rightPadDelta.x = this.rightPadDelta.y = 0;
            this.triton.takeGyroDeltas();
            this.updateRumble();
            return;
        }

        const steamState = this.triton.state;
        const useSteam = steamState.connected;
        const src = useSteam ? steamState : this.generic.state;

        for (let i = 0; i < GamepadButton.Count; i++) {
            this.buttons[i] = !!src.buttons[i];
        }

        // Analog triggers act as buttons with hysteresis.
        this.leftTrigger = src.triggerLeft;
        this.rightTrigger = src.triggerRight;
        this.leftTriggerHeld = this.leftTriggerHeld
            ? src.triggerLeft > TriggerReleaseThreshold
            : src.triggerLeft > TriggerPressThreshold;
        this.rightTriggerHeld = this.rightTriggerHeld
            ? src.triggerRight > TriggerReleaseThreshold
            : src.triggerRight > TriggerPressThreshold;
        this.buttons[GamepadButton.LeftTrigger] = this.leftTriggerHeld;
        this.buttons[GamepadButton.RightTrigger] = this.rightTriggerHeld;

        this.applyDeadzone(src.leftStickX, src.leftStickY, this.leftStick);
        this.applyDeadzone(src.rightStickX, src.rightStickY, this.rightStick);

        // Steam Controller extras
        if (useSteam) {
            this.leftTouchpad = steamState.leftPad;
            this.rightTouchpad = steamState.rightPad;
            this.leftStickTouched = steamState.leftStickTouched;
            this.rightStickTouched = steamState.rightStickTouched;

            // Gyro: gate by the configured capacitive-touch activation mode.
            const rawGyro = this.triton.takeGyroDeltas();
            let gyroActive = false;
            switch (this.gyroMode) {
                case "stickTouch":
                    gyroActive = steamState.rightStickTouched;
                    break;
                case "padTouch":
                    gyroActive = steamState.rightPad.touched;
                    break;
                case "always":
                    gyroActive = true;
                    break;
                case "off":
                    gyroActive = false;
                    break;
            }
            if (gyroActive) {
                // Gyro-mouse mapping: yawing the controller left moves the
                // aim left (-x), pitching the face up moves it up (+y).
                const sign = this.gyroInvert ? -1 : 1;
                this.gyroDelta.x += -rawGyro.yaw * this.gyroSensitivity * sign;
                this.gyroDelta.y += rawGyro.pitch * this.gyroSensitivity * sign;
            }
            this.gyroActive = gyroActive;

            // Right trackpad: relative deltas, like a mouse.
            if (steamState.rightPad.touched) {
                if (this.rightPadWasTouched) {
                    this.rightPadDelta.x += (steamState.rightPad.x - this.rightPadLast.x)
                        * this.trackpadSensitivity;
                    this.rightPadDelta.y += (steamState.rightPad.y - this.rightPadLast.y)
                        * this.trackpadSensitivity;
                }
                this.rightPadLast.x = steamState.rightPad.x;
                this.rightPadLast.y = steamState.rightPad.y;
            }
            this.rightPadWasTouched = steamState.rightPad.touched;
        } else {
            this.leftTouchpad = null;
            this.rightTouchpad = null;
            this.leftStickTouched = false;
            this.rightStickTouched = false;
            this.gyroActive = false;
            this.gyroDelta.x = 0;
            this.gyroDelta.y = 0;
            this.rightPadDelta.x = 0;
            this.rightPadDelta.y = 0;
            this.rightPadWasTouched = false;
        }

        // Track activity for input-source switching. Connecting a
        // controller counts as activity so hints swap immediately.
        if (this.hasActivity() || this.connected != this.wasConnected) {
            this.lastActivityTime = performance.now();
        }
        this.wasConnected = this.connected;

        this.updateRumble();
    }

    private wasConnected = false;

    private hasActivity() {
        for (let i = 0; i < GamepadButton.Count; i++) {
            if (this.buttons[i]) {
                return true;
            }
        }
        if (
            Math.abs(this.leftStick.x) > StickActivityThreshold
            || Math.abs(this.leftStick.y) > StickActivityThreshold
            || Math.abs(this.rightStick.x) > StickActivityThreshold
            || Math.abs(this.rightStick.y) > StickActivityThreshold
        ) {
            return true;
        }
        return !!(this.leftTouchpad?.touched || this.rightTouchpad?.touched);
    }

    buttonDown(button: number) {
        return !!this.buttons[button];
    }

    buttonPressed(button: number) {
        return !this.buttonsOld[button] && !!this.buttons[button];
    }

    buttonReleased(button: number) {
        return !!this.buttonsOld[button] && !this.buttons[button];
    }

    // First button that transitioned to pressed this frame (bind capture).
    anyButtonPressed(): number | null {
        for (let i = GamepadButton.None + 1; i < GamepadButton.Count; i++) {
            if (this.buttonPressed(i)) {
                return i;
            }
        }
        return null;
    }

    // Gyro aim movement (radians, sensitivity/invert applied, gyro-mouse
    // axis mapping) accumulated since the last call.
    takeGyroAimDelta(): Vec2Like {
        const delta = { x: this.gyroDelta.x, y: this.gyroDelta.y };
        this.gyroDelta.x = 0;
        this.gyroDelta.y = 0;
        return delta;
    }

    // Right trackpad movement (pad units, sensitivity applied) accumulated
    // since the last call.
    takeRightPadDelta(): Vec2Like {
        const delta = { x: this.rightPadDelta.x, y: this.rightPadDelta.y };
        this.rightPadDelta.x = 0;
        this.rightPadDelta.y = 0;
        return delta;
    }

    // Haptic mixing
    //
    // One-shot effects are authored as piecewise-linear envelopes over the
    // low/high channels (attack transient, body, tail), optionally with
    // per-frame jitter for granular textures. Named continuous sources
    // (screen shake, plane fly-over) are refreshed every frame. Everything
    // is mixed by per-channel max, then reduced to whatever the connected
    // controller supports (triton speed+gain, or generic dual-rumble).

    private hapticEffects: Array<{
        keyframes: HapticKeyframe[];
        startTime: number;
        jitter: number;
        channel?: string;
    }> = [];
    private rumbleSources = new Map<
        string,
        { low: number; high: number; expireTime: number }
    >();
    private lastGenericRumbleTime = 0;
    private lastRumbleLow = 0;
    private lastRumbleHigh = 0;

    // Play an authored haptic envelope. Keyframes are (ms, low, high) with
    // linear interpolation between them; the effect ends at the last
    // keyframe. jitter (0..1) roughens the output for debris/texture tails.
    // An effect with a channel replaces any active effect on that channel,
    // so rapid retriggers (full-auto fire) can never stack or extend each
    // other: the newest effect's end time is the hard stop.
    playHaptic(keyframes: HapticKeyframe[], jitter = 0, channel?: string) {
        if (!keyframes.length) {
            return;
        }
        if (channel) {
            for (let i = this.hapticEffects.length - 1; i >= 0; i--) {
                if (this.hapticEffects[i].channel == channel) {
                    this.hapticEffects.splice(i, 1);
                }
            }
        }
        this.hapticEffects.push({
            keyframes,
            startTime: performance.now(),
            jitter,
            channel,
        });
    }

    // Legacy one-shot rumble pulse, intensities 0..1.
    rumble(lowFrequency: number, highFrequency: number, durationMs: number) {
        if (lowFrequency <= 0 && highFrequency <= 0) {
            return;
        }
        const low = Math.min(Math.max(lowFrequency, 0), 1);
        const high = Math.min(Math.max(highFrequency, 0), 1);
        this.playHaptic([
            { t: 0, low, high },
            { t: durationMs, low, high },
            { t: durationMs + 1, low: 0, high: 0 },
        ]);
    }

    // Continuous rumble owned by a named source; refresh every frame while
    // active (stale sources expire automatically). Zero levels remove it.
    setRumbleSource(key: string, lowFrequency: number, highFrequency: number) {
        if (lowFrequency <= 0.001 && highFrequency <= 0.001) {
            this.rumbleSources.delete(key);
            return;
        }
        this.rumbleSources.set(key, {
            low: Math.min(Math.max(lowFrequency, 0), 1),
            high: Math.min(Math.max(highFrequency, 0), 1),
            expireTime: performance.now() + 300,
        });
    }

    private updateRumble() {
        const now = performance.now();
        let low = 0;
        let high = 0;
        for (let i = this.hapticEffects.length - 1; i >= 0; i--) {
            const effect = this.hapticEffects[i];
            const t = now - effect.startTime;
            const frames = effect.keyframes;
            if (t >= frames[frames.length - 1].t) {
                this.hapticEffects.splice(i, 1);
                continue;
            }
            // Piecewise-linear interpolation over the envelope
            let effLow = frames[0].low;
            let effHigh = frames[0].high;
            for (let j = 1; j < frames.length; j++) {
                if (t <= frames[j].t) {
                    const span = frames[j].t - frames[j - 1].t;
                    const frac = span > 0 ? (t - frames[j - 1].t) / span : 1;
                    effLow = frames[j - 1].low + (frames[j].low - frames[j - 1].low) * frac;
                    effHigh = frames[j - 1].high
                        + (frames[j].high - frames[j - 1].high) * frac;
                    break;
                }
            }
            if (effect.jitter > 0) {
                // Granular texture: randomize per frame, biased downward
                const grain = 1 - Math.random() * effect.jitter;
                effLow *= grain;
                effHigh *= 1 - Math.random() * effect.jitter;
            }
            low = Math.max(low, effLow);
            high = Math.max(high, effHigh);
        }
        for (const [key, src] of this.rumbleSources) {
            if (src.expireTime <= now) {
                this.rumbleSources.delete(key);
                continue;
            }
            low = Math.max(low, src.low);
            high = Math.max(high, src.high);
        }

        if (this.triton.state.connected) {
            this.triton.setRumble(low, high);
        } else if (this.generic.state.connected) {
            const changed = Math.abs(low - this.lastRumbleLow) > 0.05
                || Math.abs(high - this.lastRumbleHigh) > 0.05;
            if (low > 0 || high > 0) {
                // The Gamepad API is fire-and-forget; refresh periodically
                if (changed || now - this.lastGenericRumbleTime > 200) {
                    this.generic.rumble(low, high, 400);
                    this.lastGenericRumbleTime = now;
                }
            } else if (this.lastRumbleLow > 0 || this.lastRumbleHigh > 0) {
                this.generic.rumble(0, 0, 1);
            }
        }
        this.lastRumbleLow = low;
        this.lastRumbleHigh = high;
    }
}

export const controllerManager = new ControllerManager();
