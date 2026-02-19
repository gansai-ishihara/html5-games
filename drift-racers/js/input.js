// Input handling module for drift racing game

var input = { up: false, down: false, left: false, right: false, drift: false, item: false, skill: false, stickX: 0, stickY: 0 };
var keys = {};
var gamepadIndex = null;

// Gamepad connection events
window.addEventListener("gamepadconnected", function (e) {
    gamepadIndex = e.gamepad.index;
    console.log("Gamepad connected: " + e.gamepad.id);
});

window.addEventListener("gamepaddisconnected", function (e) {
    if (gamepadIndex === e.gamepad.index) {
        gamepadIndex = null;
        console.log("Gamepad disconnected");
    }
});

// Keyboard event listeners
document.addEventListener('keydown', function (e) {
    keys[e.code] = true;

    // Prevent default for specific keys
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
    }

    updateInput();
});

document.addEventListener('keyup', function (e) {
    keys[e.code] = false;
    updateInput();
});

// Reset all input when window loses focus (prevents stuck keys on Alt+Tab)
window.addEventListener('blur', function () {
    keys = {};
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    input.drift = false;
    input.item = false;
    input.skill = false;
    input.stickX = 0;
    input.stickY = 0;
});

// Map keys and gamepad to input object
function updateInput() {
    // Reset basic input (keep stick values if virtual joystick is active)
    var keyUp = keys.ArrowUp || keys.KeyW;
    var keyDown = keys.ArrowDown || keys.KeyS;
    var keyLeft = keys.ArrowLeft || keys.KeyA;
    var keyRight = keys.ArrowRight || keys.KeyD;
    var keyDrift = keys.ShiftLeft || keys.ShiftRight;
    var keyItem = false;
    var keySkill = false;

    // Gamepad Input
    var gpUp = false, gpDown = false, gpLeft = false, gpRight = false;
    var gpDrift = false, gpItem = false, gpSkill = false;
    var gpStickX = 0;

    if (gamepadIndex !== null) {
        var gp = navigator.getGamepads()[gamepadIndex];
        if (gp) {
            // Axes (Left Stick)
            if (Math.abs(gp.axes[0]) > 0.1) {
                gpStickX = gp.axes[0];
            }

            // Buttons (Standard mapping)
            // 0: A (Cross), 1: B (Circle), 2: X (Square), 3: Y (Triangle)
            // 4: LB, 5: RB, 6: LT, 7: RT
            // 12: D-Pad Up, 13: Down, 14: Left, 15: Right

            // Accel: A (0) or RT (7)
            if (gp.buttons[0].pressed || gp.buttons[7].pressed) gpUp = true;
            // Brake: B (1) or LT (6)
            if (gp.buttons[1].pressed || gp.buttons[6].pressed) gpDown = true;

            // Steering: D-Pad
            if (gp.buttons[14].pressed) gpLeft = true;
            if (gp.buttons[15].pressed) gpRight = true;

            // Drift: LB (4) or RB (5)
            if (gp.buttons[4].pressed || gp.buttons[5].pressed) gpDrift = true;

            // Item: X (2) or LT (6 - alt)
            // Let's stick to X for item to avoid conflict with brake on LT
            if (gp.buttons[2].pressed) gpItem = true;

            // Skill: Y (3)
            if (gp.buttons[3].pressed) gpSkill = true;
        }
    }

    // Merge inputs (Keyboard | Gamepad | Touch)
    // Note: Touch inputs modify `input` directly in event handlers, but we must be careful not to overwrite them if they are active
    // Actually, updateJoystick sets input.stickX/Y.
    // The touch buttons set input.up/down/drift directly.

    // We'll combine standard inputs here. 
    // For touch, we need to ensure we don't clear it if touch is active.
    // However, the current structure of touch handling in this file sets `input.up = true` on touchstart. 
    // If we overwrite `input.up` here based only on keys/gamepad, we kill touch input.
    // Strategy: touch events set flags, updateInput should probably OR them? 
    // But touch events are instantaneous? No, touchstart sets it, touchend clears it.
    // So `input.up` might be true from touch.

    // Let's modify the variable names to be clear they are frame inputs, then OR them with current state if needed?
    // No, `updateInput` is called on keydown/keyup. It re-evaluates keyboard state.
    // It does NOT run every frame loop in main.js? 
    // Wait, main.js passes `input` to `racer.update`. 
    // `input.js` has `updateInput` called on key events, but gamepad connected needs polling!

    // CRITICAL FIX: Gamepad needs polling every frame. Key events are event-driven.
    // We should export a `pollGamepad` function or make `updateInput` callable every frame.
    // But `input` object is global.

    // Currently `updateInput` is only called on key events. 
    // I should create a `pollInput()` function called from `main.js` animate loop.

    // For now, I will modify `updateInput` to strictly handle keyboard state mapping, 
    // AND I will add `pollGamepads()` to be called from main.js.

    input.up = keyUp || gpUp || (input.up && isMobile); // Hacky preservation of touch? 
    // Better: Separate source tracking.
    // But to minimize refactoring risk:
    // Let's make `updateInput` ONLY handle keyboard. 
    // Gamepad updates will be applied in a new function called from main loop.

    input.up = keyUp;
    input.down = keyDown;
    input.left = keyLeft;
    input.right = keyRight;
    input.drift = keyDrift;

    // One-shot
    if (keys.Space) {
        input.item = true;
        keys.Space = false;
    }
    if (keys.KeyQ) {
        input.skill = true;
        keys.KeyQ = false;
    }
}

function pollGamepads() {
    if (gamepadIndex === null) return;

    var gp = navigator.getGamepads()[gamepadIndex];
    if (!gp) return;

    // First, refresh keyboard state so we have clean baseline
    var keyUp = keys.ArrowUp || keys.KeyW || false;
    var keyDown = keys.ArrowDown || keys.KeyS || false;
    var keyLeft = keys.ArrowLeft || keys.KeyA || false;
    var keyRight = keys.ArrowRight || keys.KeyD || false;
    var keyDrift = keys.ShiftLeft || keys.ShiftRight || false;

    // Gamepad state with proper deadzone for analog triggers
    var gpUp = gp.buttons[0].pressed || (gp.buttons[7].value > 0.2);
    var gpDown = gp.buttons[1].pressed || (gp.buttons[6].value > 0.2);
    var gpLeft = gp.buttons[14] && gp.buttons[14].pressed;
    var gpRight = gp.buttons[15] && gp.buttons[15].pressed;
    var gpDrift = (gp.buttons[4] && gp.buttons[4].pressed) || (gp.buttons[5] && gp.buttons[5].pressed);

    // Merge keyboard + gamepad (touch is handled separately via events)
    if (!joyActive) {
        // Only override if virtual joystick is not active
        input.up = keyUp || gpUp;
        input.down = keyDown || gpDown;
        input.left = keyLeft || gpLeft;
        input.right = keyRight || gpRight;
    } else {
        // Joystick active: OR gamepad on top of touch state
        if (gpUp) input.up = true;
        if (gpDown) input.down = true;
        if (gpLeft) input.left = true;
        if (gpRight) input.right = true;
    }
    input.drift = keyDrift || gpDrift || input.drift;

    // Analog Stick with deadzone
    if (Math.abs(gp.axes[0]) > 0.15) {
        input.stickX = gp.axes[0];
        if (input.stickX < -0.3) input.left = true;
        if (input.stickX > 0.3) input.right = true;
    } else if (!joyActive) {
        // Reset stick only if virtual joystick isn't controlling it
        input.stickX = 0;
    }

    if (gp.buttons[2] && gp.buttons[2].pressed) input.item = true;
    if (gp.buttons[3] && gp.buttons[3].pressed) input.skill = true;
}

// Virtual joystick state
var joyActive = false;
var joyTouchId = null;
var joyCenterX = 0;
var joyCenterY = 0;
var joyRadius = 45; // max displacement from center

function setupJoystick() {
    var base = document.getElementById('joy-base');
    var thumb = document.getElementById('joy-thumb');
    if (!base || !thumb) return;

    base.addEventListener('touchstart', function (e) {
        e.preventDefault();
        AUDIO.init();
        var touch = e.changedTouches[0];
        joyTouchId = touch.identifier;
        joyActive = true;
        var rect = base.getBoundingClientRect();
        joyCenterX = rect.left + rect.width / 2;
        joyCenterY = rect.top + rect.height / 2;
        updateJoystick(touch.clientX, touch.clientY, thumb);
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
        if (!joyActive) return;
        for (var i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                e.preventDefault();
                updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY, thumb);
                break;
            }
        }
    }, { passive: false });

    function onJoyEnd(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                joyActive = false;
                joyTouchId = null;
                thumb.style.transform = 'translate(0px, 0px)';
                input.stickX = 0;
                input.stickY = 0;
                input.left = keys.ArrowLeft || keys.KeyA || false;
                input.right = keys.ArrowRight || keys.KeyD || false;
                input.up = keys.ArrowUp || keys.KeyW || false;
                input.down = keys.ArrowDown || keys.KeyS || false;
                break;
            }
        }
    }
    document.addEventListener('touchend', onJoyEnd, { passive: false });
    document.addEventListener('touchcancel', onJoyEnd, { passive: false });
}

function updateJoystick(tx, ty, thumb) {
    var dx = tx - joyCenterX;
    var dy = ty - joyCenterY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to radius
    if (dist > joyRadius) {
        dx = dx / dist * joyRadius;
        dy = dy / dist * joyRadius;
        dist = joyRadius;
    }

    // Move thumb visual
    thumb.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';

    // Normalize to -1..1
    var nx = dx / joyRadius;
    var ny = dy / joyRadius;

    input.stickX = nx;
    input.stickY = ny;

    // Dead zone
    var deadZone = 0.2;
    input.left = nx < -deadZone;
    input.right = nx > deadZone;
    input.up = ny < -deadZone;
    input.down = ny > deadZone;
}

// Setup mobile touch controls
function setupMobile() {
    // Setup joystick
    setupJoystick();

    // Setup action buttons (non-joystick buttons)
    var buttons = document.querySelectorAll('.action-btns .ctrl-btn');

    buttons.forEach(function (btn) {
        var key = btn.getAttribute('data-key');

        btn.addEventListener('touchstart', function (e) {
            e.preventDefault();
            AUDIO.init();
            btn.classList.add('pressed');

            if (key === 'accel') {
                input.up = true;
            } else if (key === 'brake') {
                input.down = true;
            } else if (key === 'drift') {
                input.drift = true;
            } else if (key === 'item') {
                input.item = true;
                setTimeout(function () {
                    input.item = false;
                }, 100);
            } else if (key === 'skill') {
                input.skill = true;
                setTimeout(function () {
                    input.skill = false;
                }, 100);
            }
        }, { passive: false });

        btn.addEventListener('touchend', function (e) {
            e.preventDefault();
            btn.classList.remove('pressed');

            if (key === 'accel') {
                input.up = joyActive ? input.stickY < -0.2 : false;
            } else if (key === 'brake') {
                input.down = joyActive ? input.stickY > 0.2 : false;
            } else if (key === 'drift') {
                input.drift = false;
            }
        }, { passive: false });

        btn.addEventListener('touchcancel', function (e) {
            e.preventDefault();
            btn.classList.remove('pressed');

            if (key === 'accel') {
                input.up = joyActive ? input.stickY < -0.2 : false;
            } else if (key === 'brake') {
                input.down = joyActive ? input.stickY > 0.2 : false;
            } else if (key === 'drift') {
                input.drift = false;
            }
        }, { passive: false });
    });
}

// Detect mobile device (avoid false positives on Windows desktops with touchscreen/pen)
function checkMobile() {
    var hasTouchEvents = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var isDesktopOS = /Windows|Macintosh|Linux(?!.*Android)/.test(navigator.userAgent);
    var isMobileUA = /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent);
    isMobile = isMobileUA || (hasTouchEvents && !isDesktopOS);
    if (isMobile) document.body.classList.add('mobile-active');
}

// Check screen orientation on mobile
function checkOrientation() {
    var rotatePrompt = document.getElementById('rotate-prompt');

    if (isMobile && window.innerHeight > window.innerWidth) {
        // Portrait mode on mobile - show rotation prompt
        if (rotatePrompt) {
            rotatePrompt.style.display = 'flex';
        }
    } else {
        // Landscape or desktop - hide rotation prompt
        if (rotatePrompt) {
            rotatePrompt.style.display = 'none';
        }
    }
}

// === Fullscreen toggle ===
var fsBtn = document.getElementById('fullscreen-btn');
if (fsBtn) {
    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            var el = document.documentElement;
            try {
                if (el.requestFullscreen) {
                    el.requestFullscreen().catch(function () {});
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                } else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
                }
            } catch (e) {}
            // Lock landscape on mobile
            try {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(function () {});
                }
            } catch (e) {}
        } else {
            try {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } catch (e) {}
        }
    }

    fsBtn.onclick = toggleFullscreen;
    // Also handle touch for mobile (touchend fires more reliably)
    fsBtn.addEventListener('touchend', function (e) {
        e.preventDefault();
        toggleFullscreen();
    }, { passive: false });

    // Update button icon on fullscreen change
    function updateFsIcon() {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        fsBtn.textContent = isFs ? '\u2716' : '\u26F6';
        fsBtn.title = isFs ? '\u5168\u753B\u9762\u89E3\u9664' : '\u5168\u753B\u9762\u5207\u66FF';
    }
    document.addEventListener('fullscreenchange', updateFsIcon);
    document.addEventListener('webkitfullscreenchange', updateFsIcon);
}
