import { GamepadButton } from "./gamepadButtons.ts";

// Standard gamepad mapping
const StandardButtonMap: Array<[number, GamepadButton]> = [
    [0, GamepadButton.A],
    [1, GamepadButton.B],
    [2, GamepadButton.X],
    [3, GamepadButton.Y],
    [4, GamepadButton.LeftBumper],
    [5, GamepadButton.RightBumper],
    [8, GamepadButton.Back],
    [9, GamepadButton.Start],
    [10, GamepadButton.LeftStick],
    [11, GamepadButton.RightStick],
    [12, GamepadButton.DpadUp],
    [13, GamepadButton.DpadDown],
    [14, GamepadButton.DpadLeft],
    [15, GamepadButton.DpadRight],
    [16, GamepadButton.Guide],
];

export class GenericGamepadState {
    connected = false;
    buttons: Record<number, boolean> = {};
    leftStickX = 0;
    leftStickY = 0; // +y up
    rightStickX = 0;
    rightStickY = 0;
    triggerLeft = 0;
    triggerRight = 0;
}

// Fallback for browsers without WebHID and for regular controllers
export class GenericGamepadDriver {
    state = new GenericGamepadState();

    poll() {
        const state = this.state;
        if (!navigator.getGamepads) {
            state.connected = false;
            return;
        }
        let pad: Gamepad | null = null;
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
            const p = pads[i];
            if (p?.connected && p.mapping == "standard") {
                pad = p;
                break;
            }
        }
        if (!pad) {
            if (state.connected) {
                state.connected = false;
                state.buttons = {};
                state.leftStickX = state.leftStickY = 0;
                state.rightStickX = state.rightStickY = 0;
                state.triggerLeft = state.triggerRight = 0;
            }
            return;
        }
        state.connected = true;
        for (let i = 0; i < StandardButtonMap.length; i++) {
            const [idx, button] = StandardButtonMap[i];
            state.buttons[button] = !!pad.buttons[idx]?.pressed;
        }
        state.triggerLeft = pad.buttons[6]?.value ?? 0;
        state.triggerRight = pad.buttons[7]?.value ?? 0;
        state.leftStickX = pad.axes[0] ?? 0;
        state.leftStickY = -(pad.axes[1] ?? 0);
        state.rightStickX = pad.axes[2] ?? 0;
        state.rightStickY = -(pad.axes[3] ?? 0);
    }

    rumble(lowFrequency: number, highFrequency: number, durationMs: number) {
        if (!navigator.getGamepads) {
            return;
        }
        const pads = navigator.getGamepads();
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            const actuator = pad?.vibrationActuator;
            if (pad?.connected && actuator) {
                actuator
                    .playEffect("dual-rumble", {
                        duration: durationMs,
                        strongMagnitude: Math.min(Math.max(lowFrequency, 0), 1),
                        weakMagnitude: Math.min(Math.max(highFrequency, 0), 1),
                    })
                    .catch(() => {});
                break;
            }
        }
    }
}
