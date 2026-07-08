/*
 Steam Controller (2026, "triton") gamepad buttons enumeration.
 
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

export enum GamepadButton {
    None = 0,
    A,
    B,
    X,
    Y,
    LeftBumper,
    RightBumper,
    LeftTrigger,
    RightTrigger,
    Back,
    Start,
    Guide,
    LeftStick,
    RightStick,
    DpadUp,
    DpadDown,
    DpadLeft,
    DpadRight,
    QuickAccess,
    LeftPaddle1,
    RightPaddle1,
    LeftPaddle2,
    RightPaddle2,
    LeftTouchpadClick,
    RightTouchpadClick,
    Count,
}

export const GamepadButtonNames: Record<number, string> = {
    [GamepadButton.A]: "A Button",
    [GamepadButton.B]: "B Button",
    [GamepadButton.X]: "X Button",
    [GamepadButton.Y]: "Y Button",
    [GamepadButton.LeftBumper]: "LB",
    [GamepadButton.RightBumper]: "RB",
    [GamepadButton.LeftTrigger]: "LT",
    [GamepadButton.RightTrigger]: "RT",
    [GamepadButton.Back]: "View",
    [GamepadButton.Start]: "Menu",
    [GamepadButton.Guide]: "Steam",
    [GamepadButton.LeftStick]: "L3",
    [GamepadButton.RightStick]: "R3",
    [GamepadButton.DpadUp]: "D-Pad Up",
    [GamepadButton.DpadDown]: "D-Pad Down",
    [GamepadButton.DpadLeft]: "D-Pad Left",
    [GamepadButton.DpadRight]: "D-Pad Right",
    [GamepadButton.QuickAccess]: "QAM",
    [GamepadButton.LeftPaddle1]: "L4",
    [GamepadButton.RightPaddle1]: "R4",
    [GamepadButton.LeftPaddle2]: "L5",
    [GamepadButton.RightPaddle2]: "R5",
    [GamepadButton.LeftTouchpadClick]: "L Pad Click",
    [GamepadButton.RightTouchpadClick]: "R Pad Click",
};
