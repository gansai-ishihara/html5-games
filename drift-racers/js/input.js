// Input handling module for drift racing game

var input = {up: false, down: false, left: false, right: false, drift: false, item: false, skill: false};
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

// Setup mobile touch controls
function setupMobile() {
    var buttons = document.querySelectorAll('.ctrl-btn');

    buttons.forEach(function(btn) {
        var key = btn.getAttribute('data-key');

        btn.addEventListener('touchstart', function(e) {
            e.preventDefault();
            AUDIO.init();
            btn.classList.add('pressed');

            if (key === 'up' || key === 'accel') {
                input.up = true;
            } else if (key === 'down' || key === 'brake') {
                input.down = true;
            } else if (key === 'left') {
                input.left = true;
            } else if (key === 'right') {
                input.right = true;
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

            if (key === 'up' || key === 'accel') {
                input.up = false;
            } else if (key === 'down' || key === 'brake') {
                input.down = false;
            } else if (key === 'left') {
                input.left = false;
            } else if (key === 'right') {
                input.right = false;
            } else if (key === 'drift') {
                input.drift = false;
            }
        }, {passive: false});

        btn.addEventListener('touchcancel', function(e) {
            e.preventDefault();
            btn.classList.remove('pressed');

            if (key === 'up' || key === 'accel') {
                input.up = false;
            } else if (key === 'down' || key === 'brake') {
                input.down = false;
            } else if (key === 'left') {
                input.left = false;
            } else if (key === 'right') {
                input.right = false;
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
