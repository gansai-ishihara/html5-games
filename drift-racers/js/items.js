// items.js - Item boxes, traps, and projectiles for drift-racers
// Babylon.js engine (migrated from Three.js r128)
// Dependencies: ITEMS, TRACK_POINTS, TRACK_WIDTH, getTrackPoint, getTrackAngle

var itemBoxes = [];
var itemBoxMeshes = [];
var traps = [];
var trapMeshes = [];
var projectiles = [];
var projMeshes = [];
var energyRings = [];
var energyRingMeshes = [];

var _itn = 0; // unique name counter for items

// Helper: StandardMaterial shorthand
function imat(hex, emHex, emInt, alpha) {
  var mat = new BABYLON.StandardMaterial('imat' + (++_itn), scene);
  mat.diffuseColor = c3(hex);
  if (emHex !== undefined) mat.emissiveColor = c3(emHex).scale(emInt || 1);
  if (alpha !== undefined) { mat.alpha = alpha; }
  mat.backFaceCulling = true;
  return mat;
}

function imatDS(hex, emHex, emInt, alpha) {
  var mat = imat(hex, emHex, emInt, alpha);
  mat.backFaceCulling = false;
  return mat;
}

function imatUnlit(hex, alpha) {
  var mat = new BABYLON.StandardMaterial('iunlit' + (++_itn), scene);
  mat.diffuseColor = c3(hex);
  mat.emissiveColor = c3(hex);
  mat.disableLighting = true;
  if (alpha !== undefined) mat.alpha = alpha;
  mat.backFaceCulling = true;
  return mat;
}

// Helper function to create question mark texture
function createQuestionMarkTexture() {
  var cvs = document.createElement('canvas');
  cvs.width = 128;
  cvs.height = 128;
  var ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 100px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 64);
  var url = cvs.toDataURL();
  var tex = new BABYLON.Texture(url, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  tex.hasAlpha = true;
  return tex;
}

// Generate item boxes along the track
function generateItemBoxes(sc) {
  for (var i = 10; i < TRACK_POINTS - 5; i += 10) {
    var trackPoint = getTrackPoint(i);
    var trackAngle = getTrackAngle(i);
    var perpAngle = trackAngle + Math.PI / 2;

    var offsets = [-1, 0, 1];
    for (var j = 0; j < offsets.length; j++) {
      var lateralOffset = offsets[j] * 8;

      var box = {
        x: trackPoint.x + Math.cos(perpAngle) * lateralOffset,
        y: trackPoint.y + 2.5,
        z: trackPoint.z + Math.sin(perpAngle) * lateralOffset,
        active: true,
        respawn: 0,
        baseY: trackPoint.y + 2.5
      };
      itemBoxes.push(box);

      // Create visual mesh - Crystal Kingdom: glowing crystal cube
      var group = new BABYLON.TransformNode('itemBox' + (++_itn), scene);

      var rainbowHue = (i * 0.12 + j * 0.33) % 1.0;
      var cubeCol = new BABYLON.Color3();
      hslToCol(rainbowHue, 0.9, 0.55, cubeCol);

      if (typeof CRYSTAL_KINGDOM !== 'undefined' && CRYSTAL_KINGDOM) {
        // Floating crystal orb - original design (no question marks)
        var crystalMat = new BABYLON.StandardMaterial('cbox' + _itn, scene);
        crystalMat.diffuseColor = cubeCol;
        crystalMat.emissiveColor = cubeCol.scale(0.6);
        crystalMat.specularColor = new BABYLON.Color3(0.8, 0.8, 1.0);
        crystalMat.specularPower = 8;
        crystalMat.alpha = 0.7;
        crystalMat.emissiveFresnelParameters = new BABYLON.FresnelParameters();
        crystalMat.emissiveFresnelParameters.bias = 0.2;
        crystalMat.emissiveFresnelParameters.power = 2.0;
        crystalMat.emissiveFresnelParameters.leftColor = cubeCol;
        crystalMat.emissiveFresnelParameters.rightColor = BABYLON.Color3.Black();

        // Central glowing orb
        var orb = BABYLON.MeshBuilder.CreateSphere('ibo' + (++_itn), { diameter: 1.8, segments: 8 }, scene);
        orb.material = crystalMat;
        orb.parent = group;
        // 3 orbiting crystal shards
        for (var sh = 0; sh < 3; sh++) {
          var shAng = (sh / 3) * Math.PI * 2;
          var shard = BABYLON.MeshBuilder.CreateCylinder('ibs' + (++_itn), {
            diameterTop: 0.1, diameterBottom: 0.6, height: 1.2, tessellation: 4
          }, scene);
          shard.material = crystalMat;
          shard.position.x = Math.cos(shAng) * 1.4;
          shard.position.z = Math.sin(shAng) * 1.4;
          shard.rotation.z = 0.4;
          shard.rotation.y = shAng;
          shard.parent = group;
        }
        // Outer glow halo
        var haloMat = new BABYLON.StandardMaterial('ibh' + _itn, scene);
        haloMat.emissiveColor = cubeCol;
        haloMat.disableLighting = true;
        haloMat.alpha = 0.1;
        var halo = BABYLON.MeshBuilder.CreateSphere('ibhalo' + (++_itn), { diameter: 4.0, segments: 6 }, scene);
        halo.material = haloMat;
        halo.parent = group;
      } else {
        // Standard floating orb style
        var orbMat = new BABYLON.StandardMaterial('orb' + _itn, scene);
        orbMat.diffuseColor = cubeCol;
        orbMat.emissiveColor = cubeCol.scale(0.4);
        orbMat.alpha = 0.8;
        var orbMesh = BABYLON.MeshBuilder.CreateSphere('ib' + (++_itn), { diameter: 2.2, segments: 8 }, scene);
        orbMesh.material = orbMat;
        orbMesh.parent = group;
        if (shadowGen) shadowGen.addShadowCaster(orbMesh);
        // Ring around orb
        var ringMat = new BABYLON.StandardMaterial('ibr' + _itn, scene);
        ringMat.diffuseColor = cubeCol;
        ringMat.emissiveColor = cubeCol.scale(0.5);
        ringMat.alpha = 0.6;
        var ring = BABYLON.MeshBuilder.CreateTorus('ibring' + (++_itn), { diameter: 3.0, thickness: 0.2, tessellation: 16 }, scene);
        ring.material = ringMat;
        ring.parent = group;
      }

      group.position.copyFromFloats(box.x, box.y, box.z);
      itemBoxMeshes.push(group);
    }
  }
}

// Add a trap/bomb on the track
function addTrap(sc, x, y, z, owner) {
  var trap = {
    x: x,
    y: y,
    z: z,
    life: 600,
    owner: owner || null
  };
  traps.push(trap);

  var group = new BABYLON.TransformNode('trap' + (++_itn), scene);

  // Main bomb sphere
  var sphereMat = imat(0x222222);
  var sphere = BABYLON.MeshBuilder.CreateSphere('ts' + (++_itn), { diameter: 2.4, segments: 12 }, scene);
  sphere.material = sphereMat;
  sphere.parent = group;
  if (shadowGen) shadowGen.addShadowCaster(sphere);

  // Spikes
  var spikeMat = imat(0x111111);
  var spikePositions = [
    { x: 1.2, y: 0, z: 0, rx: 0, rz: Math.PI / 2 },
    { x: -1.2, y: 0, z: 0, rx: 0, rz: -Math.PI / 2 },
    { x: 0, y: 0, z: 1.2, rx: 0, rz: 0 },
    { x: 0, y: 0, z: -1.2, rx: 0, rz: Math.PI },
    { x: 0, y: 1.2, z: 0, rx: 0, rz: 0 },
    { x: 0, y: -1.2, z: 0, rx: Math.PI, rz: 0 },
    { x: 0.85, y: 0.85, z: 0, rx: Math.PI / 4, rz: Math.PI / 2 },
    { x: -0.85, y: 0.85, z: 0, rx: Math.PI / 4, rz: -Math.PI / 2 }
  ];
  for (var i = 0; i < spikePositions.length; i++) {
    var sp = spikePositions[i];
    var spike = BABYLON.MeshBuilder.CreateCylinder('spike' + (++_itn), {
      diameterTop: 0, diameterBottom: 0.6, height: 0.8, tessellation: 6
    }, scene);
    spike.material = spikeMat;
    spike.position.copyFromFloats(sp.x, sp.y, sp.z);
    spike.rotation.x = sp.rx;
    spike.rotation.z = sp.rz;
    spike.parent = group;
    if (shadowGen) shadowGen.addShadowCaster(spike);
  }

  // Red blinking light on top
  var lightMat = imat(0xff0000, 0xff0000, 1.0);
  var lightMesh = BABYLON.MeshBuilder.CreateSphere('tl' + (++_itn), { diameter: 0.4, segments: 8 }, scene);
  lightMesh.material = lightMat;
  lightMesh.position.y = 1.5;
  lightMesh.parent = group;
  group.metadata = { light: lightMesh };

  group.position.copyFromFloats(x, y, z);
  trapMeshes.push(group);
}

// Fire a homing projectile
function addProjectile(sc, x, y, z, ang, owner) {
  var projectile = {
    x: x,
    y: y + 1.5,
    z: z,
    ang: ang,
    spd: 4,
    life: 180,
    owner: owner
  };
  projectiles.push(projectile);

  var group = new BABYLON.TransformNode('proj' + (++_itn), scene);

  // Main body - red sphere
  var bodyMat = imat(0xff0000, 0x880000, 0.8);
  var body = BABYLON.MeshBuilder.CreateSphere('pb' + (++_itn), { diameter: 1.2, segments: 8 }, scene);
  body.material = bodyMat;
  body.parent = group;
  if (shadowGen) shadowGen.addShadowCaster(body);

  // Fire trail
  var trailMat = imat(0xff6600, 0xff6600, 1.0, 0.7);
  var trail = BABYLON.MeshBuilder.CreateBox('pt' + (++_itn), { width: 0.4, height: 0.4, depth: 1.2 }, scene);
  trail.material = trailMat;
  trail.position.z = -0.8;
  trail.parent = group;

  group.position.copyFromFloats(projectile.x, projectile.y, projectile.z);
  group.rotation.y = ang;
  projMeshes.push(group);
}

// Update item boxes each frame
function updateItemBoxes(dt) {
  var timeScale = (dt || 0.016) * 60;
  for (var i = 0; i < itemBoxes.length; i++) {
    var box = itemBoxes[i];
    var mesh = itemBoxMeshes[i];

    if (!box.active) {
      box.respawn -= timeScale;
      if (box.respawn <= 0) {
        box.active = true;
        mesh.setEnabled(true);
      }
    } else {
      // Spin
      mesh.rotation.y += 0.04 * timeScale;
      mesh.rotation.x = Math.sin(Date.now() * 0.002) * 0.15;

      // Bouncy floating
      var floatOffset = Math.sin(Date.now() * 0.004 + i * 0.5) * 0.5;
      mesh.position.y = box.baseY + floatOffset;

      // Cycle emissive color for rainbow shimmer
      var childMeshes = mesh.getChildMeshes();
      if (childMeshes.length > 0 && childMeshes[0].material && childMeshes[0].material.emissiveColor) {
        var hue = ((Date.now() * 0.001) + i * 0.1) % 1.0;
        hslToCol(hue, 0.8, 0.35, childMeshes[0].material.emissiveColor);
      }
    }
  }
}

// Update projectiles each frame
function updateProjectiles(sc, racers, dt) {
  var timeScale = (dt || 0.016) * 60;
  for (var i = projectiles.length - 1; i >= 0; i--) {
    var proj = projectiles[i];
    var mesh = projMeshes[i];

    // Find nearest enemy racer
    var nearestDist = Infinity;
    var nearestRacer = null;
    for (var r = 0; r < racers.length; r++) {
      if (racers[r] === proj.owner) continue;
      var dx = racers[r].x - proj.x;
      var dz = racers[r].z - proj.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestRacer = racers[r];
      }
    }

    // Steer toward nearest enemy
    if (nearestRacer) {
      var targetAngle = Math.atan2(nearestRacer.z - proj.z, nearestRacer.x - proj.x);
      var angleDiff = targetAngle - proj.ang;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      var maxTurn = 0.06 * timeScale;
      if (angleDiff > maxTurn) proj.ang += maxTurn;
      else if (angleDiff < -maxTurn) proj.ang -= maxTurn;
      else proj.ang += angleDiff;
    }

    // Move
    proj.x += Math.cos(proj.ang) * proj.spd * timeScale;
    proj.z += Math.sin(proj.ang) * proj.spd * timeScale;
    proj.life -= timeScale;

    // Update mesh
    mesh.position.copyFromFloats(proj.x, proj.y, proj.z);
    mesh.rotation.y = proj.ang;

    // Remove if expired
    if (proj.life <= 0) {
      mesh.dispose();
      projectiles.splice(i, 1);
      projMeshes.splice(i, 1);
    }
  }
}

// Update traps each frame
function updateTraps(sc, dt) {
  var timeScale = (dt || 0.016) * 60;
  var frameCount = Date.now() / 16;

  for (var i = traps.length - 1; i >= 0; i--) {
    var trap = traps[i];
    var mesh = trapMeshes[i];

    trap.life -= timeScale;
    mesh.rotation.y += 0.02 * timeScale;

    // Blink the red light
    if (mesh.metadata && mesh.metadata.light) {
      var blinkOn = Math.floor(frameCount / 15) % 2 === 0;
      var lm = mesh.metadata.light;
      if (lm.material && lm.material.emissiveColor) {
        lm.material.emissiveColor = c3(0xff0000).scale(blinkOn ? 1.0 : 0.2);
      }
    }

    // Remove if expired
    if (trap.life <= 0) {
      mesh.dispose();
      traps.splice(i, 1);
      trapMeshes.splice(i, 1);
    }
  }
}

// Generate energy rings along the track
function generateEnergyRings(sc) {
  energyRings = [];
  energyRingMeshes = [];

  for (var i = 3; i < TRACK_POINTS; i += 5) {
    var trackPoint = getTrackPoint(i);
    var trackAngle = getTrackAngle(i);
    var perpAngle = trackAngle + Math.PI / 2;

    var side = i % 3;
    var lateralOffset = (side - 1) * 6;

    var ring = {
      x: trackPoint.x + Math.cos(perpAngle) * lateralOffset,
      y: trackPoint.y + 2.0,
      z: trackPoint.z + Math.sin(perpAngle) * lateralOffset,
      active: true,
      respawn: 0
    };
    energyRings.push(ring);

    // Create diamond/crystal mesh
    var group = new BABYLON.TransformNode('ering' + (++_itn), scene);

    var ringMat = imat(0x00ddff, 0x0088cc, 0.6, 0.85);

    // Diamond shape: top cone + inverted bottom cone
    var topMesh = BABYLON.MeshBuilder.CreateCylinder('ert' + (++_itn), {
      diameterTop: 0, diameterBottom: 1.2, height: 0.8, tessellation: 6
    }, scene);
    topMesh.material = ringMat;
    topMesh.position.y = 0.2;
    topMesh.parent = group;

    var botMesh = BABYLON.MeshBuilder.CreateCylinder('erb' + (++_itn), {
      diameterTop: 1.2, diameterBottom: 0, height: 0.4, tessellation: 6
    }, scene);
    botMesh.material = ringMat;
    botMesh.position.y = -0.2;
    botMesh.parent = group;

    // Inner glow sphere
    var glowMat = imatUnlit(0x88ffff, 0.4);
    var glowMesh = BABYLON.MeshBuilder.CreateSphere('erg' + (++_itn), { diameter: 0.6, segments: 8 }, scene);
    glowMesh.material = glowMat;
    glowMesh.parent = group;

    group.position.copyFromFloats(ring.x, ring.y, ring.z);
    energyRingMeshes.push(group);
  }
}

// Update energy rings each frame
function updateEnergyRings(dt) {
  var timeScale = (dt || 0.016) * 60;
  for (var i = 0; i < energyRings.length; i++) {
    var ring = energyRings[i];
    var mesh = energyRingMeshes[i];

    if (!ring.active) {
      ring.respawn -= timeScale;
      if (ring.respawn <= 0) {
        ring.active = true;
        mesh.setEnabled(true);
      }
    } else {
      // Spin and float
      mesh.rotation.y += 0.05 * timeScale;
      var floatOffset = Math.sin(Date.now() * 0.003 + i * 0.7) * 0.3;
      mesh.position.y = ring.y + floatOffset;

      // Pulse glow
      var pulse = 0.5 + Math.sin(Date.now() * 0.005 + i) * 0.2;
      var childMeshes = mesh.getChildMeshes();
      if (childMeshes.length > 0 && childMeshes[0].material && childMeshes[0].material.emissiveColor) {
        childMeshes[0].material.emissiveColor = c3(0x0088cc).scale(pulse);
      }
    }
  }
}

// ============================================================================
// BOOST PADS - Speed boost panels on the track
// ============================================================================
var boostPads = [];
var boostPadMeshes = [];

function generateBoostPads(sc) {
  boostPads = [];
  boostPadMeshes = [];

  var padPositions = [15, 40, 65, 88];

  for (var p = 0; p < padPositions.length; p++) {
    var idx = padPositions[p];
    var trackPoint = getTrackPoint(idx);
    var trackAngle = getTrackAngle(idx);

    var pad = {
      x: trackPoint.x,
      y: trackPoint.y + 0.05,
      z: trackPoint.z,
      ang: trackAngle,
      active: true
    };
    boostPads.push(pad);

    var group = new BABYLON.TransformNode('bpad' + (++_itn), scene);

    // Base plate
    var plateMat = imat(0xFF6600, 0xFF4400, 0.5, 0.85);
    var plate = BABYLON.MeshBuilder.CreateBox('bp' + (++_itn), { width: 6, height: 0.15, depth: 8 }, scene);
    plate.material = plateMat;
    plate.parent = group;

    // Arrow chevrons
    var arrowMat = imat(0xFFDD00, 0xFFAA00, 0.8);
    for (var a = 0; a < 3; a++) {
      var leftChev = BABYLON.MeshBuilder.CreateBox('bc' + (++_itn), { width: 2.0, height: 0.2, depth: 0.3 }, scene);
      leftChev.material = arrowMat;
      leftChev.position.copyFromFloats(-0.8, 0.1, -2 + a * 2.5);
      leftChev.rotation.y = 0.4;
      leftChev.parent = group;

      var rightChev = BABYLON.MeshBuilder.CreateBox('bc' + (++_itn), { width: 2.0, height: 0.2, depth: 0.3 }, scene);
      rightChev.material = arrowMat;
      rightChev.position.copyFromFloats(0.8, 0.1, -2 + a * 2.5);
      rightChev.rotation.y = -0.4;
      rightChev.parent = group;
    }

    // Side glow strips
    var stripMat = imat(0xFF8800, 0xFF6600, 0.6);
    var stripL = BABYLON.MeshBuilder.CreateBox('bs' + (++_itn), { width: 0.3, height: 0.2, depth: 8 }, scene);
    stripL.material = stripMat;
    stripL.position.x = -3;
    stripL.parent = group;
    var stripR = BABYLON.MeshBuilder.CreateBox('bs' + (++_itn), { width: 0.3, height: 0.2, depth: 8 }, scene);
    stripR.material = stripMat;
    stripR.position.x = 3;
    stripR.parent = group;

    group.position.copyFromFloats(pad.x, pad.y, pad.z);
    group.rotation.y = -trackAngle - Math.PI / 2;
    boostPadMeshes.push(group);
  }
}

function updateBoostPads(dt) {
  var time = Date.now() * 0.003;
  for (var i = 0; i < boostPadMeshes.length; i++) {
    var mesh = boostPadMeshes[i];
    var childMeshes = mesh.getChildMeshes();

    // Pulse the base plate glow
    if (childMeshes.length > 0 && childMeshes[0].material && childMeshes[0].material.emissiveColor) {
      childMeshes[0].material.emissiveColor = c3(0xFF4400).scale(0.4 + Math.sin(time + i) * 0.2);
    }

    // Animate arrows
    for (var c = 1; c < childMeshes.length - 2; c++) {
      var child = childMeshes[c];
      if (child.material && child.material.emissiveColor) {
        var phase = (time * 2 + c * 0.5) % 2;
        var emInt = phase < 1 ? 0.5 + phase * 0.5 : 1.5 - phase * 0.5;
        child.material.emissiveColor = c3(0xFFAA00).scale(emInt);
      }
    }
  }
}
