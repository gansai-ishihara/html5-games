// kart.js - Racer/Kart module for drift racing game
// Uses Three.js r128 (globally loaded)

var racers = [];
var player = null;

// GLB Model loading system
var glbModelCache = {};  // bodyType -> THREE.Group (template)
var glbModelsLoaded = false;
var glbLoader = null;

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

  bodyTypes.forEach(function(bodyType) {
    var url = MODEL_FILES[bodyType];
    glbLoader.load(url,
      function(gltf) {
        var model = gltf.scene;
        // Compute bounding box to normalize size
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        box.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        // Target: character model roughly 1.2 units tall (sitting in kart)
        var targetSize = 1.2;
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
        model.traverse(function(child) {
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
      function(err) {
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

  envTypes.forEach(function(envType) {
    var url = ENV_MODEL_FILES[envType];
    glbLoader.load(url,
      function(gltf) {
        var model = gltf.scene;
        // マテリアルのPBRプロパティを調整 → ファンタジー風の明るく鮮やかな見た目に
        model.traverse(function(child) {
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
        // Y軸反転: ENV_MODEL_FLIP_Yで指定されたモデルをX軸回転で上下反転
        if (typeof ENV_MODEL_FLIP_Y !== 'undefined' && ENV_MODEL_FLIP_Y[envType]) {
          model.rotation.x = Math.PI;
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
      function(err) {
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

// Clone an environment model with given position, scale, and rotation
// Box3正規化: Y軸反転検出、地面設置、サイズ正規化
function placeEnvModel(scene, envType, x, y, z, scale, rotY) {
  var template = envModelCache[envType];
  if (!template) return null;
  var clone = template.clone();

  // Box3で正規化 - モデルのバウンディングボックスを計算
  var box = new THREE.Box3().setFromObject(clone);
  var size = new THREE.Vector3();
  box.getSize(size);
  var center = new THREE.Vector3();
  box.getCenter(center);

  // Y軸反転検出: 重心が下にある場合はY反転している可能性
  // (正常なモデルは原点が底面付近にあるはず)
  var maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) maxDim = 1;

  // スケール適用
  var s = (typeof scale === 'number') ? scale : 1;
  var normalizedScale = s / maxDim;
  clone.scale.set(normalizedScale, normalizedScale, normalizedScale);

  // 再計算 (スケール後)
  box.setFromObject(clone);
  box.getCenter(center);

  // 地面に設置: モデルの底面をy座標に合わせる
  clone.position.set(
    x - center.x + x * 0, // centerX分ずらして中央配置
    y - box.min.y,          // 底面をy座標に合わせる
    z - center.z + z * 0
  );
  // X,Z位置を直接設定 (centerオフセットは不要、positionで直接指定)
  clone.position.x = x;
  clone.position.z = z;
  clone.position.y = y - box.min.y + y * 0;
  // box.min.yが負なら地面より下にあるので持ち上げる
  var groundOffset = -box.min.y;
  clone.position.set(x, y + groundOffset, z);

  if (rotY !== undefined) clone.rotation.y = rotY;
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
  this.lastCP = 0;

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

Racer.prototype.placeAt = function(idx) {
  var pt = getTrackPoint(idx);
  this.x = pt.x;
  this.y = pt.y;
  this.z = pt.z;
  this.ang = getTrackAngle(idx);
  this.totalIdx = idx;
  this.aiTargetIdx = idx + 10;
};

Racer.prototype.createMesh = function(scene) {
  this.mesh = new THREE.Group();

  var char = this.char;
  var mainColor = char.col;
  var helmetColor = char.hc;
  var darkColor = char.bc;
  var skinColor = char.skin || 0xFFDBAC;
  var bodyType = char.body || 'dragon';

  // Materials
  var bodyMat = new THREE.MeshLambertMaterial({
    color: mainColor, metalness: 0.55, roughness: 0.18
  });
  var darkMat = new THREE.MeshLambertMaterial({
    color: 0x222228, metalness: 0.5, roughness: 0.25
  });
  var chromeMat = new THREE.MeshLambertMaterial({
    color: 0xeeeeee, metalness: 0.9, roughness: 0.08
  });
  var accentMat = new THREE.MeshLambertMaterial({
    color: darkColor, metalness: 0.5, roughness: 0.2
  });

  var bodyGroup = new THREE.Group();

  // === MAIN BODY - shape varies by kart style ===
  var kartStyle = KARTS[this.kartIdx] ? KARTS[this.kartIdx].style : 'medium';
  var baseW = 1.5, baseH = 0.22, baseD = 2.4;
  var shellW = 1.3, shellH = 0.38, shellD = 2.0;

  if (kartStyle === 'long') { baseW = 1.35; baseD = 2.7; shellW = 1.15; shellD = 2.3; shellH = 0.32; }
  else if (kartStyle === 'wide') { baseW = 1.65; shellW = 1.45; shellH = 0.42; }

  // Lower chassis
  var base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseD), darkMat);
  base.position.y = 0.15;
  base.castShadow = true;
  bodyGroup.add(base);

  // Upper body shell
  var shell = new THREE.Mesh(new THREE.BoxGeometry(shellW, shellH, shellD), bodyMat);
  shell.position.set(0, 0.38, -0.1);
  shell.castShadow = true;
  bodyGroup.add(shell);

  // Front nose
  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bodyMat);
  nose.position.set(0, 0.32, -1.2);
  nose.scale.set(1.2, 0.5, 0.7);
  bodyGroup.add(nose);

  // Chrome bumper
  var bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), chromeMat);
  bumper.position.set(0, 0.18, -1.4);
  bumper.rotation.z = Math.PI / 2;
  bodyGroup.add(bumper);

  // Side skirts
  var skirtGeom = new THREE.BoxGeometry(0.12, 0.2, 1.8);
  bodyGroup.add(new THREE.Mesh(skirtGeom, accentMat).translateX(-0.72).translateY(0.18));
  bodyGroup.add(new THREE.Mesh(skirtGeom, accentMat).translateX(0.72).translateY(0.18));

  // Engine cowl
  var cowl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), accentMat);
  cowl.position.set(0, 0.45, 0.85);
  cowl.scale.set(1.1, 0.65, 0.8);
  bodyGroup.add(cowl);

  // Spoiler
  var spoilerMat = new THREE.MeshLambertMaterial({ color: mainColor, metalness: 0.6, roughness: 0.15 });
  var spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.2), spoilerMat);
  spoiler.position.set(0, 0.85, 1.15);
  spoiler.rotation.x = -0.15;
  bodyGroup.add(spoiler);
  var epGeom = new THREE.BoxGeometry(0.04, 0.16, 0.22);
  bodyGroup.add(new THREE.Mesh(epGeom, spoilerMat).translateX(-0.68).translateY(0.82).translateZ(1.15));
  bodyGroup.add(new THREE.Mesh(epGeom, spoilerMat).translateX(0.68).translateY(0.82).translateZ(1.15));
  var sGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6);
  bodyGroup.add(new THREE.Mesh(sGeom, chromeMat).translateX(-0.45).translateY(0.65).translateZ(1.05));
  bodyGroup.add(new THREE.Mesh(sGeom, chromeMat).translateX(0.45).translateY(0.65).translateZ(1.05));

  // Exhaust
  var exhMat = new THREE.MeshLambertMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.1 });
  var exhGeom = new THREE.CylinderGeometry(0.07, 0.09, 0.35, 8);
  var lExh = new THREE.Mesh(exhGeom, exhMat);
  lExh.position.set(-0.32, 0.22, 1.35); lExh.rotation.x = Math.PI / 2.3;
  bodyGroup.add(lExh);
  var rExh = new THREE.Mesh(exhGeom, exhMat);
  rExh.position.set(0.32, 0.22, 1.35); rExh.rotation.x = Math.PI / 2.3;
  bodyGroup.add(rExh);

  // Headlights
  var hlMat = new THREE.MeshLambertMaterial({
    color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.1
  });
  bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hlMat).translateX(-0.4).translateY(0.3).translateZ(-1.45));
  bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hlMat).translateX(0.4).translateY(0.3).translateZ(-1.45));

  // Tail lights
  var tlMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.4 });
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.04), tlMat).translateX(-0.45).translateY(0.35).translateZ(1.2));
  bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.04), tlMat).translateX(0.45).translateY(0.35).translateZ(1.2));

  // === CHARACTER-SPECIFIC DECORATIONS based on body type ===
  if (bodyType === 'dragon') {
    // Flame stripes + flame tip
    var flameMat = new THREE.MeshLambertMaterial({
      color: 0xFF6600, emissive: 0xFF4400, emissiveIntensity: 0.5, side: THREE.DoubleSide
    });
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.25), flameMat).translateX(-0.67).translateY(0.32).translateZ(-0.2).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.25), flameMat).translateX(0.67).translateY(0.32).translateZ(-0.2).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6), flameMat).translateY(0.45).translateZ(-1.5).rotateX(Math.PI / 2));
  } else if (bodyType === 'mermaid') {
    // Fin + side vents
    var finMat = new THREE.MeshLambertMaterial({ color: mainColor, metalness: 0.6, roughness: 0.15 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.6), finMat).translateY(0.65).translateZ(0.3));
    var ventMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.4), ventMat).translateX(-0.66).translateY(0.38).translateZ(-0.5));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.4), ventMat).translateX(0.66).translateY(0.38).translateZ(-0.5));
  } else if (bodyType === 'golem') {
    // Leaf emblem + vine trim
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x44DD44, emissive: 0x22AA22, emissiveIntensity: 0.3 });
    var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), leafMat);
    leaf.position.set(0, 0.52, -0.6); leaf.scale.set(1, 0.3, 1.5);
    bodyGroup.add(leaf);
    var vineMat = new THREE.MeshLambertMaterial({ color: 0x33AA33 });
    var vine = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 4, 12, Math.PI), vineMat);
    vine.position.set(-0.7, 0.28, 0); vine.rotation.y = Math.PI / 2;
    bodyGroup.add(vine);
  } else if (bodyType === 'phantom') {
    // Bat wings + glowing accents
    var wingMat = new THREE.MeshLambertMaterial({ color: 0x6633AA, metalness: 0.7, roughness: 0.1 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), wingMat).translateX(-0.85).translateY(0.6).translateZ(0.9).rotateZ(0.4));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), wingMat).translateX(0.85).translateY(0.6).translateZ(0.9).rotateZ(-0.4));
    var glowMat = new THREE.MeshLambertMaterial({ color: 0xBB77FF, emissive: 0x8844CC, emissiveIntensity: 0.8 });
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat).translateX(-0.5).translateY(0.25).translateZ(-1.3));
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat).translateX(0.5).translateY(0.25).translateZ(-1.3));
  } else if (bodyType === 'angel') {
    // Star emblem + sun ray stripes
    var starMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.1 });
    var star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), starMat);
    star.position.set(0, 0.55, -0.7); star.scale.set(1.2, 0.4, 1.2);
    bodyGroup.add(star);
    var rayMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, emissive: 0xFFAA00, emissiveIntensity: 0.3 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 1.2), rayMat).translateX(-0.67).translateY(0.42).translateZ(-0.1));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 1.2), rayMat).translateX(0.67).translateY(0.42).translateZ(-0.1));
  } else if (bodyType === 'robot') {
    // Antenna + circuit lines
    var antMat = new THREE.MeshLambertMaterial({ color: 0x44DDDD, emissive: 0x00AAAA, emissiveIntensity: 0.5 });
    bodyGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.4, 4), antMat).translateY(0.9).translateZ(0.5));
    bodyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), antMat).translateY(1.1).translateZ(0.5));
    // Circuit pattern on sides
    var circMat = new THREE.MeshLambertMaterial({ color: 0x00FFFF, emissive: 0x00CCCC, emissiveIntensity: 0.4, side: THREE.DoubleSide });
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), circMat).translateX(-0.67).translateY(0.35).translateZ(0).rotateY(Math.PI / 2));
    bodyGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.06), circMat).translateX(0.67).translateY(0.35).translateZ(0).rotateY(Math.PI / 2));
  } else if (bodyType === 'ninja') {
    // Shuriken emblem + stealth trim
    var shurikenMat = new THREE.MeshLambertMaterial({ color: 0xFFAACC, emissive: 0xFF77AA, emissiveIntensity: 0.4, metalness: 0.7 });
    var shuriken = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), shurikenMat);
    shuriken.position.set(0, 0.55, -0.8); shuriken.scale.set(1.5, 0.3, 1.5);
    bodyGroup.add(shuriken);
    // Sakura petal-like side trim
    var petalMat = new THREE.MeshLambertMaterial({ color: 0xFF88BB, emissive: 0xFF5599, emissiveIntensity: 0.2 });
    for (var p = 0; p < 3; p++) {
      var petal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), petalMat);
      petal.position.set(-0.68, 0.35, -0.5 + p * 0.4);
      bodyGroup.add(petal);
      var petal2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), petalMat);
      petal2.position.set(0.68, 0.35, -0.5 + p * 0.4);
      bodyGroup.add(petal2);
    }
  } else if (bodyType === 'king') {
    // Crown ridge + gold trim
    var crownMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.3, metalness: 0.8 });
    // Gold crown emblem on hood
    var crown = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 4, 8), crownMat);
    crown.position.set(0, 0.52, -0.6); crown.rotation.x = Math.PI / 2;
    bodyGroup.add(crown);
    // Gold side stripe
    var goldMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, metalness: 0.8, roughness: 0.1 });
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 1.6), goldMat).translateX(-0.68).translateY(0.42).translateZ(0));
    bodyGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 1.6), goldMat).translateX(0.68).translateY(0.42).translateZ(0));
  }

  // Number circle
  var numMat = new THREE.MeshLambertMaterial({ color: 0xffffff, roughness: 0.5 });
  var numGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12);
  bodyGroup.add(new THREE.Mesh(numGeom, numMat).translateX(-0.73).translateY(0.38).translateZ(-0.1).rotateZ(Math.PI / 2));
  bodyGroup.add(new THREE.Mesh(numGeom, numMat).translateX(0.73).translateY(0.38).translateZ(-0.1).rotateZ(Math.PI / 2));

  this.bodyMesh = bodyGroup;
  this.mesh.add(bodyGroup);

  // === DRIVER ===
  var driverGroup = new THREE.Group();
  driverGroup.position.set(0, 0.55, 0.15);

  // Check if GLB model is available for this character
  var hasGLBModel = glbModelCache[bodyType] !== undefined;

  if (hasGLBModel) {
    // Use GLB model as driver
    var glbClone = glbModelCache[bodyType].clone();
    // Position the GLB model to sit in the kart
    glbClone.position.set(0, -0.1, 0);
    driverGroup.add(glbClone);
    this.glbDriver = glbClone;
  } else {
    // Fallback: procedural driver mesh
    // Head
    var headMat = new THREE.MeshLambertMaterial({ color: skinColor, roughness: 0.6 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), headMat);
    head.position.y = 0.58;
    head.castShadow = true;
    driverGroup.add(head);
    this.headMesh = head;

    // Helmet
    var helmetMat = new THREE.MeshLambertMaterial({ color: helmetColor, metalness: 0.65, roughness: 0.12 });
    var helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), helmetMat);
    helmet.position.y = 0.62;
    helmet.scale.set(1, 0.9, 1);
    driverGroup.add(helmet);

    // Visor
    var visorTint = bodyType === 'phantom' ? 0x220044 : bodyType === 'dragon' ? 0x331100 : 0x111133;
    var visorMat = new THREE.MeshLambertMaterial({
      color: visorTint, metalness: 0.95, roughness: 0.05, transparent: true, opacity: 0.85
    });
    var visor = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, -Math.PI*0.4, Math.PI*0.8, 0.3, 0.5), visorMat);
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
      var gogMat = new THREE.MeshLambertMaterial({ color: 0xFFDD44, metalness: 0.6, roughness: 0.2 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), gogMat).translateX(-0.12).translateY(0.78).translateZ(-0.18).rotateX(0.4));
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), gogMat).translateX(0.12).translateY(0.78).translateZ(-0.18).rotateX(0.4));
    } else if (bodyType === 'phantom') {
      var hornMat = new THREE.MeshLambertMaterial({ color: 0x6633AA, metalness: 0.7 });
      driverGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hornMat).translateX(-0.2).translateY(0.82).translateZ(-0.05).rotateZ(0.4));
      driverGroup.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), hornMat).translateX(0.2).translateY(0.82).translateZ(-0.05).rotateZ(-0.4));
    } else if (bodyType === 'angel') {
      var haloMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.6, metalness: 0.7 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16), haloMat).translateY(0.95).rotateX(Math.PI / 2));
    } else if (bodyType === 'robot') {
      var ledMat = new THREE.MeshLambertMaterial({ color: 0x00FF00, emissive: 0x00FF00, emissiveIntensity: 1.0 });
      driverGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), ledMat).translateX(-0.1).translateY(0.6).translateZ(-0.28));
      driverGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), ledMat).translateX(0.1).translateY(0.6).translateZ(-0.28));
    } else if (bodyType === 'ninja') {
      var scarfMat = new THREE.MeshLambertMaterial({ color: 0xFF77AA, side: THREE.DoubleSide });
      driverGroup.add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), scarfMat).translateY(0.5).translateZ(0.2).rotateX(-0.3));
    } else if (bodyType === 'king') {
      var crMat = new THREE.MeshLambertMaterial({ color: 0xFFDD00, emissive: 0xFFAA00, emissiveIntensity: 0.3, metalness: 0.8 });
      driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 4, 8), crMat).translateY(0.78).rotateX(Math.PI / 2));
      var gemMat = new THREE.MeshLambertMaterial({ color: 0xFF0000, emissive: 0xFF0000, emissiveIntensity: 0.5 });
      driverGroup.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), gemMat).translateY(0.85).translateZ(-0.15));
    }

    // Torso
    var torsoMat = new THREE.MeshLambertMaterial({ color: mainColor, roughness: 0.5 });
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.45, 8), torsoMat);
    torso.position.y = 0.22;
    driverGroup.add(torso);

    // Arms
    var armMat = new THREE.MeshLambertMaterial({ color: mainColor, roughness: 0.5 });
    var armGeom = new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6);
    driverGroup.add(new THREE.Mesh(armGeom, armMat).translateX(-0.28).translateY(0.15).translateZ(-0.15).rotateZ(0.5).rotateX(-0.6));
    driverGroup.add(new THREE.Mesh(armGeom, armMat).translateX(0.28).translateY(0.15).translateZ(-0.15).rotateZ(-0.5).rotateX(-0.6));

    // Steering wheel
    driverGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 12), darkMat).translateY(0.1).translateZ(-0.38).rotateX(-0.3));
  }

  bodyGroup.add(driverGroup);

  // === WHEELS ===
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

    var tire = new THREE.Mesh(new THREE.TorusGeometry(wR, wW, 10, 20),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a, roughness: 0.95 }));
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    var rim = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.7, wR * 0.7, wW * 1.3, 14),
      new THREE.MeshLambertMaterial({ color: 0xcccccc, metalness: 0.85, roughness: 0.1 }));
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    var cap = new THREE.Mesh(new THREE.CylinderGeometry(wR * 0.3, wR * 0.3, wW * 1.5, 8),
      new THREE.MeshLambertMaterial({ color: mainColor, metalness: 0.7, roughness: 0.2 }));
    cap.rotation.z = Math.PI / 2;
    wheelGroup.add(cap);

    wheelGroup.position.set(wheelPositions[i].x, 0.28, wheelPositions[i].z);
    this.mesh.add(wheelGroup);
    this.wheelMeshes.push(wheelGroup);
  }

  scene.add(this.mesh);

  // Position mesh at racer coordinates immediately (needed for countdown visibility)
  this.updateMesh();
};

Racer.prototype.activateSkill = function(racers) {
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

Racer.prototype.update = function(input, racers, scene) {
  // Handle finished state - auto-drive along track (like Mario Kart)
  if (this.finished) {
    // Follow the track at moderate speed so finished racers don't block others
    var autoSpd = this.maxSpd * 0.6;
    if (this.spd < autoSpd) {
      this.spd += this.accel * 0.5;
    } else {
      this.spd *= 0.98;
    }

    // Steer toward next waypoint
    var targetPt = getTrackPoint(this.aiTargetIdx);
    var dx = targetPt.x - this.x;
    var dz = targetPt.z - this.z;
    var targetAng = Math.atan2(dz, dx);
    var angDiff = targetAng - this.ang;
    while (angDiff > Math.PI) angDiff -= Math.PI * 2;
    while (angDiff < -Math.PI) angDiff += Math.PI * 2;
    var turnRate = this.handling;
    if (Math.abs(angDiff) > turnRate) {
      this.ang += turnRate * (angDiff > 0 ? 1 : -1);
    } else {
      this.ang += angDiff;
    }
    this.tilt = angDiff * 0.5;

    // Advance waypoint
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 12) {
      this.aiTargetIdx += 3;
      if (this.aiTargetIdx >= TRACK_POINTS) this.aiTargetIdx -= TRACK_POINTS;
    }

    // Apply movement
    this.x += Math.cos(this.ang) * this.spd;
    this.z += Math.sin(this.ang) * this.spd;

    // Track Y position
    var nearIdx = nearestTrackIndex(this.x, this.z);
    var nearNode = trackNodes[nearIdx];
    if (nearNode) {
      this.y += (nearNode.y - this.y) * 0.15;
    }
    this.totalIdx = nearIdx;

    this.updateMesh();
    return;
  }

  // Handle stun
  if (this.stunTimer > 0) {
    this.stunTimer--;
    this.spd *= 0.92;
    this.updateMesh();
    return;
  }

  // Decrement timers
  if (this.boostTimer > 0) this.boostTimer--;
  if (this.shieldTimer > 0) this.shieldTimer--;
  if (this.driftSpark > 0) this.driftSpark--;

  // Skill cooldown
  if (this.skillCooldown > 0) {
    this.skillCooldown--;
    if (this.skillCooldown <= 0) {
      this.skillReady = true;
    }
  }

  // Skill active timer
  if (this.skillActive) {
    this.skillTimer--;
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
    this.autoShieldTimer++;
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
        this.spd += curAccel;
        if (this.spd > curMax) this.spd = curMax;
      }
    } else if (input.down) {
      this.spd -= curAccel * 1.5;
      var minSpd = -0.3 * curMax;
      if (this.spd < minSpd) this.spd = minSpd;
    } else {
      this.spd *= 0.985;
    }

    // Drifting
    var wasDrifting = this.drifting;
    this.drifting = input.drift && this.spd > 0.3;

    // Drift charge with equipment bonus
    var driftChargeRate = 1;
    if (this.equip === 'drift_up') driftChargeRate = 2;
    if (this.skillActive && this.char.skill === 'sakura_drift') driftChargeRate = 4;

    if (this.drifting && (input.left || input.right)) {
      this.driftCharge = Math.min(this.driftCharge + driftChargeRate, 120);
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
    var turnRate = curHandling;
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
      this.tilt *= 0.9;
    }

    if (this.drifting && fr % 20 === 0) {
      this.driftSpark = 15;
      if (SND && SND.drift) SND.drift();
    }

  } else if (!this.isPlayer) {
    // === IMPROVED AI ===

    // --- Lookahead target with lateral offset for lane variety ---
    var lookahead = 8 + Math.floor(this.spd * 3);
    var targetIdx = (this.aiTargetIdx + lookahead) % TRACK_POINTS;
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

    var turnRate = curHandling * 0.9;
    if (this.aiDrifting) turnRate *= 1.5;
    turnRate *= Math.min(1, Math.abs(this.spd) / 0.8);

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
      this.aiDriftCharge = Math.min(this.aiDriftCharge + driftChargeRate, 120);
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
      this.tilt *= 0.9;
    }

    // Advance waypoint
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 12) {
      this.aiTargetIdx += 3;
      if (this.aiTargetIdx >= TRACK_POINTS) this.aiTargetIdx -= TRACK_POINTS;
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
      this.spd += curAccel;
      if (this.spd > aiMaxSpd) this.spd = aiMaxSpd;
    } else {
      this.spd *= 0.995;
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
            if (sdx*sdx + sdz*sdz < 100) { useSkill = Math.random() < 0.006; break; }
          }
        }
      } else if (skill === 'quake') {
        // Quake: use when many racers nearby
        var nearCount = 0;
        for (var sr = 0; sr < racers.length; sr++) {
          if (racers[sr] !== this) {
            var sdx = racers[sr].x - this.x;
            var sdz = racers[sr].z - this.z;
            if (sdx*sdx + sdz*sdz < 900) nearCount++;
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
    if (this.aiItemDelay > 0) this.aiItemDelay--;
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
  this.x += Math.cos(this.ang) * this.spd;
  this.z += Math.sin(this.ang) * this.spd;

  // Track Y position
  var nearIdx = nearestTrackIndex(this.x, this.z);
  var nearNode = trackNodes[nearIdx];
  if (nearNode) {
    this.y += (nearNode.y - this.y) * 0.15;
  }

  // Off-track handling (shadow_phase skips wall collision)
  var distToTrack = trackDist(this.x, this.z);
  var trackEdge = TRACK_WIDTH * 0.55;
  var wallDist = TRACK_WIDTH * 0.6;

  var phasing = this.skillActive && this.char.skill === 'shadow_phase';

  if (!phasing && distToTrack > wallDist) {
    var centerNode = trackNodes[nearIdx];
    var pushAng = Math.atan2(centerNode.z - this.z, centerNode.x - this.x);
    var pushStr = (distToTrack - wallDist) * 0.3;
    this.x += Math.cos(pushAng) * pushStr;
    this.z += Math.sin(pushAng) * pushStr;
    this.spd *= 0.88;
  } else if (!phasing && distToTrack > trackEdge) {
    this.spd *= 0.96;
  }

  // Progress tracking
  var prevIdx = this.totalIdx;
  this.totalIdx = nearIdx;

  // Lap detection
  if (prevIdx > TRACK_POINTS - 50 && this.totalIdx < 50) {
    this.lap++;
    if (this.isPlayer && this.lap < TOTAL_LAPS && SND && SND.lap) SND.lap();
    if (this.lap >= TOTAL_LAPS && !this.finished) {
      this.finished = true;
      this.finTime = fr;
    }
  }

  this.progress = this.lap * TRACK_POINTS + this.totalIdx;

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
        var pullStr = 0.3;
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
        box.respawn = 180;
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

  // Collision with other racers (shadow_phase skips)
  if (!phasing) {
    var minSep = 2.0;
    for (var r = 0; r < racers.length; r++) {
      var other = racers[r];
      if (other !== this) {
        var dx = this.x - other.x;
        var dz = this.z - other.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minSep && dist > 0.01) {
          var pushAng = Math.atan2(dz, dx);
          var pushDist = (minSep - dist) * 0.6;
          this.x += Math.cos(pushAng) * pushDist;
          this.z += Math.sin(pushAng) * pushDist;
          other.x -= Math.cos(pushAng) * pushDist;
          other.z -= Math.sin(pushAng) * pushDist;
          var spdDiff = this.spd - other.spd;
          this.spd -= spdDiff * 0.3;
          other.spd += spdDiff * 0.3;
        }
      }
    }
  }

  this.updateMesh();
};

Racer.prototype.updateMesh = function() {
  if (!this.mesh) return;

  this.mesh.position.set(this.x, this.y, this.z);
  this.mesh.rotation.y = -this.ang - Math.PI / 2;

  if (this.bodyMesh) {
    this.bodyMesh.rotation.z = -this.tilt;
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
    this.mesh.traverse(function(child) {
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

Racer.prototype.useItem = function(racers, scene) {
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
