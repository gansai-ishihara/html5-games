// kart.js - Racer/Kart module for drift racing game
// Uses Three.js r128 (globally loaded)

var racers = [];
var player = null;

// GLB Model loading system
var glbModelCache = {};  // bodyType -> THREE.Group (template)
var glbModelsLoaded = false;
var glbLoader = null;

// Combined character+kart model cache
var kartModelCache = {};  // bodyType -> THREE.Group (template)
var kartModelsLoaded = false;

// Environment model cache
var envModelCache = {};  // envType -> THREE.Group (template)
var envModelsLoaded = false;

function initGLBLoader() {
  if (!glbLoader && THREE.GLTFLoader) {
    glbLoader = new THREE.GLTFLoader();
  }
}

// Preload all character GLB models
function preloadModels(callback) {
  initGLBLoader();
  if (!glbLoader) {
    console.warn('GLTFLoader not available, using procedural meshes');
    glbModelsLoaded = true;
    if (callback) callback();
    return;
  }

  var bodyTypes = Object.keys(MODEL_FILES);
  var loaded = 0;
  var total = bodyTypes.length;

  bodyTypes.forEach(function (bodyType) {
    var url = MODEL_FILES[bodyType];
    glbLoader.load(url,
      function (gltf) {
        var model = gltf.scene;
        // Compute bounding box to normalize size
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        box.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        // Target: character model roughly 1.1 units tall (compact above kart)
        var targetSize = 1.1;
        var scale = targetSize / maxDim;
        model.scale.set(scale, scale, scale);

        // Center the model
        var center = new THREE.Vector3();
        box.getCenter(center);
        model.position.set(
          -center.x * scale,
          -box.min.y * scale, // sit on ground
          -center.z * scale
        );

        // シャドウ有効化 + PBR調整でファンタジー風に
        model.traverse(function (child) {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            for (var mi = 0; mi < mats.length; mi++) {
              var mat = mats[mi];
              if (!mat) continue;
              if (mat.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.55; }
              if (mat.color) {
                var hsl = {};
                mat.color.getHSL(hsl);
                if (hsl.l > 0.01) {
                  mat.color.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.2 + 0.05), Math.min(0.8, hsl.l * 1.15 + 0.1));
                }
              }
              if (mat.emissive !== undefined && mat.color) {
                var hsl2 = {};
                mat.color.getHSL(hsl2);
                mat.emissive.setHSL(hsl2.h, Math.min(1.0, hsl2.s * 0.4), 0.1);
                mat.emissiveIntensity = 0.2;
              }
            }
          }
        });

        glbModelCache[bodyType] = model;
        loaded++;
        console.log('Loaded model: ' + bodyType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          glbModelsLoaded = true;
          console.log('All GLB models loaded!');
          if (callback) callback();
        }
      },
      undefined,
      function (err) {
        console.warn('Failed to load model ' + bodyType + ': ' + err.message);
        loaded++;
        if (loaded === total) {
          glbModelsLoaded = true;
          if (callback) callback();
        }
      }
    );
  });
}

// Preload all combined character+kart GLB models
function preloadKartModels(callback) {
  initGLBLoader();
  if (!glbLoader || typeof KART_MODEL_FILES === 'undefined') {
    kartModelsLoaded = true;
    if (callback) callback();
    return;
  }

  var bodyTypes = Object.keys(KART_MODEL_FILES);
  var loaded = 0;
  var total = bodyTypes.length;

  bodyTypes.forEach(function (bodyType) {
    var url = KART_MODEL_FILES[bodyType];
    glbLoader.load(url,
      function (gltf) {
        var model = gltf.scene;
        // Compute bounding box to normalize size
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        box.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        // Target: combined kart+character roughly 2.2 units tall
        var targetSize = 2.2;
        var scale = targetSize / maxDim;
        model.scale.set(scale, scale, scale);

        // Center horizontally, sit on ground
        var center = new THREE.Vector3();
        box.getCenter(center);
        model.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale
        );

        // Auto-detect inverted models from Trellis
        var scaledBox = new THREE.Box3().setFromObject(model);
        if (scaledBox.max.y <= 0.001 && scaledBox.min.y < -0.1) {
          model.rotation.x = Math.PI;
          console.log('Flipped inverted kart model: ' + bodyType);
        }

        // PBR adjustments for vibrant fantasy look
        model.traverse(function (child) {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            for (var mi = 0; mi < mats.length; mi++) {
              var mat = mats[mi];
              if (!mat) continue;
              if (mat.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.5; }
              if (mat.color) {
                var hsl = {};
                mat.color.getHSL(hsl);
                if (hsl.l > 0.01) {
                  mat.color.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.2 + 0.05), Math.min(0.8, hsl.l * 1.15 + 0.1));
                }
              }
              if (mat.emissive !== undefined && mat.color) {
                var hsl2 = {};
                mat.color.getHSL(hsl2);
                mat.emissive.setHSL(hsl2.h, Math.min(1.0, hsl2.s * 0.4), 0.1);
                mat.emissiveIntensity = 0.2;
              }
            }
          }
        });

        kartModelCache[bodyType] = model;
        loaded++;
        console.log('Loaded kart model: ' + bodyType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          kartModelsLoaded = true;
          console.log('All kart GLB models loaded!');
          if (callback) callback();
        }
      },
      undefined,
      function (err) {
        console.warn('Failed to load kart model ' + bodyType + ': ' + err.message);
        loaded++;
        if (loaded === total) {
          kartModelsLoaded = true;
          if (callback) callback();
        }
      }
    );
  });
}

// Preload all environment GLB models
function preloadEnvModels(callback) {
  initGLBLoader();
  if (!glbLoader) {
    console.warn('GLTFLoader not available for env models');
    envModelsLoaded = true;
    if (callback) callback();
    return;
  }

  var envTypes = Object.keys(ENV_MODEL_FILES);
  var loaded = 0;
  var total = envTypes.length;

  envTypes.forEach(function (envType) {
    var url = ENV_MODEL_FILES[envType];
    glbLoader.load(url,
      function (gltf) {
        var model = gltf.scene;
        // マテリアルのPBRプロパティを調整 → ファンタジー風の明るく鮮やかな見た目に
        model.traverse(function (child) {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            var mats = Array.isArray(child.material) ? child.material : [child.material];
            for (var mi = 0; mi < mats.length; mi++) {
              var mat = mats[mi];
              if (!mat) continue;
              // PBR調整: メタリック感を消して明るくする (StandardMaterialのみ)
              if (mat.isMeshStandardMaterial) { mat.metalness = 0; mat.roughness = 0.6; }
              // 色の彩度・明度を上げる
              if (mat.color) {
                var hsl = {};
                mat.color.getHSL(hsl);
                if (hsl.l > 0.01) { // 黒でなければ調整
                  mat.color.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.3 + 0.1), Math.min(0.85, hsl.l * 1.2 + 0.15));
                }
              }
              // ほんのり発光
              if (mat.emissive !== undefined && mat.color) {
                var hsl2 = {};
                mat.color.getHSL(hsl2);
                // Shift emissive towards blue for Crystal Kingdom theme
                var eHue = hsl2.h * 0.7 + 0.6 * 0.3; // blend towards blue (0.6)
                mat.emissive.setHSL(eHue, Math.min(1.0, hsl2.s * 0.45), 0.12);
                mat.emissiveIntensity = 0.25;
              }
            }
          }
        });
        // Auto-detect inverted models from Trellis
        var autoBox = new THREE.Box3().setFromObject(model);
        var belowOrigin = Math.abs(autoBox.min.y);
        var aboveOrigin = Math.max(autoBox.max.y, 0.001);
        var needsFlip = false;
        // If model extends much more below origin than above, it's inverted
        if (belowOrigin > aboveOrigin * 2) {
          needsFlip = true;
        }
        // All geometry at or below origin = definitely inverted
        if (autoBox.max.y <= 0.001 && autoBox.min.y < -0.1) {
          needsFlip = true;
        }
        // Manual override from ENV_MODEL_FLIP_Y
        if (typeof ENV_MODEL_FLIP_Y !== 'undefined' && ENV_MODEL_FLIP_Y[envType] !== undefined) {
          needsFlip = ENV_MODEL_FLIP_Y[envType];
        }
        if (needsFlip) {
          model.rotation.x = Math.PI;
          console.log('Flipped inverted model: ' + envType);
        }
        envModelCache[envType] = model;
        loaded++;
        console.log('Loaded env model: ' + envType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          envModelsLoaded = true;
          console.log('All environment GLB models loaded!');
          if (callback) callback();
        }
      },
      undefined,
      function (err) {
        console.warn('Failed to load env model ' + envType + ': ' + err.message);
        loaded++;
        if (loaded === total) {
          envModelsLoaded = true;
          if (callback) callback();
        }
      }
    );
  });
}

// Clone and place an environment model at given position, scale, rotation
function placeEnvModel(scene, envType, x, y, z, scale, rotY) {
  var template = envModelCache[envType];
  if (!template) return null;
  var clone = template.clone();

  // Reset position and apply rotY FIRST so bbox includes rotation
  clone.position.set(0, 0, 0);
  if (rotY !== undefined) clone.rotation.y = rotY;

  // Compute bounding box at origin (includes rotation)
  var box = new THREE.Box3().setFromObject(clone);
  var size = new THREE.Vector3();
  box.getSize(size);
  var maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) maxDim = 1;

  // Apply normalized scale (target size in world units)
  var s = (typeof scale === 'number') ? scale : 1;
  var normalizedScale = s / maxDim;
  clone.scale.set(normalizedScale, normalizedScale, normalizedScale);

  // Recompute box after scaling (still at origin)
  box.setFromObject(clone);
  var center = new THREE.Vector3();
  box.getCenter(center);

  // Place: center horizontally at (x, z), bottom at y
  clone.position.set(x - center.x, y - box.min.y, z - center.z);

  scene.add(clone);
  trackMeshes.push(clone);
  return clone;
}

function Racer(charIdx, isPlayer, kartIdx, equipType) {
  this.charIdx = charIdx;
  this.char = CHARACTERS[charIdx];
  this.isPlayer = isPlayer;

  // Kart bonuses
  var kart = KARTS[kartIdx || 0];
  this.kartIdx = kartIdx || 0;

  // Position and movement
  this.x = 0;
  this.y = 0;
  this.z = 0;
  this.ang = 0;
  this.spd = 0;

  // Performance stats with kart bonuses
  this.maxSpd = 0.9 + this.char.s * 0.09 + (kart.sBonus || 0);
  this.accel = 0.007 + this.char.a * 0.0012 + (kart.aBonus || 0);
  this.handling = 0.018 + this.char.h * 0.002 + (kart.hBonus || 0);

  // Race tracking
  this.lap = 0;
  this.totalIdx = 0;
  this.progress = 0;
  this.progressAccum = 0; // cumulative forward progress (handles start-line wraparound)
  this.lastCP = 0;
  this.crossedStartOnce = false; // Prevents false lap on first start-line crossing

  // Items and state
  this.item = null;
  this.drifting = false;
  this.driftCharge = 0;
  this.boostTimer = 0;
  this.shieldTimer = 0;
  this.stunTimer = 0;

  // Energy rings (speed boost collectible)
  this.rings = 0;

  // Skill system
  this.skillCooldown = 0;
  this.skillReady = true;
  this.skillActive = false;
  this.skillTimer = 0;

  // Equipment
  this.equip = equipType || 'nitro';
  this.autoShieldReady = (this.equip === 'auto_shield');
  this.autoShieldTimer = 0;

  // Race completion
  this.finished = false;
  this.finTime = 0;

  // Visual
  this.tilt = 0;
  this.driftSpark = 0;
  this.mesh = null;
  this.bodyMesh = null;
  this.headMesh = null;
  this.wheelMeshes = [];

  // AI properties
  if (!isPlayer) {
    this.aiTargetIdx = 0;
    this.aiInner = Math.random() > 0.5;
    this.aiSkill = 0.75 + Math.random() * 0.23; // 0.75~0.98 (higher baseline)
    this.aiLateral = (Math.random() - 0.5) * 8; // lane offset for variety
    this.aiDrifting = false;
    this.aiDriftCharge = 0;
    this.aiItemDelay = 0; // cooldown between item uses
  }
}

Racer.prototype.placeAt = function (idx) {
  var pt = getTrackPoint(idx);
  this.x = pt.x;
  this.y = pt.y;
  this.z = pt.z;
  this.ang = getTrackAngle(idx);
  this.totalIdx = idx;
  this.aiTargetIdx = (idx + 3) % TRACK_POINTS;
  // Initialize progress relative to start line (node 0)
  // Racers behind the line (e.g. node 95-99) get negative progress
  this.progressAccum = (idx > TRACK_POINTS / 2) ? idx - TRACK_POINTS : idx;
  this.progress = this.progressAccum;
};

Racer.prototype.createMesh = function (scene) {
  this.mesh = new THREE.Group();

  var char = this.char;
  var mainColor = char.col;
  var helmetColor = char.hc;
  var darkColor = char.bc;
  var skinColor = char.skin || 0xFFDBAC;
  var bodyType = char.body || 'dragon';

  // === CHECK FOR COMBINED KART MODEL (character+kart in one GLB) ===
  var hasKartModel = kartModelCache[bodyType] !== undefined;
  if (hasKartModel) {
    var kartClone = kartModelCache[bodyType].clone();
    kartClone.rotation.y = Math.PI; // Face forward (nose at -Z)
    this.mesh.add(kartClone);
    this.kartGLB = kartClone;
    this.bodyMesh = kartClone;
    this.wheelMeshes = [];
    this.steeringWheel = null;
    this.driverGroup = kartClone;

    scene.add(this.mesh);
    this.updateMesh();
    return;
  }

  // === FALLBACK: Procedural kart + separate character model ===

  // Materials
  var bodyMat = new THREE.MeshStandardMaterial({
    color: mainColor, metalness: 0.55, roughness: 0.18
  });
  var darkMat = new THREE.MeshStandardMaterial({
    color: 0x222228, metalness: 0.5, roughness: 0.25
  });
  var chromeMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee, metalness: 0.9, roughness: 0.08
  });
  var accentMat = new THREE.MeshStandardMaterial({
    color: darkColor, metalness: 0.5, roughness: 0.2
  });

  var bodyGroup = new THREE.Group();

  // === MAIN BODY - shape varies by kart style ===
  var kartStyle = KARTS[this.kartIdx] ? KARTS[this.kartIdx].style : 'medium';

  // Style-specific dimensions - dramatically different silhouettes
  var baseW, baseD, shellW, shellH, shellD, noseLen, spoilerW;
  if (kartStyle === 'long') {
    // Stardust: sleek F1-style, very long nose, narrow body
    baseW = 1.1; baseD = 3.2; shellW = 0.9; shellH = 0.25; shellD = 2.5; noseLen = 1.8; spoilerW = 1.0;
  } else if (kartStyle === 'wide') {
    // Titan: chunky tank-like, wide body, short nose, high shell
    baseW = 1.9; baseD = 2.2; shellW = 1.7; shellH = 0.40; shellD = 1.8; noseLen = 0.8; spoilerW = 1.8;
  } else {
    // Thunderbolt: balanced sporty, medium proportions
    baseW = 1.5; baseD = 2.5; shellW = 1.3; shellH = 0.30; shellD = 2.1; noseLen = 1.25; spoilerW = 1.4;
  }

  // Lower chassis - tapered (wider at rear)
  var chassisGeo = new THREE.BufferGeometry();
  var cw = baseW * 0.5, cd = baseD * 0.5, ch = 0.12;
  var cwf = cw * 0.75; // front is narrower
  var chassisVerts = [
    // Top face
    -cwf, ch, -cd, cwf, ch, -cd, cw, ch, cd, -cw, ch, cd,
    // Bottom face
    -cwf, -ch, -cd, cwf, -ch, -cd, cw, -ch, cd, -cw, -ch, cd
  ];
  var chassisIdx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4];
  chassisGeo.setAttribute('position', new THREE.Float32BufferAttribute(chassisVerts, 3));
  chassisGeo.setIndex(chassisIdx);
  chassisGeo.computeVertexNormals();
  var chassis = new THREE.Mesh(chassisGeo, darkMat);
  chassis.position.y = 0.14;
  chassis.castShadow = true;
  bodyGroup.add(chassis);

  // Upper body shell
  var shell = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bodyMat);
  shell.position.set(0, 0.30, -0.05);
  shell.scale.set(shellW * 0.52, shellH * 0.6, shellD * 0.48);
  shell.castShadow = true;
  bodyGroup.add(shell);

  // Front nose - elongated aerodynamic shape
  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), bodyMat);
  nose.position.set(0, 0.25, -noseLen);
  nose.scale.set(baseW * 0.55, 0.35, 0.8);
  nose.castShadow = true;
  bodyGroup.add(nose);

  // Front splitter (chin)
  var splitter = new THREE.Mesh(new THREE.BoxGeometry(baseW * 0.9, 0.04, 0.35), darkMat);
  splitter.position.set(0, 0.06, -noseLen - 0.1);
  bodyGroup.add(splitter);

  // Chrome bumper
  var bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, baseW * 0.85, 8), chromeMat);
  bumper.position.set(0, 0.12, -noseLen - 0.15);
  bumper.rotation.z = Math.PI / 2;
  bodyGroup.add(bumper);

  // Side pods / skirts - sculpted with spheres
  for (var s = -1; s <= 1; s += 2) {
    var pod = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), accentMat);
    pod.position.set(s * (baseW * 0.42), 0.20, 0.15);
    pod.scale.set(0.5, 0.42, 2.2);
    pod.castShadow = true;
    bodyGroup.add(pod);
  }

  // Side air intakes
  var intakeMat = new THREE.MeshLambertMaterial({ color: 0x111115 });
  for (var s = -1; s <= 1; s += 2) {
    var intake = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.45), intakeMat);
    intake.position.set(s * (shellW * 0.52), 0.22, -0.4);
    bodyGroup.add(intake);
  }

  // Engine cowl (rear) - kept low so character is visible from behind
  var cowl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), accentMat);
  cowl.position.set(0, 0.24, 0.9);
  cowl.scale.set(1.15, 0.35, 0.85);
  cowl.castShadow = true;
  bodyGroup.add(cowl);

  // Wheel arches / fenders
  var fenderMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  var fenderPositions = [
    { x: -0.72, z: -0.85, front: true }, { x: 0.72, z: -0.85, front: true },
    { x: -0.72, z: 0.9, front: false }, { x: 0.72, z: 0.9, front: false }
  ];
  for (var fi = 0; fi < fenderPositions.length; fi++) {
    var fp = fenderPositions[fi];
    var fr = fp.front ? 0.32 : 0.37;
    var fender = new THREE.Mesh(
      new THREE.TorusGeometry(fr, 0.06, 6, 12, Math.PI),
      fenderMat
    );
    fender.position.set(fp.x, 0.22, fp.z);
    fender.rotation.y = Math.PI / 2;
    fender.rotation.x = -Math.PI / 2;
    bodyGroup.add(fender);
  }

  // Spoiler - style-specific
  var spoilerMat = new THREE.MeshLambertMaterial({ color: mainColor });
  var spoilerH = kartStyle === 'wide' ? 0.65 : 0.58;
  var spoiler = new THREE.Mesh(new THREE.BoxGeometry(spoilerW, 0.06, 0.25), spoilerMat);
  spoiler.position.set(0, spoilerH, 1.15);
  spoiler.rotation.x = -0.18;
  bodyGroup.add(spoiler);
  // Spoiler end plates
  var epMat = new THREE.MeshLambertMaterial({ color: mainColor });
  var epW = spoilerW * 0.48;
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.28), epMat).translateX(-epW).translateY(spoilerH - 0.02).translateZ(1.15));
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.28), epMat).translateX(epW).translateY(spoilerH - 0.02).translateZ(1.15));
  // Spoiler supports (chrome)
  var sGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6);
  bodyGroup.add(new THREE.Mesh(sGeom, chromeMat).translateX(-epW * 0.7).translateY(spoilerH - 0.2).translateZ(1.05));
  bodyGroup.add(new THREE.Mesh(sGeom, chromeMat).translateX(epW * 0.7).translateY(spoilerH - 0.2).translateZ(1.05));

  // Exhaust pipes (chrome)
  var exhMat = new THREE.MeshStandardMaterial({ color: 0xBBBBBB, metalness: 0.7, roughness: 0.2 });
  var exhGeom = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 8);
  var lExh = new THREE.Mesh(exhGeom, exhMat);
  lExh.position.set(-0.3, 0.14, 1.4); lExh.rotation.x = Math.PI / 2.3;
  bodyGroup.add(lExh);
  var rExh = new THREE.Mesh(exhGeom, exhMat);
  rExh.position.set(0.3, 0.14, 1.4); rExh.rotation.x = Math.PI / 2.3;
  bodyGroup.add(rExh);
  // Exhaust tips (glowing orange inside)
  var exhTipMat = new THREE.MeshLambertMaterial({ color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.4 });
  var exhTipGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8);
  bodyGroup.add(new THREE.Mesh(exhTipGeo, exhTipMat).translateX(-0.3).translateY(0.12).translateZ(1.55).rotateX(Math.PI / 2.3));
  bodyGroup.add(new THREE.Mesh(exhTipGeo, exhTipMat).translateX(0.3).translateY(0.12).translateZ(1.55).rotateX(Math.PI / 2.3));

  // Headlights - larger, LED-style
  var hlMat = new THREE.MeshLambertMaterial({
    color: 0xffffdd, emissive: 0xffffaa, emissiveIntensity: 0.6
  });
  var hlGeo = new THREE.SphereGeometry(0.09, 8, 8);
  bodyGroup.add(new THREE.Mesh(hlGeo, hlMat).translateX(-0.38).translateY(0.18).translateZ(-noseLen - 0.05));
  bodyGroup.add(new THREE.Mesh(hlGeo, hlMat).translateX(0.38).translateY(0.18).translateZ(-noseLen - 0.05));
  // Headlight housing
  var hlHouseMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  var hlHouseGeo = new THREE.SphereGeometry(0.12, 8, 8);
  hlHouseGeo.scale(1, 1, 0.5);
  bodyGroup.add(new THREE.Mesh(hlHouseGeo, hlHouseMat).translateX(-0.38).translateY(0.18).translateZ(-noseLen + 0.01));
  bodyGroup.add(new THREE.Mesh(hlHouseGeo, hlHouseMat).translateX(0.38).translateY(0.18).translateZ(-noseLen + 0.01));

  // Tail lights - LED strip style
  var tlMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.5 });
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.03), tlMat).translateX(-0.42).translateY(0.22).translateZ(1.25));
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.03), tlMat).translateX(0.42).translateY(0.22).translateZ(1.25));
  // Center brake light
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.03), tlMat).translateY(spoilerH - 0.12).translateZ(1.22));

  // === CHARACTER-SPECIFIC DECORATIONS based on body type (low kart style) ===
  if (bodyType === 'dragon') {
    var flameMat = new THREE.MeshLambertMaterial({
      color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.5, side: THREE.DoubleSide
    });
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.18), flameMat).translateX(-0.67).translateY(0.22).translateZ(-0.2).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.18), flameMat).translateX(0.67).translateY(0.22).translateZ(-0.2).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), flameMat).translateY(0.28).translateZ(-1.5).rotateX(Math.PI / 2));
  } else if (bodyType === 'mermaid') {
    var finMat = new THREE.MeshLambertMaterial({ color: mainColor });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.6), finMat).translateY(0.35).translateZ(0.3));
    var ventMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 0.4), ventMat).translateX(-0.66).translateY(0.24).translateZ(-0.5));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 0.4), ventMat).translateX(0.66).translateY(0.24).translateZ(-0.5));
  } else if (bodyType === 'golem') {
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x44DD44, emissive: 0x22AA22, emissiveIntensity: 0.3 });
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), leafMat);
    leaf.position.set(0, 0.30, -0.6); leaf.scale.set(1, 0.3, 1.5);
    bodyGroup.add(leaf);
    var vineMat = new THREE.MeshLambertMaterial({ color: 0x33AA33 });
    var vine = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 4, 12, Math.PI), vineMat);
    vine.position.set(-0.7, 0.20, 0); vine.rotation.y = Math.PI / 2;
    bodyGroup.add(vine);
  } else if (bodyType === 'phantom') {
    var wingMat = new THREE.MeshLambertMaterial({ color: 0x6633AA });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), wingMat).translateX(-0.85).translateY(0.35).translateZ(0.9).rotateZ(0.4));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), wingMat).translateX(0.85).translateY(0.35).translateZ(0.9).rotateZ(-0.4));
    var glowMat = new THREE.MeshLambertMaterial({ color: 0xBB77FF, emissive: 0x8844CC, emissiveIntensity: 0.8 });
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat).translateX(-0.5).translateY(0.18).translateZ(-1.3));
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat).translateX(0.5).translateY(0.18).translateZ(-1.3));
  } else if (bodyType === 'angel') {
    var starMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.6 });
    var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), starMat);
    star.position.set(0, 0.30, -0.7); star.scale.set(1.2, 0.4, 1.2);
    bodyGroup.add(star);
    var rayMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 1.2), rayMat).translateX(-0.67).translateY(0.26).translateZ(-0.1));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 1.2), rayMat).translateX(0.67).translateY(0.26).translateZ(-0.1));
  } else if (bodyType === 'robot') {
    var antMat = new THREE.MeshLambertMaterial({ color: 0x44DDDD, emissive: 0x00AAAA, emissiveIntensity: 0.5 });
    bodyGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.4, 4), antMat).translateY(0.50).translateZ(0.5));
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), antMat).translateY(0.70).translateZ(0.5));
    var circMat = new THREE.MeshLambertMaterial({ color: 0x00FFFF, emissive: 0x00CCCC, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), circMat).translateX(-0.67).translateY(0.22).translateZ(0).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), circMat).translateX(0.67).translateY(0.22).translateZ(0).rotateY(Math.PI / 2));
  } else if (bodyType === 'ninja') {
    var shurikenMat = new THREE.MeshLambertMaterial({ color: 0xFFAACC, emissive: 0xFF77AA, emissiveIntensity: 0.4 });
    var shuriken = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), shurikenMat);
    shuriken.position.set(0, 0.30, -0.8); shuriken.scale.set(1.5, 0.3, 1.5);
    bodyGroup.add(shuriken);
    var petalMat = new THREE.MeshLambertMaterial({ color: 0xFF88BB, emissive: 0xFF5599, emissiveIntensity: 0.2 });
    for (var p = 0; p < 3; p++) {
      bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), petalMat).translateX(-0.68).translateY(0.22).translateZ(-0.5 + p * 0.4));
      bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), petalMat).translateX(0.68).translateY(0.22).translateZ(-0.5 + p * 0.4));
    }
  } else if (bodyType === 'king') {
    var crownMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
    var crown = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 4, 8), crownMat);
    crown.position.set(0, 0.30, -0.6); crown.rotation.x = Math.PI / 2;
    bodyGroup.add(crown);
    var goldMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 1.6), goldMat).translateX(-0.68).translateY(0.26).translateZ(0));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 1.6), goldMat).translateX(0.68).translateY(0.26).translateZ(0));
  }

  this.bodyMesh = bodyGroup;
  bodyGroup.scale.set(0.50, 0.18, 0.50); // Ultra-flat go-kart platform
  bodyGroup.position.y = -0.30; // Push kart body way down
  this.mesh.add(bodyGroup);

  // === DRIVER (full body above kart, Mario Kart style) ===
  var driverGroup = new THREE.Group();
  driverGroup.position.set(0, 0.55, 0.0); // High above kart - full body visible

  // Check if GLB model is available for this character
  var hasGLBModel = glbModelCache[bodyType] !== undefined;

  if (hasGLBModel) {
    // Use GLB model as driver
    var glbClone = glbModelCache[bodyType].clone();
    // Position the GLB model to sit above the kart, full body visible
    glbClone.position.set(0, 0.0, 0);
    glbClone.scale.multiplyScalar(2.2); // Large character - full body clearly visible above kart
    glbClone.rotation.y = Math.PI;
    driverGroup.add(glbClone);
    this.glbDriver = glbClone;
    // Steering wheel for GLB driver
    var swGroupGLB = new THREE.Group();
    swGroupGLB.position.set(0, -0.1, -0.4);
    swGroupGLB.rotation.x = -0.3;
    var swMatGLB = new THREE.MeshLambertMaterial({ color: 0x333333 });
    swGroupGLB.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12), swMatGLB));
    driverGroup.add(swGroupGLB);
    this.steeringWheel = swGroupGLB;
  } else {
    // Fallback: procedural driver mesh
    // Head
    var headMat = new THREE.MeshLambertMaterial({ color: skinColor });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), headMat);
    head.position.y = 0.58;
    head.castShadow = true;
    driverGroup.add(head);
    this.headMesh = head;

    // Helmet
    var helmetMat = new THREE.MeshLambertMaterial({ color: helmetColor });
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), helmetMat);
    helmet.position.y = 0.62;
    helmet.scale.set(1, 0.9, 1);
    driverGroup.add(helmet);

    // Visor
    var visorTint = bodyType === 'phantom' ? 0x220044 : bodyType === 'dragon' ? 0x331100 : 0x111133;
    var visorMat = new THREE.MeshLambertMaterial({
      color: visorTint, transparent: true, opacity: 0.85
    });
    var visor = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, -Math.PI * 0.4, Math.PI * 0.8, 0.3, 0.5), visorMat);
    visor.position.set(0, 0.6, -0.12);
    driverGroup.add(visor);

    // Character-specific helmet decorations
    if (bodyType === 'dragon') {
      var crestMat = new THREE.MeshLambertMaterial({ color: 0xFF2200, emissive: 0xFF4400, emissiveIntensity: 0.4 });
      bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.15, 0.5), crestMat).translateY(0.82 + 0.55).translateZ(0.05 + 0.15));
    } else if (bodyType === 'mermaid') {
      var antMat2 = new THREE.MeshLambertMaterial({ color: 0x66BBFF });
      driverGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.3, 4), antMat2).translateX(0.15).translateY(0.85));
      var tipMat = new THREE.MeshLambertMaterial({ color: 0x00AAFF, emissive: 0x0088FF, emissiveIntensity: 0.6 });
      driverGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), tipMat).translateX(0.15).translateY(1.0));
    } else if (bodyType === 'golem') {
      var gogMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), gogMat).translateX(-0.12).translateY(0.78).translateZ(-0.18).rotateX(0.4));
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), gogMat).translateX(0.12).translateY(0.78).translateZ(-0.18).rotateX(0.4));
    } else if (bodyType === 'phantom') {
      var hornMat = new THREE.MeshLambertMaterial({ color: 0x6633AA });
      driverGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hornMat).translateX(-0.2).translateY(0.82).translateZ(-0.05).rotateZ(0.4));
      driverGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hornMat).translateX(0.2).translateY(0.82).translateZ(-0.05).rotateZ(-0.4));
    } else if (bodyType === 'angel') {
      var haloMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.6 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16), haloMat).translateY(0.95).rotateX(Math.PI / 2));
    } else if (bodyType === 'robot') {
      var ledMat = new THREE.MeshLambertMaterial({ color: 0x00FF00, emissive: 0x00FF00, emissiveIntensity: 1.0 });
      driverGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), ledMat).translateX(-0.1).translateY(0.6).translateZ(-0.28));
      driverGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), ledMat).translateX(0.1).translateY(0.6).translateZ(-0.28));
    } else if (bodyType === 'ninja') {
      var scarfMat = new THREE.MeshLambertMaterial({ color: 0xFF77AA, side: THREE.DoubleSide });
      driverGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), scarfMat).translateY(0.5).translateZ(0.2).rotateX(-0.3));
    } else if (bodyType === 'king') {
      var crMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 4, 8), crMat).translateY(0.78).rotateX(Math.PI / 2));
      var gemMat = new THREE.MeshLambertMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.5 });
      driverGroup.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), gemMat).translateY(0.85).translateZ(-0.15));
    }

    // Torso
    var torsoMat = new THREE.MeshLambertMaterial({ color: mainColor });
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.45, 8), torsoMat);
    torso.position.y = 0.22;
    driverGroup.add(torso);

    // Arms
    var armMat = new THREE.MeshLambertMaterial({ color: mainColor });
    var armGeom = new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6);
    driverGroup.add(new THREE.Mesh(armGeom, armMat).translateX(-0.28).translateY(0.15).translateZ(-0.15).rotateZ(0.5).rotateX(-0.6));
    driverGroup.add(new THREE.Mesh(armGeom, armMat).translateX(0.28).translateY(0.15).translateZ(-0.15).rotateZ(-0.5).rotateX(-0.6));

    // Steering wheel (tracked for animation)
    var swGroup = new THREE.Group();
    swGroup.position.set(0, 0.1, -0.38);
    swGroup.rotation.x = -0.3;
    var swRing = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12), darkMat);
    swGroup.add(swRing);
    // Spokes
    var spokeMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    for (var sp = 0; sp < 3; sp++) {
      var spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 4), spokeMat);
      spoke.rotation.z = sp * Math.PI / 3;
      swGroup.add(spoke);
    }
    driverGroup.add(swGroup);
    this.steeringWheel = swGroup;
  }

  this.mesh.add(driverGroup);
  this.driverGroup = driverGroup;

  // === WHEELS - improved with better rims and detail ===
  this.wheelMeshes = [];
  var wheelPositions = [
    { x: -0.72, z: -0.85 }, { x: 0.72, z: -0.85 },
    { x: -0.72, z: 0.9 }, { x: 0.72, z: 0.9 }
  ];

  for (var i = 0; i < 4; i++) {
    var wheelGroup = new THREE.Group();
    var isFront = i < 2;
    var wR = isFront ? 0.28 : 0.33;
    var wW = isFront ? 0.14 : 0.17;

    // Tire (dark rubber)
    var tireMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    var tire = new THREE.Mesh(new THREE.TorusGeometry(wR, wW, 10, 20), tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim disc (metallic)
    var rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.15 });
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.7, wR * 0.7, wW * 1.3, 14), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    // Rim spokes (5 spoke design)
    var spokeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.2 });
    for (var sp = 0; sp < 5; sp++) {
      var spokeAng = (sp / 5) * Math.PI * 2;
      var spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, wW * 1.1, wR * 0.55), spokeMat);
      spoke.position.set(
        Math.cos(spokeAng) * wR * 0.35,
        0,
        Math.sin(spokeAng) * wR * 0.35
      );
      spoke.rotation.y = spokeAng;
      wheelGroup.add(spoke);
    }

    // Center cap (character color)
    var capMat = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.6, roughness: 0.2 });
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.22, wR * 0.22, wW * 1.6, 10), capMat);
    cap.rotation.z = Math.PI / 2;
    wheelGroup.add(cap);

    wheelGroup.position.set(wheelPositions[i].x, 0.28, wheelPositions[i].z);
    bodyGroup.add(wheelGroup);
    this.wheelMeshes.push(wheelGroup);
  }

  scene.add(this.mesh);

  // Position mesh at racer coordinates immediately (needed for countdown visibility)
  this.updateMesh();
};

Racer.prototype.activateSkill = function (racers) {
  if (!this.skillReady || this.skillActive) return;
  this.skillActive = true;
  this.skillReady = false;
  this.skillTimer = this.char.skillDur;

  var skill = this.char.skill;

  if (skill === 'flame_burst') {
    this.boostTimer = Math.max(this.boostTimer, this.char.skillDur);
    this.spd = Math.max(this.spd, this.maxSpd * 1.5);
  } else if (skill === 'aqua_shield') {
    this.shieldTimer = Math.max(this.shieldTimer, this.char.skillDur);
  } else if (skill === 'quake') {
    // Slow down nearby racers
    for (var r = 0; r < racers.length; r++) {
      var other = racers[r];
      if (other !== this) {
        var dx = this.x - other.x;
        var dz = this.z - other.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 30) {
          other.spd *= 0.5;
          other.stunTimer = Math.max(other.stunTimer, 45);
        }
      }
    }
  } else if (skill === 'shadow_phase') {
    // Phase through walls and racers - handled in update
  } else if (skill === 'solar_boost') {
    // Max speed boost - handled in update
  } else if (skill === 'overclock') {
    // All stats up - handled in update
  } else if (skill === 'sakura_drift') {
    // Drift boost - handled in update
  } else if (skill === 'golden_aura') {
    // Ring magnet + boost conversion - handled in update
  }

  if (SND && SND.boost) SND.boost();
};

Racer.prototype.update = function (input, racers, scene, dt) {
  // Delta time scaling (base 60FPS)
  var timeScale = (dt || 0.016) * 60;

  // Handle finished state - auto-drive along track (like Mario Kart)
  if (this.finished) {
    var autoSpd = this.maxSpd * 0.5;
    if (this.spd < autoSpd) {
      this.spd += this.accel * 0.5 * timeScale;
    } else {
      this.spd *= Math.pow(0.98, timeScale);
    }

    // Use nearest track index to keep waypoint in sync with actual position
    var nearIdx = nearestTrackIndex(this.x, this.z);
    var lookAhead = nearIdx + 5;
    if (lookAhead >= TRACK_POINTS) lookAhead -= TRACK_POINTS;
    this.aiTargetIdx = lookAhead;

    // Steer toward track waypoint
    var targetPt = getTrackPoint(this.aiTargetIdx);
    var dx = targetPt.x - this.x;
    var dz = targetPt.z - this.z;
    var targetAng = Math.atan2(dz, dx);
    var angDiff = targetAng - this.ang;
    while (angDiff > Math.PI) angDiff -= Math.PI * 2;
    while (angDiff < -Math.PI) angDiff += Math.PI * 2;
    var turnRate = this.handling * 1.5 * timeScale; // Faster turning for track following
    if (Math.abs(angDiff) > turnRate) {
      this.ang += turnRate * (angDiff > 0 ? 1 : -1);
    } else {
      this.ang += angDiff;
    }
    this.tilt = angDiff * 0.3;

    // Pull toward track center to prevent drifting off-road
    var nearNode = trackNodes[nearIdx];
    if (nearNode) {
      this.x += (nearNode.x - this.x) * 0.03 * timeScale;
      this.z += (nearNode.z - this.z) * 0.03 * timeScale;
    }

    // Apply movement
    this.x += Math.cos(this.ang) * this.spd * timeScale;
    this.z += Math.sin(this.ang) * this.spd * timeScale;

    // Track Y position
    if (nearNode) {
      this.y += (nearNode.y - this.y) * 0.15 * timeScale;
    }
    this.totalIdx = nearIdx;

    this.updateMesh();
    return;
  }

  // Handle stun
  if (this.stunTimer > 0) {
    this.stunTimer -= timeScale;
    this.spd *= Math.pow(0.92, timeScale);
    this.updateMesh();
    return;
  }

  // Decrement timers
  if (this.boostTimer > 0) this.boostTimer -= timeScale;
  if (this.shieldTimer > 0) this.shieldTimer -= timeScale;
  if (this.driftSpark > 0) this.driftSpark -= timeScale;

  // Skill cooldown
  if (this.skillCooldown > 0) {
    this.skillCooldown -= timeScale;
    if (this.skillCooldown <= 0) {
      this.skillReady = true;
    }
  }

  // Skill active timer
  if (this.skillActive) {
    this.skillTimer -= timeScale;
    if (this.skillTimer <= 0) {
      this.skillActive = false;
      // Start cooldown
      var cd = this.char.skillCD;
      if (this.equip === 'reactor') cd = Math.floor(cd * 0.75);
      this.skillCooldown = cd;
    }
  }

  // Auto-shield recharge
  if (this.equip === 'auto_shield' && !this.autoShieldReady) {
    this.autoShieldTimer += timeScale;
    if (this.autoShieldTimer >= 3600) { // 60 seconds
      this.autoShieldReady = true;
      this.autoShieldTimer = 0;
    }
  }

  // Calculate current max speed with skill effects and ring bonus
  var curMax = this.maxSpd;
  var ringBoost = this.rings * RING_BOOST_PER;
  curMax += ringBoost;
  if (this.boostTimer > 0) curMax *= 1.4;
  if (this.skillActive && this.char.skill === 'solar_boost') curMax *= 1.3;
  if (this.skillActive && this.char.skill === 'overclock') curMax *= 1.15;

  // Effective handling/accel
  var curAccel = this.accel;
  var curHandling = this.handling;
  if (this.skillActive && this.char.skill === 'overclock') {
    curAccel *= 1.3;
    curHandling *= 1.3;
  }

  // Player controls
  if (this.isPlayer && input) {
    // Skill activation
    if (input.skill && this.skillReady && !this.skillActive) {
      this.activateSkill(racers);
      input.skill = false;
    }

    // Acceleration
    if (input.up) {
      if (this.spd < curMax) {
        this.spd += curAccel * timeScale;
        if (this.spd > curMax) this.spd = curMax;
      }
    } else if (input.down) {
      this.spd -= curAccel * 1.5 * timeScale;
      var minSpd = -0.3 * curMax;
      if (this.spd < minSpd) this.spd = minSpd;
    } else {
      this.spd *= Math.pow(0.985, timeScale);
    }

    // Drifting
    var wasDrifting = this.drifting;
    this.drifting = input.drift && this.spd > 0.3;

    // Drift charge with equipment bonus
    var driftChargeRate = 1;
    if (this.equip === 'drift_up') driftChargeRate = 2;
    if (this.skillActive && this.char.skill === 'sakura_drift') driftChargeRate = 4;

    if (this.drifting && (input.left || input.right)) {
      this.driftCharge = Math.min(this.driftCharge + driftChargeRate * timeScale, 120);
    }
    if (wasDrifting && !this.drifting && this.driftCharge > 0) {
      var boostAmount = 0;
      if (this.driftCharge >= 90) {
        boostAmount = 50;
      } else if (this.driftCharge >= 45) {
        boostAmount = 30;
      }
      // Equipment bonus
      if (this.equip === 'nitro') boostAmount = Math.floor(boostAmount * 1.5);
      if (boostAmount > 0) {
        this.boostTimer = Math.max(this.boostTimer, boostAmount);
        if (SND && SND.boost) SND.boost();
      }
      this.driftCharge = 0;
    }
    if (!this.drifting) this.driftCharge = 0;

    // Turning
    var turnRate = curHandling * timeScale; // Scale turn rate by time
    if (this.drifting) turnRate *= 1.6;
    if (this.skillActive && this.char.skill === 'sakura_drift') turnRate *= 1.4;
    turnRate *= Math.min(1, Math.abs(this.spd) / 0.8);

    // Analog stick steering (proportional) or digital
    var steerAmt = 0;
    if (input.stickX && Math.abs(input.stickX) > 0.1) {
      steerAmt = input.stickX;
    } else if (input.left) {
      steerAmt = -1;
    } else if (input.right) {
      steerAmt = 1;
    }

    if (steerAmt !== 0) {
      this.ang += turnRate * steerAmt;
      this.tilt = Math.max(-0.3, Math.min(0.3, this.tilt + 0.02 * steerAmt));
    } else {
      this.tilt *= Math.pow(0.9, timeScale);
    }

    if (this.drifting && Math.floor(fr % 20) === 0) {
      this.driftSpark = 15;
      if (SND && SND.drift) SND.drift();
    }

  } else if (!this.isPlayer) {
    // === IMPROVED AI ===

    // --- Sync waypoint with actual position using nearest track index ---
    var nearIdx = nearestTrackIndex(this.x, this.z);
    // Keep aiTargetIdx ahead of current position (small lookahead at low speed)
    var lookahead = 2 + Math.floor(this.spd * 5);
    this.aiTargetIdx = (nearIdx + lookahead) % TRACK_POINTS;

    var targetPt = getTrackPoint(this.aiTargetIdx);
    var tAng = getTrackAngle(this.aiTargetIdx);
    var perpAng = tAng + Math.PI / 2;
    // Add lateral offset for racing line variety
    var tx = targetPt.x + Math.cos(perpAng) * this.aiLateral;
    var tz = targetPt.z + Math.sin(perpAng) * this.aiLateral;

    var dx = tx - this.x;
    var dz = tz - this.z;
    var targetAng = Math.atan2(dz, dx);

    var angDiff = targetAng - this.ang;
    while (angDiff > Math.PI) angDiff -= Math.PI * 2;
    while (angDiff < -Math.PI) angDiff += Math.PI * 2;

    // --- Track correction: pull AI back toward track center when off-road ---
    var nearNode = trackNodes[nearIdx];
    if (nearNode) {
      var offDx = this.x - nearNode.x;
      var offDz = this.z - nearNode.z;
      var offDist = Math.sqrt(offDx * offDx + offDz * offDz);
      var halfTrack = TRACK_WIDTH * 0.45;
      if (offDist > halfTrack) {
        // Pull back toward track center proportionally to how far off
        var pullStr = Math.min(0.15, (offDist - halfTrack) * 0.01) * timeScale;
        this.x -= offDx * pullStr;
        this.z -= offDz * pullStr;
      }
    }

    // --- AI Drift logic: drift on sharp turns ---
    var absAngDiff = Math.abs(angDiff);
    var wasDriftingAI = this.aiDrifting;

    // Start drifting when turn is sharp and speed is decent
    if (absAngDiff > 0.25 && this.spd > 0.5) {
      this.aiDrifting = true;
    }
    // Stop drifting when turn straightens
    if (absAngDiff < 0.08) {
      this.aiDrifting = false;
    }

    var turnRate = curHandling * 0.9 * timeScale;
    if (this.aiDrifting) turnRate *= 1.5;
    // Minimum turn rate so AI can steer even at low speed (e.g. at race start)
    turnRate *= Math.max(0.3, Math.min(1, Math.abs(this.spd) / 0.8));

    if (absAngDiff > turnRate) {
      this.ang += turnRate * (angDiff > 0 ? 1 : -1);
    } else {
      this.ang += angDiff;
    }

    // Drift charge
    var driftChargeRate = 1;
    if (this.equip === 'drift_up') driftChargeRate = 2;
    if (this.skillActive && this.char.skill === 'sakura_drift') driftChargeRate = 4;

    if (this.aiDrifting) {
      this.aiDriftCharge = Math.min(this.aiDriftCharge + driftChargeRate * timeScale, 120);
      this.tilt = angDiff > 0 ? 0.2 : -0.2;
    }

    // Release drift for mini-turbo boost
    if (wasDriftingAI && !this.aiDrifting && this.aiDriftCharge > 0) {
      var boostAmount = 0;
      if (this.aiDriftCharge >= 90) boostAmount = 50;
      else if (this.aiDriftCharge >= 45) boostAmount = 30;
      if (this.equip === 'nitro') boostAmount = Math.floor(boostAmount * 1.5);
      if (boostAmount > 0) {
        this.boostTimer = Math.max(this.boostTimer, boostAmount);
      }
      this.aiDriftCharge = 0;
    }
    if (!this.aiDrifting) {
      this.aiDriftCharge = 0;
      this.tilt *= Math.pow(0.9, timeScale);
    }

    // --- Rubber banding: AI adapts speed based on position relative to player ---
    var rubberFactor = 1.0;
    if (player) {
      var playerProgress = player.progress || 0;
      var myProgress = this.progress || 0;
      var progressDiff = playerProgress - myProgress; // positive = AI is behind

      if (progressDiff > 30) {
        // AI far behind player: speed up significantly
        rubberFactor = 1.08 + Math.min(progressDiff - 30, 80) * 0.002;
      } else if (progressDiff > 10) {
        // AI somewhat behind: slight speed boost
        rubberFactor = 1.0 + (progressDiff - 10) * 0.003;
      } else if (progressDiff < -30) {
        // AI far ahead: slow down slightly
        rubberFactor = 0.92;
      } else if (progressDiff < -10) {
        // AI somewhat ahead: slight slow down
        rubberFactor = 0.97;
      }
    }

    var aiMaxSpd = curMax * this.aiSkill * rubberFactor;
    // Slow down in sharp curves
    if (absAngDiff > 0.3) {
      aiMaxSpd *= 0.85;
    }

    if (this.spd < aiMaxSpd) {
      this.spd += curAccel * timeScale;
      if (this.spd > aiMaxSpd) this.spd = aiMaxSpd;
    } else {
      this.spd *= Math.pow(0.995, timeScale);
    }

    // --- Smart skill use: use when it makes sense ---
    if (this.skillReady && !this.skillActive) {
      var useSkill = false;
      var skill = this.char.skill;
      if (skill === 'flame_burst' || skill === 'solar_boost' || skill === 'overclock') {
        // Speed skills: use on straightaways or when behind
        if (absAngDiff < 0.15 && this.spd > this.maxSpd * 0.7) useSkill = Math.random() < 0.01;
        if (player && (player.progress - this.progress) > 20) useSkill = Math.random() < 0.02;
      } else if (skill === 'aqua_shield') {
        // Shield: use when near enemies or projectiles
        for (var sr = 0; sr < racers.length; sr++) {
          if (racers[sr] !== this) {
            var sdx = racers[sr].x - this.x;
            var sdz = racers[sr].z - this.z;
            if (sdx * sdx + sdz * sdz < 100) { useSkill = Math.random() < 0.006; break; }
          }
        }
      } else if (skill === 'quake') {
        // Quake: use when many racers nearby
        var nearCount = 0;
        for (var sr = 0; sr < racers.length; sr++) {
          if (racers[sr] !== this) {
            var sdx = racers[sr].x - this.x;
            var sdz = racers[sr].z - this.z;
            if (sdx * sdx + sdz * sdz < 900) nearCount++;
          }
        }
        if (nearCount >= 2) useSkill = Math.random() < 0.008;
      } else if (skill === 'sakura_drift') {
        // Drift skill: use when approaching curves
        if (absAngDiff > 0.2) useSkill = Math.random() < 0.012;
      } else {
        // Other skills: moderate random use
        useSkill = Math.random() < 0.005;
      }
      if (useSkill) this.activateSkill(racers);
    }

    // --- Smart item use ---
    if (this.aiItemDelay > 0) this.aiItemDelay -= timeScale;
    if (this.item && this.aiItemDelay <= 0) {
      var useItem = false;
      if (this.item === 'boost') {
        // Use boost on straightaways
        if (absAngDiff < 0.15) useItem = Math.random() < 0.02;
        // Or when behind
        if (player && (player.progress - this.progress) > 15) useItem = Math.random() < 0.04;
      } else if (this.item === 'trap') {
        // Drop trap when enemy is close behind
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir] !== this && racers[ir].progress < this.progress &&
            (this.progress - racers[ir].progress) < 15) {
            useItem = Math.random() < 0.03;
            break;
          }
        }
      } else if (this.item === 'homing') {
        // Fire homing when enemy ahead
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir] !== this && racers[ir].progress > this.progress &&
            (racers[ir].progress - this.progress) < 40) {
            useItem = Math.random() < 0.02;
            break;
          }
        }
      } else if (this.item === 'shield') {
        // Shield when enemies nearby
        useItem = Math.random() < 0.01;
      } else if (this.item === 'thunder') {
        // Thunder when in last places
        var myRank = 1;
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir].progress > this.progress) myRank++;
        }
        if (myRank >= 4) useItem = Math.random() < 0.015;
      }
      if (useItem) {
        this.useItem(racers, scene);
        this.aiItemDelay = 120; // 2-second cooldown between items
      }
    }
  }

  // Movement
  this.x += Math.cos(this.ang) * this.spd * timeScale;
  this.z += Math.sin(this.ang) * this.spd * timeScale;

  // Track Y position
  var nearIdx = nearestTrackIndex(this.x, this.z);
  var nearNode = trackNodes[nearIdx];
  if (nearNode) {
    this.y += (nearNode.y - this.y) * 0.15 * timeScale;
  }

  // Off-track handling - wall slide (Mario Kart style)
  // trackDist now uses accurate perpendicular-to-segment distance
  var distToTrack = trackDist(this.x, this.z);
  var halfW = TRACK_WIDTH / 2;       // 14 = actual track edge
  var grassEdge = halfW + 0.5;       // 14.5 = just past road edge
  var wallLimit = halfW + 1.5;       // 15.5 = hard wall at guardrail, cannot pass

  var phasing = this.skillActive && this.char.skill === 'shadow_phase';

  if (!phasing && distToTrack > wallLimit) {
    // Hard wall: push back firmly, slide along edge
    var centerNode = trackNodes[nearIdx];
    var pushAng = Math.atan2(centerNode.z - this.z, centerNode.x - this.x);
    var overshoot = distToTrack - wallLimit;
    // Strong push proportional to overshoot - prevents escaping
    var pushStr = Math.min(overshoot * 0.6, 3.0) * timeScale;
    this.x += Math.cos(pushAng) * pushStr;
    this.z += Math.sin(pushAng) * pushStr;
    // Speed reduction
    this.spd *= Math.pow(0.93, timeScale);
    // Steer toward track to slide along wall
    var toTrackAng = Math.atan2(centerNode.z - this.z, centerNode.x - this.x);
    var angDiffToTrack = toTrackAng - this.ang;
    while (angDiffToTrack > Math.PI) angDiffToTrack -= Math.PI * 2;
    while (angDiffToTrack < -Math.PI) angDiffToTrack += Math.PI * 2;
    this.ang += angDiffToTrack * 0.06 * timeScale;
  } else if (!phasing && distToTrack > grassEdge) {
    // Grass slowdown - gradually stronger the further you go
    var grassDepth = (distToTrack - grassEdge) / (wallLimit - grassEdge);
    this.spd *= Math.pow((0.98 - grassDepth * 0.04), timeScale);
  }

  // Progress tracking (cumulative delta to handle start-line wraparound)
  var prevIdx = this.totalIdx;
  this.totalIdx = nearIdx;

  var idxDelta = nearIdx - prevIdx;
  if (idxDelta < -TRACK_POINTS / 2) idxDelta += TRACK_POINTS;  // forward wrap (99→0)
  if (idxDelta > TRACK_POINTS / 2) idxDelta -= TRACK_POINTS;   // backward wrap (rare)
  this.progressAccum += idxDelta;
  this.progress = this.progressAccum;

  // Lap detection
  if (prevIdx > TRACK_POINTS - 50 && this.totalIdx < 50) {
    if (!this.crossedStartOnce) {
      // First crossing from behind start line - don't count as lap
      this.crossedStartOnce = true;
    } else {
      this.lap++;
      if (this.isPlayer && this.lap < TOTAL_LAPS && SND && SND.lap) SND.lap();
      if (this.lap >= TOTAL_LAPS && !this.finished) {
        this.finished = true;
        this.finTime = fr;
      }
    }
  }

  // Energy ring collection
  if (typeof energyRings !== 'undefined') {
    var magnetRange = 3;
    if (this.equip === 'magnet') magnetRange = 8;
    if (this.skillActive && this.char.skill === 'golden_aura') magnetRange = 15;

    for (var i = 0; i < energyRings.length; i++) {
      var ring = energyRings[i];
      if (!ring.active) continue;
      var rdx = this.x - ring.x;
      var rdz = this.z - ring.z;
      var rdist = Math.sqrt(rdx * rdx + rdz * rdz);

      // Magnet pull
      if (rdist < magnetRange && rdist > 3) {
        var pullStr = 0.3 * timeScale;
        ring.x += rdx / rdist * pullStr;
        ring.z += rdz / rdist * pullStr;
      }

      if (rdist < 3) {
        ring.active = false;
        ring.respawn = 300;
        if (typeof energyRingMeshes !== 'undefined' && energyRingMeshes[i]) energyRingMeshes[i].visible = false;
        if (this.rings < RING_MAX) {
          this.rings++;
          // Golden aura: convert rings to boost
          if (this.skillActive && this.char.skill === 'golden_aura') {
            this.boostTimer = Math.max(this.boostTimer, 20);
          }
        }
        if (this.isPlayer && SND && SND.pickup) SND.pickup();
      }
    }
  }

  // Collision with item boxes
  if (typeof itemBoxes !== 'undefined') {
    for (var i = 0; i < itemBoxes.length; i++) {
      var box = itemBoxes[i];
      if (!box.active) continue;
      if (this.item) continue;
      var dx = this.x - box.x;
      var dz = this.z - box.z;
      var dist = dx * dx + dz * dz;
      if (dist < 9) {
        box.active = false;
        box.respawn = 180; // Respawn frames (approx 3s) - keeping as frames for simplicity since it's an integer counter in updateItemBoxes
        if (itemBoxMeshes[i]) itemBoxMeshes[i].visible = false;
        this.item = ITEMS[Math.floor(Math.random() * ITEMS.length)].type;
        if (this.isPlayer) SND.pickup();
      }
    }
  }

  // Collision with boost pads
  if (typeof boostPads !== 'undefined') {
    for (var i = 0; i < boostPads.length; i++) {
      var bpad = boostPads[i];
      if (!bpad.active) continue;
      var bpdx = this.x - bpad.x;
      var bpdz = this.z - bpad.z;
      var bpdist = bpdx * bpdx + bpdz * bpdz;
      if (bpdist < 16) { // ~4 unit radius (pad is 6x8)
        this.boostTimer = Math.max(this.boostTimer, 45);
        if (this.isPlayer && SND && SND.boostPad) SND.boostPad();
      }
    }
  }

  // Collision with traps
  if (typeof traps !== 'undefined') {
    for (var t = 0; t < traps.length; t++) {
      var trap = traps[t];
      if (trap.owner !== this) {
        var dx = this.x - trap.x;
        var dz = this.z - trap.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.5) {
          var blocked = false;
          if (this.shieldTimer > 0) { this.shieldTimer = 0; blocked = true; }
          else if (this.equip === 'auto_shield' && this.autoShieldReady) { this.autoShieldReady = false; this.autoShieldTimer = 0; blocked = true; }

          if (!blocked) {
            this.stunTimer = 90;
            this.spd *= 0.3;
            // Drop rings
            this.rings = Math.max(0, this.rings - RING_DROP_ON_HIT);
          }
          traps.splice(t, 1);
          if (trapMeshes && trapMeshes[t]) {
            scene.remove(trapMeshes[t]);
            trapMeshes.splice(t, 1);
          }
          t--;
          if (SND && SND.hit) SND.hit();
        }
      }
    }
  }

  // Collision with projectiles
  if (typeof projectiles !== 'undefined') {
    for (var p = 0; p < projectiles.length; p++) {
      var proj = projectiles[p];
      if (proj.owner !== this) {
        var dx = this.x - proj.x;
        var dz = this.z - proj.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.5) {
          var blocked = false;
          if (this.shieldTimer > 0) { this.shieldTimer = 0; blocked = true; }
          else if (this.equip === 'auto_shield' && this.autoShieldReady) { this.autoShieldReady = false; this.autoShieldTimer = 0; blocked = true; }

          if (!blocked) {
            this.stunTimer = 75;
            this.spd *= 0.4;
            this.rings = Math.max(0, this.rings - RING_DROP_ON_HIT);
          }
          projectiles.splice(p, 1);
          if (projMeshes && projMeshes[p]) {
            scene.remove(projMeshes[p]);
            projMeshes.splice(p, 1);
          }
          p--;
          if (SND && SND.hit) SND.hit();
        }
      }
    }
  }

  // Collision with other racers - gentle bumping (Mario Kart style)
  if (!phasing) {
    var minSep = 1.6;
    for (var r = 0; r < racers.length; r++) {
      var other = racers[r];
      if (other !== this) {
        var dx = this.x - other.x;
        var dz = this.z - other.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minSep && dist > 0.01) {
          var pushAng = Math.atan2(dz, dx);
          var pushDist = (minSep - dist) * 0.25 * timeScale;
          this.x += Math.cos(pushAng) * pushDist;
          this.z += Math.sin(pushAng) * pushDist;
          other.x -= Math.cos(pushAng) * pushDist;
          other.z -= Math.sin(pushAng) * pushDist;
          // Gentle speed exchange
          var spdDiff = this.spd - other.spd;
          this.spd -= spdDiff * 0.08 * timeScale;
          other.spd += spdDiff * 0.08 * timeScale;
        }
      }
    }
  }

  this.updateMesh();
};

Racer.prototype.updateMesh = function () {
  if (!this.mesh) return;

  this.mesh.position.set(this.x, this.y, this.z);
  this.mesh.rotation.y = -this.ang - Math.PI / 2;

  if (this.bodyMesh) {
    this.bodyMesh.rotation.z = -this.tilt;
  }
  if (this.driverGroup) {
    // Lean into turns (like Mario Kart) - gentle so character stays visible
    this.driverGroup.rotation.z = -this.tilt * 0.35;
    // Lean forward when accelerating - minimal to keep character upright
    this.driverGroup.rotation.x = Math.min(this.spd * 0.05, 0.06);
  }
  // Steering wheel rotation
  if (this.steeringWheel) {
    this.steeringWheel.rotation.z = this.tilt * 2.5;
  }

  // Wheel spin
  var wheelRotation = this.spd * 2;
  for (var i = 0; i < this.wheelMeshes.length; i++) {
    var wheel = this.wheelMeshes[i];
    wheel.rotation.x += wheelRotation;
    if (i < 2) wheel.rotation.y = -this.tilt * 0.5;
  }

  // Skill active visual - transparency for shadow phase
  if (this.skillActive && this.char.skill === 'shadow_phase') {
    this.mesh.traverse(function (child) {
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = 0.4 + Math.sin(fr * 0.2) * 0.2;
      }
    });
  }

  // Emissive effects on body
  if (this.bodyMesh) {
    var children = this.bodyMesh.children;
    for (var c = 0; c < children.length; c++) {
      var child = children[c];
      if (child.material && child.material.emissive !== undefined) {
        child.material.emissive = new THREE.Color(0x000000);
        child.material.emissiveIntensity = 0;

        if (this.shieldTimer > 0) {
          child.material.emissive = new THREE.Color(0x4488ff);
          child.material.emissiveIntensity = 0.3;
        }
        if (this.boostTimer > 0) {
          child.material.emissive = new THREE.Color(0xff8800);
          child.material.emissiveIntensity = 0.4;
        }
        if (this.skillActive) {
          child.material.emissive = new THREE.Color(this.char.col);
          child.material.emissiveIntensity = 0.5 + Math.sin(fr * 0.15) * 0.2;
        }
        if (this.stunTimer > 0 && fr % 10 < 5) {
          child.material.emissive = new THREE.Color(0xffff00);
          child.material.emissiveIntensity = 0.5;
        }
      }
    }
  }

  // Drift charge visual
  if (this.drifting && this.driftCharge > 0) {
    var sparkColor;
    if (this.driftCharge >= 90) sparkColor = new THREE.Color(0xff6600);
    else if (this.driftCharge >= 45) sparkColor = new THREE.Color(0x4488ff);
    else sparkColor = new THREE.Color(0xffffff);
    for (var w = 2; w < 4; w++) {
      var wheel = this.wheelMeshes[w];
      if (wheel && wheel.children) {
        for (var wc = 0; wc < wheel.children.length; wc++) {
          var part = wheel.children[wc];
          if (part.material && part.material.color && part.material.color.getHex() === 0xcccccc) {
            part.material.emissive = sparkColor;
            part.material.emissiveIntensity = 0.6 + Math.sin(fr * 0.5) * 0.3;
          }
        }
      }
    }
  } else {
    for (var w = 2; w < 4; w++) {
      var wheel = this.wheelMeshes[w];
      if (wheel && wheel.children) {
        for (var wc = 0; wc < wheel.children.length; wc++) {
          var part = wheel.children[wc];
          if (part.material && part.material.emissive) {
            part.material.emissive = new THREE.Color(0x000000);
            part.material.emissiveIntensity = 0;
          }
        }
      }
    }
  }
};

Racer.prototype.useItem = function (racers, scene) {
  if (!this.item) return;

  var itemType = this.item;
  this.item = null;

  var boostDuration = 90;
  if (this.equip === 'nitro') boostDuration = 135;

  if (itemType === 'boost') {
    this.boostTimer = boostDuration;
    if (SND && SND.boost) SND.boost();
  } else if (itemType === 'trap') {
    var trapX = this.x - Math.cos(this.ang) * 2;
    var trapZ = this.z - Math.sin(this.ang) * 2;
    addTrap(scene, trapX, this.y, trapZ, this);
    if (SND && SND.item) SND.pickup();
  } else if (itemType === 'homing') {
    var projX = this.x + Math.cos(this.ang) * 2;
    var projZ = this.z + Math.sin(this.ang) * 2;
    addProjectile(scene, projX, this.y, projZ, this.ang, this);
    if (SND && SND.item) SND.pickup();
  } else if (itemType === 'shield') {
    this.shieldTimer = 240;
    if (SND && SND.shield) SND.shield();
  } else if (itemType === 'thunder') {
    for (var r = 0; r < racers.length; r++) {
      var other = racers[r];
      if (other !== this && other.shieldTimer === 0) {
        other.stunTimer = 120;
        other.spd *= 0.2;
        other.rings = Math.max(0, other.rings - RING_DROP_ON_HIT);
      }
    }
    if (SND && SND.thunder) SND.thunder();
  }
};
