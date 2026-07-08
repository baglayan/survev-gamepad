/*
 Steam Controller (2026, "triton") WebHID driver.
 
 Copyright (C) 2026 Meriç Bağlayan <meric.baglayan@outlook.com>
 
 This software is provided 'as-is', without any express or implied
 warranty. In no event will the authors be held liable for any damages
 arising from the use of this software.
 
 Permission is granted to anyone to use this software for any purpose,
 including commercial applications, and to alter it and redistribute it
 freely, subject to the following restrictions:
 
 1. The origin of this software must not be misrepresented; you must not
    claim that you wrote the original software. If you use this software
    in a product, an acknowledgment in the product documentation would be
    appreciated but is not required.
 2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.
 3. This notice may not be removed or altered from any source distribution.
*/

import { GamepadButton } from "./gamepadButtons.ts";
import {
    buildRumblePayload,
    buildSetSettingPayload,
    HID_VENDOR_USAGE_PAGE,
    ID_OUT_REPORT_HAPTIC_RUMBLE,
    ID_TRITON_BATTERY_STATUS,
    ID_TRITON_CONTROLLER_STATE,
    ID_TRITON_CONTROLLER_STATE_BLE,
    ID_TRITON_CONTROLLER_STATE_TIMESTAMP,
    ID_TRITON_WIRELESS_STATUS,
    ID_TRITON_WIRELESS_STATUS_X,
    LIZARD_MODE_OFF,
    parseTritonState,
    SETTING_GYRO_MODE_SEND_RAW_ACCEL,
    SETTING_GYRO_MODE_SEND_RAW_GYRO,
    SETTING_IMU_MODE,
    SETTING_LIZARD_MODE,
    TRITON_FEATURE_REPORT_ID,
    TRITON_HBUTTON_L4,
    TRITON_HBUTTON_QAM,
    TRITON_HBUTTON_R4,
    TRITON_LBUTTON_A,
    TRITON_LBUTTON_B,
    TRITON_LBUTTON_DPAD_DOWN,
    TRITON_LBUTTON_DPAD_LEFT,
    TRITON_LBUTTON_DPAD_RIGHT,
    TRITON_LBUTTON_DPAD_UP,
    TRITON_LBUTTON_L,
    TRITON_LBUTTON_L3,
    TRITON_LBUTTON_L5,
    TRITON_LBUTTON_MENU,
    TRITON_LBUTTON_R,
    TRITON_LBUTTON_R3,
    TRITON_LBUTTON_R5,
    TRITON_LBUTTON_STEAM,
    TRITON_LBUTTON_VIEW,
    TRITON_LBUTTON_X,
    TRITON_LBUTTON_Y,
    TRITON_LEFT_GRIP_TOUCH,
    TRITON_LEFT_JOYSTICK_TOUCH,
    TRITON_LEFT_TOUCHPAD_CLICK,
    TRITON_LEFT_TOUCHPAD_TOUCH,
    TRITON_LIZARD_RESEND_INTERVAL_MS,
    TRITON_RIGHT_GRIP_TOUCH,
    TRITON_RIGHT_JOYSTICK_TOUCH,
    TRITON_RIGHT_TOUCHPAD_CLICK,
    TRITON_RIGHT_TOUCHPAD_TOUCH,
    TRITON_RUMBLE_RESEND_INTERVAL_MS,
    USB_VENDOR_VALVE,
} from "./tritonProtocol.ts";

// Ignore gyro rates below ~0.5 deg/s so sensor noise doesn't drift the aim.
const GYRO_NOISE_FLOOR_RAD = 0.009;

const ButtonMaskMap: Array<[number, GamepadButton]> = [
    [TRITON_LBUTTON_A, GamepadButton.A],
    [TRITON_LBUTTON_B, GamepadButton.B],
    [TRITON_LBUTTON_X, GamepadButton.X],
    [TRITON_LBUTTON_Y, GamepadButton.Y],
    [TRITON_LBUTTON_L, GamepadButton.LeftBumper],
    [TRITON_LBUTTON_R, GamepadButton.RightBumper],
    [TRITON_LBUTTON_MENU, GamepadButton.Back],
    [TRITON_LBUTTON_VIEW, GamepadButton.Start],
    [TRITON_LBUTTON_STEAM, GamepadButton.Guide],
    [TRITON_HBUTTON_QAM, GamepadButton.QuickAccess],
    [TRITON_LBUTTON_L3, GamepadButton.LeftStick],
    [TRITON_LBUTTON_R3, GamepadButton.RightStick],
    [TRITON_LBUTTON_DPAD_UP, GamepadButton.DpadUp],
    [TRITON_LBUTTON_DPAD_DOWN, GamepadButton.DpadDown],
    [TRITON_LBUTTON_DPAD_LEFT, GamepadButton.DpadLeft],
    [TRITON_LBUTTON_DPAD_RIGHT, GamepadButton.DpadRight],
    [TRITON_HBUTTON_R4, GamepadButton.RightPaddle1],
    [TRITON_HBUTTON_L4, GamepadButton.LeftPaddle1],
    [TRITON_LBUTTON_R5, GamepadButton.RightPaddle2],
    [TRITON_LBUTTON_L5, GamepadButton.LeftPaddle2],
    [TRITON_RIGHT_TOUCHPAD_CLICK, GamepadButton.RightTouchpadClick],
    [TRITON_LEFT_TOUCHPAD_CLICK, GamepadButton.LeftTouchpadClick],
];

export interface TouchpadState {
    touched: boolean;
    x: number; // -1..1, +x right
    y: number; // -1..1, +y up
    pressure: number; // 0..1
}

// Raw state mirrored from the controller's input reports. Axis conventions:
// sticks/pads report +y up, matching the game's world coordinates.
export class SteamTritonState {
    connected = false;
    buttons: Record<number, boolean> = {};
    leftStickX = 0;
    leftStickY = 0;
    rightStickX = 0;
    rightStickY = 0;
    triggerLeft = 0;
    triggerRight = 0;
    leftPad: TouchpadState = { touched: false, x: 0, y: 0, pressure: 0 };
    rightPad: TouchpadState = { touched: false, x: 0, y: 0, pressure: 0 };
    // Capacitive sensors
    leftStickTouched = false;
    rightStickTouched = false;
    leftGripTouched = false;
    rightGripTouched = false;
    // Integrated gyro angles in radians, accumulated between polls.
    // Yaw: rotation about the axis pointing up out of a flat-held
    // controller; positive = counter-clockwise viewed from above.
    // Pitch: rotation about the axis pointing right; positive = tilting
    // the controller face up toward you.
    gyroYawDelta = 0;
    gyroPitchDelta = 0;
    // Instantaneous rates in rad/s, for diagnostics/future use.
    gyroPitchRate = 0;
    gyroYawRate = 0;
    gyroRollRate = 0;
    batteryLevel = -1;
}

export class SteamTritonDriver {
    state = new SteamTritonState();
    onChange: (() => void) | null = null;
    // Set when a granted device could not be opened (e.g. Steam is holding
    // it, or the OS denied raw HID access); cleared on a successful attach.
    openError = false;
    // While suspended (controller released by the user), the lizard-mode
    // and IMU refreshes stop, so the firmware watchdog restores desktop
    // keyboard/mouse emulation within a few seconds. Input reports keep
    // arriving but the game ignores them.
    suspended = false;

    private devices: HIDDevice[] = [];
    private activeDevice: HIDDevice | null = null;
    private lastImuTimestamp = -1;
    private imuTimestampBits: 16 | 32 = 32;
    private lastLizardTime = 0;
    private rumbleLow = 0;
    private rumbleHigh = 0;
    private rumbleLowGainDb = 0;
    private rumbleHighGainDb = 0;
    private lastRumbleTime = 0;
    private featureReportInFlight = false;
    private initialized = false;

    static get supported() {
        return !!navigator.hid;
    }

    // Re-attaches devices the user has already granted access to. Safe to
    // call without a user gesture.
    async init() {
        if (this.initialized || !navigator.hid) {
            return;
        }
        this.initialized = true;

        navigator.hid.addEventListener("connect", (e) => {
            this.tryAttachDevice((e as HIDConnectionEvent).device);
        });
        navigator.hid.addEventListener("disconnect", (e) => {
            this.detachDevice((e as HIDConnectionEvent).device);
        });

        try {
            const devices = await navigator.hid.getDevices();
            for (const device of devices) {
                await this.tryAttachDevice(device);
            }
        } catch (err) {
            console.error("Steam Controller: failed to enumerate HID devices", err);
        }
    }

    // Must be called from a user gesture (WebHID permission prompt).
    async requestDevice() {
        if (!navigator.hid) {
            return false;
        }
        await this.init();
        try {
            const devices = await navigator.hid.requestDevice({
                filters: [{ vendorId: USB_VENDOR_VALVE }],
            });
            let attached = false;
            for (const device of devices) {
                attached = (await this.tryAttachDevice(device)) || attached;
            }
            return attached;
        } catch (err) {
            console.error("Steam Controller: requestDevice failed", err);
            return false;
        }
    }

    get deviceGranted() {
        return this.devices.length > 0;
    }

    private isTritonInterface(device: HIDDevice) {
        if (device.vendorId != USB_VENDOR_VALVE) {
            return false;
        }
        // The gamepad data lives on a vendor-defined usage page interface;
        // the other interfaces are the lizard-mode keyboard/mouse emulation.
        return device.collections.some((c) => c.usagePage == HID_VENDOR_USAGE_PAGE);
    }

    private async tryAttachDevice(device: HIDDevice) {
        if (!this.isTritonInterface(device) || this.devices.includes(device)) {
            return false;
        }
        try {
            if (!device.opened) {
                await device.open();
            }
        } catch (err) {
            console.error("Steam Controller: failed to open HID interface", err);
            this.openError = true;
            this.notifyChange();
            return false;
        }
        this.openError = false;
        this.devices.push(device);
        device.oninputreport = (event) => {
            this.handleInputReport(event);
        };
        await this.disableLizardMode(device);
        await this.enableImu(device);
        this.notifyChange();
        return true;
    }

    private detachDevice(device: HIDDevice) {
        const idx = this.devices.indexOf(device);
        if (idx >= 0) {
            this.devices.splice(idx, 1);
        }
        if (this.activeDevice == device) {
            this.activeDevice = null;
            this.setConnected(false);
        }
        this.notifyChange();
    }

    private setConnected(connected: boolean) {
        if (this.state.connected != connected) {
            this.state.connected = connected;
            if (!connected) {
                this.state.buttons = {};
                this.state.leftPad.touched = false;
                this.state.rightPad.touched = false;
                this.lastImuTimestamp = -1;
            }
            this.notifyChange();
        }
    }

    private notifyChange() {
        this.onChange?.();
    }

    private handleInputReport(event: HIDInputReportEvent) {
        switch (event.reportId) {
            case ID_TRITON_CONTROLLER_STATE:
            case ID_TRITON_CONTROLLER_STATE_BLE:
                this.handleState(event.device, event.data, false);
                break;
            case ID_TRITON_CONTROLLER_STATE_TIMESTAMP:
                this.handleState(event.device, event.data, true);
                break;
            case ID_TRITON_BATTERY_STATUS:
                if (event.data.byteLength >= 2) {
                    this.state.batteryLevel = event.data.getUint8(1);
                }
                break;
            case ID_TRITON_WIRELESS_STATUS_X:
            case ID_TRITON_WIRELESS_STATUS:
                if (event.data.byteLength >= 1) {
                    const wirelessState = event.data.getUint8(0);
                    if (wirelessState == 2 /* connect */) {
                        this.activeDevice = event.device;
                        this.setConnected(true);
                    } else if (wirelessState == 1 /* disconnect */) {
                        this.setConnected(false);
                    }
                }
                break;
            default:
                break;
        }
    }

    private handleState(device: HIDDevice, data: DataView, hasTrackpadTimestamp: boolean) {
        const report = parseTritonState(data, hasTrackpadTimestamp);
        if (!report) {
            return;
        }
        this.activeDevice = device;
        this.setConnected(true);

        const state = this.state;
        for (let i = 0; i < ButtonMaskMap.length; i++) {
            const [mask, button] = ButtonMaskMap[i];
            state.buttons[button] = (report.buttons & mask) != 0;
        }
        state.leftStickTouched = (report.buttons & TRITON_LEFT_JOYSTICK_TOUCH) != 0;
        state.rightStickTouched = (report.buttons & TRITON_RIGHT_JOYSTICK_TOUCH) != 0;
        state.leftGripTouched = (report.buttons & TRITON_LEFT_GRIP_TOUCH) != 0;
        state.rightGripTouched = (report.buttons & TRITON_RIGHT_GRIP_TOUCH) != 0;

        state.leftStickX = report.leftStickX;
        state.leftStickY = report.leftStickY;
        state.rightStickX = report.rightStickX;
        state.rightStickY = report.rightStickY;
        state.triggerLeft = report.triggerLeft;
        state.triggerRight = report.triggerRight;

        state.leftPad.touched = (report.buttons & TRITON_LEFT_TOUCHPAD_TOUCH) != 0;
        if (state.leftPad.touched) {
            state.leftPad.x = report.leftPadX;
            state.leftPad.y = report.leftPadY;
            state.leftPad.pressure = report.leftPadPressure;
        }
        state.rightPad.touched = (report.buttons & TRITON_RIGHT_TOUCHPAD_TOUCH) != 0;
        if (state.rightPad.touched) {
            state.rightPad.x = report.rightPadX;
            state.rightPad.y = report.rightPadY;
            state.rightPad.pressure = report.rightPadPressure;
        }

        // Integrate the gyro yaw rate using the on-device IMU timestamps
        // (much more accurate than frame timing). SDL maps raw gyro Z to
        // yaw for a flat-held controller.
        if (this.lastImuTimestamp >= 0 && this.imuTimestampBits == report.imuTimestampBits) {
            let deltaTicks: number;
            if (report.imuTimestampBits == 16) {
                deltaTicks = (report.imuTimestamp - this.lastImuTimestamp) & 0xffff;
            } else {
                deltaTicks = (report.imuTimestamp - this.lastImuTimestamp) >>> 0;
            }
            const tickUs = report.imuTimestampBits == 16 ? 32 : 1;
            const dtSec = (deltaTicks * tickUs) / 1e6;
            if (dtSec > 0 && dtSec < 0.25) {
                if (Math.abs(report.gyroZ) > GYRO_NOISE_FLOOR_RAD) {
                    state.gyroYawDelta += report.gyroZ * dtSec;
                }
                if (Math.abs(report.gyroX) > GYRO_NOISE_FLOOR_RAD) {
                    state.gyroPitchDelta += report.gyroX * dtSec;
                }
            }
        }
        this.lastImuTimestamp = report.imuTimestamp;
        this.imuTimestampBits = report.imuTimestampBits;
        state.gyroPitchRate = report.gyroX;
        state.gyroYawRate = report.gyroZ;
        state.gyroRollRate = report.gyroY;
    }

    // Consume the gyro angles accumulated since the last call (radians).
    takeGyroDeltas() {
        const deltas = {
            yaw: this.state.gyroYawDelta,
            pitch: this.state.gyroPitchDelta,
        };
        this.state.gyroYawDelta = 0;
        this.state.gyroPitchDelta = 0;
        return deltas;
    }

    private async sendFeatureReport(device: HIDDevice, payload: Uint8Array<ArrayBuffer>) {
        if (this.featureReportInFlight) {
            return;
        }
        this.featureReportInFlight = true;
        try {
            await device.sendFeatureReport(TRITON_FEATURE_REPORT_ID, payload);
        } catch (_err) {
            // Some transports expose the reports as unnumbered; retry with
            // the report id inlined as the first data byte.
            try {
                const raw = new Uint8Array(payload.length + 1);
                raw[0] = TRITON_FEATURE_REPORT_ID;
                raw.set(payload, 1);
                await device.sendFeatureReport(0, raw);
            } catch (err2) {
                console.error("Steam Controller: feature report failed", err2);
            }
        } finally {
            this.featureReportInFlight = false;
        }
    }

    private disableLizardMode(device: HIDDevice) {
        return this.sendFeatureReport(
            device,
            buildSetSettingPayload(SETTING_LIZARD_MODE, LIZARD_MODE_OFF),
        );
    }

    private enableImu(device: HIDDevice) {
        return this.sendFeatureReport(
            device,
            buildSetSettingPayload(
                SETTING_IMU_MODE,
                SETTING_GYRO_MODE_SEND_RAW_ACCEL | SETTING_GYRO_MODE_SEND_RAW_GYRO,
            ),
        );
    }

    // The firmware watchdog re-enables lizard mode and can reset the IMU
    // mode, so both settings are refreshed periodically.
    private async refreshSettings(device: HIDDevice) {
        await this.disableLizardMode(device);
        await this.enableImu(device);
    }

    // Continuous rumble level, intensities 0..1. Non-zero levels are
    // re-sent every 40ms by update() (the hardware auto-stops after ~50ms
    // without refreshes); zero is sent once on transition.
    setRumble(lowFrequency: number, highFrequency: number) {
        const quantize = (intensity: number) => {
            const t = Math.min(Math.max(intensity, 0), 1);
            if (t <= 0.001) {
                return { speed: 0, gainDb: 0 };
            }
            const speed = Math.round((0.4 + 0.6 * t) * 65535);
            const gainDb = Math.round(-24 * (1 - t));
            return { speed, gainDb };
        };
        const low = quantize(lowFrequency);
        const high = quantize(highFrequency);
        if (
            low.speed == this.rumbleLow
            && high.speed == this.rumbleHigh
            && low.gainDb == this.rumbleLowGainDb
            && high.gainDb == this.rumbleHighGainDb
        ) {
            return;
        }
        const zeroCross = (low.speed == 0) != (this.rumbleLow == 0)
            || (high.speed == 0) != (this.rumbleHigh == 0);
        const bigChange = Math.abs(low.speed - this.rumbleLow) > 6000
            || Math.abs(high.speed - this.rumbleHigh) > 6000
            || Math.abs(low.gainDb - this.rumbleLowGainDb) >= 4
            || Math.abs(high.gainDb - this.rumbleHighGainDb) >= 4;
        this.rumbleLow = low.speed;
        this.rumbleHigh = high.speed;
        this.rumbleLowGainDb = low.gainDb;
        this.rumbleHighGainDb = high.gainDb;
        if (zeroCross || bigChange) {
            this.sendRumble();
        }
    }

    private sendRumble() {
        const device = this.activeDevice;
        if (!device) {
            return;
        }
        this.lastRumbleTime = performance.now();
        device
            .sendReport(
                ID_OUT_REPORT_HAPTIC_RUMBLE,
                buildRumblePayload(
                    this.rumbleLow,
                    this.rumbleLowGainDb,
                    this.rumbleHigh,
                    this.rumbleHighGainDb,
                ),
            )
            .catch(() => {});
    }

    // Call once per frame: keeps lizard mode disabled
    update() {
        const now = performance.now();
        if (this.state.connected && this.activeDevice && !this.suspended) {
            if (now - this.lastLizardTime >= TRITON_LIZARD_RESEND_INTERVAL_MS) {
                this.lastLizardTime = now;
                this.refreshSettings(this.activeDevice);
            }
            if (
                (this.rumbleLow || this.rumbleHigh)
                && now - this.lastRumbleTime >= TRITON_RUMBLE_RESEND_INTERVAL_MS
            ) {
                this.sendRumble();
            }
        }
    }
}
