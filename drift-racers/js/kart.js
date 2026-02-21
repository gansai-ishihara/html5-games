// kart.js - Racer/Kart module for drift racing game
// Babylon.js engine (migrated from Three.js r128)

var racers = [];
var player = null;

// GLB Model loading system
var glbModelCache = {};  // bodyType -> BABYLON.TransformNode (template)
var glbModelsLoaded = false;

// Combined character+kart model cache
var kartModelCache = {};  // bodyType -> BABYLON.TransformNode (template)
var kartModelsLoaded = false;

// Environment model cache
var envModelCache = {};  // envType -> BABYLON.TransformNode (template)
var envModelsLoaded = false;

// Course GLB model
var courseModelRoot = null;
var courseModelLoaded = false;

// --- GLB Material Enhancement Helpers ---

function enhanceGLBMaterials(meshes, opts) {
  // opts: { metalness, roughness, satBoost, lumBoost, emissiveBlend, emissiveInt }
  var o = opts || {};
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    if (!mesh.material) continue;
    var mats = mesh.material instanceof BABYLON.MultiMaterial ? mesh.material.subMaterials : [mesh.material];
    for (var mi = 0; mi < mats.length; mi++) {
      var mat = mats[mi];
      if (!mat) continue;
      if (mat instanceof BABYLON.PBRMaterial) {
        mat.metallic = o.metalness !== undefined ? o.metalness : 0;
        mat.roughness = o.roughness !== undefined ? o.roughness : 0.55;
      }
      // Boost saturation/luminance on diffuse/albedo
      var col = mat.diffuseColor || mat.albedoColor;
      if (col) {
        var hsl = { h: 0, s: 0, l: 0 };
        colToHSL(col, hsl);
        if (hsl.l > 0.01) {
          var ns = Math.min(1.0, hsl.s * (o.satBoost || 1.2) + 0.05);
          var nl = Math.min(o.lumMax || 0.8, hsl.l * (o.lumBoost || 1.15) + 0.1);
          hslToCol(hsl.h, ns, nl, col);
        }
      }
      // Emissive tint
      if (o.emissiveInt && col) {
        var hsl2 = { h: 0, s: 0, l: 0 };
        colToHSL(col, hsl2);
        var eH = o.emissiveBlend !== undefined ? (hsl2.h * (1 - o.emissiveBlend) + 0.6 * o.emissiveBlend) : hsl2.h;
        var ec = new BABYLON.Color3();
        hslToCol(eH, Math.min(1.0, hsl2.s * 0.4), 0.1, ec);
        if (mat.emissiveColor) mat.emissiveColor = ec.scale(o.emissiveInt);
        else if (mat instanceof BABYLON.PBRMaterial) mat.emissiveColor = ec.scale(o.emissiveInt);
      }
    }
    // Shadow
    if (shadowGen) shadowGen.addShadowCaster(mesh);
    mesh.receiveShadows = true;
  }
}

// Color conversion helpers
function colToHSL(c3, out) {
  var r = c3.r, g = c3.g, b = c3.b;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  out.h = h; out.s = s; out.l = l;
}

function hslToCol(h, s, l, out) {
  if (s === 0) { out.r = out.g = out.b = l; return; }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  out.r = hue2rgb(p, q, h + 1 / 3);
  out.g = hue2rgb(p, q, h);
  out.b = hue2rgb(p, q, h - 1 / 3);
}

// --- GLB Bounding Box Helper ---
function getGLBBounds(root) {
  var min = new BABYLON.Vector3(1e9, 1e9, 1e9);
  var max = new BABYLON.Vector3(-1e9, -1e9, -1e9);
  var meshes = root.getChildMeshes ? root.getChildMeshes() : [];
  if (root.getBoundingInfo && root.getTotalVertices && root.getTotalVertices() > 0) {
    meshes.push(root);
  }
  for (var i = 0; i < meshes.length; i++) {
    var m = meshes[i];
    if (!m.getBoundingInfo || !m.getTotalVertices || m.getTotalVertices() === 0) continue;
    m.computeWorldMatrix(true);
    var bi = m.getBoundingInfo();
    var bmin = bi.boundingBox.minimumWorld;
    var bmax = bi.boundingBox.maximumWorld;
    min.minimizeInPlace(bmin);
    max.maximizeInPlace(bmax);
  }
  return { min: min, max: max, size: max.subtract(min) };
}

// Preload all character GLB models
function preloadModels(callback) {
  var bodyTypes = Object.keys(MODEL_FILES);
  var loaded = 0;
  var total = bodyTypes.length;
  if (total === 0) { glbModelsLoaded = true; if (callback) callback(); return; }

  bodyTypes.forEach(function (bodyType) {
    var url = MODEL_FILES[bodyType];
    BABYLON.SceneLoader.ImportMesh('', '', url, scene,
      function (meshes, particleSystems, skeletons) {
        // Create a root TransformNode
        var root = new BABYLON.TransformNode('glb_' + bodyType, scene);
        for (var i = 0; i < meshes.length; i++) {
          if (!meshes[i].parent || meshes[i].parent === scene) meshes[i].parent = root;
        }
        // Hide skeleton debug display
        if (skeletons) {
          for (var si = 0; si < skeletons.length; si++) {
            skeletons[si].overrideMesh = null;
          }
        }

        // Normalize size
        var bounds = getGLBBounds(root);
        var sz = bounds.size;
        var maxDim = Math.max(sz.x, sz.y, sz.z);
        if (maxDim === 0) maxDim = 1;
        var targetSize = 1.1;
        var sc = targetSize / maxDim;
        root.scaling.copyFromFloats(sc, sc, sc);

        // Center horizontally, sit on ground
        root.computeWorldMatrix(true);
        var b2 = getGLBBounds(root);
        var cx = (b2.min.x + b2.max.x) / 2;
        var cz = (b2.min.z + b2.max.z) / 2;
        root.position.copyFromFloats(-cx, -b2.min.y, -cz);

        // Enhance materials
        enhanceGLBMaterials(root.getChildMeshes(), {
          metalness: 0, roughness: 0.55, satBoost: 1.2, lumBoost: 1.15, lumMax: 0.8, emissiveInt: 0.2
        });

        // Disable for now (template - will be cloned)
        root.setEnabled(false);
        glbModelCache[bodyType] = root;
        loaded++;
        console.log('Loaded model: ' + bodyType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          glbModelsLoaded = true;
          console.log('All GLB models loaded!');
          if (callback) callback();
        }
      },
      null,
      function (sc, msg, err) {
        console.warn('Failed to load model ' + bodyType + ': ' + (msg || err));
        loaded++;
        if (loaded === total) { glbModelsLoaded = true; if (callback) callback(); }
      }
    );
  });
}

// Preload all combined character+kart GLB models
function preloadKartModels(callback) {
  if (typeof KART_MODEL_FILES === 'undefined') {
    kartModelsLoaded = true;
    if (callback) callback();
    return;
  }

  var bodyTypes = Object.keys(KART_MODEL_FILES);
  var loaded = 0;
  var total = bodyTypes.length;
  if (total === 0) { kartModelsLoaded = true; if (callback) callback(); return; }

  bodyTypes.forEach(function (bodyType) {
    var url = KART_MODEL_FILES[bodyType];
    BABYLON.SceneLoader.ImportMesh('', '', url, scene,
      function (meshes, particleSystems, skeletons) {
        var root = new BABYLON.TransformNode('kart_' + bodyType, scene);
        for (var i = 0; i < meshes.length; i++) {
          if (!meshes[i].parent || meshes[i].parent === scene) meshes[i].parent = root;
        }
        // Hide skeleton debug display
        if (skeletons) {
          for (var si = 0; si < skeletons.length; si++) {
            skeletons[si].overrideMesh = null;
          }
        }

        // Normalize size
        var bounds = getGLBBounds(root);
        var sz = bounds.size;
        var maxDim = Math.max(sz.x, sz.y, sz.z);
        if (maxDim === 0) maxDim = 1;
        var targetSize = 2.2;
        var sc = targetSize / maxDim;
        root.scaling.copyFromFloats(sc, sc, sc);

        // Center horizontally, sit on ground
        root.computeWorldMatrix(true);
        var b2 = getGLBBounds(root);
        var cx = (b2.min.x + b2.max.x) / 2;
        var cz = (b2.min.z + b2.max.z) / 2;
        root.position.copyFromFloats(-cx, -b2.min.y, -cz);

        // Auto-detect inverted models from Trellis
        root.computeWorldMatrix(true);
        var b3 = getGLBBounds(root);
        if (b3.max.y <= 0.001 && b3.min.y < -0.1) {
          root.rotation.x = Math.PI;
          console.log('Flipped inverted kart model: ' + bodyType);
        }

        // Enhance materials
        enhanceGLBMaterials(root.getChildMeshes(), {
          metalness: 0, roughness: 0.5, satBoost: 1.2, lumBoost: 1.15, lumMax: 0.8, emissiveInt: 0.2
        });

        root.setEnabled(false);
        kartModelCache[bodyType] = root;
        loaded++;
        console.log('Loaded kart model: ' + bodyType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          kartModelsLoaded = true;
          console.log('All kart GLB models loaded!');
          if (callback) callback();
        }
      },
      null,
      function (sc, msg, err) {
        console.warn('Failed to load kart model ' + bodyType + ': ' + (msg || err));
        loaded++;
        if (loaded === total) { kartModelsLoaded = true; if (callback) callback(); }
      }
    );
  });
}

// Preload all environment GLB models
function preloadEnvModels(callback) {
  var envTypes = Object.keys(ENV_MODEL_FILES);
  var loaded = 0;
  var total = envTypes.length;
  if (total === 0) { envModelsLoaded = true; if (callback) callback(); return; }

  envTypes.forEach(function (envType) {
    var url = ENV_MODEL_FILES[envType];
    BABYLON.SceneLoader.ImportMesh('', '', url, scene,
      function (meshes) {
        var root = new BABYLON.TransformNode('env_' + envType, scene);
        for (var i = 0; i < meshes.length; i++) {
          if (!meshes[i].parent || meshes[i].parent === scene) meshes[i].parent = root;
        }

        // Enhance materials
        enhanceGLBMaterials(root.getChildMeshes(), {
          metalness: 0, roughness: 0.6, satBoost: 1.3, lumBoost: 1.2, lumMax: 0.85,
          emissiveInt: 0.25, emissiveBlend: 0.3
        });

        // Auto-detect inverted models
        root.computeWorldMatrix(true);
        var autoBox = getGLBBounds(root);
        var belowOrigin = Math.abs(autoBox.min.y);
        var aboveOrigin = Math.max(autoBox.max.y, 0.001);
        var needsFlip = false;
        if (belowOrigin > aboveOrigin * 2) needsFlip = true;
        if (autoBox.max.y <= 0.001 && autoBox.min.y < -0.1) needsFlip = true;
        if (typeof ENV_MODEL_FLIP_Y !== 'undefined' && ENV_MODEL_FLIP_Y[envType] !== undefined) {
          needsFlip = ENV_MODEL_FLIP_Y[envType];
        }
        if (needsFlip) {
          root.rotation.x = Math.PI;
          console.log('Flipped inverted model: ' + envType);
        }

        root.setEnabled(false);
        envModelCache[envType] = root;
        loaded++;
        console.log('Loaded env model: ' + envType + ' (' + loaded + '/' + total + ')');
        if (loaded === total) {
          envModelsLoaded = true;
          console.log('All environment GLB models loaded!');
          if (callback) callback();
        }
      },
      null,
      function (sc, msg, err) {
        console.warn('Failed to load env model ' + envType + ': ' + (msg || err));
        loaded++;
        if (loaded === total) { envModelsLoaded = true; if (callback) callback(); }
      }
    );
  });
}

// Load the Blender-generated course GLB
function loadCourseModel(callback) {
  if (!USE_COURSE_GLB || !COURSE_GLB_PATH) {
    courseModelLoaded = true;
    if (callback) callback();
    return;
  }
  console.log('Loading course GLB: ' + COURSE_GLB_PATH);
  BABYLON.SceneLoader.ImportMesh('', '', COURSE_GLB_PATH, scene,
    function (meshes) {
      courseModelRoot = new BABYLON.TransformNode('courseRoot', scene);
      for (var i = 0; i < meshes.length; i++) {
        var m = meshes[i];
        if (!m.parent || m.parent === scene) m.parent = courseModelRoot;
        // Enable shadows on course meshes (desktop only)
        if (shadowGen && m.getTotalVertices && m.getTotalVertices() > 0) {
          m.receiveShadows = true;
        }
      }
      var allMeshes = courseModelRoot.getChildMeshes();
      courseModelLoaded = true;
      console.log('Course GLB loaded: ' + allMeshes.length + ' meshes');
      if (callback) callback();
    },
    null,
    function (sc, msg, err) {
      console.warn('Failed to load course GLB: ' + (msg || err));
      courseModelLoaded = true;
      if (callback) callback();
    }
  );
}

// Clone and place an environment model at given position, scale, rotation
function placeEnvModel(sc, envType, x, y, z, scale, rotY) {
  var template = envModelCache[envType];
  if (!template) return null;

  var clone = template.clone(envType + '_c' + (++_ktn), null);
  clone.setEnabled(true);
  // Enable all child meshes
  var cms = clone.getChildMeshes();
  for (var ci = 0; ci < cms.length; ci++) cms[ci].setEnabled(true);

  // Reset position and apply rotY FIRST so bbox includes rotation
  clone.position.copyFromFloats(0, 0, 0);
  clone.rotation.copyFrom(template.rotation); // preserve flip
  if (rotY !== undefined) clone.rotation.y = rotY;

  // Compute bounding box at origin (includes rotation)
  clone.computeWorldMatrix(true);
  var box = getGLBBounds(clone);
  var sz = box.size;
  var maxDim = Math.max(sz.x, sz.y, sz.z);
  if (maxDim === 0) maxDim = 1;

  // Apply normalized scale (target size in world units)
  var s = (typeof scale === 'number') ? scale : 1;
  var normalizedScale = s / maxDim;
  clone.scaling.copyFromFloats(normalizedScale, normalizedScale, normalizedScale);

  // Recompute box after scaling
  clone.computeWorldMatrix(true);
  box = getGLBBounds(clone);
  var cx = (box.min.x + box.max.x) / 2;
  var cz = (box.min.z + box.max.z) / 2;

  // Place: center horizontally at (x, z), bottom at y
  clone.position.copyFromFloats(x - cx, y - box.min.y, z - cz);

  // Crystal Kingdom: add glow to vegetation and castle
  if (CRYSTAL_KINGDOM) {
    var needsGlow = envType.indexOf('tree') >= 0 || envType === 'flowerbed' || envType === 'castle' || envType === 'fountain' || envType === 'archgate';
    if (needsGlow) {
      var childMeshes = clone.getChildMeshes();
      for (var ei = 0; ei < childMeshes.length; ei++) {
        var eMat = childMeshes[ei].material;
        if (eMat && eMat.emissiveColor) {
          eMat = eMat.clone(eMat.name + '_glow');
          if (envType === 'castle') {
            eMat.emissiveColor = new BABYLON.Color3(0.12, 0.1, 0.2);
          } else if (envType === 'fountain') {
            eMat.emissiveColor = new BABYLON.Color3(0.08, 0.1, 0.18);
          } else {
            eMat.emissiveColor = new BABYLON.Color3(0.1, 0.06, 0.18);
          }
          childMeshes[ei].material = eMat;
        }
      }
    }
  }

  trackMeshes.push(clone);
  return clone;
}

var _ktn = 0; // unique name counter

// --- Racer Constructor (no Three.js dependencies) ---

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
  this.vy = 0;
  this.airborne = false;

  // Performance stats with kart bonuses
  this.maxSpd = 0.9 + this.char.s * 0.09 + (kart.sBonus || 0);
  this.accel = 0.007 + this.char.a * 0.0012 + (kart.aBonus || 0);
  this.handling = 0.018 + this.char.h * 0.002 + (kart.hBonus || 0);

  // Race tracking
  this.lap = 0;
  this.totalIdx = 0;
  this.progress = 0;
  this.progressAccum = 0;
  this.lastCP = 0;
  this.crossedStartOnce = false;

  // Items and state
  this.item = null;
  this.drifting = false;
  this.driftCharge = 0;
  this.boostTimer = 0;
  this.shieldTimer = 0;
  this.stunTimer = 0;

  // Energy rings
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
    var diff = (typeof DIFFICULTY !== 'undefined' && typeof cpuDifficulty !== 'undefined') ? DIFFICULTY[cpuDifficulty] : DIFFICULTY.normal;
    this.aiSkill = diff.aiSkillMin + Math.random() * (diff.aiSkillMax - diff.aiSkillMin);
    this.aiDiffItemFreq = diff.itemFreq || 1.0;
    this.aiDiffSkillFreq = diff.skillFreq || 1.0;
    this.aiDiffRubberBehind = diff.rubberBehind || 0.08;
    this.aiDiffRubberAhead = diff.rubberAhead || -0.08;
    // Spread AI karts across track width to avoid bunching
    var laneSlots = [-5, -2.5, 0, 2.5, 5, -3.5, 3.5, -1];
    this.aiLateral = laneSlots[charIdx % laneSlots.length] + (Math.random() - 0.5) * 1.5;
    this.aiDrifting = false;
    this.aiDriftCharge = 0;
    this.aiItemDelay = 0;
    this.aiStuckTimer = 0;
    this._smoothAvoid = 0; // smoothed avoidance offset
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
  this.progressAccum = (idx > TRACK_POINTS / 2) ? idx - TRACK_POINTS : idx;
  this.progress = this.progressAccum;
};

// --- Babylon.js material helpers for procedural kart ---
function kartPBR(hex, metalness, roughness) {
  var mat = new BABYLON.StandardMaterial('kpbr' + (++_ktn), scene);
  mat.diffuseColor = c3(hex);
  // Approximate PBR metallic/roughness with specular
  var met = metalness !== undefined ? metalness : 0.5;
  var rou = roughness !== undefined ? roughness : 0.2;
  mat.specularColor = c3(hex).scale(met);
  mat.specularPower = 4 + (1 - rou) * 60;
  mat.backFaceCulling = true;
  return mat;
}

function kartStd(hex, emHex, emInt) {
  var mat = new BABYLON.StandardMaterial('kstd' + (++_ktn), scene);
  mat.diffuseColor = c3(hex);
  if (emHex !== undefined) {
    mat.emissiveColor = c3(emHex).scale(emInt || 1);
  }
  mat.backFaceCulling = true;
  return mat;
}

function kartStdDS(hex, emHex, emInt) {
  var mat = kartStd(hex, emHex, emInt);
  mat.backFaceCulling = false;
  return mat;
}

// Babylon.js mesh builder shortcuts for kart parts
function kCyl(opts, mat) {
  var m = BABYLON.MeshBuilder.CreateCylinder('kc' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}
function kBox(opts, mat) {
  var m = BABYLON.MeshBuilder.CreateBox('kb' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}
function kSph(opts, mat) {
  var m = BABYLON.MeshBuilder.CreateSphere('ks' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}
function kTorus(opts, mat) {
  var m = BABYLON.MeshBuilder.CreateTorus('kt' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}
function kGnd(opts, mat) {
  var m = BABYLON.MeshBuilder.CreateGround('kg' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}
function kPoly(opts, mat) {
  var m = BABYLON.MeshBuilder.CreatePolyhedron('kp' + (++_ktn), opts, scene);
  m.material = mat;
  return m;
}

Racer.prototype.createMesh = function (sc) {
  this.mesh = new BABYLON.TransformNode('racer' + (++_ktn), scene);

  var char = this.char;
  var mainColor = char.col;
  var helmetColor = char.hc;
  var darkColor = char.bc;
  var skinColor = char.skin || 0xFFDBAC;
  var bodyType = char.body || 'dragon';

  // === CHECK FOR COMBINED KART MODEL (character+kart in one GLB) ===
  var hasKartModel = kartModelCache[bodyType] !== undefined;
  if (hasKartModel) {
    var kartClone = kartModelCache[bodyType].clone('kartClone_' + bodyType + (++_ktn), this.mesh);
    kartClone.setEnabled(true);
    var cms = kartClone.getChildMeshes();
    for (var ci = 0; ci < cms.length; ci++) cms[ci].setEnabled(true);
    kartClone.rotation.y = Math.PI; // Face forward (nose at -Z)
    this.kartGLB = kartClone;
    this.bodyMesh = kartClone;
    this.wheelMeshes = [];
    this.steeringWheel = null;
    this.driverGroup = kartClone;

    this.updateMesh();
    return;
  }

  // === FALLBACK: Procedural kart + separate character model ===

  // Materials
  var bodyMat = kartPBR(mainColor, 0.55, 0.18);
  var darkMat = kartPBR(0x222228, 0.5, 0.25);
  var chromeMat = kartPBR(0xeeeeee, 0.9, 0.08);
  var accentMat = kartPBR(darkColor, 0.5, 0.2);

  var bodyGroup = new BABYLON.TransformNode('body' + (++_ktn), scene);
  bodyGroup.parent = this.mesh;

  // === MAIN BODY ===
  var kartStyle = KARTS[this.kartIdx] ? KARTS[this.kartIdx].style : 'medium';

  var baseW, baseD, shellW, shellH, shellD, noseLen, spoilerW;
  if (kartStyle === 'long') {
    baseW = 1.1; baseD = 3.2; shellW = 0.9; shellH = 0.25; shellD = 2.5; noseLen = 1.8; spoilerW = 1.0;
  } else if (kartStyle === 'wide') {
    baseW = 1.9; baseD = 2.2; shellW = 1.7; shellH = 0.40; shellD = 1.8; noseLen = 0.8; spoilerW = 1.8;
  } else {
    baseW = 1.5; baseD = 2.5; shellW = 1.3; shellH = 0.30; shellD = 2.1; noseLen = 1.25; spoilerW = 1.4;
  }

  // Lower chassis - tapered (wider at rear)
  var cw = baseW * 0.5, cd = baseD * 0.5, ch = 0.12;
  var cwf = cw * 0.75;
  var chassisVerts = [
    -cwf, ch, -cd, cwf, ch, -cd, cw, ch, cd, -cw, ch, cd,
    -cwf, -ch, -cd, cwf, -ch, -cd, cw, -ch, cd, -cw, -ch, cd
  ];
  var chassisIdx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 2, 6, 7, 2, 7, 3, 1, 5, 6, 1, 6, 2, 0, 3, 7, 0, 7, 4];
  var chassis = createCustomMesh('chassis' + _ktn, chassisVerts, chassisIdx, null, null, scene);
  chassis.material = darkMat;
  chassis.position.y = 0.14;
  chassis.parent = bodyGroup;
  if (shadowGen) shadowGen.addShadowCaster(chassis);

  // Upper body shell
  var shell = kSph({ diameter: 2, segments: 12 }, bodyMat);
  shell.position.copyFromFloats(0, 0.30, -0.05);
  shell.scaling.copyFromFloats(shellW * 0.52, shellH * 0.6, shellD * 0.48);
  shell.parent = bodyGroup;
  if (shadowGen) shadowGen.addShadowCaster(shell);

  // Front nose
  var nose = kSph({ diameter: 1, segments: 12 }, bodyMat);
  nose.position.copyFromFloats(0, 0.25, -noseLen);
  nose.scaling.copyFromFloats(baseW * 0.55, 0.35, 0.8);
  nose.parent = bodyGroup;
  if (shadowGen) shadowGen.addShadowCaster(nose);

  // Front splitter
  var splitter = kBox({ width: baseW * 0.9, height: 0.04, depth: 0.35 }, darkMat);
  splitter.position.copyFromFloats(0, 0.06, -noseLen - 0.1);
  splitter.parent = bodyGroup;

  // Chrome bumper
  var bumper = kCyl({ diameterTop: 0.1, diameterBottom: 0.1, height: baseW * 0.85, tessellation: 8 }, chromeMat);
  bumper.position.copyFromFloats(0, 0.12, -noseLen - 0.15);
  bumper.rotation.z = Math.PI / 2;
  bumper.parent = bodyGroup;

  // Side pods
  for (var s = -1; s <= 1; s += 2) {
    var pod = kSph({ diameter: 0.8, segments: 8 }, accentMat);
    pod.position.copyFromFloats(s * (baseW * 0.42), 0.20, 0.15);
    pod.scaling.copyFromFloats(0.5, 0.42, 2.2);
    pod.parent = bodyGroup;
    if (shadowGen) shadowGen.addShadowCaster(pod);
  }

  // Side air intakes
  var intakeMat = kartStd(0x111115);
  for (var s = -1; s <= 1; s += 2) {
    var intake = kBox({ width: 0.04, height: 0.10, depth: 0.45 }, intakeMat);
    intake.position.copyFromFloats(s * (shellW * 0.52), 0.22, -0.4);
    intake.parent = bodyGroup;
  }

  // Engine cowl (rear)
  var cowl = kSph({ diameter: 0.9, segments: 10 }, accentMat);
  cowl.position.copyFromFloats(0, 0.24, 0.9);
  cowl.scaling.copyFromFloats(1.15, 0.35, 0.85);
  cowl.parent = bodyGroup;
  if (shadowGen) shadowGen.addShadowCaster(cowl);

  // Wheel arches / fenders
  var fenderMat = kartStd(0x1a1a1a);
  var fenderPositions = [
    { x: -0.72, z: -0.85, front: true }, { x: 0.72, z: -0.85, front: true },
    { x: -0.72, z: 0.9, front: false }, { x: 0.72, z: 0.9, front: false }
  ];
  for (var fi = 0; fi < fenderPositions.length; fi++) {
    var fp = fenderPositions[fi];
    var fR = fp.front ? 0.32 : 0.37;
    var fender = kTorus({ diameter: fR * 2, thickness: 0.06, tessellation: 12 }, fenderMat);
    // Only show top half - we approximate by positioning and parent
    fender.position.copyFromFloats(fp.x, 0.22, fp.z);
    fender.rotation.y = Math.PI / 2;
    fender.rotation.x = -Math.PI / 2;
    fender.parent = bodyGroup;
  }

  // Spoiler
  var spoilerMat = kartStd(mainColor);
  var spoilerH = kartStyle === 'wide' ? 0.65 : 0.58;
  var spoiler = kBox({ width: spoilerW, height: 0.06, depth: 0.25 }, spoilerMat);
  spoiler.position.copyFromFloats(0, spoilerH, 1.15);
  spoiler.rotation.x = -0.18;
  spoiler.parent = bodyGroup;

  // Spoiler end plates
  var epMat = kartStd(mainColor);
  var epW = spoilerW * 0.48;
  var ep1 = kBox({ width: 0.04, height: 0.14, depth: 0.28 }, epMat);
  ep1.position.copyFromFloats(-epW, spoilerH - 0.02, 1.15);
  ep1.parent = bodyGroup;
  var ep2 = kBox({ width: 0.04, height: 0.14, depth: 0.28 }, epMat);
  ep2.position.copyFromFloats(epW, spoilerH - 0.02, 1.15);
  ep2.parent = bodyGroup;

  // Spoiler supports
  var spoilerSup = kCyl({ diameterTop: 0.05, diameterBottom: 0.05, height: 0.32, tessellation: 6 }, chromeMat);
  spoilerSup.position.copyFromFloats(-epW * 0.7, spoilerH - 0.2, 1.05);
  spoilerSup.parent = bodyGroup;
  var spoilerSup2 = kCyl({ diameterTop: 0.05, diameterBottom: 0.05, height: 0.32, tessellation: 6 }, chromeMat);
  spoilerSup2.position.copyFromFloats(epW * 0.7, spoilerH - 0.2, 1.05);
  spoilerSup2.parent = bodyGroup;

  // Exhaust pipes
  var exhMat = kartPBR(0xBBBBBB, 0.7, 0.2);
  var lExh = kCyl({ diameterTop: 0.12, diameterBottom: 0.16, height: 0.4, tessellation: 8 }, exhMat);
  lExh.position.copyFromFloats(-0.3, 0.14, 1.4); lExh.rotation.x = Math.PI / 2.3;
  lExh.parent = bodyGroup;
  var rExh = kCyl({ diameterTop: 0.12, diameterBottom: 0.16, height: 0.4, tessellation: 8 }, exhMat);
  rExh.position.copyFromFloats(0.3, 0.14, 1.4); rExh.rotation.x = Math.PI / 2.3;
  rExh.parent = bodyGroup;

  // Exhaust tips
  var exhTipMat = kartStd(0xFF6600, 0xFF4400, 0.4);
  var et1 = kCyl({ diameterTop: 0.08, diameterBottom: 0.10, height: 0.08, tessellation: 8 }, exhTipMat);
  et1.position.copyFromFloats(-0.3, 0.12, 1.55); et1.rotation.x = Math.PI / 2.3;
  et1.parent = bodyGroup;
  var et2 = kCyl({ diameterTop: 0.08, diameterBottom: 0.10, height: 0.08, tessellation: 8 }, exhTipMat);
  et2.position.copyFromFloats(0.3, 0.12, 1.55); et2.rotation.x = Math.PI / 2.3;
  et2.parent = bodyGroup;

  // Headlights
  var hlMat = kartStd(0xffffdd, 0xffffaa, 0.6);
  var hl1 = kSph({ diameter: 0.18, segments: 8 }, hlMat);
  hl1.position.copyFromFloats(-0.38, 0.18, -noseLen - 0.05);
  hl1.parent = bodyGroup;
  var hl2 = kSph({ diameter: 0.18, segments: 8 }, hlMat);
  hl2.position.copyFromFloats(0.38, 0.18, -noseLen - 0.05);
  hl2.parent = bodyGroup;

  // Headlight housing
  var hlHouseMat = kartStd(0x333333);
  var hlh1 = kSph({ diameter: 0.24, segments: 8 }, hlHouseMat);
  hlh1.position.copyFromFloats(-0.38, 0.18, -noseLen + 0.01);
  hlh1.scaling.z = 0.5;
  hlh1.parent = bodyGroup;
  var hlh2 = kSph({ diameter: 0.24, segments: 8 }, hlHouseMat);
  hlh2.position.copyFromFloats(0.38, 0.18, -noseLen + 0.01);
  hlh2.scaling.z = 0.5;
  hlh2.parent = bodyGroup;

  // Tail lights
  var tlMat = kartStd(0xff2222, 0xff0000, 0.5);
  var tl1 = kBox({ width: 0.18, height: 0.06, depth: 0.03 }, tlMat);
  tl1.position.copyFromFloats(-0.42, 0.22, 1.25);
  tl1.parent = bodyGroup;
  var tl2 = kBox({ width: 0.18, height: 0.06, depth: 0.03 }, tlMat);
  tl2.position.copyFromFloats(0.42, 0.22, 1.25);
  tl2.parent = bodyGroup;
  // Center brake light
  var cbl = kBox({ width: 0.5, height: 0.04, depth: 0.03 }, tlMat);
  cbl.position.copyFromFloats(0, spoilerH - 0.12, 1.22);
  cbl.parent = bodyGroup;

  // === CHARACTER-SPECIFIC DECORATIONS ===
  if (bodyType === 'dragon') {
    var flameMat = kartStdDS(0xFF6600, 0xFF4400, 0.5);
    var fg1 = kGnd({ width: 1.5, height: 0.18 }, flameMat);
    fg1.position.copyFromFloats(-0.67, 0.22, -0.2); fg1.rotation.z = Math.PI / 2;
    fg1.parent = bodyGroup;
    var fg2 = kGnd({ width: 1.5, height: 0.18 }, flameMat);
    fg2.position.copyFromFloats(0.67, 0.22, -0.2); fg2.rotation.z = Math.PI / 2;
    fg2.parent = bodyGroup;
    var fc = kCyl({ diameterTop: 0, diameterBottom: 0.3, height: 0.4, tessellation: 6 }, flameMat);
    fc.position.copyFromFloats(0, 0.28, -1.5); fc.rotation.x = Math.PI / 2;
    fc.parent = bodyGroup;
  } else if (bodyType === 'mermaid') {
    var finMat = kartStd(mainColor);
    var fin = kBox({ width: 0.04, height: 0.25, depth: 0.6 }, finMat);
    fin.position.copyFromFloats(0, 0.35, 0.3);
    fin.parent = bodyGroup;
    var ventMat = kartStd(0x333333);
    var v1 = kBox({ width: 0.02, height: 0.10, depth: 0.4 }, ventMat);
    v1.position.copyFromFloats(-0.66, 0.24, -0.5); v1.parent = bodyGroup;
    var v2 = kBox({ width: 0.02, height: 0.10, depth: 0.4 }, ventMat);
    v2.position.copyFromFloats(0.66, 0.24, -0.5); v2.parent = bodyGroup;
  } else if (bodyType === 'golem') {
    var leafMat = kartStd(0x44DD44, 0x22AA22, 0.3);
    var leaf = kSph({ diameter: 0.4, segments: 6 }, leafMat);
    leaf.position.copyFromFloats(0, 0.30, -0.6); leaf.scaling.copyFromFloats(1, 0.3, 1.5);
    leaf.parent = bodyGroup;
    var vineMat = kartStd(0x33AA33);
    var vine = kTorus({ diameter: 1.6, thickness: 0.03, tessellation: 12 }, vineMat);
    vine.position.copyFromFloats(-0.7, 0.20, 0); vine.rotation.y = Math.PI / 2;
    vine.parent = bodyGroup;
  } else if (bodyType === 'phantom') {
    var wingMat = kartStd(0x6633AA);
    var pw1 = kBox({ width: 0.5, height: 0.25, depth: 0.02 }, wingMat);
    pw1.position.copyFromFloats(-0.85, 0.35, 0.9); pw1.rotation.z = 0.4;
    pw1.parent = bodyGroup;
    var pw2 = kBox({ width: 0.5, height: 0.25, depth: 0.02 }, wingMat);
    pw2.position.copyFromFloats(0.85, 0.35, 0.9); pw2.rotation.z = -0.4;
    pw2.parent = bodyGroup;
    var glowMat = kartStd(0xBB77FF, 0x8844CC, 0.8);
    var pg1 = kSph({ diameter: 0.12, segments: 6 }, glowMat);
    pg1.position.copyFromFloats(-0.5, 0.18, -1.3); pg1.parent = bodyGroup;
    var pg2 = kSph({ diameter: 0.12, segments: 6 }, glowMat);
    pg2.position.copyFromFloats(0.5, 0.18, -1.3); pg2.parent = bodyGroup;
  } else if (bodyType === 'angel') {
    var starMat = kartStd(0xFFDD00, 0xFFAA00, 0.6);
    var star = kPoly({ type: 1, size: 0.2 }, starMat);
    star.position.copyFromFloats(0, 0.30, -0.7); star.scaling.copyFromFloats(1.2, 0.4, 1.2);
    star.parent = bodyGroup;
    var rayMat = kartStd(0xFFDD44, 0xFFAA00, 0.3);
    var ray1 = kBox({ width: 0.02, height: 0.08, depth: 1.2 }, rayMat);
    ray1.position.copyFromFloats(-0.67, 0.26, -0.1); ray1.parent = bodyGroup;
    var ray2 = kBox({ width: 0.02, height: 0.08, depth: 1.2 }, rayMat);
    ray2.position.copyFromFloats(0.67, 0.26, -0.1); ray2.parent = bodyGroup;
  } else if (bodyType === 'robot') {
    var antMat = kartStd(0x44DDDD, 0x00AAAA, 0.5);
    var ant = kCyl({ diameterTop: 0.04, diameterBottom: 0.03, height: 0.4, tessellation: 4 }, antMat);
    ant.position.copyFromFloats(0, 0.50, 0.5); ant.parent = bodyGroup;
    var antTip = kSph({ diameter: 0.10, segments: 6 }, antMat);
    antTip.position.copyFromFloats(0, 0.70, 0.5); antTip.parent = bodyGroup;
    var circMat = kartStdDS(0x00FFFF, 0x00CCCC, 0.4);
    var circ1 = kGnd({ width: 1.6, height: 0.06 }, circMat);
    circ1.position.copyFromFloats(-0.67, 0.22, 0); circ1.rotation.z = Math.PI / 2;
    circ1.parent = bodyGroup;
    var circ2 = kGnd({ width: 1.6, height: 0.06 }, circMat);
    circ2.position.copyFromFloats(0.67, 0.22, 0); circ2.rotation.z = Math.PI / 2;
    circ2.parent = bodyGroup;
  } else if (bodyType === 'ninja') {
    var shurikenMat = kartStd(0xFFAACC, 0xFF77AA, 0.4);
    var shuriken = kPoly({ type: 1, size: 0.15 }, shurikenMat);
    shuriken.position.copyFromFloats(0, 0.30, -0.8); shuriken.scaling.copyFromFloats(1.5, 0.3, 1.5);
    shuriken.parent = bodyGroup;
    var petalMat = kartStd(0xFF88BB, 0xFF5599, 0.2);
    for (var p = 0; p < 3; p++) {
      var pt1 = kSph({ diameter: 0.12, segments: 4 }, petalMat);
      pt1.position.copyFromFloats(-0.68, 0.22, -0.5 + p * 0.4); pt1.parent = bodyGroup;
      var pt2 = kSph({ diameter: 0.12, segments: 4 }, petalMat);
      pt2.position.copyFromFloats(0.68, 0.22, -0.5 + p * 0.4); pt2.parent = bodyGroup;
    }
  } else if (bodyType === 'king') {
    var crownMat = kartStd(0xFFDD00, 0xFFAA00, 0.3);
    var crown = kTorus({ diameter: 0.4, thickness: 0.04, tessellation: 8 }, crownMat);
    crown.position.copyFromFloats(0, 0.30, -0.6); crown.rotation.x = Math.PI / 2;
    crown.parent = bodyGroup;
    var goldMat = kartStd(0xFFDD00);
    var gs1 = kBox({ width: 0.03, height: 0.06, depth: 1.6 }, goldMat);
    gs1.position.copyFromFloats(-0.68, 0.26, 0); gs1.parent = bodyGroup;
    var gs2 = kBox({ width: 0.03, height: 0.06, depth: 1.6 }, goldMat);
    gs2.position.copyFromFloats(0.68, 0.26, 0); gs2.parent = bodyGroup;
  }

  this.bodyMesh = bodyGroup;
  bodyGroup.scaling.copyFromFloats(0.50, 0.18, 0.50);
  bodyGroup.position.y = -0.30;

  // === DRIVER ===
  var driverGroup = new BABYLON.TransformNode('driver' + (++_ktn), scene);
  driverGroup.parent = this.mesh;
  driverGroup.position.copyFromFloats(0, 0.55, 0.0);

  var hasGLBModel = glbModelCache[bodyType] !== undefined;

  if (hasGLBModel) {
    var glbClone = glbModelCache[bodyType].clone('driverClone_' + bodyType + (++_ktn), driverGroup);
    glbClone.setEnabled(true);
    var cms = glbClone.getChildMeshes();
    for (var ci = 0; ci < cms.length; ci++) cms[ci].setEnabled(true);
    glbClone.position.copyFromFloats(0, 0, 0);
    glbClone.scaling.scaleInPlace(2.2);
    glbClone.rotation.y = Math.PI;
    this.glbDriver = glbClone;

    // Steering wheel for GLB driver
    var swGroupGLB = new BABYLON.TransformNode('sw_glb' + (++_ktn), scene);
    swGroupGLB.parent = driverGroup;
    swGroupGLB.position.copyFromFloats(0, -0.1, -0.4);
    swGroupGLB.rotation.x = -0.3;
    var swMatGLB = kartStd(0x333333);
    var swTorus = kTorus({ diameter: 0.28, thickness: 0.025, tessellation: 12 }, swMatGLB);
    swTorus.parent = swGroupGLB;
    this.steeringWheel = swGroupGLB;
  } else {
    // Fallback: procedural driver
    var headMat = kartStd(skinColor);
    var head = kSph({ diameter: 0.6, segments: 14 }, headMat);
    head.position.y = 0.58;
    head.parent = driverGroup;
    if (shadowGen) shadowGen.addShadowCaster(head);
    this.headMesh = head;

    // Helmet
    var helmetMat = kartStd(helmetColor);
    var helmet = kSph({ diameter: 0.68, segments: 14 }, helmetMat);
    helmet.position.y = 0.62;
    helmet.scaling.copyFromFloats(1, 0.9, 1);
    helmet.parent = driverGroup;

    // Visor
    var visorTint = bodyType === 'phantom' ? 0x220044 : bodyType === 'dragon' ? 0x331100 : 0x111133;
    var visorMat = kartStd(visorTint);
    visorMat.alpha = 0.85;
    var visor = kSph({ diameter: 0.56, segments: 10, slice: 0.4 }, visorMat);
    visor.position.copyFromFloats(0, 0.6, -0.12);
    visor.parent = driverGroup;

    // Character-specific helmet decorations
    if (bodyType === 'dragon') {
      var crestMat = kartStd(0xFF2200, 0xFF4400, 0.4);
      var crest = kBox({ width: 0.04, height: 0.15, depth: 0.5 }, crestMat);
      crest.position.copyFromFloats(0, 0.82 + 0.55, 0.05 + 0.15);
      crest.parent = bodyGroup;
    } else if (bodyType === 'mermaid') {
      var antMat2 = kartStd(0x66BBFF);
      var mAnt = kCyl({ diameterTop: 0.03, diameterBottom: 0.02, height: 0.3, tessellation: 4 }, antMat2);
      mAnt.position.copyFromFloats(0.15, 0.85, 0); mAnt.parent = driverGroup;
      var tipMat = kartStd(0x00AAFF, 0x0088FF, 0.6);
      var mTip = kSph({ diameter: 0.08, segments: 6 }, tipMat);
      mTip.position.copyFromFloats(0.15, 1.0, 0); mTip.parent = driverGroup;
    } else if (bodyType === 'golem') {
      var gogMat = kartStd(0xFFDD44);
      var gog1 = kTorus({ diameter: 0.2, thickness: 0.025, tessellation: 12 }, gogMat);
      gog1.position.copyFromFloats(-0.12, 0.78, -0.18); gog1.rotation.x = 0.4;
      gog1.parent = driverGroup;
      var gog2 = kTorus({ diameter: 0.2, thickness: 0.025, tessellation: 12 }, gogMat);
      gog2.position.copyFromFloats(0.12, 0.78, -0.18); gog2.rotation.x = 0.4;
      gog2.parent = driverGroup;
    } else if (bodyType === 'phantom') {
      var hornMat = kartStd(0x6633AA);
      var horn1 = kCyl({ diameterTop: 0, diameterBottom: 0.08, height: 0.2, tessellation: 6 }, hornMat);
      horn1.position.copyFromFloats(-0.2, 0.82, -0.05); horn1.rotation.z = 0.4;
      horn1.parent = driverGroup;
      var horn2 = kCyl({ diameterTop: 0, diameterBottom: 0.08, height: 0.2, tessellation: 6 }, hornMat);
      horn2.position.copyFromFloats(0.2, 0.82, -0.05); horn2.rotation.z = -0.4;
      horn2.parent = driverGroup;
    } else if (bodyType === 'angel') {
      var haloMat = kartStd(0xFFDD00, 0xFFAA00, 0.6);
      var halo = kTorus({ diameter: 0.44, thickness: 0.02, tessellation: 16 }, haloMat);
      halo.position.y = 0.95; halo.rotation.x = Math.PI / 2;
      halo.parent = driverGroup;
    } else if (bodyType === 'robot') {
      var ledMat = kartStd(0x00FF00, 0x00FF00, 1.0);
      var led1 = kBox({ width: 0.06, height: 0.03, depth: 0.02 }, ledMat);
      led1.position.copyFromFloats(-0.1, 0.6, -0.28); led1.parent = driverGroup;
      var led2 = kBox({ width: 0.06, height: 0.03, depth: 0.02 }, ledMat);
      led2.position.copyFromFloats(0.1, 0.6, -0.28); led2.parent = driverGroup;
    } else if (bodyType === 'ninja') {
      var scarfMat = kartStdDS(0xFF77AA);
      var scarf = kGnd({ width: 0.3, height: 0.5 }, scarfMat);
      scarf.position.copyFromFloats(0, 0.5, 0.2); scarf.rotation.x = -0.3;
      scarf.parent = driverGroup;
    } else if (bodyType === 'king') {
      var crMat = kartStd(0xFFDD00, 0xFFAA00, 0.3);
      var cr = kTorus({ diameter: 0.5, thickness: 0.025, tessellation: 8 }, crMat);
      cr.position.y = 0.78; cr.rotation.x = Math.PI / 2;
      cr.parent = driverGroup;
      var gemMat = kartStd(0xFF0000, 0xFF0000, 0.5);
      var gem = kPoly({ type: 1, size: 0.04 }, gemMat);
      gem.position.copyFromFloats(0, 0.85, -0.15); gem.parent = driverGroup;
    }

    // Torso
    var torsoMat = kartStd(mainColor);
    var torso = kCyl({ diameterTop: 0.44, diameterBottom: 0.36, height: 0.45, tessellation: 8 }, torsoMat);
    torso.position.y = 0.22;
    torso.parent = driverGroup;

    // Arms
    var armMat = kartStd(mainColor);
    var armL = kCyl({ diameterTop: 0.12, diameterBottom: 0.10, height: 0.35, tessellation: 6 }, armMat);
    armL.position.copyFromFloats(-0.28, 0.15, -0.15); armL.rotation.z = 0.5; armL.rotation.x = -0.6;
    armL.parent = driverGroup;
    var armR = kCyl({ diameterTop: 0.12, diameterBottom: 0.10, height: 0.35, tessellation: 6 }, armMat);
    armR.position.copyFromFloats(0.28, 0.15, -0.15); armR.rotation.z = -0.5; armR.rotation.x = -0.6;
    armR.parent = driverGroup;

    // Steering wheel
    var swGroup = new BABYLON.TransformNode('sw' + (++_ktn), scene);
    swGroup.parent = driverGroup;
    swGroup.position.copyFromFloats(0, 0.1, -0.38);
    swGroup.rotation.x = -0.3;
    var swRing = kTorus({ diameter: 0.28, thickness: 0.025, tessellation: 12 }, darkMat);
    swRing.parent = swGroup;
    var spokeMat2 = kartStd(0x888888);
    for (var sp = 0; sp < 3; sp++) {
      var spoke = kCyl({ diameterTop: 0.02, diameterBottom: 0.02, height: 0.24, tessellation: 4 }, spokeMat2);
      spoke.rotation.z = sp * Math.PI / 3;
      spoke.parent = swGroup;
    }
    this.steeringWheel = swGroup;
  }

  this.driverGroup = driverGroup;

  // === WHEELS ===
  this.wheelMeshes = [];
  var wheelPositions = [
    { x: -0.72, z: -0.85 }, { x: 0.72, z: -0.85 },
    { x: -0.72, z: 0.9 }, { x: 0.72, z: 0.9 }
  ];

  for (var i = 0; i < 4; i++) {
    var wheelGroup = new BABYLON.TransformNode('wheel' + i + '_' + (++_ktn), scene);
    wheelGroup.parent = bodyGroup;
    var isFront = i < 2;
    var wR = isFront ? 0.28 : 0.33;
    var wW = isFront ? 0.14 : 0.17;

    // Tire
    var tireMat = kartStd(0x1a1a1a);
    var tire = kTorus({ diameter: wR * 2, thickness: wW, tessellation: 20 }, tireMat);
    tire.rotation.y = Math.PI / 2;
    tire.parent = wheelGroup;
    if (shadowGen) shadowGen.addShadowCaster(tire);

    // Rim disc
    var rimMat = kartPBR(0xdddddd, 0.8, 0.15);
    var rim = kCyl({ diameterTop: wR * 1.4, diameterBottom: wR * 1.4, height: wW * 1.3, tessellation: 14 }, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.parent = wheelGroup;

    // Rim spokes
    var spokeMat3 = kartPBR(0xcccccc, 0.7, 0.2);
    for (var sp = 0; sp < 5; sp++) {
      var spokeAng = (sp / 5) * Math.PI * 2;
      var rSpoke = kBox({ width: 0.04, height: wW * 1.1, depth: wR * 0.55 }, spokeMat3);
      rSpoke.position.copyFromFloats(
        Math.cos(spokeAng) * wR * 0.35,
        0,
        Math.sin(spokeAng) * wR * 0.35
      );
      rSpoke.rotation.y = spokeAng;
      rSpoke.parent = wheelGroup;
    }

    // Center cap
    var capMat = kartPBR(mainColor, 0.6, 0.2);
    var cap = kCyl({ diameterTop: wR * 0.44, diameterBottom: wR * 0.44, height: wW * 1.6, tessellation: 10 }, capMat);
    cap.rotation.z = Math.PI / 2;
    cap.parent = wheelGroup;

    wheelGroup.position.copyFromFloats(wheelPositions[i].x, 0.28, wheelPositions[i].z);
    this.wheelMeshes.push(wheelGroup);
  }

  this.updateMesh();
};

// === SKILL ACTIVATION (pure logic, no Three.js) ===
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
  }
  // shadow_phase, solar_boost, overclock, sakura_drift, golden_aura handled in update

  if (SND && SND.boost) SND.boost();
};

// === UPDATE (physics, AI, collisions - pure logic, no Three.js) ===
Racer.prototype.update = function (input, racers, sc, dt) {
  var timeScale = (dt || 0.016) * 60;

  // Handle finished state
  if (this.finished) {
    this.spd *= Math.pow(0.96, timeScale);
    if (this.spd < 0.05) this.spd = 0;

    var nearIdx = nearestTrackIndex(this.x, this.z);
    var lookahead = 4 + Math.floor(this.spd * 6);
    this.aiTargetIdx = (nearIdx + lookahead) % TRACK_POINTS;

    if (this.spd > 0.05) {
      var targetPt = getTrackPoint(this.aiTargetIdx);
      var dx = targetPt.x - this.x;
      var dz = targetPt.z - this.z;
      var targetAng = Math.atan2(dz, dx);
      var angDiff = targetAng - this.ang;
      while (angDiff > Math.PI) angDiff -= Math.PI * 2;
      while (angDiff < -Math.PI) angDiff += Math.PI * 2;
      this.ang += angDiff * Math.min(0.15 * timeScale, 1.0);
      this.x += Math.cos(this.ang) * this.spd * timeScale;
      this.z += Math.sin(this.ang) * this.spd * timeScale;
    }
    this.tilt *= Math.pow(0.9, timeScale);

    var nearNode = trackNodes[nearIdx];
    if (nearNode) {
      var offDx = this.x - nearNode.x;
      var offDz = this.z - nearNode.z;
      var offDist = Math.sqrt(offDx * offDx + offDz * offDz);
      if (offDist > TRACK_WIDTH * 0.25) {
        var pullStr = 0.05 * timeScale;
        this.x -= offDx * pullStr;
        this.z -= offDz * pullStr;
      }
      this.y += (nearNode.y - this.y) * 0.08 * timeScale;
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
    if (this.skillCooldown <= 0) this.skillReady = true;
  }

  // Skill active timer
  if (this.skillActive) {
    this.skillTimer -= timeScale;
    if (this.skillTimer <= 0) {
      this.skillActive = false;
      var cd = this.char.skillCD;
      if (this.equip === 'reactor') cd = Math.floor(cd * 0.75);
      this.skillCooldown = cd;
    }
  }

  // Auto-shield recharge
  if (this.equip === 'auto_shield' && !this.autoShieldReady) {
    this.autoShieldTimer += timeScale;
    if (this.autoShieldTimer >= 3600) {
      this.autoShieldReady = true;
      this.autoShieldTimer = 0;
    }
  }

  // Speed calculations
  var curMax = this.maxSpd;
  var ringBoost = this.rings * RING_BOOST_PER;
  curMax += ringBoost;
  if (this.boostTimer > 0) curMax *= 1.4;
  if (this.skillActive && this.char.skill === 'solar_boost') curMax *= 1.3;
  if (this.skillActive && this.char.skill === 'overclock') curMax *= 1.15;

  var curAccel = this.accel;
  var curHandling = this.handling;
  if (this.skillActive && this.char.skill === 'overclock') {
    curAccel *= 1.3;
    curHandling *= 1.3;
  }

  // Player controls
  if (this.isPlayer && input) {
    if (input.skill && this.skillReady && !this.skillActive) {
      this.activateSkill(racers);
      input.skill = false;
    }

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

    var wasDrifting = this.drifting;
    this.drifting = input.drift && this.spd > 0.3;

    var driftChargeRate = 1;
    if (this.equip === 'drift_up') driftChargeRate = 2;
    if (this.skillActive && this.char.skill === 'sakura_drift') driftChargeRate = 4;

    if (this.drifting && (input.left || input.right)) {
      this.driftCharge = Math.min(this.driftCharge + driftChargeRate * timeScale, 120);
    }
    if (wasDrifting && !this.drifting && this.driftCharge > 0) {
      var boostAmount = 0;
      if (this.driftCharge >= 90) boostAmount = 50;
      else if (this.driftCharge >= 45) boostAmount = 30;
      if (this.equip === 'nitro') boostAmount = Math.floor(boostAmount * 1.5);
      if (boostAmount > 0) {
        this.boostTimer = Math.max(this.boostTimer, boostAmount);
        if (SND && SND.boost) SND.boost();
      }
      this.driftCharge = 0;
    }
    if (!this.drifting) this.driftCharge = 0;

    var turnRate = curHandling * timeScale;
    if (this.drifting) turnRate *= 1.6;
    if (this.skillActive && this.char.skill === 'sakura_drift') turnRate *= 1.4;
    turnRate *= Math.min(1, Math.abs(this.spd) / 0.8);

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
    // === AI ===
    var nearIdx = nearestTrackIndex(this.x, this.z);
    var nearNode = trackNodes[nearIdx];

    // Distance from track center
    var offDx = nearNode ? this.x - nearNode.x : 0;
    var offDz = nearNode ? this.z - nearNode.z : 0;
    var offDist = Math.sqrt(offDx * offDx + offDz * offDz);
    var halfW = TRACK_WIDTH * 0.5;
    var centerRatio = offDist / halfW; // 0=center, 1=edge

    // Measure track curvature ahead (sum of angle changes over next 10 nodes)
    var curvatureSum = 0;
    for (var ci = 0; ci < 10; ci++) {
      var ca = getTrackAngle((nearIdx + ci) % TRACK_POINTS);
      var cb = getTrackAngle((nearIdx + ci + 1) % TRACK_POINTS);
      var cd = cb - ca;
      while (cd > Math.PI) cd -= Math.PI * 2;
      while (cd < -Math.PI) cd += Math.PI * 2;
      curvatureSum += cd;
    }
    var absCurve = Math.abs(curvatureSum);

    // Lookahead: much shorter on curves
    var lookahead = absCurve > 0.8 ? 3 : absCurve > 0.4 ? 4 : 6;
    lookahead += Math.floor(this.spd * 3);
    this.aiTargetIdx = (nearIdx + lookahead) % TRACK_POINTS;

    var targetPt = getTrackPoint(this.aiTargetIdx);
    var tAng = getTrackAngle(this.aiTargetIdx);
    var perpAng = tAng + Math.PI / 2;

    // Use lateral lane offset so AI karts don't all converge to same point
    var laneOff = this.aiLateral || 0;

    // Dynamic avoidance: shift target away from nearby karts (smoothed)
    var avoidTarget = 0;
    for (var av = 0; av < racers.length; av++) {
      if (racers[av] === this || racers[av].finished) continue;
      var avDx = this.x - racers[av].x;
      var avDz = this.z - racers[av].z;
      var avDist = Math.sqrt(avDx * avDx + avDz * avDz);
      if (avDist < 8 && avDist > 0.01) {
        // Gentle avoidance to prevent oscillation
        var avoidStrength = (8 - avDist) / 8;
        avoidStrength = avoidStrength * 2.5;
        var avAng = Math.atan2(avDz, avDx);
        var perpProj = Math.cos(avAng - perpAng);
        avoidTarget += perpProj > 0 ? avoidStrength : -avoidStrength;
      }
    }
    // Very smooth avoidance to prevent jerky steering
    this._smoothAvoid += (avoidTarget - this._smoothAvoid) * 0.06 * timeScale;
    laneOff += this._smoothAvoid;
    // Clamp lane offset to stay on track
    laneOff = Math.max(-halfW * 0.6, Math.min(halfW * 0.6, laneOff));

    var tx = targetPt.x + Math.cos(perpAng) * laneOff;
    var tz = targetPt.z + Math.sin(perpAng) * laneOff;

    var dx = tx - this.x;
    var dz = tz - this.z;
    var targetAng = Math.atan2(dz, dx);

    var angDiff = targetAng - this.ang;
    while (angDiff > Math.PI) angDiff -= Math.PI * 2;
    while (angDiff < -Math.PI) angDiff += Math.PI * 2;

    // Pre-movement centering is now handled in post-movement section

    // Progress-based stuck detection (smooth recovery, no teleport)
    if (typeof this._lastProgressCheck === 'undefined') {
      this._lastProgressCheck = this.progress;
      this._progressCheckTimer = 0;
      this._recovering = false;
    }
    this._progressCheckTimer += timeScale;
    if (this._progressCheckTimer > 300) {
      if (Math.abs(this.progress - this._lastProgressCheck) < 3) {
        this._recovering = true;
        this._recoverTarget = (nearestTrackIndex(this.x, this.z) + 3) % TRACK_POINTS;
      }
      this._lastProgressCheck = this.progress;
      this._progressCheckTimer = 0;
    }
    // Smooth recovery: lerp toward target node
    if (this._recovering) {
      var recNode = trackNodes[this._recoverTarget];
      if (recNode) {
        this.x += (recNode.x - this.x) * 0.05 * timeScale;
        this.z += (recNode.z - this.z) * 0.05 * timeScale;
        this.y += (recNode.y - this.y) * 0.05 * timeScale;
        var recAng = getTrackAngle(this._recoverTarget);
        var ra = recAng - this.ang;
        while (ra > Math.PI) ra -= Math.PI * 2;
        while (ra < -Math.PI) ra += Math.PI * 2;
        this.ang += ra * 0.05 * timeScale;
        this.spd = Math.max(this.spd, 0.3);
        var rd = Math.sqrt(Math.pow(this.x - recNode.x, 2) + Math.pow(this.z - recNode.z, 2));
        if (rd < 2) this._recovering = false;
      }
    }

    // AI Drift logic
    var absAngDiff = Math.abs(angDiff);
    var wasDriftingAI = this.aiDrifting;

    if (absAngDiff > 0.25 && this.spd > 0.5) this.aiDrifting = true;
    if (absAngDiff < 0.08) this.aiDrifting = false;

    // AI brakes on sharp curves
    if (absCurve > 0.6 && this.spd > 0.7) {
      this.spd *= (1 - 0.015 * timeScale);
    }

    var turnRate = curHandling * 2.2 * timeScale;
    if (this.aiDrifting) turnRate *= 1.8;
    turnRate = Math.max(turnRate, 0.035 * timeScale);
    // No speed penalty for turning - AI should always steer well
    // Extra turn boost when far from track center
    if (offDist > halfW * 0.5) turnRate *= 1.5;

    if (absAngDiff > turnRate) {
      this.ang += turnRate * (angDiff > 0 ? 1 : -1);
    } else {
      this.ang += angDiff;
    }

    var driftChargeRate = 1;
    if (this.equip === 'drift_up') driftChargeRate = 2;
    if (this.skillActive && this.char.skill === 'sakura_drift') driftChargeRate = 4;

    if (this.aiDrifting) {
      this.aiDriftCharge = Math.min(this.aiDriftCharge + driftChargeRate * timeScale, 120);
      this.tilt = angDiff > 0 ? 0.2 : -0.2;
    }

    if (wasDriftingAI && !this.aiDrifting && this.aiDriftCharge > 0) {
      var boostAmount = 0;
      if (this.aiDriftCharge >= 90) boostAmount = 50;
      else if (this.aiDriftCharge >= 45) boostAmount = 30;
      if (this.equip === 'nitro') boostAmount = Math.floor(boostAmount * 1.5);
      if (boostAmount > 0) this.boostTimer = Math.max(this.boostTimer, boostAmount);
      this.aiDriftCharge = 0;
    }
    if (!this.aiDrifting) {
      this.aiDriftCharge = 0;
      this.tilt *= Math.pow(0.9, timeScale);
    }

    // Rubber banding
    var rubberFactor = 1.0;
    var rbBehind = this.aiDiffRubberBehind || 0.08;
    var rbAhead = this.aiDiffRubberAhead || -0.08;
    if (player) {
      var playerProgress = player.progress || 0;
      var myProgress = this.progress || 0;
      var progressDiff = playerProgress - myProgress;

      if (progressDiff > 30) {
        rubberFactor = 1.0 + rbBehind + Math.min(progressDiff - 30, 80) * 0.002;
      } else if (progressDiff > 10) {
        rubberFactor = 1.0 + (progressDiff - 10) * (rbBehind / 20);
      } else if (progressDiff < -30) {
        rubberFactor = 1.0 + rbAhead;
      } else if (progressDiff < -10) {
        rubberFactor = 1.0 + rbAhead * 0.4;
      }
    }

    var aiMaxSpd = curMax * this.aiSkill * rubberFactor;
    if (absAngDiff > 0.5) aiMaxSpd *= 0.7;
    else if (absAngDiff > 0.3) aiMaxSpd *= 0.82;
    else if (absAngDiff > 0.15) aiMaxSpd *= 0.92;

    if (this.spd < aiMaxSpd) {
      this.spd += curAccel * timeScale;
      if (this.spd > aiMaxSpd) this.spd = aiMaxSpd;
    } else {
      this.spd *= Math.pow(0.995, timeScale);
    }

    // Smart skill use
    var skFreq = this.aiDiffSkillFreq || 1.0;
    if (this.skillReady && !this.skillActive) {
      var useSkill = false;
      var skill = this.char.skill;
      if (skill === 'flame_burst' || skill === 'solar_boost' || skill === 'overclock') {
        if (absAngDiff < 0.15 && this.spd > this.maxSpd * 0.7) useSkill = Math.random() < 0.01 * skFreq;
        if (player && (player.progress - this.progress) > 20) useSkill = Math.random() < 0.02 * skFreq;
      } else if (skill === 'aqua_shield') {
        for (var sr = 0; sr < racers.length; sr++) {
          if (racers[sr] !== this) {
            var sdx = racers[sr].x - this.x;
            var sdz = racers[sr].z - this.z;
            if (sdx * sdx + sdz * sdz < 100) { useSkill = Math.random() < 0.006 * skFreq; break; }
          }
        }
      } else if (skill === 'quake') {
        var nearCount = 0;
        for (var sr = 0; sr < racers.length; sr++) {
          if (racers[sr] !== this) {
            var sdx = racers[sr].x - this.x;
            var sdz = racers[sr].z - this.z;
            if (sdx * sdx + sdz * sdz < 900) nearCount++;
          }
        }
        if (nearCount >= 2) useSkill = Math.random() < 0.008 * skFreq;
      } else if (skill === 'sakura_drift') {
        if (absAngDiff > 0.2) useSkill = Math.random() < 0.012 * skFreq;
      } else {
        useSkill = Math.random() < 0.005 * skFreq;
      }
      if (useSkill) this.activateSkill(racers);
    }

    // Smart item use
    var itFreq = this.aiDiffItemFreq || 1.0;
    if (this.aiItemDelay > 0) this.aiItemDelay -= timeScale;
    if (this.item && this.aiItemDelay <= 0) {
      var useItem = false;
      if (this.item === 'boost') {
        if (absAngDiff < 0.15) useItem = Math.random() < 0.02 * itFreq;
        if (player && (player.progress - this.progress) > 15) useItem = Math.random() < 0.04 * itFreq;
      } else if (this.item === 'trap') {
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir] !== this && racers[ir].progress < this.progress &&
            (this.progress - racers[ir].progress) < 15) {
            useItem = Math.random() < 0.03 * itFreq;
            break;
          }
        }
      } else if (this.item === 'homing') {
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir] !== this && racers[ir].progress > this.progress &&
            (racers[ir].progress - this.progress) < 40) {
            useItem = Math.random() < 0.02 * itFreq;
            break;
          }
        }
      } else if (this.item === 'shield') {
        useItem = Math.random() < 0.01 * itFreq;
      } else if (this.item === 'thunder') {
        var myRank = 1;
        for (var ir = 0; ir < racers.length; ir++) {
          if (racers[ir].progress > this.progress) myRank++;
        }
        if (myRank >= 4) useItem = Math.random() < 0.015 * itFreq;
      }
      if (useItem) {
        this.useItem(racers, scene);
        this.aiItemDelay = 120;
      }
    }
  }

  // Movement
  this.x += Math.cos(this.ang) * this.spd * timeScale;
  this.z += Math.sin(this.ang) * this.spd * timeScale;

  // AI post-movement track centering (counteracts curve drift - smooth only)
  if (!this.isPlayer) {
    var pmIdx = nearestTrackIndex(this.x, this.z);
    var pmNode = trackNodes[pmIdx];
    if (pmNode) {
      var pmDx = this.x - pmNode.x;
      var pmDz = this.z - pmNode.z;
      var pmDist = Math.sqrt(pmDx * pmDx + pmDz * pmDz);
      var pmHW = TRACK_WIDTH * 0.5;
      // Progressively pull toward center starting at 40% of half-width
      if (pmDist > pmHW * 0.4) {
        var pmRatio = Math.min(1, (pmDist - pmHW * 0.4) / (pmHW * 0.6));
        var pmPull = pmRatio * pmRatio * 0.4 * timeScale;
        this.x -= pmDx / pmDist * pmPull;
        this.z -= pmDz / pmDist * pmPull;
      }
      // Strong pull at 70% (no hard snap)
      if (pmDist > pmHW * 0.7) {
        var overRatio = (pmDist - pmHW * 0.7) / (pmHW * 0.3);
        var strongPull = Math.min(overRatio * 1.5, 2.0) * timeScale;
        this.x -= pmDx / pmDist * strongPull;
        this.z -= pmDz / pmDist * strongPull;
      }
    }
  }

  // Track Y position + ramp jump physics
  var nearIdx = nearestTrackIndex(this.x, this.z);
  var nearNode = trackNodes[nearIdx];

  // Ramp detection (ramp spots at nodes 48, 92)
  var rampSpots = [48, 92];
  var onRamp = false;
  for (var ri = 0; ri < rampSpots.length; ri++) {
    var rampIdx = rampSpots[ri];
    var idxDiff = Math.abs(nearIdx - rampIdx);
    if (idxDiff > TRACK_POINTS / 2) idxDiff = TRACK_POINTS - idxDiff;
    if (idxDiff <= 2) {
      onRamp = true;
      // On the ramp - raise kart along slope
      var rampProgress = 1 - idxDiff / 2; // 0 at edge, 1 at center
      var rampHeight = 2.5 * rampProgress;
      if (nearNode) {
        var rampY = nearNode.y + rampHeight;
        this.y += (rampY - this.y) * 0.3 * timeScale;
      }
      // Launch at ramp peak
      if (idxDiff <= 1 && !this.airborne && this.spd > 0.3) {
        this.airborne = true;
        this.vy = 0.15 + this.spd * 0.08;
      }
      break;
    }
  }

  if (this.airborne) {
    // Apply gravity
    this.vy -= 0.008 * timeScale;
    this.y += this.vy * timeScale;
    // Landing check
    var groundY = nearNode ? nearNode.y : 0;
    if (this.y <= groundY && this.vy < 0) {
      this.y = groundY;
      this.vy = 0;
      this.airborne = false;
      // Landing boost
      if (this.spd > 0.5) this.boostTimer = Math.max(this.boostTimer, 15);
    }
  } else if (!onRamp && nearNode) {
    this.y += (nearNode.y - this.y) * 0.15 * timeScale;
  }

  // Off-track handling
  var distToTrack = trackDist(this.x, this.z);
  var halfW = TRACK_WIDTH / 2;
  var grassEdge = halfW + 0.5;
  var wallLimit = halfW + 1.5;

  var phasing = this.skillActive && this.char.skill === 'shadow_phase';

  if (!phasing && distToTrack > wallLimit) {
    var centerNode = trackNodes[nearIdx];
    var pushAng = Math.atan2(centerNode.z - this.z, centerNode.x - this.x);
    var overshoot = distToTrack - wallLimit;
    var pushStr = Math.min(overshoot * 0.6, 3.0) * timeScale;
    this.x += Math.cos(pushAng) * pushStr;
    this.z += Math.sin(pushAng) * pushStr;
    this.spd *= Math.pow(0.95, timeScale);
    var toTrackAng = Math.atan2(centerNode.z - this.z, centerNode.x - this.x);
    var angDiffToTrack = toTrackAng - this.ang;
    while (angDiffToTrack > Math.PI) angDiffToTrack -= Math.PI * 2;
    while (angDiffToTrack < -Math.PI) angDiffToTrack += Math.PI * 2;
    var steerStr = this.isPlayer ? 0.06 : 0.15;
    this.ang += angDiffToTrack * steerStr * timeScale;
    if (!this.isPlayer) {
      if (this.spd < 0.15) {
        this.aiStuckTimer = (this.aiStuckTimer || 0) + timeScale;
      } else {
        this.aiStuckTimer = 0;
      }
      if (this.aiStuckTimer > 90) {
        // Smooth recovery: lerp toward track center instead of teleporting
        var recoverNode = trackNodes[nearIdx];
        this.x += (recoverNode.x - this.x) * 0.1 * timeScale;
        this.z += (recoverNode.z - this.z) * 0.1 * timeScale;
        this.y += (recoverNode.y - this.y) * 0.1 * timeScale;
        var recAng = getTrackAngle(nearIdx);
        var raDiff = recAng - this.ang;
        while (raDiff > Math.PI) raDiff -= Math.PI * 2;
        while (raDiff < -Math.PI) raDiff += Math.PI * 2;
        this.ang += raDiff * 0.1 * timeScale;
        this.spd = Math.max(this.spd, 0.3);
        if (this.aiStuckTimer > 150) this.aiStuckTimer = 0;
      }
    }
  } else if (!phasing && distToTrack > grassEdge) {
    var grassDepth = (distToTrack - grassEdge) / (wallLimit - grassEdge);
    this.spd *= Math.pow((0.98 - grassDepth * 0.04), timeScale);
    if (!this.isPlayer) this.aiStuckTimer = 0;
  } else {
    if (!this.isPlayer) this.aiStuckTimer = 0;
  }

  // Progress tracking
  var prevIdx = this.totalIdx;
  this.totalIdx = nearIdx;

  var idxDelta = nearIdx - prevIdx;
  if (idxDelta < -TRACK_POINTS / 2) idxDelta += TRACK_POINTS;
  if (idxDelta > TRACK_POINTS / 2) idxDelta -= TRACK_POINTS;
  this.progressAccum += idxDelta;
  this.progress = this.progressAccum;

  // Lap detection
  if (prevIdx > TRACK_POINTS - 50 && this.totalIdx < 50) {
    if (!this.crossedStartOnce) {
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

      if (rdist < magnetRange && rdist > 3) {
        var pullStr = 0.3 * timeScale;
        ring.x += rdx / rdist * pullStr;
        ring.z += rdz / rdist * pullStr;
      }

      if (rdist < 3) {
        ring.active = false;
        ring.respawn = 300;
        if (typeof energyRingMeshes !== 'undefined' && energyRingMeshes[i]) energyRingMeshes[i].setEnabled(false);
        if (this.rings < RING_MAX) {
          this.rings++;
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
        box.respawn = 180;
        if (itemBoxMeshes[i]) itemBoxMeshes[i].setEnabled(false);
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
      if (bpdist < 16) {
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
            this.rings = Math.max(0, this.rings - RING_DROP_ON_HIT);
          }
          traps.splice(t, 1);
          if (trapMeshes && trapMeshes[t]) {
            trapMeshes[t].dispose();
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
            projMeshes[p].dispose();
            projMeshes.splice(p, 1);
          }
          p--;
          if (SND && SND.hit) SND.hit();
        }
      }
    }
  }

  // Collision with other racers (only lower-index resolves each pair once)
  // Grace period at race start to prevent shaking from tight starting positions
  if (!phasing && fr > 180) {
    var minSep = 3.0;
    var myIdx = racers.indexOf(this);
    for (var r = 0; r < racers.length; r++) {
      if (r <= myIdx) continue;
      var other = racers[r];
      if (other.finished) continue;
      var dx = this.x - other.x;
      var dz = this.z - other.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minSep && dist > 0.01) {
        var pushAng = Math.atan2(dz, dx);
        // Gentle push to prevent vibration
        var pushDist = Math.min((minSep - dist) * 0.2, 0.3);
        this.x += Math.cos(pushAng) * pushDist;
        this.z += Math.sin(pushAng) * pushDist;
        other.x -= Math.cos(pushAng) * pushDist;
        other.z -= Math.sin(pushAng) * pushDist;
        // Speed differentiation to separate naturally
        var spdDiff = this.spd - other.spd;
        this.spd -= spdDiff * 0.03;
        other.spd += spdDiff * 0.03;
      }
    }
  }

  // Ghost recording
  if (this.isPlayer && typeof ghostRecording !== 'undefined' && ghostRecording && typeof ghostSamples !== 'undefined') {
    if (fr % GHOST_SAMPLE_INTERVAL === 0) {
      var flags = 0;
      if (this.drifting) flags |= 1;
      if (this.boostTimer > 0) flags |= 2;
      ghostSamples.push([
        Math.round(this.x * 10) / 10,
        Math.round(this.z * 10) / 10,
        Math.round(this.y * 10) / 10,
        Math.round(this.ang * 100) / 100,
        flags
      ]);
    }
  }

  this.updateMesh();
};

// === UPDATE MESH (Babylon.js version) ===
Racer.prototype.updateMesh = function () {
  if (!this.mesh) return;

  this.mesh.position.copyFromFloats(this.x, this.y, this.z);
  this.mesh.rotation.y = -this.ang - Math.PI / 2;

  if (this.bodyMesh) {
    this.bodyMesh.rotation.z = -this.tilt;
  }
  if (this.driverGroup) {
    this.driverGroup.rotation.z = -this.tilt * 0.35;
    this.driverGroup.rotation.x = Math.min(this.spd * 0.05, 0.06);
  }
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

  // Shadow phase transparency
  if (this.char.skill === 'shadow_phase') {
    var targetOpacity = this.skillActive ? (0.4 + Math.sin(fr * 0.2) * 0.2) : 1.0;
    var childMeshes = this.mesh.getChildMeshes ? this.mesh.getChildMeshes() : [];
    for (var ci = 0; ci < childMeshes.length; ci++) {
      var cm = childMeshes[ci];
      if (cm.material) {
        cm.material.alpha = targetOpacity;
      }
    }
  }

  // Emissive effects on body
  if (this.bodyMesh) {
    var children = this.bodyMesh.getChildMeshes ? this.bodyMesh.getChildMeshes() : [];
    for (var c = 0; c < children.length; c++) {
      var child = children[c];
      if (!child.material || !child.material.emissiveColor) continue;

      // Reset emissive
      child.material.emissiveColor = new BABYLON.Color3(0, 0, 0);

      if (this.shieldTimer > 0) {
        child.material.emissiveColor = c3(0x4488ff).scale(0.3);
      }
      if (this.boostTimer > 0) {
        child.material.emissiveColor = c3(0xff8800).scale(0.4);
      }
      if (this.skillActive) {
        child.material.emissiveColor = c3(this.char.col).scale(0.5 + Math.sin(fr * 0.15) * 0.2);
      }
      if (this.stunTimer > 0 && fr % 10 < 5) {
        child.material.emissiveColor = c3(0xffff00).scale(0.5);
      }
    }
  }

  // Drift charge visual
  if (this.drifting && this.driftCharge > 0) {
    var sparkColor;
    if (this.driftCharge >= 90) sparkColor = c3(0xff6600);
    else if (this.driftCharge >= 45) sparkColor = c3(0x4488ff);
    else sparkColor = c3(0xffffff);
    for (var w = 2; w < 4; w++) {
      var wheel = this.wheelMeshes[w];
      if (!wheel) continue;
      var wChildren = wheel.getChildMeshes ? wheel.getChildMeshes() : [];
      for (var wc = 0; wc < wChildren.length; wc++) {
        var part = wChildren[wc];
        if (part.material && part.material.albedoColor) {
          // Check if spoke (metallic silver part)
          var ac = part.material.albedoColor;
          if (ac.r > 0.7 && ac.g > 0.7 && ac.b > 0.7) {
            part.material.emissiveColor = sparkColor.scale(0.6 + Math.sin(fr * 0.5) * 0.3);
          }
        } else if (part.material && part.material.diffuseColor) {
          var dc = part.material.diffuseColor;
          if (dc.r > 0.7 && dc.g > 0.7 && dc.b > 0.7) {
            part.material.emissiveColor = sparkColor.scale(0.6 + Math.sin(fr * 0.5) * 0.3);
          }
        }
      }
    }
  } else {
    for (var w = 2; w < 4; w++) {
      var wheel = this.wheelMeshes[w];
      if (!wheel) continue;
      var wChildren = wheel.getChildMeshes ? wheel.getChildMeshes() : [];
      for (var wc = 0; wc < wChildren.length; wc++) {
        var part = wChildren[wc];
        if (part.material && part.material.emissiveColor) {
          part.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
        }
      }
    }
  }
};

// === USE ITEM (no Three.js) ===
Racer.prototype.useItem = function (racers, sc) {
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

// === Ghost Racer (replays recorded ghost data) ===
var ghostRacers = [];

function GhostRacer(ghostData, sc) {
  this.displayName = ghostData.displayName || 'Ghost';
  this.charIdx = ghostData.charIdx || 0;
  this.kartIdx = ghostData.kartIdx || 0;
  this.char = CHARACTERS[this.charIdx] || CHARACTERS[0];
  this.samples = ghostData.samples || [];
  this.sampleIdx = 0;
  this.finished = false;
  this.isGhost = true;
  this.x = 0; this.y = 0; this.z = 0; this.ang = 0;

  // Create ghost mesh (semi-transparent clone)
  this.mesh = new BABYLON.TransformNode('ghost' + (++_ktn), scene);
  var bodyType = this.char.body || 'dragon';
  var hasKartModel = kartModelCache[bodyType] !== undefined;
  if (hasKartModel) {
    var kartClone = kartModelCache[bodyType].clone('ghostKart_' + bodyType + (++_ktn), this.mesh);
    kartClone.setEnabled(true);
    var cms = kartClone.getChildMeshes();
    for (var ci = 0; ci < cms.length; ci++) cms[ci].setEnabled(true);
    kartClone.rotation.y = Math.PI;
  } else if (glbModelCache[bodyType]) {
    var glbClone = glbModelCache[bodyType].clone('ghostGlb_' + bodyType + (++_ktn), this.mesh);
    glbClone.setEnabled(true);
    var cms = glbClone.getChildMeshes();
    for (var ci = 0; ci < cms.length; ci++) cms[ci].setEnabled(true);
  } else {
    // Simple placeholder
    var mat = kartStd(this.char.col);
    mat.alpha = 0.4;
    var box = kBox({ width: 1.5, height: 0.8, depth: 2.5 }, mat);
    box.parent = this.mesh;
  }

  // Make all child materials semi-transparent
  var allMeshes = this.mesh.getChildMeshes();
  for (var i = 0; i < allMeshes.length; i++) {
    var cm = allMeshes[i];
    if (cm.material) {
      // Clone material so we don't affect the template
      cm.material = cm.material.clone('ghostMat' + (++_ktn));
      cm.material.alpha = 0.35;
      cm.material.disableDepthWrite = true;
    }
  }

  // Name label
  this.nameDiv = document.createElement('div');
  this.nameDiv.className = 'ghost-name';
  this.nameDiv.textContent = this.displayName;
  this.nameDiv.style.display = 'none';
  document.body.appendChild(this.nameDiv);

  // Set initial position
  if (this.samples.length > 0) {
    var s = this.samples[0];
    this.x = s[0]; this.z = s[1]; this.y = s[2]; this.ang = s[3];
  }
}

GhostRacer.prototype.update = function (currentFrame) {
  if (this.finished || this.samples.length === 0) return;

  var sIdx = Math.floor(currentFrame / GHOST_SAMPLE_INTERVAL);
  if (sIdx >= this.samples.length) {
    this.finished = true;
    if (this.mesh) this.mesh.setEnabled(false);
    if (this.nameDiv) this.nameDiv.style.display = 'none';
    return;
  }

  // Interpolate between samples
  var fracFrame = currentFrame / GHOST_SAMPLE_INTERVAL;
  var idx0 = Math.floor(fracFrame);
  var idx1 = Math.min(idx0 + 1, this.samples.length - 1);
  var t = fracFrame - idx0;

  var s0 = this.samples[idx0];
  var s1 = this.samples[idx1];

  this.x = s0[0] + (s1[0] - s0[0]) * t;
  this.z = s0[1] + (s1[1] - s0[1]) * t;
  this.y = s0[2] + (s1[2] - s0[2]) * t;

  var angDiff = s1[3] - s0[3];
  if (angDiff > Math.PI) angDiff -= Math.PI * 2;
  if (angDiff < -Math.PI) angDiff += Math.PI * 2;
  this.ang = s0[3] + angDiff * t;

  // Update mesh
  if (this.mesh) {
    this.mesh.position.copyFromFloats(this.x, this.y, this.z);
    this.mesh.rotation.y = -this.ang - Math.PI / 2;
  }

  // Update name label position (project 3D to 2D)
  if (this.nameDiv && typeof camera !== 'undefined' && camera && typeof engine !== 'undefined' && engine) {
    var pos3d = new BABYLON.Vector3(this.x, this.y + 2.5, this.z);
    var projected = BABYLON.Vector3.Project(
      pos3d,
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );
    if (projected.z < 1) {
      this.nameDiv.style.left = projected.x + 'px';
      this.nameDiv.style.top = projected.y + 'px';
      this.nameDiv.style.display = 'block';
    } else {
      this.nameDiv.style.display = 'none';
    }
  }
};

GhostRacer.prototype.cleanup = function (sc) {
  if (this.mesh) this.mesh.dispose();
  if (this.nameDiv && this.nameDiv.parentNode) this.nameDiv.parentNode.removeChild(this.nameDiv);
};
