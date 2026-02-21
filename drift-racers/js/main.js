// main.js - Main entry point and game loop for Drift Racers
// Mario Kart-style 3D racing game using Babylon.js

// Start a new race
function startRace() {
  // Cleanup preview before starting race
  cleanupPreview3D();

  // Initialize audio
  AUDIO.init();

  // Hide title screen
  document.getElementById('title-screen').style.display = 'none';

  // Generate the race track
  generateTrack();

  // Initialize the 3D scene (also creates particle systems)
  initScene();
  initSpeedLines();

  // Model caches were loaded into the old preview scene which is now disposed.
  // Clear caches and reload into the new race scene.
  kartModelCache = {};
  glbModelCache = {};
  envModelCache = {};
  courseModelRoot = null;
  kartModelsLoaded = false;
  glbModelsLoaded = false;
  envModelsLoaded = false;
  courseModelLoaded = false;

  // Build track mesh (skip if using course GLB which includes road surface)
  if (!USE_COURSE_GLB) buildTrackMesh(scene);

  // Show loading indicator
  var cdEl = document.getElementById('countdown');
  var cdNum = document.getElementById('cd-num');
  cdEl.style.display = 'flex';
  cdNum.textContent = 'LOADING...';
  cdNum.style.color = '#88bbff';
  cdNum.style.animation = 'none';
  cdNum.style.fontSize = '48px';

  // Reload all models into the new scene, then continue
  var charDone = false, kartDone = false, envDone = false, courseDone = false;
  function onAllModelsReady() {
    if (!charDone || !kartDone || !envDone || !courseDone) return;
    cdNum.style.fontSize = '';
    continueRaceSetup();
  }
  preloadModels(function () { charDone = true; onAllModelsReady(); });
  preloadKartModels(function () { kartDone = true; onAllModelsReady(); });
  preloadEnvModels(function () { envDone = true; onAllModelsReady(); });
  loadCourseModel(function () { courseDone = true; onAllModelsReady(); });
}

// Continue race setup after models are loaded into the race scene
function continueRaceSetup() {
  // Build decorations (skip if course GLB includes all decorations)
  if (!USE_COURSE_GLB) buildTrackDecorations(scene);

  // Start ghost recording
  ghostSamples = [];
  ghostRecording = true;

  // Mario Kart-style 2-column starting grid BEHIND the start/finish line
  var gridPositions = [
    { node: 99, lateral: -2.5 },
    { node: 99, lateral: 2.5 },
    { node: 98, lateral: -2.5 },
    { node: 98, lateral: 2.5 },
    { node: 97, lateral: -2.5 },
    { node: 97, lateral: 2.5 },
  ];

  // Player goes in last grid slot (back-right)
  player = new Racer(selectedChar, true, selectedKart, EQUIPMENT[selectedEquip].type);
  var playerSlot = gridPositions[NUM_RACERS - 1];
  player.placeAt(playerSlot.node);
  var playerPerpAng = getTrackAngle(playerSlot.node) + Math.PI / 2;
  player.x += Math.cos(playerPerpAng) * playerSlot.lateral;
  player.z += Math.sin(playerPerpAng) * playerSlot.lateral;
  player.createMesh(scene);
  racers.push(player);

  if (gameMode === 'ghost') {
    // Ghost mode: load top ghosts instead of AI racers
    ghostRacers = [];
    if (typeof getTopGhosts === 'function') {
      getTopGhosts(5, function (ghosts) {
        for (var gi = 0; gi < ghosts.length; gi++) {
          var gr = new GhostRacer(ghosts[gi], scene);
          ghostRacers.push(gr);
        }
      });
    }
  } else {
    // CPU mode: AI racers fill the remaining grid slots
    var usedChars = [selectedChar];
    for (var i = 0; i < NUM_RACERS - 1; i++) {
      var aiCharIdx;
      do {
        aiCharIdx = Math.floor(Math.random() * CHARACTERS.length);
      } while (usedChars.indexOf(aiCharIdx) !== -1 && usedChars.length < CHARACTERS.length);
      usedChars.push(aiCharIdx);

      var aiKart = Math.floor(Math.random() * KARTS.length);
      var aiEquip = EQUIPMENT[Math.floor(Math.random() * EQUIPMENT.length)].type;
      var aiRacer = new Racer(aiCharIdx, false, aiKart, aiEquip);
      var slot = gridPositions[i];
      aiRacer.placeAt(slot.node);
      var perpAng = getTrackAngle(slot.node) + Math.PI / 2;
      aiRacer.x += Math.cos(perpAng) * slot.lateral;
      aiRacer.z += Math.sin(perpAng) * slot.lateral;
      aiRacer.createMesh(scene);
      racers.push(aiRacer);
    }
  }

  // Generate item boxes on track
  generateItemBoxes(scene);

  // Generate energy rings on track
  generateEnergyRings(scene);

  // Generate boost pads on track
  generateBoostPads(scene);

  // Start countdown sequence
  gameState = 'countdown';
  var countdownEl = document.getElementById('countdown');
  var countdownNum = document.getElementById('cd-num');
  countdownEl.style.display = 'flex';

  var count = 3;
  countdownNum.textContent = count;
  countdownNum.style.color = '#ff4444';
  countdownNum.style.animation = 'none';
  setTimeout(function () {
    countdownNum.style.animation = 'cdPop 1s ease-out';
  }, 10);
  SND.countdown();

  var countdownInterval = setInterval(function () {
    count--;

    if (count > 0) {
      countdownNum.textContent = count;
      countdownNum.style.color = '#ff4444';
      countdownNum.style.animation = 'none';
      setTimeout(function () {
        countdownNum.style.animation = 'cdPop 1s ease-out';
      }, 10);
      SND.countdown();
    } else if (count === 0) {
      countdownNum.textContent = 'GO!';
      countdownNum.style.color = '#44ff44';
      countdownNum.style.animation = 'none';
      setTimeout(function () {
        countdownNum.style.animation = 'cdPop 1s ease-out';
      }, 10);
      SND.go();
    } else {
      // Countdown finished
      clearInterval(countdownInterval);
      countdownEl.style.display = 'none';
      gameState = 'racing';
    }
  }, 1000);

  // Show HUD elements
  document.getElementById('hud').style.display = 'block';
  document.getElementById('minimap').style.display = 'block';

  // Show mobile controls if on mobile
  if (isMobile) {
    document.getElementById('mobile-controls').style.display = 'flex';
    document.getElementById('boost-bar').style.display = 'block';
  }

  // Reset race timer and frame counter
  raceTime = 0;
  fr = 0;

  // Start the animation loop
  animate();
}

// Called when race finishes - uploads ranking and ghost data
function onRaceFinished() {
  if (!currentUser || !player) return;

  var finTime = player.finTime || raceTime;

  // Upload ranking
  if (typeof uploadRanking === 'function') {
    uploadRanking({
      charIdx: selectedChar,
      kartIdx: selectedKart,
      equipIdx: selectedEquip,
      time: finTime
    });
  }

  // Upload ghost data (only if recording has reasonable data)
  if (typeof uploadGhost === 'function' && ghostSamples.length > 100) {
    uploadGhost({
      charIdx: selectedChar,
      kartIdx: selectedKart,
      equipIdx: selectedEquip,
      time: finTime,
      samples: ghostSamples
    });
  }

  // Show ranking in results
  if (typeof showResultRanking === 'function') {
    setTimeout(showResultRanking, 500); // Small delay for DB write
  }
}

var animFrameId = null;

// Delta time tracking (replaces THREE.Clock)
var lastFrameTime = 0;

// Main game loop
function animate() {
  animFrameId = requestAnimationFrame(animate);

  // Calculate delta time in seconds
  var now = performance.now();
  var dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  // Cap dt to prevent physics explosions on lag spikes (e.g. max 0.1s aka 10FPS drop)
  if (dt > 0.1) dt = 0.1;
  // Skip first frame where dt would be huge
  if (dt <= 0) return;

  fr++;

  // Update race time when racing
  if (gameState === 'racing') {
    raceTime++;
  }

  // Update input from gamepad
  if (typeof pollGamepads === 'function') pollGamepads();

  // Update item boxes
  updateItemBoxes(dt);

  // Update energy rings
  updateEnergyRings(dt);

  // Update projectiles and traps
  updateProjectiles(scene, racers, dt);
  updateTraps(scene, dt);

  // Update boost pads
  updateBoostPads(dt);

  // Update game logic when racing
  if (gameState === 'racing') {
    // Update all racers
    for (var i = 0; i < racers.length; i++) {
      if (i === 0) {
        // Player racer - use input
        racers[i].update(input, racers, scene, dt);
      } else {
        // AI racer - use empty input
        racers[i].update({}, racers, scene, dt);
      }
    }

    // Handle player item use
    if (input.item && player.item) {
      player.useItem(racers, scene);
      input.item = false;
    }

    // Handle player skill activation
    if (input.skill && player.skillReady && !player.skillActive) {
      player.activateSkill(racers);
      input.skill = false;
    }

    // Check if player finished
    if (player.lap >= TOTAL_LAPS && !player.finished) {
      player.finished = true;
      player.finTime = raceTime;
      player.finishCountdown = 180; // 3 seconds grace period
      SND.finish();
    }

    // Check if AI racers finished
    for (var i = 1; i < racers.length; i++) {
      if (racers[i].lap >= TOTAL_LAPS && !racers[i].finished) {
        racers[i].finished = true;
        racers[i].finTime = raceTime;
      }
    }

    // Grace period: after player finishes, force-finish remaining AI after 3 seconds
    if (player.finished && player.finishCountdown > 0) {
      player.finishCountdown--;
      if (player.finishCountdown <= 0) {
        // Force all unfinished racers to finish with estimated times
        for (var i = 1; i < racers.length; i++) {
          if (!racers[i].finished) {
            racers[i].finished = true;
            // Estimate finish time based on remaining progress
            var remaining = (TOTAL_LAPS * TRACK_POINTS) - racers[i].progress;
            var estFrames = remaining > 0 ? Math.floor(remaining * 2.5) : 60;
            racers[i].finTime = raceTime + estFrames;
          }
        }
      }
    }

    // Update ghost racers
    if (typeof ghostRacers !== 'undefined') {
      for (var gi = 0; gi < ghostRacers.length; gi++) {
        ghostRacers[gi].update(raceTime);
      }
    }

    // Check if race is complete
    var allFinished = true;
    for (var i = 0; i < racers.length; i++) {
      if (!racers[i].finished) {
        allFinished = false;
        break;
      }
    }

    // In ghost mode, only player needs to finish
    if (gameMode === 'ghost') {
      allFinished = player.finished;
    }

    // End race when all finished or timeout (3 minutes)
    if (allFinished || raceTime > 60 * 180) {
      ghostRecording = false;
      showResults();
      onRaceFinished();
    }
  }

  // Update camera position
  updateCamera(player);

  // Update engine sound - only when actively racing and moving
  if (player) {
    if (gameState === 'racing' && Math.abs(player.spd) > 0.05) {
      var engineSpd = Math.abs(player.spd) / (player.maxSpd || 1.5);
      SND.engine(engineSpd);
    } else {
      SND.engine(0);
    }
  }

  // Update cloud animation
  updateClouds(dt);

  // Update water surface animation
  updateWaterSurfaces(dt);

  // Update environmental effects
  updateEnvParticles(dt);

  // Update visual effects
  updateDriftParticles(player, dt);
  updateBoostEffect(player, dt);

  // Render the scene (with post-processing if available)
  renderScene();

  // Speed lines overlay
  updateSpeedLines(player, dt);

  // Update HUD and minimap
  updateHUD();
  drawMinimap();
}

// Initialize game on page load
checkMobile();
checkOrientation();
buildCharSelect();
setupMobile();

// Initialize login modal and account bar
if (typeof initLoginModal === 'function') initLoginModal();
if (typeof updateAccountBar === 'function') updateAccountBar();

// Initialize Firebase
if (typeof initFirebase === 'function') initFirebase();

// Ranking button handler
var rankingBtn = document.getElementById('ranking-btn');
if (rankingBtn) {
  rankingBtn.onclick = function () {
    if (typeof showRankingScreen === 'function') showRankingScreen();
  };
}
var rankingBack = document.getElementById('ranking-back');
if (rankingBack) {
  rankingBack.onclick = function () {
    if (typeof hideRankingScreen === 'function') hideRankingScreen();
  };
}

// Initialize 3D preview on title screen
initPreview3D();

// Eagerly preload character models and kart models for preview
preloadModels(function () {
  // Refresh preview with GLB models now available
  buildPreviewKart();
});
preloadKartModels(function () {
  // Refresh preview with kart GLB models now available
  buildPreviewKart();
});

// Request fullscreen and lock orientation on mobile
function requestMobileFullscreen() {
  var el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(function () { });
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  } catch (e) { }
  // Lock to landscape
  try {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(function () { });
    }
  } catch (e) { }
}

// Start button handler
document.getElementById('start-btn').onclick = function () {
  AUDIO.init();
  // Auto-fullscreen on mobile (needs user gesture)
  if (isMobile) requestMobileFullscreen();
  // Reset frame time before starting to avoid huge initial dt
  lastFrameTime = performance.now();
  // startRace() handles its own model loading into the race scene
  startRace();
};

// Retry button handler
document.getElementById('retry-btn').onclick = function () {
  // Stop animation loop
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop engine sound
  if (AUDIO.engineRunning) {
    SND.engine(0);
  }

  // Dispose Babylon.js scene and engine
  if (scene) {
    scene.dispose();
  }
  if (engine) {
    engine.dispose();
    engine = null;
  }

  // Clean up speed lines
  if (speedLinesCanvas) {
    speedLinesCanvas.remove();
    speedLinesCanvas = null;
    speedLinesCtx = null;
  }

  // Reset item arrays
  traps = [];
  trapMeshes = [];
  projectiles = [];
  projMeshes = [];
  itemBoxes = [];
  itemBoxMeshes = [];
  energyRings = [];
  energyRingMeshes = [];
  boostPads = [];
  boostPadMeshes = [];

  // Reset track
  trackMeshes = [];
  trackNodes = [];

  // Reset racers
  racers = [];
  player = null;

  // Cleanup ghost racers
  if (typeof ghostRacers !== 'undefined') {
    for (var gi = 0; gi < ghostRacers.length; gi++) {
      if (ghostRacers[gi].cleanup) ghostRacers[gi].cleanup(scene);
    }
    ghostRacers = [];
  }

  // Reset ghost recording
  ghostSamples = [];
  ghostRecording = false;

  // Reset particles
  particles = { driftLeft: null, driftRight: null, boostFlame: null, dustClouds: [] };

  // Clear model caches (they point to the now-disposed race scene)
  kartModelCache = {};
  glbModelCache = {};
  envModelCache = {};
  courseModelRoot = null;
  kartModelsLoaded = false;
  glbModelsLoaded = false;
  envModelsLoaded = false;
  courseModelLoaded = false;

  // Reset scene and camera
  scene = null;
  camera = null;

  // Reset game state
  gameState = 'title';
  raceTime = 0;
  fr = 0;

  // Hide all game UI
  document.getElementById('results').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('minimap').style.display = 'none';
  if (isMobile) {
    document.getElementById('mobile-controls').style.display = 'none';
    document.getElementById('boost-bar').style.display = 'none';
  }

  // Reset skill gauge
  var skillGauge = document.getElementById('skill-gauge');
  if (skillGauge) skillGauge.textContent = '';

  // Show title screen again
  document.getElementById('title-screen').style.display = 'flex';

  // Rebuild character selection and 3D preview
  buildCharSelect();
  initPreview3D();

  // Re-preload models for preview (caches were cleared above)
  preloadModels(function () { buildPreviewKart(); });
  preloadKartModels(function () { buildPreviewKart(); });
};
