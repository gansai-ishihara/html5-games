// main.js - Main entry point and game loop for Drift Racers
// Mario Kart-style 3D racing game using Three.js r128

// Start a new race
function startRace() {
  // Initialize audio
  AUDIO.init();

  // Hide title screen
  document.getElementById('title-screen').style.display = 'none';

  // Generate the race track
  generateTrack();

  // Initialize the 3D scene (also creates particle systems)
  initScene();
  initSpeedLines();

  // Build the track mesh and decorations
  buildTrackMesh(scene);
  buildTrackDecorations(scene);

  // Create player racer with kart and equipment (back of grid)
  player = new Racer(selectedChar, true, selectedKart, EQUIPMENT[selectedEquip].type);
  player.placeAt(0);
  player.createMesh(scene);
  racers.push(player);

  // Create AI racers (staggered ahead of player, like Mario Kart grid)
  var usedChars = [selectedChar];
  for (var i = 0; i < NUM_RACERS - 1; i++) {
    // Select a different character index for each AI
    var aiCharIdx;
    do {
      aiCharIdx = Math.floor(Math.random() * CHARACTERS.length);
    } while (usedChars.indexOf(aiCharIdx) !== -1 && usedChars.length < CHARACTERS.length);
    usedChars.push(aiCharIdx);

    // Random kart and equipment for AI
    var aiKart = Math.floor(Math.random() * KARTS.length);
    var aiEquip = EQUIPMENT[Math.floor(Math.random() * EQUIPMENT.length)].type;
    var aiRacer = new Racer(aiCharIdx, false, aiKart, aiEquip);
    // Place AI racers ahead of player in staggered grid
    var gridIdx = 2 + i * 2;
    aiRacer.placeAt(gridIdx);
    // Lateral stagger (left/right alternating)
    var lateralOffset = ((i % 2 === 0) ? -1 : 1) * 4;
    var perpAng = getTrackAngle(gridIdx) + Math.PI / 2;
    aiRacer.x += Math.cos(perpAng) * lateralOffset;
    aiRacer.z += Math.sin(perpAng) * lateralOffset;
    aiRacer.createMesh(scene);
    racers.push(aiRacer);
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
  setTimeout(function() {
    countdownNum.style.animation = 'cdPop 1s ease-out';
  }, 10);
  SND.countdown();

  var countdownInterval = setInterval(function() {
    count--;

    if (count > 0) {
      countdownNum.textContent = count;
      countdownNum.style.color = '#ff4444';
      countdownNum.style.animation = 'none';
      setTimeout(function() {
        countdownNum.style.animation = 'cdPop 1s ease-out';
      }, 10);
      SND.countdown();
    } else if (count === 0) {
      countdownNum.textContent = 'GO!';
      countdownNum.style.color = '#44ff44';
      countdownNum.style.animation = 'none';
      setTimeout(function() {
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

var animFrameId = null;

// Main game loop
function animate() {
  animFrameId = requestAnimationFrame(animate);

  fr++;

  // Update race time when racing
  if (gameState === 'racing') {
    raceTime++;
  }

  // Update item boxes
  updateItemBoxes();

  // Update energy rings
  updateEnergyRings();

  // Update projectiles and traps
  updateProjectiles(scene, racers);
  updateTraps(scene);

  // Update boost pads
  updateBoostPads();

  // Update game logic when racing
  if (gameState === 'racing') {
    // Update all racers
    for (var i = 0; i < racers.length; i++) {
      if (i === 0) {
        // Player racer - use input
        racers[i].update(input, racers, scene);
      } else {
        // AI racer - use empty input
        racers[i].update({}, racers, scene);
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
      SND.finish();
    }

    // Check if AI racers finished
    for (var i = 1; i < racers.length; i++) {
      if (racers[i].lap >= TOTAL_LAPS && !racers[i].finished) {
        racers[i].finished = true;
        racers[i].finTime = raceTime;
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

    // End race if all finished or timeout (3 minutes)
    if (allFinished || raceTime > 60 * 180) {
      showResults();
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
  updateClouds();

  // Update water surface animation
  updateWaterSurfaces();

  // Update visual effects
  updateDriftParticles(player);
  updateBoostEffect(player);

  // Render the scene (with post-processing if available)
  renderScene();

  // Speed lines overlay
  updateSpeedLines(player);

  // Update HUD and minimap
  updateHUD();
  drawMinimap();
}

// Initialize game on page load
checkMobile();
checkOrientation();
buildCharSelect();
setupMobile();

// Start button handler
document.getElementById('start-btn').onclick = function() {
  AUDIO.init();
  var btn = document.getElementById('start-btn');
  var needCharModels = !glbModelsLoaded;
  var needEnvModels = !envModelsLoaded;

  if (needCharModels || needEnvModels) {
    btn.textContent = 'LOADING MODELS...';
    btn.disabled = true;
    var charDone = !needCharModels;
    var envDone = !needEnvModels;

    function checkAllDone() {
      if (charDone && envDone) {
        btn.textContent = 'START RACE';
        btn.disabled = false;
        startRace();
      }
    }

    if (needCharModels) {
      preloadModels(function() { charDone = true; checkAllDone(); });
    }
    if (needEnvModels) {
      preloadEnvModels(function() { envDone = true; checkAllDone(); });
    }
  } else {
    startRace();
  }
};

// Retry button handler
document.getElementById('retry-btn').onclick = function() {
  // Stop animation loop
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Stop engine sound
  if (AUDIO.engineRunning) {
    SND.engine(0);
  }

  // Clean up renderer
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
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

  // Reset particles
  particles = {driftLeft: null, driftRight: null, boostFlame: null, dustClouds: []};

  // Reset scene
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

  // Rebuild character selection
  buildCharSelect();
};
