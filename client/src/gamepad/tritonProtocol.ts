/*
 Steam Controller (2026, "triton") HID protocol constants.

 This file is an altered TypeScript port of portions of SDL3, specifically:
   src/joystick/hidapi/SDL_hidapi_steam_triton.c
   src/joystick/hidapi/steam/controller_constants.h
   src/joystick/hidapi/steam/controller_structs.h
   src/joystick/controller_list.h
 as of commit 5403934fd30e3568b1e20f652d4823c796739722 (2026-07-08).

 Simple DirectMedia Layer
 Copyright (C) 1997-2026 Sam Lantinga <slouken@libsdl.org>
 Copyright (C) 2021 Valve Corporation
 Copyright (C) 2020 Valve Corporation
 Copyright (C) Valve Corporation

 TypeScript port and modifications
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

 This file is an altered TypeScript port and is not the original SDL source.
*/

export const USB_VENDOR_VALVE = 0x28de;

export const USB_PRODUCT_VALVE_TRITON_WIRED = 0x1302;
export const USB_PRODUCT_VALVE_TRITON_BLE = 0x1303;
export const USB_PRODUCT_VALVE_STEAM_PROTEUS_DONGLE = 0x1304;
export const USB_PRODUCT_VALVE_STEAM_NEREID_DONGLE = 0x1305;

export const TRITON_PRODUCT_IDS = [
    USB_PRODUCT_VALVE_TRITON_WIRED,
    USB_PRODUCT_VALVE_TRITON_BLE,
    USB_PRODUCT_VALVE_STEAM_PROTEUS_DONGLE,
    USB_PRODUCT_VALVE_STEAM_NEREID_DONGLE,
];

export const HID_VENDOR_USAGE_PAGE = 0xff00;

export const HID_FEATURE_REPORT_BYTES = 64;
export const HID_RUMBLE_OUTPUT_REPORT_BYTES = 10;

// ETritonReportIDTypes (controller_structs.h)
export const ID_TRITON_CONTROLLER_STATE = 0x42;
export const ID_TRITON_BATTERY_STATUS = 0x43;
export const ID_TRITON_CONTROLLER_STATE_BLE = 0x45;
export const ID_TRITON_WIRELESS_STATUS_X = 0x46;
export const ID_TRITON_CONTROLLER_STATE_TIMESTAMP = 0x47;
export const ID_TRITON_WIRELESS_STATUS = 0x79;

// ETritonWirelessState
export const TRITON_WIRELESS_STATE_DISCONNECT = 1;
export const TRITON_WIRELESS_STATE_CONNECT = 2;

// FeatureReportMessageIDs
export const ID_SET_SETTINGS_VALUES = 0x87;

// ControllerSettings
export const SETTING_LIZARD_MODE = 9;
export const SETTING_IMU_MODE = 48;

// LizardModeState_t
export const LIZARD_MODE_OFF = 0;

// SettingGyroMode bitmask
export const SETTING_GYRO_MODE_OFF = 0x0000;
export const SETTING_GYRO_MODE_SEND_RAW_ACCEL = 0x0008;
export const SETTING_GYRO_MODE_SEND_RAW_GYRO = 0x0010;

// ValveTritonOutReportMessageIDs
export const ID_OUT_REPORT_HAPTIC_RUMBLE = 0x80;

// TritonButtons bitmask
export const TRITON_LBUTTON_A = 0x00000001;
export const TRITON_LBUTTON_B = 0x00000002;
export const TRITON_LBUTTON_X = 0x00000004;
export const TRITON_LBUTTON_Y = 0x00000008;
export const TRITON_HBUTTON_QAM = 0x00000010;
export const TRITON_LBUTTON_R3 = 0x00000020;
export const TRITON_LBUTTON_VIEW = 0x00000040;
export const TRITON_HBUTTON_R4 = 0x00000080;
export const TRITON_LBUTTON_R5 = 0x00000100;
export const TRITON_LBUTTON_R = 0x00000200;
export const TRITON_LBUTTON_DPAD_DOWN = 0x00000400;
export const TRITON_LBUTTON_DPAD_RIGHT = 0x00000800;
export const TRITON_LBUTTON_DPAD_LEFT = 0x00001000;
export const TRITON_LBUTTON_DPAD_UP = 0x00002000;
export const TRITON_LBUTTON_MENU = 0x00004000;
export const TRITON_LBUTTON_L3 = 0x00008000;
export const TRITON_LBUTTON_STEAM = 0x00010000;
export const TRITON_HBUTTON_L4 = 0x00020000;
export const TRITON_LBUTTON_L5 = 0x00040000;
export const TRITON_LBUTTON_L = 0x00080000;
export const TRITON_RIGHT_JOYSTICK_TOUCH = 0x00100000;
export const TRITON_RIGHT_TOUCHPAD_TOUCH = 0x00200000;
export const TRITON_RIGHT_TOUCHPAD_CLICK = 0x00400000;
export const TRITON_RIGHT_TRIGGER_CLICK = 0x00800000;
export const TRITON_LEFT_JOYSTICK_TOUCH = 0x01000000;
export const TRITON_LEFT_TOUCHPAD_TOUCH = 0x02000000;
export const TRITON_LEFT_TOUCHPAD_CLICK = 0x04000000;
export const TRITON_LEFT_TRIGGER_CLICK = 0x08000000;
export const TRITON_RIGHT_GRIP_TOUCH = 0x10000000;
export const TRITON_LEFT_GRIP_TOUCH = 0x20000000;

// Gyro is reported as int16 covering +-2000 deg/s; accel covers +-2g.
export const TRITON_GYRO_FULL_SCALE_DPS = 2000;

// Sensor packet cadence: nominally 1 kHz per the USB descriptor, ~4ms actual.
export const TRITON_SENSOR_UPDATE_INTERVAL_US = 4032;

// Steam Controller hardware rumble safety timeout is ~50ms; SDL resends every 40ms.
export const TRITON_RUMBLE_RESEND_INTERVAL_MS = 40;

// The firmware watchdog re-enables lizard mode, so SDL re-disables it every 3s.
export const TRITON_LIZARD_RESEND_INTERVAL_MS = 3000;

/*
 Byte offsets within the state report payload (after the report ID byte).

 TritonMTUNoQuat_t / TritonMTUNoQuat32TS_t are identical through the sticks
 (#pragma pack(1), little-endian):
   0   uint8  seq_num
   1   uint32 buttons
   5   int16  sTriggerLeft
   7   int16  sTriggerRight
   9   int16  sLeftStickX
   11  int16  sLeftStickY
   13  int16  sRightStickX
   15  int16  sRightStickY
 Then for ID_TRITON_CONTROLLER_STATE / _BLE (TritonMTUNoQuat_t):
   17  int16  sLeftPadX      27 uint16 unPressureRight
   19  int16  sLeftPadY      29 uint32 imu.timestamp (us)
   21  uint16 unPressureLeft 33 int16  imu accel x/y/z
   23  int16  sRightPadX     39 int16  imu gyro x/y/z
   25  int16  sRightPadY
 And for ID_TRITON_CONTROLLER_STATE_TIMESTAMP (TritonMTUNoQuat32TS_t):
   17  uint16 unTrackpadTimestamp
   19  int16  sLeftPadX      29 uint16 unPressureRight
   21  int16  sLeftPadY      31 uint16 imu.timestamp (32us units)
   23  uint16 unPressureLeft 33 int16  imu accel x/y/z
   25  int16  sRightPadX     39 int16  imu gyro x/y/z
   27  int16  sRightPadY
*/
export const TRITON_STATE_MIN_BYTES = 45;

export interface TritonStateReport {
    buttons: number;
    triggerLeft: number; // 0..1
    triggerRight: number; // 0..1
    leftStickX: number; // -1..1, +x right
    leftStickY: number; // -1..1, +y up
    rightStickX: number;
    rightStickY: number;
    leftPadX: number; // -1..1
    leftPadY: number; // -1..1, +y up
    leftPadPressure: number; // 0..1
    rightPadX: number;
    rightPadY: number;
    rightPadPressure: number;
    // Raw IMU timestamp; 32-bit reports count microseconds, 16-bit reports
    // count 32-microsecond units. Wraparound must be handled by the caller.
    imuTimestamp: number;
    imuTimestampBits: 16 | 32;
    gyroX: number; // rad/s
    gyroY: number;
    gyroZ: number;
}

const GYRO_SCALE = (TRITON_GYRO_FULL_SCALE_DPS / 32768) * (Math.PI / 180);

export function parseTritonState(
    data: DataView,
    hasTrackpadTimestamp: boolean,
): TritonStateReport | null {
    if (data.byteLength < TRITON_STATE_MIN_BYTES) {
        return null;
    }
    const padBase = hasTrackpadTimestamp ? 19 : 17;
    const imuBase = hasTrackpadTimestamp ? 31 : 29;
    const imuTimestamp = hasTrackpadTimestamp
        ? data.getUint16(imuBase, true)
        : data.getUint32(imuBase, true);
    // The IMU block is timestamp (2 or 4 bytes), then accel x/y/z, then
    // gyro x/y/z (int16 each).
    const gyroBase = imuBase + (hasTrackpadTimestamp ? 2 : 4) + 6;
    return {
        buttons: data.getUint32(1, true),
        triggerLeft: data.getInt16(5, true) / 32767,
        triggerRight: data.getInt16(7, true) / 32767,
        leftStickX: data.getInt16(9, true) / 32768,
        leftStickY: data.getInt16(11, true) / 32768,
        rightStickX: data.getInt16(13, true) / 32768,
        rightStickY: data.getInt16(15, true) / 32768,
        leftPadX: data.getInt16(padBase, true) / 32768,
        leftPadY: data.getInt16(padBase + 2, true) / 32768,
        leftPadPressure: data.getUint16(padBase + 4, true) / 32768,
        rightPadX: data.getInt16(padBase + 6, true) / 32768,
        rightPadY: data.getInt16(padBase + 8, true) / 32768,
        rightPadPressure: data.getUint16(padBase + 10, true) / 32768,
        imuTimestamp,
        imuTimestampBits: hasTrackpadTimestamp ? 16 : 32,
        gyroX: data.getInt16(gyroBase, true) * GYRO_SCALE,
        gyroY: data.getInt16(gyroBase + 2, true) * GYRO_SCALE,
        gyroZ: data.getInt16(gyroBase + 4, true) * GYRO_SCALE,
    };
}

/*
 Feature report layout used for ID_SET_SETTINGS_VALUES (SDL sends a 64-byte
 buffer whose first byte is HID report ID 1):
   [0] report id (1)     -> passed separately to WebHID sendFeatureReport
   [1] header.type       (e.g. ID_SET_SETTINGS_VALUES)
   [2] header.length     (n * sizeof(ControllerSetting) = n * 3)
   [3] settingNum        (uint8)
   [4] settingValue      (uint16 LE)
   ... zero padding to 64 bytes total
*/
export const TRITON_FEATURE_REPORT_ID = 1;

export function buildSetSettingPayload(settingNum: number, settingValue: number) {
    const payload = new Uint8Array(HID_FEATURE_REPORT_BYTES - 1);
    payload[0] = ID_SET_SETTINGS_VALUES;
    payload[1] = 3; // one ControllerSetting (uint8 + uint16)
    payload[2] = settingNum;
    payload[3] = settingValue & 0xff;
    payload[4] = (settingValue >> 8) & 0xff;
    return payload;
}

/*
 Rumble output report (OutputReportMsg + MsgHapticRumble, 10 bytes total):
   [0] report id (ID_OUT_REPORT_HAPTIC_RUMBLE) -> passed separately to WebHID
   [1] type (0)
   [2] intensity (uint16 LE, 0)
   [4] left.speed (uint16 LE)
   [6] left.gain (int8, dB)
   [7] right.speed (uint16 LE)
   [9] right.gain (int8, dB)

 Speed drives the actuator rate while gain (dB) attenuates amplitude;
 shaping strength through gain keeps weak rumble smooth instead of
 degenerating into slow discrete knocks at low speeds.
*/
export function buildRumblePayload(
    lowSpeed: number,
    lowGainDb: number,
    highSpeed: number,
    highGainDb: number,
) {
    const payload = new Uint8Array(HID_RUMBLE_OUTPUT_REPORT_BYTES - 1);
    payload[0] = 0; // type
    payload[1] = 0; // intensity lo
    payload[2] = 0; // intensity hi
    payload[3] = lowSpeed & 0xff;
    payload[4] = (lowSpeed >> 8) & 0xff;
    payload[5] = lowGainDb & 0xff; // int8 two's complement
    payload[6] = highSpeed & 0xff;
    payload[7] = (highSpeed >> 8) & 0xff;
    payload[8] = highGainDb & 0xff;
    return payload;
}
