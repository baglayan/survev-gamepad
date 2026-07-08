import base64 from "base64-js";
import $ from "jquery";
import { type Input, Input as GameInput } from "../../shared/gameConfig.ts";
import { BitStream } from "../../shared/lib/bitBuffer.ts";
import type { ConfigManager } from "./config.ts";
import { controllerManager } from "./gamepad/controllerManager.ts";
import { GamepadButton, GamepadButtonNames } from "./gamepad/gamepadButtons.ts";
import { getGamepadButtonGlyph } from "./gamepad/gamepadGlyphs.ts";
import { menuNavigator } from "./gamepad/menuNavigator.ts";
import { type InputHandler, InputType, InputValue, Key, MouseButton, MouseWheel } from "./input.ts";
import { crc16 } from "./lib/crc.ts";
import type { Localization } from "./ui/localization.ts";

function def(name: string, defaultValue: InputValue | null) {
    return {
        name,
        defaultValue,
    };
}
function inputKey(key: Key) {
    return new InputValue(InputType.Key, key);
}
function mouseButton(button: MouseButton) {
    return new InputValue(InputType.MouseButton, button);
}
function mouseWheel(wheel: MouseWheel) {
    return new InputValue(InputType.MouseWheel, wheel);
}

const BindDefs = {
    [GameInput.MoveLeft]: def("Move Left", inputKey(Key.A)),
    [GameInput.MoveRight]: def("Move Right", inputKey(Key.D)),
    [GameInput.MoveUp]: def("Move Up", inputKey(Key.W)),
    [GameInput.MoveDown]: def("Move Down", inputKey(Key.S)),
    [GameInput.Fire]: def("Fire", mouseButton(MouseButton.Left)),
    [GameInput.Reload]: def("Reload", inputKey(Key.R)),
    [GameInput.Cancel]: def("Cancel", inputKey(Key.X)),
    [GameInput.Interact]: def("Interact", inputKey(Key.F)),
    [GameInput.Revive]: def("Revive", null),
    [GameInput.Use]: def("Open/Use", null),
    [GameInput.Loot]: def("Loot", null),
    [GameInput.EquipPrimary]: def("Equip Primary", inputKey(Key.One)),
    [GameInput.EquipSecondary]: def("Equip Secondary", inputKey(Key.Two)),
    [GameInput.EquipMelee]: def("Equip Melee", inputKey(Key.Three)),
    [GameInput.EquipThrowable]: def("Equip Throwable", inputKey(Key.Four)),
    [GameInput.EquipNextWeap]: def("Equip Next Weapon", mouseWheel(MouseWheel.Down)),
    [GameInput.EquipPrevWeap]: def("Equip Previous Weapon", mouseWheel(MouseWheel.Up)),
    [GameInput.EquipLastWeap]: def("Equip Last Weapon", inputKey(Key.Q)),
    [GameInput.StowWeapons]: def("Stow Weapons", inputKey(Key.E)),
    [GameInput.EquipPrevScope]: def("Equip Previous Scope", null),
    [GameInput.EquipNextScope]: def("Equip Next Scope", null),
    [GameInput.UseBandage]: def("Use Bandage", inputKey(Key.Seven)),
    [GameInput.UseHealthKit]: def("Use Med Kit", inputKey(Key.Eight)),
    [GameInput.UseSoda]: def("Use Soda", inputKey(Key.Nine)),
    [GameInput.UsePainkiller]: def("Use Pills", inputKey(Key.Zero)),
    [GameInput.SwapWeapSlots]: def("Switch Gun Slots", inputKey(Key.T)),
    [GameInput.ToggleMap]: def("Toggle Map", inputKey(Key.M)),
    [GameInput.CycleUIMode]: def("Toggle Minimap", inputKey(Key.V)),
    [GameInput.EmoteMenu]: def("Emote Menu", mouseButton(MouseButton.Right)),
    [GameInput.TeamPingMenu]: def("Team Ping Hold", inputKey(Key.C)),
    [GameInput.EquipOtherGun]: def("Equip Other Gun", null),
    [GameInput.Fullscreen]: def("Full Screen", inputKey(Key.L)),
    [GameInput.HideUI]: def("Hide UI", null),
    [GameInput.TeamPingSingle]: def("Team Ping Menu", null),
};

// Bump when the default controller layout changes
const GamepadBindsVersion = 2;

// Default controller layout
const GamepadBindDefs: Partial<Record<GameInput, GamepadButton>> = {
    [GameInput.Fire]: GamepadButton.RightTrigger,
    [GameInput.Interact]: GamepadButton.A,
    [GameInput.Cancel]: GamepadButton.B,
    [GameInput.Reload]: GamepadButton.X,
    [GameInput.SwapWeapSlots]: GamepadButton.Y,
    [GameInput.EquipPrevWeap]: GamepadButton.LeftBumper,
    [GameInput.EquipNextWeap]: GamepadButton.RightBumper,
    [GameInput.UseBandage]: GamepadButton.DpadUp,
    [GameInput.UseHealthKit]: GamepadButton.DpadRight,
    [GameInput.UseSoda]: GamepadButton.DpadDown,
    [GameInput.UsePainkiller]: GamepadButton.DpadLeft,
    [GameInput.ToggleMap]: GamepadButton.Back,
    [GameInput.EmoteMenu]: GamepadButton.QuickAccess,
    [GameInput.EquipPrimary]: GamepadButton.LeftPaddle1,
    [GameInput.EquipSecondary]: GamepadButton.RightPaddle1,
    [GameInput.EquipMelee]: GamepadButton.LeftPaddle2,
    [GameInput.EquipThrowable]: GamepadButton.RightPaddle2,
};

export class InputBinds {
    binds: Array<InputValue | null> = [];
    gamepadBinds: Array<number | null> = [];
    boundKeys: Record<number, boolean | null> = {};
    menuHovered = false;

    constructor(
        public input: InputHandler,
        public config: ConfigManager,
    ) {
        this.loadBinds();
        this.loadGamepadBinds();
    }

    toArray() {
        const buf = new ArrayBuffer(this.binds.length * 2 + 1);
        const stream = new BitStream(buf);
        stream.writeUint8(1);
        for (let i = 0; i < this.binds.length; i++) {
            const bind = this.binds[i];
            const type = bind ? bind.type : 0;
            const code = bind ? bind.code : 0;
            stream.writeBits(type & 3, 2);
            stream.writeUint8(code & 255);
        }
        // Append crc
        const data = new Uint8Array(buf, 0, stream.byteIndex);
        const checksum = crc16(data);
        const ret = new Uint8Array(data.length + 2);
        ret.set(data);
        ret[ret.length - 2] = (checksum >> 8) & 255;
        ret[ret.length - 1] = checksum & 255;
        return ret;
    }

    fromArray(buf: Uint8Array) {
        let data = new Uint8Array(buf);
        if (!data || data.length < 3) {
            return false;
        }
        // Check crc
        const dataCrc = (data[data.length - 2] << 8) | data[data.length - 1];
        data = data.slice(0, data.length - 2);
        if (crc16(data) != dataCrc) {
            return false;
        }
        const arrayBuf = new ArrayBuffer(data.length);
        const view = new Uint8Array(arrayBuf);
        for (let i = 0; i < data.length; i++) {
            view[i] = data[i];
        }
        const stream = new BitStream(arrayBuf);
        const version = stream.readUint8();
        this.clearAllBinds();
        for (let idx = 0; stream.length - stream.index >= 10;) {
            const bind = idx++;
            const type = stream.readBits(2);
            const code = stream.readUint8();
            if (bind >= 0 && bind < GameInput.Count && type != InputType.None) {
                this.setBind(bind, type != 0 ? new InputValue(type, code) : null);
            }
        }
        if (version < 1) {
            this.upgradeBinds(version);
            this.saveBinds();
        }
        return true;
    }

    toBase64() {
        return base64.fromByteArray(this.toArray());
    }

    fromBase64(str: string) {
        let loaded = false;
        try {
            loaded = this.fromArray(base64.toByteArray(str));
        } catch (err) {
            console.error("Error", err);
        }
        return loaded;
    }

    saveBinds() {
        this.config.set("binds", this.toBase64());
        this.saveGamepadBinds();
    }

    loadBinds() {
        if (!this.fromBase64(this.config.get("binds") || "")) {
            this.loadDefaultBinds();
            this.saveBinds();
        }
    }

    saveGamepadBinds() {
        this.config.set("gamepadBinds", this.gamepadBinds.slice());
        this.config.set("gamepadBindsVersion", GamepadBindsVersion);
    }

    loadGamepadBinds() {
        const stored = this.config.get("gamepadBinds");
        const version = this.config.get("gamepadBindsVersion") ?? 0;
        this.clearAllGamepadBinds();
        if (stored?.length && version >= GamepadBindsVersion) {
            for (let i = 0; i < Math.min(stored.length, GameInput.Count); i++) {
                const code = stored[i];
                this.gamepadBinds[i] =
                    typeof code == "number" && code > GamepadButton.None && code < GamepadButton.Count
                        ? code
                        : null;
            }
        } else {
            this.loadDefaultGamepadBinds();
            this.saveGamepadBinds();
        }
    }

    clearAllGamepadBinds() {
        for (let i = 0; i < GameInput.Count; i++) {
            this.gamepadBinds[i] = null;
        }
    }

    loadDefaultGamepadBinds() {
        this.clearAllGamepadBinds();
        for (const key in GamepadBindDefs) {
            const bind = Number(key);
            this.gamepadBinds[bind] = GamepadBindDefs[bind as GameInput]!;
        }
    }

    setGamepadBind(bind: number, button: number | null) {
        if (button != null) {
            for (let i = 0; i < this.gamepadBinds.length; i++) {
                if (this.gamepadBinds[i] == button) {
                    this.gamepadBinds[i] = null;
                }
            }
        }
        this.gamepadBinds[bind] = button;
    }

    getGamepadBind(bind: number) {
        return this.gamepadBinds[bind] ?? null;
    }

    upgradeBinds(_version: number) {
        const newBinds: GameInput[] = [];

        // Set default inputs for the new binds, as long as those
        // defaults haven't already been used.

        for (let i = 0; i < newBinds.length; i++) {
            const bind = newBinds[i];
            const input = BindDefs[bind as keyof typeof BindDefs].defaultValue;
            const alreadyBound = false;
            for (let j = 0; j < this.binds.length; j++) {
                if (this.binds[j]?.equals(input!)) {
                    break;
                }
            }
            if (!alreadyBound) {
                this.setBind(bind, input);
            }
        }
    }

    clearAllBinds() {
        for (let i = 0; i < GameInput.Count; i++) {
            this.binds[i] = null;
        }
        this.boundKeys = {};
    }

    setBind(bind: number, inputValue: InputValue | null) {
        if (inputValue?.type == InputType.GamepadButton) {
            this.setGamepadBind(bind, inputValue.code);
            return;
        }
        if (!inputValue) {
            this.gamepadBinds[bind] = null;
        }
        if (inputValue) {
            for (let i = 0; i < this.binds.length; i++) {
                if (this.binds[i]?.equals(inputValue)) {
                    this.binds[i] = null;
                }
            }
        }
        const curBind = this.binds[bind];

        if (curBind && curBind.type == InputType.Key) {
            this.boundKeys[curBind.code] = null;
        }
        this.binds[bind] = inputValue;
        if (inputValue && inputValue.type == InputType.Key) {
            this.boundKeys[inputValue.code] = true;
        }
    }

    getBind(bind: number) {
        return this.binds[bind];
    }

    preventMenuBind(b: InputValue | null) {
        return b && this.menuHovered && (b.type == 2 || b.type == 3);
    }

    isKeyBound(key: Key) {
        return this.boundKeys[key];
    }

    isBindPressed(bind: Input) {
        const b = this.binds[bind];
        if (!this.preventMenuBind(b) && b && this.input.isInputValuePressed(b)) {
            return true;
        }
        if (menuNavigator.suppressing) {
            return false;
        }
        const gb = this.gamepadBinds[bind];
        return gb != null && controllerManager.buttonPressed(gb);
    }

    isBindReleased(bind: Input) {
        const b = this.binds[bind];
        if (!this.preventMenuBind(b) && b && this.input.isInputValueReleased(b)) {
            return true;
        }
        if (menuNavigator.suppressing) {
            return false;
        }
        const gb = this.gamepadBinds[bind];
        return gb != null && controllerManager.buttonReleased(gb);
    }

    isBindDown(bind: Input) {
        const b = this.binds[bind];
        if (!this.preventMenuBind(b) && b && this.input.isInputValueDown(b)) {
            return true;
        }
        if (menuNavigator.suppressing) {
            return false;
        }
        const gb = this.gamepadBinds[bind];
        return gb != null && controllerManager.buttonDown(gb);
    }

    loadDefaultBinds() {
        this.clearAllBinds();
        const defKeys = Object.keys(BindDefs);
        for (let i = 0; i < defKeys.length; i++) {
            const key = defKeys[i];
            const def = BindDefs[key as unknown as keyof typeof BindDefs];
            this.setBind(parseInt(key), def.defaultValue);
        }
        this.loadDefaultGamepadBinds();
    }
}

export class InputBindUi {
    constructor(
        public input: InputHandler,
        public inputBinds: InputBinds,
        private localization: Localization,
    ) {
        $(".js-btn-keybind-restore").on("click", () => {
            this.inputBinds.loadDefaultBinds();
            this.inputBinds.saveBinds();
            this.refresh();
        });
    }

    cancelBind() {
        this.input.captureNextInput(null);
    }

    refresh() {
        const defKeys = Object.keys(BindDefs);
        const binds = this.inputBinds.binds;
        const container = $(".js-keybind-list");
        container.empty();
        const showGamepadColumn = controllerManager.connected || controllerManager.steamGranted;
        if (showGamepadColumn) {
            const headerCss = {
                width: "25%",
                "line-height": "24px",
                "font-size": "12px",
                opacity: 0.6,
                "text-indent": 0,
            };
            container.append(
                $("<div/>", { class: "ui-keybind-container" })
                    .append($("<div/>", { css: { width: "50%" } }))
                    .append(
                        $("<div/>", {
                            class: "btn-keybind-display",
                            text: "Keyboard",
                            css: headerCss,
                        }),
                    )
                    .append(
                        $("<div/>", {
                            class: "btn-keybind-display",
                            text: "Controller",
                            css: headerCss,
                        }),
                    ),
            );
        }
        for (let i = 0; i < defKeys.length; i++) {
            const key = defKeys[i];
            const bindDef = BindDefs[key as unknown as keyof typeof BindDefs];
            const bind = binds[key as unknown as number];
            const nameKey = "bind-"
                + bindDef.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, "");
            const btn = $("<a/>", {
                class: "btn-game-menu btn-darken btn-keybind-desc",
                text: this.localization.translate(nameKey) || bindDef.name,
            });
            const kbName = bind
                ? this.localization.translate(bind.toString()) || bind.toString()
                : "";
            const gamepadBind = this.inputBinds.getGamepadBind(
                key as unknown as number,
            );
            const gamepadCell = () => {
                const cell = $("<div/>", {
                    class: "btn-keybind-display",
                    css: { width: "25%", "text-indent": 0 },
                });
                if (gamepadBind != null) {
                    const buttonName = GamepadButtonNames[gamepadBind]
                        || `Gamepad ${gamepadBind}`;
                    const glyph = getGamepadButtonGlyph(gamepadBind);
                    if (glyph) {
                        cell.append(
                            $("<span/>", {
                                html: glyph,
                                title: buttonName,
                            }),
                        );
                    } else {
                        cell.text(buttonName);
                    }
                }
                return cell;
            };
            btn.on("click", (event) => {
                const targetElem = $(event.target);
                targetElem.addClass("btn-keybind-desc-selected");
                this.input.captureNextInput((event, inputValue) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const disallowKeys: number[] = [
                        Key.Control,
                        Key.Alt,
                        Key.Windows,
                        Key.ContextMenu,
                        Key.F1,
                        Key.F2,
                        Key.F3,
                        Key.F4,
                        Key.F5,
                        Key.F6,
                        Key.F7,
                        Key.F8,
                        Key.F9,
                        Key.F10,
                        Key.F11,
                        Key.F12,
                    ];
                    if (
                        inputValue.type == InputType.Key
                        && disallowKeys.includes(inputValue.code)
                    ) {
                        return false;
                    }
                    targetElem.removeClass("btn-keybind-desc-selected");
                    if (!inputValue.equals(inputKey(Key.Escape))) {
                        let bindValue: InputValue | null = inputValue;
                        if (inputValue.equals(inputKey(Key.Backspace))) {
                            bindValue = null;
                        }
                        this.inputBinds.setBind(parseInt(key), bindValue);
                        this.inputBinds.saveBinds();
                        this.refresh();
                    }
                    return true;
                });
            });
            const row = $("<div/>", {
                class: "ui-keybind-container",
            }).append(btn);
            if (showGamepadColumn) {
                btn.css("width", "50%");
                row.append(
                    $("<div/>", {
                        class: "btn-keybind-display",
                        text: kbName,
                        css: { width: "25%", "text-indent": 0 },
                    }),
                );
                row.append(gamepadCell());
            } else {
                row.append(
                    $("<div/>", {
                        class: "btn-keybind-display",
                        text: kbName,
                    }),
                );
            }
            container.append(row);
        }
        $("#keybind-link").html(this.inputBinds.toBase64());
    }
}
