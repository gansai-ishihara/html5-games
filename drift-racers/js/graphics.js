// graphics.js - Scene setup, lighting, particles, camera, and post-processing
// Babylon.js engine (migrated from Three.js r128)

var scene, camera, engine;
var pipeline = null;
var shadowGen = null;
var particles = { driftLeft: null, driftRight: null, boostFlame: null };
var cloudMeshes = [];
var envParticleSystem = null;
var skyMat = null;
var reflectionTexture = null;

// Compatibility shims for other files that still reference Three.js globals
var renderer = null;
var clock = null;
var composer = null;
var envMap = null;

// Camera state
var cameraShake = { x: 0, y: 0 };
var currentFOV = 70;

// Helper: hex int to Babylon Color3
function c3(hex) {
  return new BABYLON.Color3((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255);
}

// Helper: hex int to Babylon Color4
function c4(hex, a) {
  return new BABYLON.Color4((hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255, a !== undefined ? a : 1);
}

// Helper: create custom mesh from vertex data arrays
function createCustomMesh(name, positions, indices, uvs, colors, sc) {
  var mesh = new BABYLON.Mesh(name, sc || scene);
  var vd = new BABYLON.VertexData();
  vd.positions = positions;
  vd.indices = indices;
  if (uvs) vd.uvs = uvs;
  if (colors) vd.colors = colors;
  var normals = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  vd.normals = normals;
  vd.applyToMesh(mesh);
  return mesh;
}

function initScene() {
  var canvas = document.getElementById('renderCanvas');

  engine = new BABYLON.Engine(canvas, false, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  });

  var dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  engine.setHardwareScalingLevel(1 / dpr);

  scene = new BABYLON.Scene(engine);
  scene.useRightHandedSystem = true;
  if (CRYSTAL_KINGDOM) {
    // Crystal Kingdom twilight atmosphere
    scene.clearColor = new BABYLON.Color4(0.024, 0.035, 0.09, 1.0);
    scene.ambientColor = new BABYLON.Color3(0.22, 0.18, 0.38);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0008; // Denser fog to hide distant white-out
    scene.fogColor = new BABYLON.Color3(0.04, 0.03, 0.10);
  } else {
    scene.clearColor = new BABYLON.Color4(0.051, 0.102, 0.208, 1.0);
    scene.ambientColor = new BABYLON.Color3(0.1, 0.1, 0.2);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.002;
    scene.fogColor = new BABYLON.Color3(0.051, 0.102, 0.208);
  }

  // Compatibility shims for scene.add/remove used by other files
  scene.add = function () { };
  scene.remove = function (obj) {
    if (obj && obj.dispose) obj.dispose();
  };

  // Camera
  camera = new BABYLON.FreeCamera('cam', new BABYLON.Vector3(0, 10, -20), scene);
  camera.inputs.clear();
  camera.minZ = 0.5;
  camera.maxZ = 2000;
  camera.fov = BABYLON.Tools.ToRadians(60);

  // === Lighting ===

  // Hemisphere (ambient + ground color)
  var hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
  if (CRYSTAL_KINGDOM) {
    hemiLight.intensity = 1.2;
    hemiLight.diffuse = new BABYLON.Color3(0.72, 0.80, 1.0);
    hemiLight.groundColor = new BABYLON.Color3(0.20, 0.16, 0.42);
  } else {
    hemiLight.intensity = 0.85;
    hemiLight.diffuse = new BABYLON.Color3(0.87, 0.93, 1.0);
    hemiLight.groundColor = new BABYLON.Color3(0.2, 0.3, 0.2);
  }

  // Sun (main directional)
  var sunLight = new BABYLON.DirectionalLight('sun',
    new BABYLON.Vector3(-1, -1.5, 1).normalize(), scene);
  if (CRYSTAL_KINGDOM) {
    sunLight.intensity = 1.3;
    sunLight.diffuse = new BABYLON.Color3(0.75, 0.72, 0.82);
    sunLight.position = new BABYLON.Vector3(100, 80, -100);
  } else {
    sunLight.intensity = 2.5;
    sunLight.diffuse = new BABYLON.Color3(1.0, 0.98, 0.93);
    sunLight.position = new BABYLON.Vector3(100, 150, -100);
  }

  // Shadows (desktop only)
  if (!isMobile) {
    shadowGen = new BABYLON.ShadowGenerator(4096, sunLight);
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.bias = 0.0001;
    shadowGen.normalBias = 0.01;
  }
  window._sunLight = sunLight;
  window._shadowGen = shadowGen;

  // Fill light
  var fillLight = new BABYLON.DirectionalLight('fill',
    new BABYLON.Vector3(1, -1, -0.75).normalize(), scene);
  fillLight.intensity = 0.6;
  fillLight.diffuse = new BABYLON.Color3(0.87, 0.91, 1.0);

  // Rim light (cool blue artistic)
  var rimLight = new BABYLON.DirectionalLight('rim',
    new BABYLON.Vector3(0.5, -0.5, 1).normalize(), scene);
  rimLight.intensity = CRYSTAL_KINGDOM ? 1.2 : 0.8;
  rimLight.diffuse = new BABYLON.Color3(0.65, 0.70, 1.0);

  // Environment texture for PBR materials (IBL)
  scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
    'https://assets.babylonjs.com/environments/environmentSpecular.env', scene);
  scene.environmentIntensity = CRYSTAL_KINGDOM ? 0.4 : 0.4;

  // Build world
  if (!USE_COURSE_GLB) buildGround();
  buildSky();
  buildClouds();
  buildStars();
  buildSunDecor();
  buildDistantMountains();
  createEnvParticles();

  // Clock shim (replaces THREE.Clock)
  clock = {
    _lastTime: 0,
    getDelta: function () {
      var now = performance.now();
      var dt = this._lastTime ? (now - this._lastTime) / 1000 : 0.016;
      this._lastTime = now;
      return dt;
    }
  };

  // Renderer shim (for main.js cleanup compatibility)
  renderer = {
    dispose: function () {
      if (engine) { engine.stopRenderLoop(); engine.dispose(); }
    },
    domElement: canvas,
    capabilities: { getMaxAnisotropy: function () { return 8; } }
  };

  // Particle effects
  createDriftParticles();
  createBoostEffect();

  // Post-processing
  initPostProcessing();
}

// Post-processing: Bloom + FXAA + Vignette + Color Grading
function initPostProcessing() {
  if (!BABYLON.DefaultRenderingPipeline) {
    console.warn('DefaultRenderingPipeline not available');
    return;
  }

  pipeline = new BABYLON.DefaultRenderingPipeline('default', true, scene, [camera]);

  // Bloom (toned down to prevent white-out from bright GLB models)
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = CRYSTAL_KINGDOM ? 0.20 : 0.30;
  pipeline.bloomKernel = CRYSTAL_KINGDOM ? 48 : 64;
  pipeline.bloomThreshold = CRYSTAL_KINGDOM ? 0.92 : 0.85;

  // FXAA
  pipeline.fxaaEnabled = true;

  // Image processing (tone mapping, vignette)
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.imageProcessing.exposure = CRYSTAL_KINGDOM ? 0.95 : 1.0;
  pipeline.imageProcessing.contrast = CRYSTAL_KINGDOM ? 1.15 : 1.06;

  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 2.5;
  pipeline.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

  // Chromatic aberration (desktop only)
  if (!isMobile) {
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = 2;
  }

  window._pipeline = pipeline;

  // Custom warm color shift + saturation boost
  BABYLON.Effect.ShadersStore['warmColorFragmentShader'] = [
    'precision highp float;',
    'varying vec2 vUV;',
    'uniform sampler2D textureSampler;',
    'void main() {',
    '  vec4 c = texture2D(textureSampler, vUV);',
    CRYSTAL_KINGDOM ?
      '  c.b += 0.01;' :  // subtle cool shift for Crystal Kingdom
      '  c.r += 0.04; c.b -= 0.02;',   // warm shift for normal
    '  float grey = dot(c.rgb, vec3(0.299, 0.587, 0.114));',
    '  c.rgb = mix(vec3(grey), c.rgb, 1.25);',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  new BABYLON.PostProcess('warmColor', 'warmColor', [], null, 1.0, camera);

  // GlowLayer for crystal emission effects
  if (CRYSTAL_KINGDOM) {
    var glowLayer = new BABYLON.GlowLayer('glow', scene, {
      mainTextureFixedSize: 512,
      blurKernelSize: 64
    });
    glowLayer.intensity = 0.45;
    window._glowLayer = glowLayer;

    // Reflection texture for water - disabled to prevent _currentLOD crash
    // TODO: re-enable with explicit renderList when meshes are stable
    reflectionTexture = null;

    // Volumetric Light Scattering (God Rays)
    if (!isMobile) {
      var vlsMesh = BABYLON.MeshBuilder.CreateSphere('vlsMesh', { diameter: 15, segments: 12 }, scene);
      var vlsMat = new BABYLON.StandardMaterial('vlsMat', scene);
      vlsMat.emissiveColor = new BABYLON.Color3(0.7, 0.65, 0.9);
      vlsMat.disableLighting = true;
      vlsMat.alpha = 0.3; // Mostly transparent - just a glow source
      vlsMesh.material = vlsMat;
      vlsMesh.position = new BABYLON.Vector3(0, 300, 600); // Higher and further away

      var godrays = new BABYLON.VolumetricLightScatteringPostProcess('godrays', 1.0, camera, vlsMesh, 100, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);
      godrays.exposure = 0.15;
      godrays.decay = 0.95;
      godrays.weight = 0.25;
      godrays.density = 0.8;
      window._godrays = godrays;
      window._vlsMesh = vlsMesh;
    }

    if (CRYSTAL_KINGDOM) {
      addGroundMist(scene);
    }
  }
}

// === MAGICAL GROUND MIST ===
function addGroundMist(scene) {
  if (!scene) return;

  var fogCanvas = document.createElement('canvas');
  fogCanvas.width = 256;
  fogCanvas.height = 256;
  var ctx = fogCanvas.getContext('2d');
  var grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(200, 230, 255, 0.25)');
  grad.addColorStop(0.4, 'rgba(150, 180, 255, 0.15)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // Add noise
  for (var n = 0; n < 2000; n++) {
    var nx = Math.random() * 256;
    var ny = Math.random() * 256;
    var dist = Math.sqrt((nx - 128) * (nx - 128) + (ny - 128) * (ny - 128));
    if (dist < 128) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (Math.random() * 0.1 * (1.0 - dist / 128)) + ')';
      ctx.fillRect(nx, ny, 4, 4);
    }
  }

  var fogTex = new BABYLON.Texture(fogCanvas.toDataURL(), scene);
  var mist = new BABYLON.ParticleSystem("mist", 1000, scene);
  mist.particleTexture = fogTex;

  var mistEmitter = BABYLON.MeshBuilder.CreateBox("mistE", { size: 1 }, scene);
  mistEmitter.position.copyFromFloats(0, -0.5, 0); // At water level
  mistEmitter.isVisible = false;
  mist.emitter = mistEmitter;

  var boxEmitter = mist.createBoxEmitter(new BABYLON.Vector3(-1, 0, -1), new BABYLON.Vector3(1, 0, 1), new BABYLON.Vector3(-400, -1.0, -400), new BABYLON.Vector3(400, 3.0, 400));

  mist.color1 = new BABYLON.Color4(0.8, 0.9, 1.0, 0.25);
  mist.color2 = new BABYLON.Color4(0.4, 0.6, 0.9, 0.10);
  mist.colorDead = new BABYLON.Color4(0.1, 0.1, 0.3, 0.0);

  mist.minSize = 30.0;
  mist.maxSize = 70.0;
  mist.minLifeTime = 8.0;
  mist.maxLifeTime = 16.0;
  mist.emitRate = 80;

  mist.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  mist.gravity = new BABYLON.Vector3(0, 0, 0);
  mist.direction1 = new BABYLON.Vector3(-1.0, 0.1, -1.0);
  mist.direction2 = new BABYLON.Vector3(1.0, 0.2, 1.0);
  mist.minAngularSpeed = -0.1;
  mist.maxAngularSpeed = 0.1;
  mist.minEmitPower = 0.5;
  mist.maxEmitPower = 2.0;
  mist.updateSpeed = 0.01;
  mist.preWarmStepOffset = 100;
  mist.preWarmCycles = 150;

  mist.start();
}

// Simple noise function for terrain generation
function terrainNoise(x, z) {
  var n = 0;
  n += Math.sin(x * 0.008 + 1.3) * Math.cos(z * 0.006 + 0.7) * 12;
  n += Math.sin(x * 0.015 + 2.1) * Math.cos(z * 0.012 - 0.3) * 6;
  n += Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.025 + 1.5) * 3;
  n += Math.sin(x * 0.06) * Math.cos(z * 0.05 + 2.0) * 1.5;
  return n;
}

// Distance to nearest track center
function distToTrackCenter(wx, wz) {
  var minDist = Infinity;
  for (var i = 0; i < trackNodes.length; i += 2) {
    var node = trackNodes[i];
    var dx = node.x - wx;
    var dz = node.z - wz;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// Get terrain height at world position, considering track clearance
function getTerrainHeight(wx, wz) {
  var baseNoise = terrainNoise(wx, wz);

  if (CRYSTAL_KINGDOM) {
    var distFromCenter = Math.sqrt(wx * wx + wz * wz);
    var lakeDepth = -2.5; // Enough for the y=-1.0 water to show completely
    var lakeRadius = 400;
    var lakeTransition = 150;

    var lakeBlend = 0;
    if (distFromCenter < lakeRadius) {
      lakeBlend = 1.0;
    } else if (distFromCenter < lakeRadius + lakeTransition) {
      var lt = (distFromCenter - lakeRadius) / lakeTransition;
      lakeBlend = 1.0 - (lt * lt * (3 - 2 * lt));
    }
    baseNoise = baseNoise * (1.0 - lakeBlend) + (lakeDepth + baseNoise * 0.3) * lakeBlend;
  }

  var trackD = distToTrackCenter(wx, wz);
  var trackClearance = TRACK_WIDTH * 0.7;
  var transitionZone = 30;

  if (trackD < trackClearance) {
    return -4;
  } else if (trackD < trackClearance + transitionZone) {
    var t = (trackD - trackClearance) / transitionZone;
    t = t * t * (3 - 2 * t);
    return -4 + t * (baseNoise + 4);
  } else {
    return baseNoise;
  }
}

// Build 3D terrain mesh with hills and valleys
function buildGround() {
  var terrainSize = 1600;
  var segments = 120;
  var segSize = terrainSize / segments;

  // Create terrain texture
  var grassTex = new BABYLON.DynamicTexture('grassTex', { width: 512, height: 512 }, scene, true);
  var ctx = grassTex.getContext();

  if (CRYSTAL_KINGDOM) {
    // Crystal Kingdom ground - rich purple/indigo crystalline landscape
    ctx.fillStyle = '#0E0A1E'; // Deep purple-indigo base (brighter than before)
    ctx.fillRect(0, 0, 512, 512);

    // Purple/blue/teal terrain patches - visible crystal landscape
    for (var i = 0; i < 50; i++) {
      var px = Math.random() * 512;
      var py = Math.random() * 512;
      var pr = 50 + Math.random() * 120;
      var pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      var hue = 220 + Math.random() * 60;
      var sat = 50 + Math.random() * 25;
      var light = 14 + Math.random() * 12;
      pg.addColorStop(0, 'hsla(' + hue + ',' + sat + '%,' + light + '%,0.5)');
      pg.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + light + '%,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }

    // Crystal vein patterns - glowing blue/cyan network
    ctx.lineWidth = 2;
    for (var i = 0; i < 80; i++) {
      var x1 = Math.random() * 512, y1 = Math.random() * 512;
      var x2 = x1 + (Math.random() - 0.5) * 180;
      var y2 = y1 + (Math.random() - 0.5) * 180;
      var veinHue = 200 + Math.random() * 40;
      ctx.strokeStyle = 'hsla(' + veinHue + ',70%,55%,' + (0.12 + Math.random() * 0.15) + ')';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (Math.random() > 0.4) {
        ctx.lineTo(x2 + (Math.random() - 0.5) * 80, y2 + (Math.random() - 0.5) * 80);
      }
      ctx.stroke();
    }

    // Crystal glints - dense sparkling field
    for (var i = 0; i < 800; i++) {
      var brightness = Math.random();
      if (brightness > 0.8) {
        ctx.fillStyle = 'rgba(180, 210, 255, ' + (0.25 + Math.random() * 0.25) + ')';
      } else if (brightness > 0.5) {
        ctx.fillStyle = 'rgba(150, 120, 220, ' + (0.15 + Math.random() * 0.15) + ')';
      } else {
        ctx.fillStyle = 'rgba(100, 160, 200, ' + (0.10 + Math.random() * 0.10) + ')';
      }
      var gs = 1 + Math.random() * 2;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, gs, gs);
    }
  } else {
    ctx.fillStyle = '#2E8B57';
    ctx.fillRect(0, 0, 512, 512);

    for (var i = 0; i < 30; i++) {
      var px = Math.random() * 512;
      var py = Math.random() * 512;
      var pr = 30 + Math.random() * 60;
      var pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      var hue = 100 + Math.random() * 40;
      var light = 45 + Math.random() * 15;
      pg.addColorStop(0, 'hsla(' + hue + ',55%,' + light + '%,0.5)');
      pg.addColorStop(1, 'hsla(' + hue + ',55%,' + light + '%,0)');
      ctx.fillStyle = pg;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }

    for (var i = 0; i < 8000; i++) {
      var gx = Math.random() * 512;
      var gy = Math.random() * 512;
      var gl = 40 + Math.random() * 25;
      ctx.fillStyle = 'hsl(' + (100 + Math.random() * 40) + ',55%,' + gl + '%)';
      ctx.fillRect(gx, gy, 0.8, 2 + Math.random() * 4);
    }

    var fColors = ['#9988CC', '#DDA0BB'];
    for (var i = 0; i < 120; i++) {
      var fx = Math.random() * 512;
      var fy = Math.random() * 512;
      ctx.fillStyle = fColors[Math.floor(Math.random() * fColors.length)];
      ctx.beginPath();
      ctx.arc(fx, fy, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  grassTex.update();
  grassTex.uScale = 40;
  grassTex.vScale = 40;
  grassTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  grassTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  grassTex.anisotropicFilteringLevel = 8;

  // Generate terrain geometry
  var vertices = [];
  var uvs = [];
  var indices = [];
  var colors = [];
  var halfSize = terrainSize / 2;

  for (var iz = 0; iz <= segments; iz++) {
    for (var ix = 0; ix <= segments; ix++) {
      var wx = -halfSize + ix * segSize;
      var wz = -halfSize + iz * segSize;
      var wy = getTerrainHeight(wx, wz);

      vertices.push(wx, wy, wz);
      uvs.push(ix / segments, iz / segments);

      var hFactor = Math.max(0, Math.min(1, (wy + 4) / 20));
      var r, g, b;
      if (CRYSTAL_KINGDOM) {
        // Rich purple/indigo ground - visible but atmospheric
        r = 0.08 + hFactor * 0.12;
        g = 0.06 + hFactor * 0.14;
        b = 0.18 + hFactor * 0.20;
      } else {
        r = 0.3 + hFactor * 0.25;
        g = 0.6 - hFactor * 0.15;
        b = 0.25 + hFactor * 0.1;
      }
      colors.push(r, g, b, 1.0); // RGBA for Babylon.js
    }
  }

  for (var iz = 0; iz < segments; iz++) {
    for (var ix = 0; ix < segments; ix++) {
      var a = iz * (segments + 1) + ix;
      var b = a + 1;
      var cc = a + (segments + 1);
      var d = cc + 1;
      indices.push(a, b, cc);
      indices.push(b, d, cc);
    }
  }

  var ground = createCustomMesh('ground', vertices, indices, uvs, colors);

  var groundMat = new BABYLON.StandardMaterial('groundMat', scene);
  groundMat.diffuseTexture = grassTex;
  if (CRYSTAL_KINGDOM) {
    // Highly specular, polished crystal look
    groundMat.specularColor = new BABYLON.Color3(0.5, 0.4, 0.7);
    groundMat.specularPower = 64;
    groundMat.emissiveColor = new BABYLON.Color3(0.04, 0.03, 0.08);

    // Procedural bump map for faceted crystalline reflections
    var bumpCvs = document.createElement('canvas');
    bumpCvs.width = 1024; bumpCvs.height = 1024;
    var bCtx = bumpCvs.getContext('2d');
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 1024, 1024);
    for (var bi = 0; bi < 15000; bi++) {
      var bx = Math.random() * 1024, by = Math.random() * 1024;
      var bv = Math.floor(128 + (Math.random() - 0.5) * 60);
      bCtx.strokeStyle = 'rgb(' + bv + ',' + bv + ',' + bv + ')';
      bCtx.lineWidth = 1 + Math.random() * 4;
      bCtx.beginPath();
      bCtx.moveTo(bx, by);
      bCtx.lineTo(bx + (Math.random() - 0.5) * 40, by + (Math.random() - 0.5) * 40);
      bCtx.stroke();
    }
    var groundBump = new BABYLON.DynamicTexture('groundBump', bumpCvs, scene, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    groundBump.uScale = 60;
    groundBump.vScale = 60;
    groundBump.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    groundBump.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    groundMat.bumpTexture = groundBump;
    groundMat.bumpTexture.level = 0.4;
  } else {
    groundMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
  }
  ground.material = groundMat;
  ground.receiveShadows = true;
  // Exclude ground from GlowLayer (it shouldn't glow)
  if (window._glowLayer) window._glowLayer.addExcludedMesh(ground);

  if (!CRYSTAL_KINGDOM) buildFlowerPatches();
  buildTerrainCliffs();
}

function buildFlowerPatches() {
  var fCount = 40;
  var fColorsHex = [0x9988CC, 0xDDA0BB, 0x66AAEE];

  for (var i = 0; i < fCount; i++) {
    var ang = Math.random() * Math.PI * 2;
    var dist = 50 + Math.random() * 400;
    var wx = Math.cos(ang) * dist;
    var wz = Math.sin(ang) * dist;

    if (distToTrackCenter(wx, wz) < 40) continue;

    var wy = getTerrainHeight(wx, wz);

    for (var j = 0; j < 5; j++) {
      var r = 0.5 + Math.random() * 0.5;
      var flower = BABYLON.MeshBuilder.CreateSphere('flower_' + i + '_' + j,
        { diameter: r * 2, segments: 6 }, scene);
      flower.position.set(
        wx + (Math.random() - 0.5) * 5,
        wy + r * 0.5,
        wz + (Math.random() - 0.5) * 5
      );
      flower.scaling.y = 0.4;
      var fMat = new BABYLON.StandardMaterial('fMat_' + i + '_' + j, scene);
      fMat.diffuseColor = c3(fColorsHex[Math.floor(Math.random() * fColorsHex.length)]);
      fMat.specularColor = BABYLON.Color3.Black();
      flower.material = fMat;
      trackMeshes.push(flower);
    }
  }
}

// Build cliff faces near the track
function buildTerrainCliffs() {
  var cliffMat = new BABYLON.StandardMaterial('cliffMat', scene);
  if (CRYSTAL_KINGDOM) {
    cliffMat.diffuseColor = c3(0x1A1525);
    cliffMat.emissiveColor = new BABYLON.Color3(0.05, 0.04, 0.10);
    cliffMat.alpha = 0.85; // Slightly transparent to reduce visual blockage
  } else {
    cliffMat.diffuseColor = c3(0x554433);
  }
  cliffMat.specularColor = BABYLON.Color3.Black();
  cliffMat.environmentIntensity = 0; // Prevent IBL gold reflections

  for (var i = 0; i < trackNodes.length; i += 4) {
    var node = trackNodes[i];
    var angle = getTrackAngle(i);
    var perpX = -Math.sin(angle);
    var perpZ = Math.cos(angle);

    for (var side = -1; side <= 1; side += 2) {
      var cliffDist = TRACK_WIDTH * 1.2 + 10; // Well outside track + shoulder
      var cx = node.x + perpX * cliffDist * side;
      var cz = node.z + perpZ * cliffDist * side;
      var terrainH = terrainNoise(cx, cz);
      var heightDiff = node.y - terrainH;

      // Skip if height difference is too large (causes wall-blocking at mountain zone)
      if (heightDiff > 3 && heightDiff < 12) {
        var cliffH = Math.min(heightDiff + 1, 10);
        var cliffW = 4 + Math.random() * 3;
        var cliffD = 2 + Math.random() * 1.5;

        var cliff = BABYLON.MeshBuilder.CreateBox('cliff_' + i + '_' + side,
          { width: cliffW, height: cliffH, depth: cliffD }, scene);
        cliff.position.set(cx, terrainH + cliffH / 2, cz);
        cliff.rotation.y = angle + Math.random() * 0.3;
        cliff.material = cliffMat;
        if (shadowGen) shadowGen.addShadowCaster(cliff);
        trackMeshes.push(cliff);
      }
    }
  }
}

// Build bridge supports under elevated road sections
function buildBridgePillars(sc) {
  var pillarMat = new BABYLON.StandardMaterial('pillarMat', sc);
  pillarMat.diffuseColor = CRYSTAL_KINGDOM ? c3(0x2A2040) : c3(0x8899aa);
  pillarMat.specularColor = BABYLON.Color3.Black();
  pillarMat.environmentIntensity = 0;

  for (var i = 0; i < trackNodes.length; i += 8) {
    if (i < 6 || i > trackNodes.length - 6) continue;

    var node = trackNodes[i];
    var terrainH = getTerrainHeight(node.x, node.z);
    var heightAboveTerrain = node.y - terrainH;

    if (heightAboveTerrain > 5) {
      var pillarHeight = heightAboveTerrain + 1;

      var pillar = BABYLON.MeshBuilder.CreateCylinder('pillar_' + i,
        { height: pillarHeight, diameterTop: 3, diameterBottom: 4, tessellation: 8 }, sc);
      pillar.position.set(node.x, terrainH + pillarHeight / 2, node.z);
      if (shadowGen) shadowGen.addShadowCaster(pillar);
      pillar.material = pillarMat;
      trackMeshes.push(pillar);

      // Cross beam
      var angle = getTrackAngle(i);
      var beamWidth = TRACK_WIDTH * 0.8;
      var beam = BABYLON.MeshBuilder.CreateBox('beam_' + i,
        { width: beamWidth, height: 1.0, depth: 2.0 }, sc);
      beam.position.set(node.x, node.y - 2, node.z);
      beam.rotation.y = -angle;
      beam.material = pillarMat;
      trackMeshes.push(beam);
    }
  }
}

// Build tunnel/arch structures
function buildTunnels(sc) {
  var tunnelSpots = [
    { start: 26, end: 29 },
    { start: 71, end: 73 }
  ];

  var tunnelMat = new BABYLON.StandardMaterial('tunnelMat', sc);
  tunnelMat.diffuseColor = CRYSTAL_KINGDOM ? c3(0x1A1530) : c3(0x556688);
  tunnelMat.specularColor = BABYLON.Color3.Black();
  tunnelMat.environmentIntensity = 0; // Prevent IBL gold reflections
  if (CRYSTAL_KINGDOM) tunnelMat.emissiveColor = new BABYLON.Color3(0.04, 0.03, 0.08);

  var innerMat = new BABYLON.StandardMaterial('innerMat', sc);
  innerMat.diffuseColor = CRYSTAL_KINGDOM ? c3(0x150E28) : c3(0x334466);
  innerMat.backFaceCulling = false;
  innerMat.environmentIntensity = 0;

  for (var t = 0; t < tunnelSpots.length; t++) {
    var spot = tunnelSpots[t];

    for (var i = spot.start; i <= spot.end; i++) {
      var node = trackNodes[i % TRACK_POINTS];
      var angle = getTrackAngle(i % TRACK_POINTS);
      var perpX = -Math.sin(angle);
      var perpZ = Math.cos(angle);

      var archW = TRACK_WIDTH + 4;
      var archH = 10;

      // Arch shape using half cylinder
      var arch = BABYLON.MeshBuilder.CreateCylinder('arch_' + t + '_' + i,
        {
          height: 3, diameterTop: archW, diameterBottom: archW, tessellation: 16,
          arc: 0.5
        }, sc);
      arch.position.set(node.x, node.y + archH / 2, node.z);
      arch.rotation.y = -angle;
      arch.rotation.z = Math.PI / 2;
      arch.scaling.x = archH / (archW / 2);
      arch.material = tunnelMat;
      trackMeshes.push(arch);

      // Side walls
      for (var side = -1; side <= 1; side += 2) {
        var wall = BABYLON.MeshBuilder.CreateBox('twall_' + t + '_' + i + '_' + side,
          { width: 1.5, height: archH, depth: 3 }, sc);
        wall.position.set(
          node.x + perpX * (archW / 2) * side,
          node.y + archH / 2,
          node.z + perpZ * (archW / 2) * side
        );
        wall.rotation.y = -angle;
        wall.material = tunnelMat;
        if (shadowGen) shadowGen.addShadowCaster(wall);
        trackMeshes.push(wall);
      }

      // Neon lights inside tunnel
      if (i % 2 === 0) {
        var lightColors = [0x4488DD, 0x8866BB, 0xFFCC66];
        var lColor = lightColors[(i - spot.start) % lightColors.length];
        var neonLight = BABYLON.MeshBuilder.CreateBox('neon_' + t + '_' + i,
          { width: archW * 0.8, height: 0.15, depth: 0.15 }, sc);
        neonLight.position.set(node.x, node.y + archH - 1, node.z);
        neonLight.rotation.y = -angle;
        var neonMat = new BABYLON.StandardMaterial('neonMat_' + t + '_' + i, sc);
        neonMat.diffuseColor = c3(lColor);
        neonMat.emissiveColor = c3(lColor);
        neonMat.alpha = 0.9;
        neonLight.material = neonMat;
        trackMeshes.push(neonLight);
      }
    }
  }
}

// Build ramps/jumps
function buildRamps(sc) {
  var rampMat = new BABYLON.StandardMaterial('rampMat', sc);
  rampMat.diffuseColor = c3(0x4488DD);
  rampMat.emissiveColor = new BABYLON.Color3(0.13, 0.4, 0.73).scale(0.35);

  var rampSpots = [48, 92];

  for (var r = 0; r < rampSpots.length; r++) {
    var idx = rampSpots[r];
    var node = trackNodes[idx];
    var angle = getTrackAngle(idx);

    var w = TRACK_WIDTH * 0.6;
    var h = 2.5;
    var d = 8;

    // Wedge vertices
    var rv = [
      -w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, 0, d / 2, -w / 2, 0, d / 2,
      -w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, h, d / 2, -w / 2, h, d / 2
    ];
    var ri = [
      4, 5, 6, 4, 6, 7,
      0, 2, 1, 0, 3, 2,
      2, 6, 5, 2, 5, 1,
      0, 4, 7, 0, 7, 3,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2
    ];

    var ramp = createCustomMesh('ramp_' + r, rv, ri, null, null, sc);
    ramp.position.set(node.x, node.y, node.z);
    ramp.rotation.y = -angle + Math.PI / 2;
    ramp.material = rampMat;
    trackMeshes.push(ramp);

    // Arrow markings
    var arrowMat = new BABYLON.StandardMaterial('arrowMat_' + r, sc);
    arrowMat.diffuseColor = c3(0xFFCC66);
    arrowMat.emissiveColor = c3(0xFFCC66).scale(0.5);
    arrowMat.alpha = 0.85;

    for (var a = 0; a < 3; a++) {
      var arrow = BABYLON.MeshBuilder.CreateCylinder('arrow_' + r + '_' + a,
        { height: 1.5, diameterTop: 0, diameterBottom: 1.6, tessellation: 3 }, sc);
      arrow.position.set(
        node.x + Math.cos(angle) * (-2 + a * 2),
        node.y + 0.5 + a * 0.5,
        node.z + Math.sin(angle) * (-2 + a * 2)
      );
      arrow.rotation.x = -Math.PI / 4;
      arrow.rotation.y = -angle;
      arrow.material = arrowMat;
      trackMeshes.push(arrow);
    }
  }
}

// Sky dome with rich gradient and aurora
function buildSky() {
  // Register sky shaders
  BABYLON.Effect.ShadersStore['skyVertexShader'] = [
    'precision highp float;',
    'attribute vec3 position;',
    'attribute vec2 uv;',
    'uniform mat4 world;',
    'uniform mat4 worldViewProjection;',
    'varying vec3 vWorldPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 wp = world * vec4(position, 1.0);',
    '  vWorldPosition = wp.xyz;',
    '  vUv = uv;',
    '  gl_Position = worldViewProjection * vec4(position, 1.0);',
    '}'
  ].join('\n');

  BABYLON.Effect.ShadersStore['skyFragmentShader'] = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform vec3 zenithColor;',
    'uniform vec3 upperColor;',
    'uniform vec3 midColor;',
    'uniform vec3 horizonColor;',
    'uniform vec3 belowColor;',
    'uniform vec3 auroraColor1;',
    'uniform vec3 auroraColor2;',
    'varying vec3 vWorldPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  float h = normalize(vWorldPosition).y;',
    '  vec3 color;',
    '  if (h > 0.6) {',
    '    color = mix(upperColor, zenithColor, (h - 0.6) / 0.4);',
    '  } else if (h > 0.25) {',
    '    color = mix(midColor, upperColor, (h - 0.25) / 0.35);',
    '  } else if (h > 0.0) {',
    '    color = mix(horizonColor, midColor, h / 0.25);',
    '  } else {',
    '    color = mix(belowColor, horizonColor, 1.0 + h * 2.5);',
    '  }',
    '  if (h > 0.05 && h < 0.85) {',
    '    float auroraH = (h - 0.05) / 0.80;',
    '    float time = uTime * 0.10;',
    // Height-based color gradient (concept art: vivid green bottom → blue → purple → pink top)
    '    float t1 = smoothstep(0.0, 0.35, auroraH);',
    '    float t2 = smoothstep(0.25, 0.55, auroraH);',
    '    float t3 = smoothstep(0.50, 0.80, auroraH);',
    '    vec3 auroraCol = mix(auroraColor1, vec3(0.15, 0.55, 1.0), t1);',
    '    auroraCol = mix(auroraCol, auroraColor2, t2);',
    '    auroraCol = mix(auroraCol, vec3(1.0, 0.3, 0.65), t3);',
    // Vertical envelope - focused band
    '    float envelope = sin(auroraH * 3.14159);',
    '    envelope = pow(envelope, 0.7);',
    // Sharp curtain bands - creates distinct bright/dark stripes like concept art
    '    float band1 = pow(max(0.0, sin(auroraH * 4.0 + sin(vUv.x * 3.0 + time) * 1.5)), 1.5);',
    '    float band2 = pow(max(0.0, sin(auroraH * 3.0 + 1.5 + sin(vUv.x * 2.0 - time * 0.6) * 1.2)), 1.3);',
    '    float bandShape = band1 * 0.6 + band2 * 0.4;',
    // Flowing curtain horizontal movement
    '    float curtain = sin(vUv.x * 5.0 + time) * 0.3 + 0.7;',
    // Aurora = color gradient * vertical envelope * distinct band shapes * curtain
    '    color += auroraCol * envelope * bandShape * curtain * 2.2;',
    '  }',
    // Warm horizon glow - moderate sunset band
    '  float horizonGlow = exp(-abs(h) * 6.0) * 0.30;',
    '  color += horizonColor * horizonGlow;',
    '  float sunsetGlow = exp(-abs(h) * 8.0) * 0.18;',
    '  color += vec3(1.0, 0.6, 0.3) * sunsetGlow;',
    '  float goldGlow = exp(-abs(h) * 12.0) * 0.10;',
    '  color += vec3(1.0, 0.85, 0.4) * goldGlow;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  var skyMesh = BABYLON.MeshBuilder.CreateSphere('sky', {
    diameter: 1600, segments: 48,
    sideOrientation: BABYLON.Mesh.BACKSIDE
  }, scene);

  skyMat = new BABYLON.ShaderMaterial('skyShader', scene, {
    vertex: 'sky',
    fragment: 'sky'
  }, {
    attributes: ['position', 'uv', 'normal'],
    uniforms: ['world', 'worldViewProjection', 'uTime',
      'zenithColor', 'upperColor', 'midColor', 'horizonColor', 'belowColor',
      'auroraColor1', 'auroraColor2'],
    needAlphaBlending: false
  });

  if (CRYSTAL_KINGDOM) {
    // Crystal Kingdom twilight sky with vivid aurora
    skyMat.setColor3('zenithColor', c3(0x030510));   // near-black space
    skyMat.setColor3('upperColor', c3(0x080C20));    // very dark navy
    skyMat.setColor3('midColor', c3(0x0E0A20));      // darker purple
    skyMat.setColor3('horizonColor', c3(0x443020));   // warm sunset horizon
    skyMat.setColor3('belowColor', c3(0x150C20));     // dark purple
    skyMat.setColor3('auroraColor1', c3(0x33FF88));   // vivid green aurora
    skyMat.setColor3('auroraColor2', c3(0x8844FF));   // vivid purple aurora
  } else {
    skyMat.setColor3('zenithColor', c3(0x0D1B33));
    skyMat.setColor3('upperColor', c3(0x1A2E4A));
    skyMat.setColor3('midColor', c3(0x6B5B95));
    skyMat.setColor3('horizonColor', c3(0xC8D5E8));
    skyMat.setColor3('belowColor', c3(0x8899CC));
    skyMat.setColor3('auroraColor1', c3(0x6688CC));
    skyMat.setColor3('auroraColor2', c3(0xAABBEE));
  }
  skyMat.backFaceCulling = false;

  skyMesh.material = skyMat;
  skyMesh.infiniteDistance = true;
  skyMesh.applyFog = false;
  if (window._glowLayer) window._glowLayer.addExcludedMesh(skyMesh);
}

// Billboard clouds
function buildClouds() {
  cloudMeshes = [];

  // Cloud texture
  var cloudTex = new BABYLON.DynamicTexture('cloudTex', { width: 256, height: 128 }, scene, true);
  var cCtx = cloudTex.getContext();

  cCtx.clearRect(0, 0, 256, 128);
  var cloudPuffs = [
    { x: 128, y: 70, r: 55 }, { x: 90, y: 75, r: 42 },
    { x: 170, y: 72, r: 45 }, { x: 60, y: 82, r: 30 },
    { x: 200, y: 80, r: 32 }, { x: 128, y: 55, r: 35 },
    { x: 105, y: 60, r: 30 }, { x: 155, y: 58, r: 32 }
  ];
  for (var i = 0; i < cloudPuffs.length; i++) {
    var cp = cloudPuffs[i];
    var grad = cCtx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, cp.r);
    grad.addColorStop(0, 'rgba(221,232,255,0.9)');
    grad.addColorStop(0.5, 'rgba(204,213,238,0.5)');
    grad.addColorStop(1, 'rgba(187,204,221,0)');
    cCtx.fillStyle = grad;
    cCtx.fillRect(cp.x - cp.r, cp.y - cp.r, cp.r * 2, cp.r * 2);
  }
  cloudTex.update();
  cloudTex.hasAlpha = true;

  for (var i = 0; i < 35; i++) {
    var sizeRoll = Math.random();
    var cloudScale = sizeRoll < 0.5 ? (30 + Math.random() * 25) :
      sizeRoll < 0.85 ? (50 + Math.random() * 40) :
        (80 + Math.random() * 40);
    var cloudH = cloudScale * 0.4;

    var cloud = BABYLON.MeshBuilder.CreatePlane('cloud_' + i,
      { width: cloudScale, height: cloudH }, scene);

    var cloudMat = new BABYLON.StandardMaterial('cloudMat_' + i, scene);
    cloudMat.diffuseTexture = cloudTex;
    cloudMat.opacityTexture = cloudTex;
    if (CRYSTAL_KINGDOM) {
      cloudMat.diffuseColor = c3([0x8877CC, 0x6688BB, 0x9966AA, 0x7788CC, 0xAA88BB][i % 5]);
      cloudMat.alpha = 0.3 + Math.random() * 0.15;
    } else {
      cloudMat.diffuseColor = c3([0xDDE8FF, 0xCCD5EE, 0xBBCCDD, 0xD5DDEE, 0xC8D5E8][i % 5]);
      cloudMat.alpha = 0.55 + Math.random() * 0.25;
    }
    cloudMat.backFaceCulling = false;
    cloudMat.disableLighting = true;
    cloudMat.emissiveColor = cloudMat.diffuseColor.scale(0.7);
    cloud.material = cloudMat;

    cloud.position.x = (Math.random() - 0.5) * 1400;
    cloud.position.y = 80 + Math.random() * 150;
    cloud.position.z = (Math.random() - 0.5) * 1400;
    cloud.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    cloud.metadata = {
      driftSpeed: 0.015 + Math.random() * 0.03,
      startX: cloud.position.x
    };
    // Exclude clouds from GlowLayer
    if (window._glowLayer) window._glowLayer.addExcludedMesh(cloud);

    cloudMeshes.push(cloud);
  }
}

// Stars
function buildStars() {
  var starCount = CRYSTAL_KINGDOM ? 1000 : 300;
  var positions = [];
  var colors = [];
  var indices = [];

  for (var i = 0; i < starCount; i++) {
    var sAngle = Math.random() * Math.PI * 2;
    var sElev = 0.2 + Math.random() * 0.8;
    var sDist = 500 + Math.random() * 300;
    positions.push(
      Math.cos(sAngle) * sDist,
      sElev * sDist,
      Math.sin(sAngle) * sDist
    );

    var starHues = [0xFFFFFF, 0xFFDD88, 0xFFAACC, 0x88DDFF, 0xDDBBFF];
    var sColor = c3(starHues[Math.floor(Math.random() * starHues.length)]);
    colors.push(sColor.r, sColor.g, sColor.b, 0.8);
    indices.push(i);
  }

  var starMesh = createCustomMesh('stars', positions, indices, null, colors);
  var starMat = new BABYLON.StandardMaterial('starMat', scene);
  starMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  starMat.disableLighting = true;
  starMat.pointsCloud = true;
  starMat.pointSize = CRYSTAL_KINGDOM ? 4.0 : 2.5;
  starMesh.material = starMat;
}

// Sun decoration
function buildSunDecor() {
  // Crystal Kingdom: low sunset position with warm golden glow
  var sunY = CRYSTAL_KINGDOM ? 25 : 80;
  var sunColor = CRYSTAL_KINGDOM ? 0xFFCC66 : 0xFFEECC;
  var flareAlpha1 = CRYSTAL_KINGDOM ? 0.2 : 0.12;
  var flareAlpha2 = CRYSTAL_KINGDOM ? 0.1 : 0.06;

  var sunMat = new BABYLON.StandardMaterial('sunMat', scene);
  sunMat.emissiveColor = c3(sunColor);
  sunMat.disableLighting = true;

  var sun = BABYLON.MeshBuilder.CreateSphere('sun', { diameter: 80, segments: 16 }, scene);
  sun.position.set(300, sunY, -400);
  sun.material = sunMat;

  var flareMat = new BABYLON.StandardMaterial('flareMat', scene);
  flareMat.emissiveColor = c3(sunColor);
  flareMat.disableLighting = true;
  flareMat.alpha = flareAlpha1;
  // Exclude sun/flare from GlowLayer to prevent huge halo
  if (window._glowLayer) window._glowLayer.addExcludedMesh(sun);

  var flare = BABYLON.MeshBuilder.CreateSphere('flare', { diameter: 120, segments: 16 }, scene);
  flare.position.set(300, sunY, -400);
  flare.material = flareMat;

  var flare2Mat = new BABYLON.StandardMaterial('flare2Mat', scene);
  flare2Mat.emissiveColor = c3(CRYSTAL_KINGDOM ? 0xFFAA44 : 0xFFDDAA);
  flare2Mat.disableLighting = true;
  flare2Mat.alpha = flareAlpha2;

  var flare2 = BABYLON.MeshBuilder.CreateSphere('flare2', { diameter: 180, segments: 16 }, scene);
  flare2.position.set(300, sunY, -400);
  flare2.material = flare2Mat;
  if (window._glowLayer) {
    window._glowLayer.addExcludedMesh(flare);
    window._glowLayer.addExcludedMesh(flare2);
  }
}

// Distant mountains
function buildDistantMountains() {
  var mtMat = new BABYLON.StandardMaterial('mtMat', scene);
  mtMat.diffuseColor = CRYSTAL_KINGDOM ? c3(0x0A0515) : c3(0x223355);
  if (CRYSTAL_KINGDOM) mtMat.emissiveColor = c3(0x05020B);  // Very dark silhouette
  mtMat.specularColor = BABYLON.Color3.Black();

  var numMountains = CRYSTAL_KINGDOM ? 120 : 8;
  var mtMeshes = [];

  for (var i = 0; i < numMountains; i++) {
    var ang = (i / numMountains) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
    var dist = CRYSTAL_KINGDOM ? 1000 + Math.random() * 400 : 900 + Math.random() * 200;
    var scale = CRYSTAL_KINGDOM ? (100 + Math.random() * 200) : (200 + Math.random() * 200);
    var h = CRYSTAL_KINGDOM ? (300 + Math.random() * 500) : (150 + Math.random() * 150);
    var tess = CRYSTAL_KINGDOM ? 3 : 4; // Sharp jagged shards

    var mt = BABYLON.MeshBuilder.CreateCylinder('mt_' + i,
      { height: h, diameterTop: 0, diameterBottom: scale * (CRYSTAL_KINGDOM ? 1.0 : 2.0), tessellation: tess }, scene);

    var yPos = CRYSTAL_KINGDOM ? (h / 2 - 100 - Math.random() * 100) : (h / 2 - 20);
    mt.position.set(Math.cos(ang) * dist, yPos, Math.sin(ang) * dist);

    mt.rotation.y = Math.random() * Math.PI;
    if (CRYSTAL_KINGDOM) {
      mt.rotation.z = (Math.random() - 0.5) * 0.8; // Jagged leaning peaks
      mt.rotation.x = (Math.random() - 0.5) * 0.5;
    }

    if (CRYSTAL_KINGDOM) {
      mtMeshes.push(mt);
    } else {
      mt.material = mtMat;
    }
  }

  // Merge the mountain ring for performance
  if (CRYSTAL_KINGDOM && mtMeshes.length > 0) {
    var mergedMt = BABYLON.Mesh.MergeMeshes(mtMeshes, true, true, undefined, false, false);
    if (mergedMt) {
      mergedMt.material = mtMat;
    }
  }
}

// Environment particles (floating motes/petals)
function createEnvParticles() {
  // Create particle texture
  var particleTex = new BABYLON.DynamicTexture('envParticleTex', 32, scene, true);
  var ptCtx = particleTex.getContext();
  var ptGrad = ptCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  ptGrad.addColorStop(0, 'rgba(255,255,255,1)');
  ptGrad.addColorStop(0.5, 'rgba(200,200,255,0.5)');
  ptGrad.addColorStop(1, 'rgba(150,150,255,0)');
  ptCtx.fillStyle = ptGrad;
  ptCtx.fillRect(0, 0, 32, 32);
  particleTex.update();
  particleTex.hasAlpha = true;

  var count = isMobile ? 300 : (CRYSTAL_KINGDOM ? 1000 : 500);
  envParticleSystem = new BABYLON.ParticleSystem('envParticles', count, scene);
  envParticleSystem.particleTexture = particleTex;
  envParticleSystem.emitter = new BABYLON.Vector3(0, 40, 0);
  envParticleSystem.createBoxEmitter(
    new BABYLON.Vector3(-0.5, -1, -0.5),
    new BABYLON.Vector3(0.5, 0, 0.5),
    new BABYLON.Vector3(-400, 5, -400),
    new BABYLON.Vector3(400, 80, 400)
  );
  envParticleSystem.minLifeTime = 6;
  envParticleSystem.maxLifeTime = 12;
  envParticleSystem.emitRate = count / 6;
  envParticleSystem.gravity = new BABYLON.Vector3(0, -0.5, 0);
  envParticleSystem.minSize = CRYSTAL_KINGDOM ? 1.0 : 0.5;
  envParticleSystem.maxSize = CRYSTAL_KINGDOM ? 5.0 : 2.5;
  if (CRYSTAL_KINGDOM) {
    // Crystal Kingdom sparkle particles - very vivid magical motes
    envParticleSystem.color1 = new BABYLON.Color4(0.6, 0.9, 1.0, 1.0);
    envParticleSystem.color2 = new BABYLON.Color4(1.0, 0.5, 1.0, 1.0);
    envParticleSystem.colorDead = new BABYLON.Color4(0.4, 0.6, 1.0, 0);
  } else {
    envParticleSystem.color1 = new BABYLON.Color4(0.5, 0.5, 1.0, 0.65);
    envParticleSystem.color2 = new BABYLON.Color4(0.9, 0.8, 0.3, 0.65);
    envParticleSystem.colorDead = new BABYLON.Color4(0.5, 0.5, 1.0, 0);
  }
  envParticleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  envParticleSystem.start();
}

function updateEnvParticles(dt) {
  // Handled automatically by Babylon.js ParticleSystem
}

// Camera follow (Mario Kart style)
function updateCamera(pl) {
  if (!pl || !camera) return;

  // Fixed camera distance - NO speed-dependent pullback
  var camDist = 5.0, camH = 2.8;

  var fwdX = Math.cos(pl.ang);
  var fwdZ = Math.sin(pl.ang);

  // Camera always stays behind the kart (no reverse flip)
  var camDirX = -fwdX;
  var camDirZ = -fwdZ;

  var idealX = pl.x + camDirX * camDist;
  var idealZ = pl.z + camDirZ * camDist;
  var idealY = pl.y + camH;

  if (pl.boostTimer > 0) {
    cameraShake.x = (Math.random() - 0.5) * 0.15;
    cameraShake.y = (Math.random() - 0.5) * 0.1;
  } else {
    cameraShake.x *= 0.85;
    cameraShake.y *= 0.85;
  }

  // Camera sticks tightly to player - no lag at any speed
  var absSpd = Math.abs(pl.spd || 0);
  var lerpFactor = 0.45 + absSpd * 0.25; // 0.45 at rest, ~0.90 at max speed
  if (pl.boostTimer > 0) lerpFactor = Math.max(lerpFactor, 0.85);
  if (lerpFactor > 0.95) lerpFactor = 0.95;
  camera.position.x += (idealX - camera.position.x) * lerpFactor + cameraShake.x;
  camera.position.y += (idealY - camera.position.y) * lerpFactor + cameraShake.y;
  camera.position.z += (idealZ - camera.position.z) * lerpFactor;

  // Look target: always forward
  var lookAhead = 2.0;
  camera.setTarget(new BABYLON.Vector3(pl.x + fwdX * lookAhead, pl.y + 1.4, pl.z + fwdZ * lookAhead));

  // Shadow light follows player
  if (window._sunLight && window._sunLight.getShadowGenerator && window._sunLight.getShadowGenerator()) {
    var sl = window._sunLight;
    sl.position = new BABYLON.Vector3(pl.x + 100, pl.y + 120, pl.z - 150);
  }
}

// Animate clouds
function updateClouds(dt) {
  var timeScale = (dt || 0.016) * 60;
  for (var i = 0; i < cloudMeshes.length; i++) {
    var c = cloudMeshes[i];
    c.position.x += c.metadata.driftSpeed * timeScale;
    if (c.position.x > 700) c.position.x = -700;
  }
}

// Drift smoke particle systems
function createDriftParticles() {
  // Smoke texture
  var smokeTex = new BABYLON.DynamicTexture('smokeTex', 64, scene, true);
  var sCtx = smokeTex.getContext();
  var grad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.4, 'rgba(220,220,220,0.4)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 64, 64);
  smokeTex.update();
  smokeTex.hasAlpha = true;

  // Left drift
  var driftLeft = new BABYLON.ParticleSystem('driftL', 50, scene);
  driftLeft.particleTexture = smokeTex;
  driftLeft.emitter = new BABYLON.Vector3(0, -100, 0);
  driftLeft.minLifeTime = 0.5;
  driftLeft.maxLifeTime = 1.0;
  driftLeft.minSize = 0.3;
  driftLeft.maxSize = 1.8;
  driftLeft.emitRate = 0;
  driftLeft.color1 = new BABYLON.Color4(1, 1, 1, 0.6);
  driftLeft.color2 = new BABYLON.Color4(0.8, 0.8, 0.8, 0.3);
  driftLeft.colorDead = new BABYLON.Color4(0.7, 0.7, 0.7, 0);
  driftLeft.direction1 = new BABYLON.Vector3(-2, 1, -2);
  driftLeft.direction2 = new BABYLON.Vector3(2, 2, 2);
  driftLeft.gravity = new BABYLON.Vector3(0, 0.5, 0);
  driftLeft.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  driftLeft.start();
  particles.driftLeft = driftLeft;

  // Right drift
  var driftRight = new BABYLON.ParticleSystem('driftR', 50, scene);
  driftRight.particleTexture = smokeTex;
  driftRight.emitter = new BABYLON.Vector3(0, -100, 0);
  driftRight.minLifeTime = 0.5;
  driftRight.maxLifeTime = 1.0;
  driftRight.minSize = 0.3;
  driftRight.maxSize = 1.8;
  driftRight.emitRate = 0;
  driftRight.color1 = new BABYLON.Color4(1, 1, 1, 0.6);
  driftRight.color2 = new BABYLON.Color4(0.8, 0.8, 0.8, 0.3);
  driftRight.colorDead = new BABYLON.Color4(0.7, 0.7, 0.7, 0);
  driftRight.direction1 = new BABYLON.Vector3(-2, 1, -2);
  driftRight.direction2 = new BABYLON.Vector3(2, 2, 2);
  driftRight.gravity = new BABYLON.Vector3(0, 0.5, 0);
  driftRight.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
  driftRight.start();
  particles.driftRight = driftRight;
}

function updateDriftParticles(player, dt) {
  if (!player || !particles.driftLeft || !particles.driftRight) return;

  if (player.drifting) {
    var wheelOffset = 1.2;
    var rearOffset = 1.5;

    particles.driftLeft.emitter = new BABYLON.Vector3(
      player.x + Math.cos(player.ang + Math.PI / 2) * wheelOffset + Math.cos(player.ang) * rearOffset,
      player.y + 0.2,
      player.z + Math.sin(player.ang + Math.PI / 2) * wheelOffset + Math.sin(player.ang) * rearOffset
    );
    particles.driftLeft.emitRate = 20;

    particles.driftRight.emitter = new BABYLON.Vector3(
      player.x - Math.cos(player.ang + Math.PI / 2) * wheelOffset + Math.cos(player.ang) * rearOffset,
      player.y + 0.2,
      player.z - Math.sin(player.ang + Math.PI / 2) * wheelOffset + Math.sin(player.ang) * rearOffset
    );
    particles.driftRight.emitRate = 20;
  } else {
    particles.driftLeft.emitRate = 0;
    particles.driftRight.emitRate = 0;
  }
}

// Boost flame particle system
function createBoostEffect() {
  var fireTex = new BABYLON.DynamicTexture('fireTex', 64, scene, true);
  var fCtx = fireTex.getContext();
  var fGrad = fCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
  fGrad.addColorStop(0, 'rgba(255,220,100,1)');
  fGrad.addColorStop(0.3, 'rgba(255,130,0,0.8)');
  fGrad.addColorStop(0.7, 'rgba(255,50,0,0.3)');
  fGrad.addColorStop(1, 'rgba(200,0,0,0)');
  fCtx.fillStyle = fGrad;
  fCtx.fillRect(0, 0, 64, 64);
  fireTex.update();
  fireTex.hasAlpha = true;

  var boostPS = new BABYLON.ParticleSystem('boostFlame', 40, scene);
  boostPS.particleTexture = fireTex;
  boostPS.emitter = new BABYLON.Vector3(0, -100, 0);
  boostPS.minLifeTime = 0.15;
  boostPS.maxLifeTime = 0.4;
  boostPS.minSize = 0.4;
  boostPS.maxSize = 1.2;
  boostPS.emitRate = 0;
  boostPS.color1 = new BABYLON.Color4(1, 0.8, 0.2, 0.9);
  boostPS.color2 = new BABYLON.Color4(1, 0.3, 0, 0.7);
  boostPS.colorDead = new BABYLON.Color4(0.8, 0, 0, 0);
  boostPS.direction1 = new BABYLON.Vector3(-1, -0.5, -1);
  boostPS.direction2 = new BABYLON.Vector3(1, 0.5, 1);
  boostPS.gravity = new BABYLON.Vector3(0, 0, 0);
  boostPS.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  boostPS.start();
  particles.boostFlame = boostPS;
}

function updateBoostEffect(player, dt) {
  if (!player || !particles.boostFlame) return;

  if (player.boostTimer > 0) {
    particles.boostFlame.emitter = new BABYLON.Vector3(
      player.x + Math.sin(player.ang) * 2,
      player.y + 0.5,
      player.z + Math.cos(player.ang) * 2
    );
    particles.boostFlame.emitRate = 30;
  } else {
    particles.boostFlame.emitRate = 0;
  }
}

// Speed lines overlay (2D canvas - no 3D dependency)
var speedLinesCanvas = null;
var speedLinesCtx = null;

function initSpeedLines() {
  speedLinesCanvas = document.createElement('canvas');
  speedLinesCanvas.id = 'speed-lines';
  speedLinesCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
  speedLinesCanvas.width = window.innerWidth;
  speedLinesCanvas.height = window.innerHeight;
  document.body.appendChild(speedLinesCanvas);
  speedLinesCtx = speedLinesCanvas.getContext('2d');
}

function updateSpeedLines(pl) {
  if (!speedLinesCtx || !pl) return;
  var w = speedLinesCanvas.width;
  var h = speedLinesCanvas.height;
  speedLinesCtx.clearRect(0, 0, w, h);

  var speedRatio = Math.abs(pl.spd) / (pl.maxSpd || 1.5);
  if (speedRatio < 0.6) return;

  var intensity = (speedRatio - 0.6) / 0.4;
  var lineCount = Math.floor(intensity * 25);
  var cx = w / 2;
  var cy = h / 2;

  speedLinesCtx.strokeStyle = 'rgba(255,255,255,' + (intensity * 0.25) + ')';
  speedLinesCtx.lineWidth = 1.5;

  for (var i = 0; i < lineCount; i++) {
    var ang = Math.random() * Math.PI * 2;
    var startR = 0.3 + Math.random() * 0.2;
    var endR = 0.6 + Math.random() * 0.4;
    var maxR = Math.max(w, h) * 0.7;

    speedLinesCtx.beginPath();
    speedLinesCtx.moveTo(cx + Math.cos(ang) * startR * maxR, cy + Math.sin(ang) * startR * maxR);
    speedLinesCtx.lineTo(cx + Math.cos(ang) * endR * maxR, cy + Math.sin(ang) * endR * maxR);
    speedLinesCtx.stroke();
  }

  if (pl.boostTimer > 0) {
    speedLinesCtx.strokeStyle = 'rgba(255,150,0,' + (0.3 + Math.random() * 0.15) + ')';
    speedLinesCtx.lineWidth = 2.5;
    for (var i = 0; i < 15; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sR = 0.2 + Math.random() * 0.15;
      var eR = 0.65 + Math.random() * 0.35;
      var maxR = Math.max(w, h) * 0.7;
      speedLinesCtx.beginPath();
      speedLinesCtx.moveTo(cx + Math.cos(ang) * sR * maxR, cy + Math.sin(ang) * sR * maxR);
      speedLinesCtx.lineTo(cx + Math.cos(ang) * eR * maxR, cy + Math.sin(ang) * eR * maxR);
      speedLinesCtx.stroke();
    }
  }
}

var skyTime = 0;
function updateSkyShader(dt) {
  if (skyMat) {
    skyTime += (dt || 0.016);
    skyMat.setFloat('uTime', skyTime);
  }
}

// Render scene
function renderScene() {
  if (scene && engine) {
    updateSkyShader(BABYLON.Engine.LastDeltaTime / 1000);
    try {
      scene.render();
    } catch (e) {
      // Disable mirror texture if it causes render errors
      if (reflectionTexture && reflectionTexture.renderList !== undefined) {
        reflectionTexture.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        console.warn('Disabled mirror texture refresh due to render error');
      }
    }
  }
}

// Handle resize
function handleResize() {
  if (!engine) return;
  engine.resize();

  if (speedLinesCanvas) {
    speedLinesCanvas.width = window.innerWidth;
    speedLinesCanvas.height = window.innerHeight;
  }
}

window.addEventListener('resize', function () {
  checkOrientation();
  handleResize();
});
