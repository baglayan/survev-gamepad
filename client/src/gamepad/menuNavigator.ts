import { controllerManager } from "./controllerManager.ts";
import { GamepadButton } from "./gamepadButtons.ts";
import { rumbleUiClick, rumbleUiTick } from "./rumble.ts";

type NavDir = "up" | "down" | "left" | "right";

const FOCUS_CLASS = "gamepad-focus";
const NAV_REPEAT_DELAY_MS = 350;
const NAV_REPEAT_INTERVAL_MS = 140;
const STICK_NAV_THRESHOLD = 0.55;

const CANDIDATE_SELECTOR = "a, button, select, input, .btn-darken, .menu-option";

// DOM-based spatial navigation for menus: d-pad / left stick moves focus,
// A activates, B goes back. Active whenever a menu context is visible (a
// modal, the in-game menu, the game-over screen, spectate buttons, or the
// main menu); while active, controller game binds are suppressed.
class MenuNavigator {
    // True while a menu context is captured; game code should ignore
    // controller input during this.
    suppressing = false;

    private focused: HTMLElement | null = null;
    private lastRoot: HTMLElement | null = null;
    private heldDir: NavDir | null = null;
    private nextNavTime = 0;
    private styleInjected = false;

    private injectStyle() {
        if (this.styleInjected) {
            return;
        }
        this.styleInjected = true;
        const style = document.createElement("style");
        style.textContent = `
            .${FOCUS_CLASS} {
                outline: 3px solid #f8cf4c !important;
                outline-offset: 1px;
                border-radius: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    private isVisible(el: HTMLElement) {
        const style = getComputedStyle(el);
        if (style.display == "none" || style.visibility == "hidden" || style.pointerEvents == "none") {
            return false;
        }
        if (Number(style.opacity) === 0) {
            return false;
        }
        // Some elements are visually thin (range slider tracks are ~3px)
        const rect = el.getBoundingClientRect();
        return (
            rect.width > 3
            && rect.height > 2
            && rect.bottom > 0
            && rect.top < window.innerHeight
            && rect.right > 0
            && rect.left < window.innerWidth
        );
    }

    // Container roots are often zero-sized wrappers for absolutely
    // positioned children (e.g. #ui-stats) and may be click-through
    // themselves, so rect-size and pointer-events checks don't apply.
    // Computed `display` does NOT inherit "none" from hidden ancestors
    // (e.g. #ui-spectate-buttons under a hidden wrapper), but such
    // elements generate no layout boxes, which getClientRects reveals.
    private isRootVisible(el: HTMLElement) {
        const style = getComputedStyle(el);
        if (
            style.display == "none"
            || style.visibility == "hidden"
            || Number(style.opacity) === 0
        ) {
            return false;
        }
        return el.getClientRects().length > 0;
    }

    private getContextRoot(): HTMLElement | null {
        // Topmost visible modal wins (settings, keybinds, loadout, ...)
        const modals = document.querySelectorAll<HTMLElement>(".modal");
        let visibleModal: HTMLElement | null = null;
        for (let i = 0; i < modals.length; i++) {
            if (this.isRootVisible(modals[i])) {
                visibleModal = modals[i];
            }
        }
        if (visibleModal) {
            return visibleModal;
        }

        const gameMenu = document.getElementById("ui-game-menu");
        if (gameMenu && this.isRootVisible(gameMenu)) {
            return gameMenu;
        }

        // Game-over / match stats screen
        const stats = document.getElementById("ui-stats");
        if (stats && this.isRootVisible(stats)) {
            return stats;
        }

        const spectate = document.getElementById("ui-spectate-buttons");
        if (spectate && this.isRootVisible(spectate)) {
            return spectate;
        }

        // Main menu (and team/loadout screens): whenever the game canvas
        // area is hidden, navigate the whole page.
        const gameArea = document.getElementById("game-area-wrapper");
        if (gameArea && !this.isRootVisible(gameArea)) {
            return document.body;
        }
        return null;
    }

    // Default element to focus when a context is first acquired. On the
    // main menu that's the featured mode (event modes like 50v50/Potato get
    // custom styling) or Play Solo.
    private preferredFocus(root: HTMLElement, candidates: HTMLElement[]) {
        if (root == document.body) {
            let eventBtn: HTMLElement | null = null;
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                if (
                    /^btn-start-mode-\d+$/.test(el.id)
                    && (el.classList.contains("btn-custom-mode-main")
                        || el.classList.contains("btn-custom-mode-no-indent"))
                ) {
                    eventBtn = el;
                }
            }
            if (eventBtn) {
                return eventBtn;
            }
            const playSolo = candidates.find((el) => el.id == "btn-start-mode-0");
            if (playSolo) {
                return playSolo;
            }
        }
        return candidates[0];
    }

    private collectCandidates(root: HTMLElement): HTMLElement[] {
        const raw = Array.from(
            root.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR),
        ).filter((el) => {
            if (el.tagName == "INPUT") {
                const type = (el as HTMLInputElement).type;
                if (type == "hidden") {
                    return false;
                }
            }
            if ((el as HTMLButtonElement).disabled) {
                return false;
            }
            return this.isVisible(el);
        });
        // Prefer innermost interactive elements: drop candidates that
        // contain other candidates.
        return raw.filter((el) => !raw.some((other) => other !== el && el.contains(other)));
    }

    private setFocus(el: HTMLElement | null) {
        if (this.focused == el) {
            return;
        }
        this.focused?.classList.remove(FOCUS_CLASS);
        this.focused = el;
        if (el) {
            el.classList.add(FOCUS_CLASS);
            el.scrollIntoView({ block: "nearest" });
        }
    }

    private readNavDir(): NavDir | null {
        if (controllerManager.buttonDown(GamepadButton.DpadUp)) return "up";
        if (controllerManager.buttonDown(GamepadButton.DpadDown)) return "down";
        if (controllerManager.buttonDown(GamepadButton.DpadLeft)) return "left";
        if (controllerManager.buttonDown(GamepadButton.DpadRight)) return "right";
        const stick = controllerManager.leftStick;
        if (Math.abs(stick.x) > Math.abs(stick.y)) {
            if (stick.x > STICK_NAV_THRESHOLD) return "right";
            if (stick.x < -STICK_NAV_THRESHOLD) return "left";
        } else {
            // Stick +y is up
            if (stick.y > STICK_NAV_THRESHOLD) return "up";
            if (stick.y < -STICK_NAV_THRESHOLD) return "down";
        }
        return null;
    }

    private moveFocus(candidates: HTMLElement[], dir: NavDir) {
        if (!this.focused) {
            this.setFocus(candidates[0]);
            return;
        }
        const from = this.focused.getBoundingClientRect();
        const fx = from.left + from.width / 2;
        const fy = from.top + from.height / 2;
        // Overlap length of two 1D spans; <= 0 means no overlap.
        const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
            Math.min(aMax, bMax) - Math.max(aMin, bMin);

        // Two passes: the first restricts candidates to a directional cone
        // so that e.g. moving "down" never lands on an element that's
        // essentially sideways (a few px lower but far off-axis); if the
        // cone is empty (sparse corners of the layout), fall back to the
        // unrestricted scoring so a distant cross-region hop (middle menu
        // -> corner buttons) still works instead of dead-ending.
        const pickBest = (requireCone: boolean) => {
            let best: HTMLElement | null = null;
            let bestScore = Infinity;
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                if (el == this.focused) {
                    continue;
                }
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = cx - fx;
                const dy = cy - fy;
                let main = 0;
                let ortho = 0;
                let aligned = false;
                switch (dir) {
                    case "up":
                    case "down":
                        main = dir == "down" ? dy : -dy;
                        ortho = Math.abs(dx);
                        aligned = overlap(from.left, from.right, rect.left, rect.right) > 0;
                        break;
                    case "left":
                    case "right":
                        main = dir == "right" ? dx : -dx;
                        ortho = Math.abs(dy);
                        aligned = overlap(from.top, from.bottom, rect.top, rect.bottom) > 0;
                        break;
                }
                if (main < 2) {
                    continue;
                }
                if (requireCone && !aligned && main < ortho * 0.35) {
                    continue;
                }
                // Elements whose rect overlaps ours perpendicular to the
                // move direction are natural neighbors: only distance
                // matters. Others pay a steep penalty for the sideways
                // offset.
                const score = main + (aligned ? 0 : ortho * 3);
                if (score < bestScore) {
                    bestScore = score;
                    best = el;
                }
            }
            return best;
        };

        const best = pickBest(true) || pickBest(false);
        if (best) {
            this.setFocus(best);
            rumbleUiTick();
        }
    }

    private cycleSelect(sel: HTMLSelectElement, dir: number) {
        const count = sel.options.length;
        if (!count) {
            return;
        }
        sel.selectedIndex = (sel.selectedIndex + dir + count) % count;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private adjustRange(input: HTMLInputElement, dir: number) {
        const min = Number(input.min) || 0;
        const max = Number(input.max) || 100;
        const step = (max - min) / 20;
        const value = Math.min(
            Math.max(Number(input.value) + dir * step, min),
            max,
        );
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Returns true when the horizontal press was consumed by the focused
    // element (select cycling / slider adjustment) instead of navigation.
    private handleHorizontalAdjust(dir: NavDir): boolean {
        const el = this.focused;
        if (!el || (dir != "left" && dir != "right")) {
            return false;
        }
        const step = dir == "right" ? 1 : -1;
        if (el.tagName == "SELECT") {
            this.cycleSelect(el as HTMLSelectElement, step);
            rumbleUiTick();
            return true;
        }
        if (el.tagName == "INPUT" && (el as HTMLInputElement).type == "range") {
            this.adjustRange(el as HTMLInputElement, step);
            rumbleUiTick();
            return true;
        }
        return false;
    }

    private activate(el: HTMLElement) {
        if (el.tagName == "SELECT") {
            this.cycleSelect(el as HTMLSelectElement, 1);
            return;
        }
        if (el.tagName == "INPUT") {
            const type = (el as HTMLInputElement).type;
            if (type == "checkbox") {
                el.click();
                return;
            }
            if (type == "range") {
                return;
            }
            el.focus();
            return;
        }
        el.click();
    }

    private goBack(root: HTMLElement) {
        // Modals: click their close button
        const close = root.querySelector<HTMLElement>(".close");
        if (close && this.isVisible(close)) {
            close.click();
            return;
        }
        if (root.id == "ui-game-menu") {
            document.getElementById("btn-game-resume")?.click();
        }
    }

    // Call once per frame after controllerManager.update(). skipInput is
    // used while keybind capture is pending so presses bind instead of
    // navigating.
    update(skipInput: boolean) {
        const root = controllerManager.connected && !controllerManager.released
            ? this.getContextRoot()
            : null;
        if (root != this.lastRoot) {
            this.lastRoot = root;
            this.setFocus(null);
        }
        if (!root) {
            this.suppressing = false;
            this.heldDir = null;
            return;
        }
        this.suppressing = true;
        this.injectStyle();

        if (skipInput) {
            this.heldDir = null;
            return;
        }

        const candidates = this.collectCandidates(root);
        if (!candidates.length) {
            this.setFocus(null);
            return;
        }
        if (!this.focused || !candidates.includes(this.focused)) {
            this.setFocus(this.preferredFocus(root, candidates));
        }

        // Directional navigation with key repeat
        const dir = this.readNavDir();
        const now = performance.now();
        if (dir) {
            if (dir != this.heldDir) {
                this.heldDir = dir;
                this.nextNavTime = now + NAV_REPEAT_DELAY_MS;
                this.navigate(candidates, dir);
            } else if (now >= this.nextNavTime) {
                this.nextNavTime = now + NAV_REPEAT_INTERVAL_MS;
                this.navigate(candidates, dir);
            }
        } else {
            this.heldDir = null;
        }

        // Bumpers/triggers switch tabs in tabbed menus (in-game menu,
        // customization)
        this.handleTabSwitch(root);

        if (controllerManager.buttonPressed(GamepadButton.A) && this.focused) {
            this.activate(this.focused);
            rumbleUiClick();
        }
        if (controllerManager.buttonPressed(GamepadButton.B)) {
            const active = document.activeElement as HTMLElement | null;
            if (active && active.tagName == "INPUT" && active != document.body) {
                active.blur();
            } else if (root == document.body) {
                // Nothing to close on the main menu: release the controller
                controllerManager.release();
            } else {
                this.goBack(root);
            }
        }
        // The Menu (Start) button on the main menu also releases the
        // controller (in-game it toggles the esc menu instead).
        if (root == document.body && controllerManager.buttonPressed(GamepadButton.Start)) {
            controllerManager.release();
        }
    }

    // LB/RB (or LT/RT) cycle between tabs in menus that have them.
    private handleTabSwitch(root: HTMLElement) {
        const next = controllerManager.buttonPressed(GamepadButton.RightBumper)
            || controllerManager.buttonPressed(GamepadButton.RightTrigger);
        const prev = controllerManager.buttonPressed(GamepadButton.LeftBumper)
            || controllerManager.buttonPressed(GamepadButton.LeftTrigger);
        const dir = (next ? 1 : 0) - (prev ? 1 : 0);
        if (!dir) {
            return;
        }
        let tabs: HTMLElement[] = [];
        let selectedClass = "";
        if (root.id == "ui-game-menu") {
            tabs = Array.from(
                root.querySelectorAll<HTMLElement>(".btn-game-tab-select"),
            );
            selectedClass = "btn-game-menu-selected";
        } else if (root.id == "modal-customize") {
            tabs = Array.from(
                root.querySelectorAll<HTMLElement>(".modal-customize-cat"),
            );
            selectedClass = "modal-customize-cat-selected";
        }
        tabs = tabs.filter((tab) => this.isVisible(tab));
        if (tabs.length < 2) {
            return;
        }
        let idx = tabs.findIndex((tab) => tab.classList.contains(selectedClass));
        if (idx < 0) {
            idx = 0;
        }
        const target = tabs[(idx + dir + tabs.length) % tabs.length];
        // The customization categories listen on mouseup, the in-game tabs
        // on click; dispatch both.
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.click();
        rumbleUiTick();
    }

    private navigate(candidates: HTMLElement[], dir: NavDir) {
        if (!this.handleHorizontalAdjust(dir)) {
            this.moveFocus(candidates, dir);
        }
    }
}

export const menuNavigator = new MenuNavigator();
