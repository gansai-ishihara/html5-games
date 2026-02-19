// HUD/UI module for drift-racers game
// Babylon.js engine (migrated from Three.js r128)

// === 3D Preview System (separate Babylon engine on preview-canvas) ===
var previewScene = null;
var previewCamera = null;
var previewEngine = null;
var previewMesh = null;
var previewAngle = 0;
var previewParticlePositions = null;
var previewParticleMeshes = [];

function initPreview3D() {
  var container = document.getElementById('preview-container');
  if (!container || previewEngine) return;

  var canvas = document.getElementById('preview-canvas');
  var w = container.clientWidth;
  var h = container.clientHeight;
  if (w === 0 || h === 0) { w = 360; h = 220; }

  // Create a separate Babylon engine for the preview
  previewEngine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    disableWebGL2Support: false
  });
  previewEngine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  // Babylon.js sets position:fixed on the canvas - CSS !important overrides this
  previewEngine.resize();

  previewScene = new BABYLON.Scene(previewEngine);
  // Background gradient
  previewScene.clearColor = new BABYLON.Color4(0.051, 0.102, 0.176, 1.0);
  previewScene.ambientColor = new BABYLON.Color3(0.1, 0.1, 0.15);

  // Compatibility shims for kart creation code that uses global `scene`
  previewScene.add = function () {};
  previewScene.remove = function (obj) { if (obj && obj.dispose) obj.dispose(); };

  // Camera
  previewCamera = new BABYLON.FreeCamera('previewCam', new BABYLON.Vector3(4, 2.5, 4), previewScene);
  previewCamera.setTarget(new BABYLON.Vector3(0, 0.7, 0));
  previewCamera.inputs.clear(); // No user control

  // Lighting (brighter for preview)
  var hemi = new BABYLON.HemisphericLight('pHemi', new BABYLON.Vector3(0, 1, 0), previewScene);
  hemi.intensity = 0.8;
  hemi.diffuse = new BABYLON.Color3(1, 1, 1);
  hemi.groundColor = new BABYLON.Color3(0.3, 0.35, 0.4);

  var sun = new BABYLON.DirectionalLight('pSun', new BABYLON.Vector3(-5, -8, -3), previewScene);
  sun.intensity = 1.2;
  sun.diffuse = new BABYLON.Color3(1, 0.93, 0.87);

  var fill = new BABYLON.DirectionalLight('pFill', new BABYLON.Vector3(3, -2, 1), previewScene);
  fill.intensity = 0.5;
  fill.diffuse = new BABYLON.Color3(0.8, 0.87, 1);

  var rim = new BABYLON.DirectionalLight('pRim', new BABYLON.Vector3(2, -1, 5), previewScene);
  rim.intensity = 0.4;
  rim.diffuse = new BABYLON.Color3(0.67, 0.73, 1);

  // Ground - glossy circular platform
  var groundMat = new BABYLON.StandardMaterial('pGround', previewScene);
  groundMat.diffuseColor = new BABYLON.Color3(0.165, 0.29, 0.353);
  groundMat.emissiveColor = new BABYLON.Color3(0.04, 0.08, 0.12);
  groundMat.specularColor = new BABYLON.Color3(0.27, 0.4, 0.53);
  groundMat.specularPower = 60;
  var ground = BABYLON.MeshBuilder.CreateCylinder('pGroundMesh', {
    diameterTop: 7, diameterBottom: 7.6, height: 0.15, tessellation: 48
  }, previewScene);
  ground.material = groundMat;
  ground.position.y = -0.1;

  // Glowing ring around platform
  var ringMat = new BABYLON.StandardMaterial('pRing', previewScene);
  ringMat.diffuseColor = new BABYLON.Color3(0.27, 0.53, 0.87);
  ringMat.emissiveColor = new BABYLON.Color3(0.27, 0.53, 0.87).scale(0.6);
  ringMat.alpha = 0.6;
  ringMat.disableLighting = true;
  var ring = BABYLON.MeshBuilder.CreateTorus('pRingMesh', {
    diameter: 7.3, thickness: 0.04, tessellation: 64
  }, previewScene);
  ring.material = ringMat;
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.02;

  // Floating particles (simple small spheres)
  previewParticlePositions = [];
  previewParticleMeshes = [];
  var pMat = new BABYLON.StandardMaterial('pPart', previewScene);
  pMat.diffuseColor = new BABYLON.Color3(0.53, 0.73, 1);
  pMat.emissiveColor = new BABYLON.Color3(0.53, 0.73, 1).scale(0.5);
  pMat.alpha = 0.5;
  pMat.disableLighting = true;
  for (var pi = 0; pi < 30; pi++) {
    var px = (Math.random() - 0.5) * 12;
    var py = Math.random() * 5;
    var pz = (Math.random() - 0.5) * 12;
    previewParticlePositions.push({ x: px, y: py, z: pz });
    var pm = BABYLON.MeshBuilder.CreateSphere('pp' + pi, { diameter: 0.06, segments: 4 }, previewScene);
    pm.material = pMat;
    pm.position.copyFromFloats(px, py, pz);
    previewParticleMeshes.push(pm);
  }

  buildPreviewKart();

  // Render loop
  previewEngine.runRenderLoop(function () {
    if (previewMesh) {
      previewAngle += 0.008;
      previewMesh.rotation.y = previewAngle;
    }
    // Animate particles
    for (var i = 0; i < previewParticlePositions.length; i++) {
      previewParticlePositions[i].y += 0.003;
      if (previewParticlePositions[i].y > 5) previewParticlePositions[i].y = 0;
      previewParticleMeshes[i].position.y = previewParticlePositions[i].y;
    }
    previewScene.render();
  });
}

function buildPreviewKart() {
  if (!previewScene) return;

  // Remove old mesh
  if (previewMesh) {
    previewMesh.dispose();
    previewMesh = null;
  }

  // Temporarily swap global scene to previewScene so kart creation works
  var savedScene = scene;
  var savedShadowGen = shadowGen;
  scene = previewScene;
  shadowGen = null; // No shadows in preview

  // Build kart+character via temporary Racer
  var tempRacer = new Racer(selectedChar, true, selectedKart, EQUIPMENT[selectedEquip].type);
  tempRacer.createMesh(previewScene);
  previewMesh = tempRacer.mesh;

  // Restore global scene
  scene = savedScene;
  shadowGen = savedShadowGen;

  // Override position/rotation for turntable display
  previewMesh.position.copyFromFloats(0, 0, 0);
  previewMesh.rotation.copyFromFloats(0, previewAngle, 0);
}

function cleanupPreview3D() {
  if (previewEngine) {
    previewEngine.stopRenderLoop();
    previewEngine.dispose();
    previewEngine = null;
  }
  previewMesh = null;
  previewScene = null;
  previewCamera = null;
  previewParticlePositions = null;
  previewParticleMeshes = [];
}

function updateHUD() {
  if (gameState !== 'racing' && gameState !== 'countdown') return;

  // Sort racers by progress to determine positions
  var sortedRacers = racers.slice().sort(function(a, b) {
    return b.progress - a.progress;
  });

  // Find player position
  var playerPos = 1;
  for (var i = 0; i < sortedRacers.length; i++) {
    if (sortedRacers[i] === player) {
      playerPos = i + 1;
      break;
    }
  }

  // Update position display
  var suffixes = ['st','nd','rd','th','th','th','th','th','th','th'];
  var posEl = document.getElementById('position-display');
  posEl.textContent = '';
  posEl.appendChild(document.createTextNode(playerPos));
  var suf = document.createElement('span');
  suf.className = 'suffix';
  suf.textContent = suffixes[playerPos - 1];
  posEl.appendChild(suf);

  // Update lap display
  var currentLap = Math.min(player.lap + 1, TOTAL_LAPS);
  document.getElementById('lap-display').textContent = 'LAP ' + currentLap + '/' + TOTAL_LAPS;

  // Update speed display
  var speedKmh = Math.round(Math.abs(player.spd * 110));
  document.getElementById('speed-display').textContent = speedKmh + ' km/h';

  // Update time display
  document.getElementById('time-display').textContent = formatTime(raceTime);

  // Update item box
  var itemBox = document.getElementById('item-box');
  if (player.item) {
    var itemEmoji = '';
    for (var i = 0; i < ITEMS.length; i++) {
      if (ITEMS[i].type === player.item) { itemEmoji = ITEMS[i].e; break; }
    }
    itemBox.textContent = itemEmoji || '?';
  } else {
    itemBox.textContent = '';
  }

  // Update ring display
  var ringEl = document.getElementById('ring-display');
  if (ringEl) {
    ringEl.textContent = '\uD83D\uDC8E ' + (player.rings || 0);
  }

  // Update skill gauge
  updateSkillGauge();

  // Update boost fill (mobile only)
  if (isMobile) {
    var boostFill = document.getElementById('boost-fill');
    if (boostFill) {
      if (player.boostTimer > 0) {
        boostFill.style.width = (player.boostTimer / 90 * 100) + '%';
      } else {
        boostFill.style.width = '0%';
      }
    }
  }

  // Update warning flash
  var warningFlash = document.getElementById('warning-flash');
  if (warningFlash) {
    warningFlash.style.opacity = player.stunTimer > 0 ? '0.6' : '0';
  }
}

function updateSkillGauge() {
  var gauge = document.getElementById('skill-gauge');
  if (!gauge || !player) return;

  if (!gauge.firstChild) {
    var btn = document.createElement('div');
    btn.className = 'skill-btn';
    var icon = document.createElement('div');
    icon.className = 'sk-icon';
    icon.textContent = player.char.e;
    btn.appendChild(icon);
    var key = document.createElement('div');
    key.className = 'sk-key';
    key.textContent = '[Q]';
    btn.appendChild(key);
    var fill = document.createElement('div');
    fill.className = 'sk-fill';
    btn.appendChild(fill);
    btn.onclick = function() {
      if (player && player.skillReady && !player.skillActive) {
        input.skill = true;
      }
    };
    gauge.appendChild(btn);
  }

  var btn = gauge.firstChild;
  var fill = btn.querySelector('.sk-fill');

  if (player.skillActive) {
    btn.className = 'skill-btn active';
    var pct = player.skillTimer / player.char.skillDur * 100;
    fill.style.height = pct + '%';
  } else if (player.skillReady) {
    btn.className = 'skill-btn ready';
    fill.style.height = '100%';
  } else {
    btn.className = 'skill-btn cooldown';
    var cd = player.char.skillCD;
    if (player.equip === 'reactor') cd = Math.floor(cd * 0.75);
    var pct = (1 - player.skillCooldown / cd) * 100;
    fill.style.height = pct + '%';
  }
}

function drawMinimap() {
  var canvas = document.getElementById('minimap');
  if (!canvas || canvas.style.display === 'none') return;

  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Calculate bounds
  var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (var i = 0; i < trackNodes.length; i++) {
    var p = trackNodes[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  var range = Math.max(maxX - minX, maxZ - minZ) * 1.15;
  var ox = (w - (maxX - minX) / range * w) / 2;
  var oy = (h - (maxZ - minZ) / range * h) / 2;
  function tx(x) { return (x - minX) / range * w + ox; }
  function tz(z) { return (z - minZ) / range * h + oy; }

  // Track path
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (var i = 0; i <= trackNodes.length; i++) {
    var p = trackNodes[i % trackNodes.length];
    if (i === 0) ctx.moveTo(tx(p.x), tz(p.z));
    else ctx.lineTo(tx(p.x), tz(p.z));
  }
  ctx.closePath();
  ctx.stroke();

  // Energy rings
  if (typeof energyRings !== 'undefined') {
    ctx.fillStyle = 'rgba(0,221,255,0.6)';
    for (var i = 0; i < energyRings.length; i++) {
      if (energyRings[i].active) {
        ctx.beginPath();
        ctx.arc(tx(energyRings[i].x), tz(energyRings[i].z), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Racers
  for (var i = racers.length - 1; i >= 0; i--) {
    var r = racers[i];
    ctx.fillStyle = r.isPlayer ? '#FFFFFF' : '#' + r.char.col.toString(16).padStart(6, '0');
    ctx.beginPath();
    ctx.arc(tx(r.x), tz(r.z), r.isPlayer ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (r.isPlayer) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function showResults() {
  gameState = 'results';

  var sortedRacers = racers.slice().sort(function(a, b) {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return a.finTime - b.finTime;
    return b.progress - a.progress;
  });

  var pPos = 1;
  for (var i = 0; i < sortedRacers.length; i++) {
    if (sortedRacers[i] === player) { pPos = i + 1; break; }
  }

  var titles = ['1ST PLACE!', '2ND PLACE!', '3RD PLACE!'];
  document.getElementById('result-title').textContent = pPos <= 3 ? titles[pPos - 1] : pPos + 'TH PLACE';

  var t = (player.finTime || raceTime) / 60;
  var mins = Math.floor(t / 60);
  var secs = t % 60;
  document.getElementById('result-time').textContent = 'TIME: ' + mins + ':' + ('0' + Math.floor(secs)).slice(-2) + '.' + ('0' + Math.floor((secs % 1) * 100)).slice(-2);

  var list = document.getElementById('result-list');
  list.textContent = '';
  for (var i = 0; i < sortedRacers.length; i++) {
    var r = sortedRacers[i];
    var li = document.createElement('li');
    if (r.isPlayer) li.className = 'player';
    var rc = ['g', 's', 'b', '', '', ''];
    var ft = r.finished ? formatTime(r.finTime) : 'DNF';
    var rank = document.createElement('span');
    rank.className = 'rank ' + rc[i];
    rank.textContent = (i + 1);
    li.appendChild(rank);
    // Character portrait
    if (r.char.img) {
      var pWrap = document.createElement('div');
      pWrap.style.cssText = 'width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;border:1.5px solid rgba(255,255,255,.2)';
      var portrait = document.createElement('img');
      portrait.src = r.char.img;
      portrait.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:center 0%;transform:scale(2);transform-origin:center 15%;display:block';
      pWrap.appendChild(portrait);
      li.appendChild(pWrap);
    }
    var info = document.createElement('span');
    info.textContent = r.char.n;
    li.appendChild(info);
    var time = document.createElement('span');
    time.style.cssText = 'margin-left:auto;opacity:.7';
    time.textContent = ft;
    li.appendChild(time);
    list.appendChild(li);
  }

  document.getElementById('results').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('minimap').style.display = 'none';
  if (isMobile) {
    document.getElementById('mobile-controls').style.display = 'none';
    document.getElementById('boost-bar').style.display = 'none';
  }
}

function formatTime(frames) {
  var t = frames / 60;
  var m = Math.floor(t / 60), s = t % 60;
  return m + ':' + ('0' + Math.floor(s)).slice(-2) + '.' + ('0' + Math.floor((s % 1) * 100)).slice(-2);
}

function updateSkillPreview() {
  var el = document.getElementById('skill-preview');
  if (!el) return;
  var c = CHARACTERS[selectedChar];
  el.textContent = '';
  var nm = document.createElement('div');
  nm.className = 'sk-name';
  nm.textContent = c.e + ' ' + c.skillName;
  el.appendChild(nm);
  var ds = document.createElement('div');
  ds.className = 'sk-desc';
  ds.textContent = c.skillDesc;
  el.appendChild(ds);
  var cd = document.createElement('div');
  cd.className = 'sk-cd';
  cd.textContent = 'CT: ' + Math.round(c.skillCD / 60) + '\u79D2 / \u52B9\u679C: ' + Math.round(c.skillDur / 60) + '\u79D2';
  el.appendChild(cd);
}

function updateCharStats() {
  var panel = document.getElementById('char-stats-panel');
  if (!panel) return;
  var c = CHARACTERS[selectedChar];
  var k = KARTS[selectedKart];
  panel.textContent = '';

  var stats = [
    {label: '\u26A1 \u30B9\u30D4\u30FC\u30C9', val: c.s, color: '#4488DD', bonus: k.sBonus * 100},
    {label: '\uD83D\uDE80 \u52A0\u901F', val: c.a, color: '#44CC88', bonus: k.aBonus * 1000},
    {label: '\uD83C\uDFAF \u30CF\u30F3\u30C9\u30EA\u30F3\u30B0', val: c.h, color: '#BB66DD', bonus: k.hBonus * 1000}
  ];

  for (var i = 0; i < stats.length; i++) {
    var row = document.createElement('div');
    row.className = 'stat-bar-row';

    var label = document.createElement('div');
    label.className = 'stat-bar-label';
    label.textContent = stats[i].label;
    row.appendChild(label);

    var track = document.createElement('div');
    track.className = 'stat-bar-track';

    var fill = document.createElement('div');
    fill.className = 'stat-bar-fill';
    var pct = Math.min(stats[i].val * 10, 100);
    fill.style.width = pct + '%';
    fill.style.background = 'linear-gradient(90deg, ' + stats[i].color + ', ' + stats[i].color + 'cc)';
    if (stats[i].val >= 9) fill.style.boxShadow = '0 0 8px ' + stats[i].color + '88';
    track.appendChild(fill);

    if (stats[i].bonus > 0) {
      var bonus = document.createElement('div');
      bonus.className = 'stat-bar-fill';
      bonus.style.width = Math.abs(stats[i].bonus) + '%';
      bonus.style.background = '#FFCC66';
      bonus.style.opacity = '0.6';
      bonus.style.position = 'absolute';
      bonus.style.left = pct + '%';
      bonus.style.top = '0';
      bonus.style.height = '100%';
      track.appendChild(bonus);
    }
    row.appendChild(track);

    var val = document.createElement('div');
    val.className = 'stat-bar-val';
    val.textContent = stats[i].val;
    if (stats[i].val >= 9) val.style.color = '#FFCC66';
    row.appendChild(val);

    panel.appendChild(row);
  }
}

// === Account Bar ===
function updateAccountBar() {
  var bar = document.getElementById('account-bar');
  if (!bar) return;
  bar.textContent = '';
  if (currentUser) {
    var name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = currentUser.displayName;
    bar.appendChild(name);
    var btn = document.createElement('button');
    btn.className = 'logout-btn';
    btn.textContent = 'LOGOUT';
    btn.onclick = function() {
      if (typeof logoutFirebase === 'function') logoutFirebase();
    };
    bar.appendChild(btn);
  } else {
    var btn = document.createElement('button');
    btn.className = 'login-btn';
    btn.textContent = 'LOGIN';
    btn.onclick = function() { showLoginModal(); };
    bar.appendChild(btn);
  }
  buildModeSelect();
}

// === Login Modal ===
function showLoginModal() {
  var modal = document.getElementById('login-modal');
  if (modal) modal.classList.add('show');
}

function hideLoginModal() {
  var modal = document.getElementById('login-modal');
  if (modal) modal.classList.remove('show');
  var err = document.getElementById('login-error');
  if (err) err.textContent = '';
}

function initLoginModal() {
  var closeBtn = document.getElementById('login-close');
  if (closeBtn) closeBtn.onclick = hideLoginModal;

  var tabs = document.querySelectorAll('.login-tab');
  var isSignup = false;
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].onclick = function() {
      for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
      this.classList.add('active');
      isSignup = this.dataset.tab === 'signup';
      var nameInput = document.getElementById('login-name');
      var submitBtn = document.getElementById('login-submit');
      if (nameInput) nameInput.style.display = isSignup ? 'block' : 'none';
      if (submitBtn) submitBtn.textContent = isSignup ? '\u65B0\u898F\u767B\u9332' : '\u30ED\u30B0\u30A4\u30F3';
    };
  }

  var submitBtn = document.getElementById('login-submit');
  if (submitBtn) {
    submitBtn.onclick = function() {
      var email = document.getElementById('login-email').value;
      var pass = document.getElementById('login-pass').value;
      var errEl = document.getElementById('login-error');
      if (!email || !pass) { if (errEl) errEl.textContent = '\u30E1\u30FC\u30EB\u3068\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B'; return; }

      var currentTab = document.querySelector('.login-tab.active');
      var doSignup = currentTab && currentTab.dataset.tab === 'signup';

      if (doSignup) {
        var name = document.getElementById('login-name').value || email.split('@')[0];
        if (typeof signupEmail === 'function') {
          signupEmail(email, pass, name).then(function() {
            hideLoginModal();
          }).catch(function(e) { if (errEl) errEl.textContent = e.message || '\u30A8\u30E9\u30FC'; });
        }
      } else {
        if (typeof loginEmail === 'function') {
          loginEmail(email, pass).then(function() {
            hideLoginModal();
          }).catch(function(e) { if (errEl) errEl.textContent = e.message || '\u30A8\u30E9\u30FC'; });
        }
      }
    };
  }

  var googleBtn = document.getElementById('login-google');
  if (googleBtn) {
    googleBtn.onclick = function() {
      var errEl = document.getElementById('login-error');
      if (typeof loginGoogle === 'function') {
        loginGoogle().then(function() {
          hideLoginModal();
        }).catch(function(e) { if (errEl) errEl.textContent = e.message || '\u30A8\u30E9\u30FC'; });
      }
    };
  }
}

// === Mode & Difficulty Select ===
function buildModeSelect() {
  var cont = document.getElementById('mode-select');
  if (!cont) return;
  cont.textContent = '';

  var cpuCard = document.createElement('div');
  cpuCard.className = 'mode-card' + (gameMode === 'cpu' ? ' sel' : '');
  cpuCard.innerHTML = '<span class="mode-icon">\uD83C\uDFCE\uFE0F</span>CPU RACE';
  cpuCard.onclick = function() { gameMode = 'cpu'; buildModeSelect(); };
  cont.appendChild(cpuCard);

  var ghostCard = document.createElement('div');
  ghostCard.className = 'mode-card' + (gameMode === 'ghost' ? ' sel' : '');
  if (!currentUser) ghostCard.classList.add('disabled');
  ghostCard.innerHTML = '<span class="mode-icon">\uD83D\uDC7B</span>GHOST';
  if (!currentUser) {
    var lbl = document.createElement('span');
    lbl.className = 'mode-label';
    lbl.textContent = '\u30ED\u30B0\u30A4\u30F3\u5FC5\u9808';
    ghostCard.appendChild(lbl);
  }
  ghostCard.onclick = function() {
    if (!currentUser) { showLoginModal(); return; }
    gameMode = 'ghost';
    buildModeSelect();
  };
  cont.appendChild(ghostCard);

  if (gameMode === 'cpu') {
    var diffCont = document.createElement('div');
    diffCont.className = 'diff-select';
    var diffs = [
      {key: 'easy', label: 'EASY'},
      {key: 'normal', label: 'NORMAL'},
      {key: 'hard', label: 'HARD'}
    ];
    for (var i = 0; i < diffs.length; i++) {
      (function(d) {
        var dc = document.createElement('div');
        dc.className = 'diff-card' + (cpuDifficulty === d.key ? ' sel' : '');
        dc.dataset.diff = d.key;
        dc.textContent = d.label;
        dc.onclick = function() { cpuDifficulty = d.key; buildModeSelect(); };
        diffCont.appendChild(dc);
      })(diffs[i]);
    }
    cont.appendChild(diffCont);
  }
}

// === Ranking Screen ===
function showRankingScreen() {
  var screen = document.getElementById('ranking-screen');
  if (!screen) return;
  screen.classList.add('show');

  var list = document.getElementById('ranking-list');
  if (list) {
    list.textContent = '';
    var loading = document.createElement('div');
    loading.style.cssText = 'color:rgba(200,213,232,.5);text-align:center;padding:20px';
    loading.textContent = 'Loading...';
    list.appendChild(loading);
  }

  if (typeof getRankings === 'function') {
    getRankings(50, function(results) {
      if (!list) return;
      list.textContent = '';
      if (results.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'color:rgba(200,213,232,.5);text-align:center;padding:20px';
        empty.textContent = '\u307E\u3060\u30E9\u30F3\u30AD\u30F3\u30B0\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093';
        list.appendChild(empty);
        return;
      }
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var entry = document.createElement('div');
        entry.className = 'ranking-entry';
        if (currentUser && r.uid === currentUser.uid) entry.classList.add('mine');

        var rankNum = document.createElement('span');
        rankNum.className = 'rank-num' + (i === 1 ? ' r2' : i === 2 ? ' r3' : '');
        rankNum.textContent = i + 1;
        entry.appendChild(rankNum);

        var charIcon = document.createElement('span');
        charIcon.className = 'rank-char';
        charIcon.textContent = CHARACTERS[r.charIdx] ? CHARACTERS[r.charIdx].e : '?';
        entry.appendChild(charIcon);

        var name = document.createElement('span');
        name.className = 'rank-name';
        name.textContent = r.displayName || 'Unknown';
        entry.appendChild(name);

        var time = document.createElement('span');
        time.className = 'rank-time';
        time.textContent = formatTime(r.time);
        entry.appendChild(time);

        list.appendChild(entry);
      }
    });
  }
}

function hideRankingScreen() {
  var screen = document.getElementById('ranking-screen');
  if (screen) screen.classList.remove('show');
}

function showResultRanking() {
  if (!currentUser || typeof getRankings !== 'function') return;
  getRankings(5, function(results) {
    if (results.length === 0) return;
    var resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    var existing = resultsEl.querySelector('.result-ranking');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.className = 'result-ranking';
    var h4 = document.createElement('h4');
    h4.textContent = 'TOP 5 RANKING';
    div.appendChild(h4);

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var row = document.createElement('div');
      row.className = 'rk-row';
      if (currentUser && r.uid === currentUser.uid) row.classList.add('mine');

      var pos = document.createElement('span');
      pos.className = 'rk-pos';
      pos.textContent = i + 1;
      row.appendChild(pos);

      var nm = document.createElement('span');
      nm.className = 'rk-name';
      nm.textContent = (CHARACTERS[r.charIdx] ? CHARACTERS[r.charIdx].e + ' ' : '') + (r.displayName || '?');
      row.appendChild(nm);

      var tm = document.createElement('span');
      tm.className = 'rk-time';
      tm.textContent = formatTime(r.time);
      row.appendChild(tm);

      div.appendChild(row);
    }

    var retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      resultsEl.insertBefore(div, retryBtn);
    } else {
      resultsEl.appendChild(div);
    }
  });
}

function buildCharSelect() {
  buildModeSelect();

  var cont = document.getElementById('char-select');
  cont.textContent = '';
  CHARACTERS.forEach(function(c, i) {
    var card = document.createElement('div');
    card.className = 'char-card' + (i === selectedChar ? ' sel' : '');

    if (c.img) {
      var wrap = document.createElement('div');
      wrap.className = 'portrait-wrap';
      var portrait = document.createElement('img');
      portrait.src = c.img;
      portrait.className = 'char-portrait';
      portrait.alt = c.n;
      portrait.draggable = false;
      wrap.appendChild(portrait);
      card.appendChild(wrap);
    } else {
      var emoji = document.createElement('div');
      emoji.className = 'emoji';
      emoji.textContent = c.e;
      card.appendChild(emoji);
    }

    var name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.n;
    card.appendChild(name);

    var type = document.createElement('div');
    type.className = 'type';
    type.textContent = c.d;
    card.appendChild(type);

    card.onclick = function() {
      AUDIO.init();
      SND.countdown();
      selectedChar = i;
      var all = document.querySelectorAll('.char-card');
      for (var x = 0; x < all.length; x++) all[x].classList.remove('sel');
      card.classList.add('sel');
      document.getElementById('char-desc').textContent = c.desc;
      updateCharStats();
      updateSkillPreview();
      buildPreviewKart();
    };
    cont.appendChild(card);
  });
  var descEl = document.getElementById('char-desc');
  if (descEl) descEl.textContent = CHARACTERS[selectedChar].desc;
  updateCharStats();
  updateSkillPreview();

  // Kart select
  var kartCont = document.getElementById('kart-select');
  if (kartCont) {
    kartCont.textContent = '';
    KARTS.forEach(function(k, i) {
      var card = document.createElement('div');
      card.className = 'kart-card' + (i === selectedKart ? ' sel' : '');

      var ke = document.createElement('div');
      ke.className = 'kart-emoji';
      ke.textContent = k.e;
      card.appendChild(ke);

      var kn = document.createElement('div');
      kn.className = 'kart-name';
      kn.textContent = k.n;
      card.appendChild(kn);

      var kd = document.createElement('div');
      kd.className = 'kart-desc';
      kd.textContent = k.desc;
      card.appendChild(kd);

      var bonusTxt = '';
      if (k.sBonus > 0) bonusTxt += '\u30B9\u30D4\u30FC\u30C9+' + Math.round(k.sBonus * 100) + '% ';
      if (k.sBonus < 0) bonusTxt += '\u30B9\u30D4\u30FC\u30C9' + Math.round(k.sBonus * 100) + '% ';
      if (k.aBonus > 0) bonusTxt += '\u52A0\u901FUP ';
      if (k.hBonus > 0) bonusTxt += '\u30CF\u30F3\u30C9\u30EA\u30F3\u30B0UP ';
      if (k.hBonus < 0) bonusTxt += '\u30CF\u30F3\u30C9\u30EA\u30F3\u30B0DOWN ';
      var kb = document.createElement('div');
      kb.className = 'kart-bonus';
      kb.textContent = bonusTxt;
      card.appendChild(kb);

      card.onclick = function() {
        AUDIO.init();
        SND.countdown();
        selectedKart = i;
        var all = document.querySelectorAll('.kart-card');
        for (var x = 0; x < all.length; x++) all[x].classList.remove('sel');
        card.classList.add('sel');
        updateCharStats();
        buildPreviewKart();
      };
      kartCont.appendChild(card);
    });
  }

  // Equipment select
  var equipCont = document.getElementById('equip-select');
  if (equipCont) {
    equipCont.textContent = '';
    EQUIPMENT.forEach(function(eq, i) {
      var card = document.createElement('div');
      card.className = 'equip-card' + (i === selectedEquip ? ' sel' : '');

      var ee = document.createElement('div');
      ee.className = 'eq-emoji';
      ee.textContent = eq.e;
      card.appendChild(ee);

      var en = document.createElement('div');
      en.className = 'eq-name';
      en.textContent = eq.n;
      card.appendChild(en);

      var ed = document.createElement('div');
      ed.className = 'eq-desc';
      ed.textContent = eq.desc;
      card.appendChild(ed);

      card.onclick = function() {
        AUDIO.init();
        SND.countdown();
        selectedEquip = i;
        var all = document.querySelectorAll('.equip-card');
        for (var x = 0; x < all.length; x++) all[x].classList.remove('sel');
        card.classList.add('sel');
      };
      equipCont.appendChild(card);
    });
  }

  // Character scroll arrows
  var charScrollPage = 0;
  var charsPerPage = 8;
  var totalPages = Math.ceil(CHARACTERS.length / charsPerPage);
  var leftBtn = document.getElementById('char-arrow-left');
  var rightBtn = document.getElementById('char-arrow-right');
  function updateCharScroll() {
    var grid = document.getElementById('char-select');
    if (grid) {
      var viewport = document.querySelector('.char-grid-viewport');
      if (viewport) {
        var scrollAmount = viewport.offsetWidth * charScrollPage;
        grid.style.transform = 'translateX(-' + scrollAmount + 'px)';
      }
    }
    if (leftBtn) leftBtn.style.opacity = charScrollPage > 0 ? '1' : '0.3';
    if (rightBtn) rightBtn.style.opacity = charScrollPage < totalPages - 1 ? '1' : '0.3';
  }
  if (leftBtn) leftBtn.onclick = function() {
    if (charScrollPage > 0) { charScrollPage--; updateCharScroll(); }
  };
  if (rightBtn) rightBtn.onclick = function() {
    if (charScrollPage < totalPages - 1) { charScrollPage++; updateCharScroll(); }
  };
  updateCharScroll();
}
