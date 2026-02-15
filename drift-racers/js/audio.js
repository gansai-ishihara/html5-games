// ============================================================================
// AUDIO.JS - Audio System for Drift Racers
// Mario Kart-style 3D racing game audio using Web Audio API
// ============================================================================

var AUDIO = {
  actx: null,
  bgmSource: null,
  bgmGain: null,
  bgmBuffer: null,
  bgmVolume: 0.5,
  engineOsc: null,
  engineGain: null,
  engineRunning: false,

  // Initialize AudioContext (call on user gesture)
  init: function() {
    if (!this.actx) {
      this.actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume context if suspended
    if (this.actx.state === 'suspended') {
      this.actx.resume();
    }
  },

  // Load and play background music (looping)
  playBGM: function(url) {
    if (!this.actx) this.init();

    var self = this;

    // Stop current BGM if playing
    this.stopBGM();

    // Fetch and decode audio file
    fetch(url)
      .then(function(response) { return response.arrayBuffer(); })
      .then(function(arrayBuffer) { return self.actx.decodeAudioData(arrayBuffer); })
      .then(function(audioBuffer) {
        self.bgmBuffer = audioBuffer;

        // Create gain node for volume control
        self.bgmGain = self.actx.createGain();
        self.bgmGain.gain.value = self.bgmVolume;
        self.bgmGain.connect(self.actx.destination);

        // Create and start source
        self.bgmSource = self.actx.createBufferSource();
        self.bgmSource.buffer = audioBuffer;
        self.bgmSource.loop = true;
        self.bgmSource.connect(self.bgmGain);
        self.bgmSource.start(0);
      })
      .catch(function(error) {
        console.warn('Failed to load BGM:', error);
      });
  },

  // Stop background music
  stopBGM: function() {
    if (this.bgmSource) {
      this.bgmSource.stop();
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }
  },

  // Set BGM volume (0.0 to 1.0)
  setBGMVolume: function(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain) {
      this.bgmGain.gain.value = this.bgmVolume;
    }
  }
};

// ============================================================================
// SOUND EFFECTS (SND)
// ============================================================================

var SND = {

  // Countdown beep (3, 2, 1...)
  countdown: function() {
    tone(440, 0.3, 'square', 0.15);
  },

  // GO! sound (race start)
  go: function() {
    tone(880, 0.35, 'square', 0.2);
    tone(1100, 0.35, 'square', 0.15, null, 0.02);
  },

  // Item pickup sound
  pickup: function() {
    tone(600, 0.08, 'sine', 0.2);
    tone(900, 0.08, 'sine', 0.2, null, 0.06);
    tone(1200, 0.08, 'sine', 0.25, null, 0.12);
  },

  // Boost activation
  boost: function() {
    tone(200, 0.35, 'sawtooth', 0.25, 500);
  },

  // Hit/explosion sound
  hit: function() {
    noise(0.12, 0.3);
    tone(200, 0.12, 'square', 0.2, 80);
  },

  // Lap complete jingle
  lap: function() {
    tone(660, 0.15, 'square', 0.2);
    tone(880, 0.15, 'square', 0.2, null, 0.13);
    tone(1100, 0.25, 'square', 0.25, null, 0.26);
  },

  // Race finish fanfare
  finish: function() {
    tone(500, 0.12, 'square', 0.2);
    tone(650, 0.12, 'square', 0.2, null, 0.10);
    tone(800, 0.12, 'square', 0.22, null, 0.20);
    tone(900, 0.12, 'square', 0.22, null, 0.30);
    tone(1100, 0.35, 'square', 0.25, null, 0.40);
  },

  // Drift sound (subtle)
  drift: function() {
    tone(80, 0.06, 'sawtooth', 0.08);
  },

  // Continuous engine sound (speed: 0-1)
  engine: function(speed) {
    if (!AUDIO.actx) AUDIO.init();

    // Clamp speed between 0 and 1
    speed = Math.max(0, Math.min(1, speed));

    // Stop engine if speed is very low (effectively stopped)
    if (speed < 0.05) {
      if (AUDIO.engineRunning) {
        AUDIO.engineGain.gain.setTargetAtTime(0, AUDIO.actx.currentTime, 0.1);
        setTimeout(function() {
          if (AUDIO.engineOsc) {
            AUDIO.engineOsc.stop();
            AUDIO.engineOsc.disconnect();
            AUDIO.engineOsc = null;
          }
          if (AUDIO.engineOsc2) {
            AUDIO.engineOsc2.stop();
            AUDIO.engineOsc2.disconnect();
            AUDIO.engineOsc2 = null;
          }
          if (AUDIO.engineGain) {
            AUDIO.engineGain.disconnect();
            AUDIO.engineGain = null;
          }
          AUDIO.engineRunning = false;
        }, 300);
      }
      return;
    }

    // Start engine if not running
    if (!AUDIO.engineRunning) {
      // Two oscillators for richer sound
      AUDIO.engineOsc = AUDIO.actx.createOscillator();
      AUDIO.engineOsc2 = AUDIO.actx.createOscillator();
      AUDIO.engineGain = AUDIO.actx.createGain();

      AUDIO.engineOsc.type = 'triangle';
      AUDIO.engineOsc2.type = 'sawtooth';
      AUDIO.engineOsc.frequency.value = 55;
      AUDIO.engineOsc2.frequency.value = 110;
      AUDIO.engineGain.gain.value = 0;

      var osc2Gain = AUDIO.actx.createGain();
      osc2Gain.gain.value = 0.15; // sawtooth much quieter
      AUDIO.engineOsc.connect(AUDIO.engineGain);
      AUDIO.engineOsc2.connect(osc2Gain);
      osc2Gain.connect(AUDIO.engineGain);
      AUDIO.engineGain.connect(AUDIO.actx.destination);
      AUDIO.engineOsc.start();
      AUDIO.engineOsc2.start();

      AUDIO.engineRunning = true;
    }

    // Modulate frequency and volume based on speed
    var baseFreq = 55;
    var maxFreq = 220;
    var targetFreq = baseFreq + (maxFreq - baseFreq) * speed;
    // Much quieter: starts very low, scales up gently
    var targetVolume = 0.02 + (speed * speed * 0.06);

    var now = AUDIO.actx.currentTime;
    AUDIO.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
    if (AUDIO.engineOsc2) {
      AUDIO.engineOsc2.frequency.setTargetAtTime(targetFreq * 2, now, 0.08);
    }
    AUDIO.engineGain.gain.setTargetAtTime(targetVolume, now, 0.08);
  },

  // Thunder/lightning sound
  thunder: function() {
    noise(0.3, 0.4);
    tone(60, 0.3, 'sawtooth', 0.15, 40, 0.05);
  },

  // Shield activation
  shield: function() {
    tone(800, 0.08, 'sine', 0.15);
    tone(1000, 0.08, 'sine', 0.15, null, 0.06);
    tone(1200, 0.08, 'sine', 0.18, null, 0.12);
    tone(1400, 0.12, 'sine', 0.2, null, 0.18);
  },

  // Ring collect (lighter than item pickup)
  ring: function() {
    tone(1200, 0.06, 'sine', 0.12);
    tone(1600, 0.06, 'sine', 0.15, null, 0.04);
  },

  // Skill ready chime
  skillReady: function() {
    tone(800, 0.1, 'triangle', 0.12);
    tone(1000, 0.1, 'triangle', 0.15, null, 0.08);
    tone(1200, 0.15, 'triangle', 0.18, null, 0.16);
  },

  // Warning buzzer (incoming attack)
  warning: function() {
    tone(300, 0.08, 'square', 0.12);
    tone(250, 0.08, 'square', 0.12, null, 0.1);
    tone(300, 0.08, 'square', 0.12, null, 0.2);
  },

  // Start boost (turbo start)
  startBoost: function() {
    tone(400, 0.4, 'sawtooth', 0.2, 800);
    tone(300, 0.2, 'square', 0.1);
  },

  // Boost pad
  boostPad: function() {
    tone(500, 0.15, 'triangle', 0.15, 900);
  },

  // Star power (invincibility)
  star: function() {
    tone(600, 0.1, 'square', 0.15);
    tone(800, 0.1, 'square', 0.15, null, 0.08);
    tone(1000, 0.1, 'square', 0.15, null, 0.16);
    tone(1200, 0.1, 'square', 0.18, null, 0.24);
    tone(1400, 0.2, 'square', 0.2, null, 0.32);
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Play a tone
// freq: frequency in Hz
// duration: duration in seconds
// type: oscillator type ('sine', 'square', 'sawtooth', 'triangle')
// volume: volume 0.0 to 1.0
// endFreq: optional ending frequency for sweep (null = constant)
// delay: optional delay before playing (default 0)
function tone(freq, duration, type, volume, endFreq, delay) {
  if (!AUDIO.actx) AUDIO.init();

  delay = delay || 0;
  var now = AUDIO.actx.currentTime + delay;

  var osc = AUDIO.actx.createOscillator();
  var gain = AUDIO.actx.createGain();

  osc.type = type || 'sine';
  osc.frequency.value = freq;

  // Frequency sweep if endFreq specified
  if (endFreq) {
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(endFreq, now + duration);
  }

  // Envelope: quick attack, sustain, quick release
  gain.gain.value = 0;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.setValueAtTime(volume, now + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.connect(gain);
  gain.connect(AUDIO.actx.destination);

  osc.start(now);
  osc.stop(now + duration);
}

// Play white noise
// duration: duration in seconds
// volume: volume 0.0 to 1.0
function noise(duration, volume) {
  if (!AUDIO.actx) AUDIO.init();

  var now = AUDIO.actx.currentTime;
  var bufferSize = AUDIO.actx.sampleRate * duration;
  var buffer = AUDIO.actx.createBuffer(1, bufferSize, AUDIO.actx.sampleRate);
  var data = buffer.getChannelData(0);

  // Generate white noise
  for (var i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }

  var source = AUDIO.actx.createBufferSource();
  var gain = AUDIO.actx.createGain();

  source.buffer = buffer;

  // Envelope
  gain.gain.value = 0;
  gain.gain.setValueAtTime(1, now);
  gain.gain.linearRampToValueAtTime(0.6, now + duration * 0.3);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  source.connect(gain);
  gain.connect(AUDIO.actx.destination);

  source.start(now);
}
