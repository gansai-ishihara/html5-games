// Input handling module for drift racing game

var input = {up: false, down: false, left: false, right: false, drift: false, item: false, skill: false, stickX: 0, stickY: 0};
var keys = {};

// Keyboard event listeners
document.addEventListener('keydown', function(e) {
    keys[e.code] = true;

    // Prevent default for specific keys
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
    }

    updateInput();
});

document.addEventListener('keyup', function(e) {
    keys[e.code] = false;
    updateInput();
});

// Map keys to input object
function updateInput() {
    input.up = keys.ArrowUp || keys.KeyW;
    input.down = keys.ArrowDown || keys.KeyS;
    input.left = keys.ArrowLeft || keys.KeyA;
    input.right = keys.ArrowRight || keys.KeyD;
    input.drift = keys.ShiftLeft || keys.ShiftRight;

    // One-shot item use
    if (keys.Space) {
        input.item = true;
        keys.Space = false;
    }

    // One-shot skill activation
    if (keys.KeyQ) {
        input.skill = true;
        keys.KeyQ = false;
    }
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

    base.addEventListener('touchstart', function(e) {
        e.preventDefault();
        AUDIO.init();
        var touch = e.changedTouches[0];
        joyTouchId = touch.identifier;
        joyActive = true;
        var rect = base.getBoundingClientRect();
        joyCenterX = rect.left + rect.width / 2;
        joyCenterY = rect.top + rect.height / 2;
        updateJoystick(touch.clientX, touch.clientY, thumb);
    }, {passive: false});

    document.addEventListener('touchmove', function(e) {
        if (!joyActive) return;
        for (var i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joyTouchId) {
                e.preventDefault();
                updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY, thumb);
                break;
            }
        }
    }, {passive: false});

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
    document.addEventListener('touchend', onJoyEnd, {passive: false});
    document.addEventListener('touchcancel', onJoyEnd, {passive: false});
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

    buttons.forEach(function(btn) {
        var key = btn.getAttribute('data-key');

        btn.addEventListener('touchstart', function(e) {
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
                setTimeout(function() {
                    input.item = false;
                }, 100);
            } else if (key === 'skill') {
                input.skill = true;
                setTimeout(function() {
                    input.skill = false;
                }, 100);
            }
        }, {passive: false});

        btn.addEventListener('touchend', function(e) {
            e.preventDefault();
            btn.classList.remove('pressed');

            if (key === 'accel') {
                input.up = joyActive ? input.stickY < -0.2 : false;
            } else if (key === 'brake') {
                input.down = joyActive ? input.stickY > 0.2 : false;
            } else if (key === 'drift') {
                input.drift = false;
            }
        }, {passive: false});

        btn.addEventListener('touchcancel', function(e) {
            e.preventDefault();
            btn.classList.remove('pressed');

            if (key === 'accel') {
                input.up = joyActive ? input.stickY < -0.2 : false;
            } else if (key === 'brake') {
                input.down = joyActive ? input.stickY > 0.2 : false;
            } else if (key === 'drift') {
                input.drift = false;
            }
        }, {passive: false});
    });
}

// Detect mobile device
function checkMobile() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
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
    fsBtn.onclick = function() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            var el = document.documentElement;
            if (el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    };

    // Update button icon on fullscreen change
    function updateFsIcon() {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        fsBtn.textContent = isFs ? '\u2716' : '\u26F6';
        fsBtn.title = isFs ? '\u5168\u753B\u9762\u89E3\u9664' : '\u5168\u753B\u9762\u5207\u66FF';
    }
    document.addEventListener('fullscreenchange', updateFsIcon);
    document.addEventListener('webkitfullscreenchange', updateFsIcon);
}
