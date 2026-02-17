// HUD/UI module for drift-racers game

// === 3D Preview System ===
var previewScene = null;
var previewCamera = null;
var previewRenderer = null;
var previewMesh = null;
var previewAnimId = null;
var previewAngle = 0;

function initPreview3D() {
  var container = document.getElementById('preview-container');
  if (!container || previewRenderer) return;

  var canvas = document.getElementById('preview-canvas');
  var w = container.clientWidth;
  var h = container.clientHeight;
  if (w === 0 || h === 0) { w = 360; h = 220; }

  previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0x1A2E4A);

  previewCamera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  previewCamera.position.set(4.5, 3, 4.5);
  previewCamera.lookAt(0, 1.0, 0);

  previewRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  previewRenderer.setSize(w, h);
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Lighting (Crystal Kingdom theme)
  previewScene.add(new THREE.AmbientLight(0xCCDDFF, 0.6));
  var sun = new THREE.DirectionalLight(0xFFEEDD, 1.2);
  sun.position.set(5, 8, 3);
  previewScene.add(sun);
  var fill = new THREE.DirectionalLight(0x99BBEE, 0.35);
  fill.position.set(-3, 2, -1);
  previewScene.add(fill);
  var rim = new THREE.DirectionalLight(0x8866BB, 0.3);
  rim.position.set(-2, 1, -5);
  previewScene.add(rim);

  // Ground disc
  var groundGeo = new THREE.CircleGeometry(5, 32);
  var groundMat = new THREE.MeshLambertMaterial({ color: 0x2A4A3A });
  var ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  previewScene.add(ground);

  buildPreviewKart();
  animatePreview3D();
}

function buildPreviewKart() {
  if (!previewScene) return;

  // Remove old mesh
  if (previewMesh) {
    previewScene.remove(previewMesh);
    previewMesh = null;
  }

  // Build kart+character via temporary Racer
  var tempRacer = new Racer(selectedChar, true, selectedKart, EQUIPMENT[selectedEquip].type);
  tempRacer.createMesh(previewScene);
  previewMesh = tempRacer.mesh;

  // Override position/rotation for turntable display
  previewMesh.position.set(0, 0, 0);
  previewMesh.rotation.set(0, previewAngle, 0);
}

function animatePreview3D() {
  previewAnimId = requestAnimationFrame(animatePreview3D);

  if (previewMesh) {
    previewAngle += 0.008;
    previewMesh.rotation.y = previewAngle;
  }

  if (previewRenderer && previewScene && previewCamera) {
    previewRenderer.render(previewScene, previewCamera);
  }
}

function cleanupPreview3D() {
  if (previewAnimId) {
    cancelAnimationFrame(previewAnimId);
    previewAnimId = null;
  }
  if (previewMesh) {
    previewScene.remove(previewMesh);
    previewMesh = null;
  }
  if (previewRenderer) {
    previewRenderer.dispose();
    previewRenderer = null;
  }
  previewScene = null;
  previewCamera = null;
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
    ringEl.textContent = '💎 ' + (player.rings || 0);
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
    // Build skill button
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

  // Energy rings on minimap
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
    var info = document.createElement('span');
    info.textContent = r.char.e + ' ' + r.char.n;
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
  cd.textContent = 'CT: ' + Math.round(c.skillCD / 60) + '秒 / 効果: ' + Math.round(c.skillDur / 60) + '秒';
  el.appendChild(cd);
}

function buildCharSelect() {
  // === キャラクター選択 ===
  var cont = document.getElementById('char-select');
  cont.textContent = '';
  CHARACTERS.forEach(function(c, i) {
    var card = document.createElement('div');
    card.className = 'char-card' + (i === selectedChar ? ' sel' : '');

    // Character portrait image (fallback to emoji if no image)
    if (c.img) {
      var portrait = document.createElement('img');
      portrait.src = c.img;
      portrait.className = 'char-portrait';
      portrait.alt = c.n;
      portrait.draggable = false;
      card.appendChild(portrait);
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

    // Compact stat bar (single line)
    var attrs = [c.s, c.a, c.h];
    var labels = ['S', 'A', 'H'];
    var statRow = document.createElement('div');
    statRow.className = 'char-stat-compact';
    for (var j = 0; j < 3; j++) {
      var seg = document.createElement('span');
      seg.className = 'stat-seg';
      seg.textContent = labels[j] + attrs[j];
      if (attrs[j] >= 9) seg.style.color = '#FFCC66';
      else if (attrs[j] >= 7) seg.style.color = 'rgba(200,213,232,.7)';
      statRow.appendChild(seg);
    }
    card.appendChild(statRow);

    card.onclick = function() {
      AUDIO.init();
      SND.countdown();
      selectedChar = i;
      var all = document.querySelectorAll('.char-card');
      for (var x = 0; x < all.length; x++) all[x].classList.remove('sel');
      card.classList.add('sel');
      document.getElementById('char-desc').textContent = c.desc;
      updateSkillPreview();
      buildPreviewKart();
    };
    cont.appendChild(card);
  });
  var descEl = document.getElementById('char-desc');
  if (descEl) descEl.textContent = CHARACTERS[selectedChar].desc;
  updateSkillPreview();

  // === カート選択 ===
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
      if (k.sBonus > 0) bonusTxt += 'スピード+' + Math.round(k.sBonus * 100) + '% ';
      if (k.sBonus < 0) bonusTxt += 'スピード' + Math.round(k.sBonus * 100) + '% ';
      if (k.aBonus > 0) bonusTxt += '加速UP ';
      if (k.hBonus > 0) bonusTxt += 'ハンドリングUP ';
      if (k.hBonus < 0) bonusTxt += 'ハンドリングDOWN ';
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
        buildPreviewKart();
      };
      kartCont.appendChild(card);
    });
  }

  // === 装備選択 ===
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

  // === Character scroll arrows ===
  var charScrollPage = 0;
  var charsPerPage = 8; // 4 columns x 2 rows
  var totalPages = Math.ceil(CHARACTERS.length / charsPerPage);
  var leftBtn = document.getElementById('char-arrow-left');
  var rightBtn = document.getElementById('char-arrow-right');
  function updateCharScroll() {
    var grid = document.getElementById('char-select');
    if (grid) {
      // Calculate scroll offset based on viewport width
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
