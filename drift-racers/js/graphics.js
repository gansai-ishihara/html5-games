// graphics.js - Scene setup, lighting, particles, camera, and post-processing
// Mario Kart-style 3D racing game using Three.js r128

var scene, camera, renderer, clock;
var composer = null; // EffectComposer for post-processing
var envMap = null;   // Environment map for reflections
var particles = { driftLeft: null, driftRight: null, boostFlame: null, dustClouds: [] };
var cloudMeshes = []; // For animating clouds

function initScene() {
  // Create scene - Darker atmosphere for neon contrast
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1a33);
  scene.fog = new THREE.FogExp2(0x0a1a33, 0.0015);

  // Camera setup
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 2000);
  camera.position.set(0, 10, 20);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    antialias: false, // We use FXAA post-process instead
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.shadowMap.enabled = !isMobile;
  if (!isMobile) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputEncoding = THREE.sRGBEncoding;
  // No CSS filter - post-processing handles color grading
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  // === Generate Environment Map for reflections ===
  generateEnvMap();

  // === Lighting setup - PBR Optimized ===

  // Ambient - dim cool blue for shadows
  var ambientLight = new THREE.AmbientLight(0x112244, 0.4);
  scene.add(ambientLight);

  // Main Sun - Bright for PBR
  var sunLight = new THREE.DirectionalLight(0xfffaed, 2.5); // Boosted intensity for PBR
  sunLight.position.set(100, 150, -100);
  if (!isMobile) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.bias = -0.0001;
  }
  scene.add(sunLight);
  window._sunLight = sunLight;

  // Hemisphere - Environment fill
  var hemiLight = new THREE.HemisphereLight(0xddeeff, 0x224422, 0.5);
  scene.add(hemiLight);

  // Rim/Backlight - Artistic purple glow
  var rimLight = new THREE.DirectionalLight(0xaa88ff, 1.2);
  rimLight.position.set(-50, 50, -100);
  scene.add(rimLight);

  // Ground - lush fantasy meadow
  buildGround();

  // Sky dome
  buildSky();

  // Clouds (billboard style, animated)
  buildClouds();

  // Stars
  buildStars();

  // Sun + glow
  buildSunDecor();

  // Rainbow removed - Crystal Kingdom doesn't need rainbow

  // Terrain structures
  buildBridgePillars(scene);
  buildTunnels(scene);
  buildRamps(scene);

  clock = new THREE.Clock();

  // Initialize particle systems
  createDriftParticles(scene);
  createBoostEffect(scene);

  // === Post-processing ===
  initPostProcessing();
}

// Generate environment cubemap for reflections
function generateEnvMap() {
  // Create a simple gradient cubemap procedurally
  var pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileCubemapShader();

  // Create a small scene for the env map
  var envScene = new THREE.Scene();

  // Gradient sky sphere
  var envSkyGeo = new THREE.SphereGeometry(100, 16, 16);
  var envSkyVS = [
    'varying vec3 vWorldPos;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');
  var envSkyFS = [
    'varying vec3 vWorldPos;',
    'void main() {',
    '  float h = normalize(vWorldPos).y;',
    '  vec3 top = vec3(0.10, 0.18, 0.29);',
    '  vec3 mid = vec3(0.42, 0.36, 0.58);',
    '  vec3 bot = vec3(0.78, 0.84, 0.91);',
    '  vec3 col = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var envSkyMat = new THREE.ShaderMaterial({
    vertexShader: envSkyVS,
    fragmentShader: envSkyFS,
    side: THREE.BackSide
  });
  envScene.add(new THREE.Mesh(envSkyGeo, envSkyMat));

  // Add some colored lights to create reflections
  envScene.add(new THREE.AmbientLight(0xffffff, 0.5));

  var rt = pmremGen.fromScene(envScene, 0.04);
  envMap = rt.texture;
  pmremGen.dispose();
}

// Post-processing: Bloom + FXAA + Vignette
// NOTE: Three.js r128 EffectComposer uses linear color space internally.
// The renderer's outputEncoding is bypassed, so we must handle gamma in the final pass.
function initPostProcessing() {
  if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.UnrealBloomPass) {
    console.warn('Post-processing not available, falling back to direct render');
    return;
  }

  // Create render target with sRGB encoding to match renderer output
  var rtParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    encoding: THREE.sRGBEncoding
  };
  var renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio(),
    rtParams
  );
  composer = new THREE.EffectComposer(renderer, renderTarget);

  // Render pass
  var renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom pass - subtle glow for emissive objects only
  var bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35,  // strength (subtle)
    0.4,   // radius
    0.92   // threshold (high = only bright things bloom)
  );
  composer.addPass(bloomPass);

  // FXAA anti-aliasing
  if (THREE.FXAAShader) {
    var fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    var pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (window.innerWidth * pixelRatio),
      1 / (window.innerHeight * pixelRatio)
    );
    composer.addPass(fxaaPass);
  }

  // Vignette + color grading (final pass, no gamma correction needed with Lambert)
  var finalShader = {
    uniforms: {
      tDiffuse: { value: null },
      darkness: { value: 0.25 },
      offset: { value: 1.2 },
      saturation: { value: 1.2 },
      contrast: { value: 1.05 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float darkness;',
      'uniform float offset;',
      'uniform float saturation;',
      'uniform float contrast;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 texel = texture2D(tDiffuse, vUv);',
      '  vec3 col = texel.rgb;',
      '  // Saturation boost',
      '  float grey = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(grey), col, saturation);',
      '  // Contrast',
      '  col = (col - 0.5) * contrast + 0.5;',
      '  // Vignette',
      '  vec2 uv = (vUv - 0.5) * 2.0;',
      '  float vig = 1.0 - darkness * dot(uv, uv) / (offset * offset);',
      '  col *= clamp(vig, 0.0, 1.0);',
      '  gl_FragColor = vec4(col, texel.a);',
      '}'
    ].join('\n')
  };
  var finalPass = new THREE.ShaderPass(finalShader);
  composer.addPass(finalPass);
}

// Simple noise function for terrain generation
function terrainNoise(x, z) {
  // Multiple octaves of sine-based noise for natural terrain
  var n = 0;
  n += Math.sin(x * 0.008 + 1.3) * Math.cos(z * 0.006 + 0.7) * 12;
  n += Math.sin(x * 0.015 + 2.1) * Math.cos(z * 0.012 - 0.3) * 6;
  n += Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.025 + 1.5) * 3;
  n += Math.sin(x * 0.06) * Math.cos(z * 0.05 + 2.0) * 1.5;
  return n;
}

// Check if point is near the track (returns distance to nearest track node)
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

  // Near the track: flatten terrain and lower it below road
  var trackD = distToTrackCenter(wx, wz);
  var trackClearance = TRACK_WIDTH * 0.7; // Zone where terrain stays flat
  var transitionZone = 30; // Smooth transition from flat to hills

  if (trackD < trackClearance) {
    // Under/near the road: low and flat
    return -4;
  } else if (trackD < trackClearance + transitionZone) {
    // Transition zone: smoothly rise from road level to terrain
    var t = (trackD - trackClearance) / transitionZone;
    t = t * t * (3 - 2 * t); // Smooth-step
    return -4 + t * (baseNoise + 4);
  } else {
    return baseNoise;
  }
}

// Build 3D terrain mesh with hills and valleys
function buildGround() {
  var terrainSize = 1600;
  var segments = 120; // Improved terrain resolution
  var segSize = terrainSize / segments;

  var grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  var ctx = grassCanvas.getContext('2d');

  // Rich emerald green (saturated)
  ctx.fillStyle = '#2E8B57';
  ctx.fillRect(0, 0, 512, 512);

  // Variation patches
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

  // Grass blades
  for (var i = 0; i < 8000; i++) {
    var gx = Math.random() * 512;
    var gy = Math.random() * 512;
    var light = 40 + Math.random() * 25;
    ctx.fillStyle = 'hsl(' + (100 + Math.random() * 40) + ',55%,' + light + '%)';
    ctx.fillRect(gx, gy, 0.8, 2 + Math.random() * 4);
  }

  // Flowers - lavender and rose only
  var fColors = ['#9988CC', '#DDA0BB'];
  for (var i = 0; i < 120; i++) {
    var fx = Math.random() * 512;
    var fy = Math.random() * 512;
    ctx.fillStyle = fColors[Math.floor(Math.random() * fColors.length)];
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  var grassTexture = new THREE.CanvasTexture(grassCanvas);
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(40, 40);
  grassTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  grassTexture.encoding = THREE.sRGBEncoding;

  // Generate terrain geometry with height variation
  var terrainGeom = new THREE.BufferGeometry();
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

      // Color variation based on height (greener valleys, brown hills)
      var hFactor = Math.max(0, Math.min(1, (wy + 4) / 20));
      var r = 0.3 + hFactor * 0.25;
      var g = 0.6 - hFactor * 0.15;
      var b = 0.25 + hFactor * 0.1;
      colors.push(r, g, b);
    }
  }

  for (var iz = 0; iz < segments; iz++) {
    for (var ix = 0; ix < segments; ix++) {
      var a = iz * (segments + 1) + ix;
      var b = a + 1;
      var c = a + (segments + 1);
      var d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  terrainGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  terrainGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  terrainGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeom.setIndex(indices);
  terrainGeom.computeVertexNormals();

  var groundMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true
  });

  var ground = new THREE.Mesh(terrainGeom, groundMaterial);
  ground.receiveShadow = true;
  scene.add(ground);

  // Additional cliff/rock faces along steep terrain changes near track
  buildTerrainCliffs(scene);
}

// Build cliff faces near the track where terrain drops sharply
function buildTerrainCliffs(scene) {
  // Create rocky cliff meshes along the sides of the road
  // Create rocky cliff meshes along the sides of the road
  var cliffMat = new THREE.MeshStandardMaterial({
    color: 0x554433,
    roughness: 0.9,
    metalness: 0.0
  });

  // Place cliff sections at track-adjacent positions
  for (var i = 0; i < trackNodes.length; i += 4) {
    var node = trackNodes[i];
    var angle = getTrackAngle(i);
    var perpX = -Math.sin(angle);
    var perpZ = Math.cos(angle);

    for (var side = -1; side <= 1; side += 2) {
      var cliffDist = TRACK_WIDTH * 0.7 + 5;
      var cx = node.x + perpX * cliffDist * side;
      var cz = node.z + perpZ * cliffDist * side;
      var terrainH = terrainNoise(cx, cz);

      // Only build cliff where terrain is significantly below road
      if (terrainH < node.y - 2) {
        var cliffH = node.y - terrainH + 1;
        var cliffW = 6 + Math.random() * 4;

        // Randomized rocky shape
        var cliffGeo = new THREE.BoxGeometry(cliffW, cliffH, 3 + Math.random() * 2);
        var cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(cx, terrainH + cliffH / 2, cz);
        cliff.rotation.y = angle + Math.random() * 0.3;

        // Slight random distortion for natural look
        var posAttr = cliff.geometry.attributes.position;
        for (var v = 0; v < posAttr.count; v++) {
          posAttr.setX(v, posAttr.getX(v) + (Math.random() - 0.5) * 0.8);
          posAttr.setZ(v, posAttr.getZ(v) + (Math.random() - 0.5) * 0.8);
        }
        cliff.geometry.computeVertexNormals();

        cliff.castShadow = true;
        scene.add(cliff);
        trackMeshes.push(cliff);
      }
    }
  }
}

// Build bridge supports/pillars under elevated road sections
function buildBridgePillars(scene) {
  var pillarMat = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    roughness: 0.6,
    metalness: 0.3
  });

  for (var i = 0; i < trackNodes.length; i += 8) {
    // Skip start/finish area to avoid overlap with karts
    if (i < 6 || i > trackNodes.length - 6) continue;

    var node = trackNodes[i];
    var terrainH = getTerrainHeight(node.x, node.z);
    var heightAboveTerrain = node.y - terrainH;

    // Only build pillars where road is well above terrain
    if (heightAboveTerrain > 5) {
      var pillarHeight = heightAboveTerrain + 1;

      // Main pillar
      var pillarGeo = new THREE.CylinderGeometry(1.5, 2.0, pillarHeight, 8);
      var pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(node.x, terrainH + pillarHeight / 2, node.z);
      pillar.castShadow = true;
      scene.add(pillar);
      trackMeshes.push(pillar);

      // Cross beam at top
      var angle = getTrackAngle(i);
      var perpX = -Math.sin(angle);
      var perpZ = Math.cos(angle);
      var beamWidth = TRACK_WIDTH * 0.8;

      var beamGeo = new THREE.BoxGeometry(beamWidth, 1.0, 2.0);
      var beam = new THREE.Mesh(beamGeo, pillarMat);
      beam.position.set(node.x, node.y - 2, node.z);
      beam.rotation.y = -angle;
      scene.add(beam);
      trackMeshes.push(beam);
    }
  }
}

// Build tunnel/arch structures at specific track points
function buildTunnels(scene) {
  // Tunnel positions (track index ranges)
  var tunnelSpots = [
    { start: 25, end: 30 },
    { start: 70, end: 75 }
  ];

  var tunnelMat = new THREE.MeshStandardMaterial({
    color: 0x556688,
    roughness: 0.7,
    metalness: 0.2
  });

  var innerMat = new THREE.MeshStandardMaterial({
    color: 0x334466,
    roughness: 0.9,
    side: THREE.BackSide
  });

  for (var t = 0; t < tunnelSpots.length; t++) {
    var spot = tunnelSpots[t];

    for (var i = spot.start; i <= spot.end; i++) {
      var node = trackNodes[i % TRACK_POINTS];
      var angle = getTrackAngle(i % TRACK_POINTS);
      var perpX = -Math.sin(angle);
      var perpZ = Math.cos(angle);

      var archW = TRACK_WIDTH + 4;
      var archH = 10;

      // Arch shape using a half-cylinder
      var archGeo = new THREE.CylinderGeometry(archW / 2, archW / 2, 3, 16, 1, true, 0, Math.PI);
      var arch = new THREE.Mesh(archGeo, tunnelMat);
      arch.position.set(node.x, node.y + archH / 2, node.z);
      arch.rotation.y = -angle;
      arch.rotation.z = Math.PI / 2;
      arch.scale.y = 1;
      arch.scale.x = archH / (archW / 2);
      scene.add(arch);
      trackMeshes.push(arch);

      // Inner surface (visible from inside)
      var innerGeo = new THREE.CylinderGeometry(archW / 2 - 0.5, archW / 2 - 0.5, 2.8, 16, 1, true, 0, Math.PI);
      var inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.copy(arch.position);
      inner.rotation.copy(arch.rotation);
      inner.scale.copy(arch.scale);
      scene.add(inner);
      trackMeshes.push(inner);

      // Side walls
      for (var side = -1; side <= 1; side += 2) {
        var wallGeo = new THREE.BoxGeometry(1.5, archH, 3);
        var wall = new THREE.Mesh(wallGeo, tunnelMat);
        wall.position.set(
          node.x + perpX * (archW / 2) * side,
          node.y + archH / 2,
          node.z + perpZ * (archW / 2) * side
        );
        wall.rotation.y = -angle;
        wall.castShadow = true;
        scene.add(wall);
        trackMeshes.push(wall);
      }

      // Neon lights inside tunnel
      if (i % 2 === 0) {
        var lightColors = [0x4488DD, 0x8866BB, 0xFFCC66];
        var lColor = lightColors[(i - spot.start) % lightColors.length];
        var lightGeo = new THREE.BoxGeometry(archW * 0.8, 0.15, 0.15);
        var lightMat = new THREE.MeshBasicMaterial({
          color: lColor,
          transparent: true,
          opacity: 0.9
        });
        var neonLight = new THREE.Mesh(lightGeo, lightMat);
        neonLight.position.set(node.x, node.y + archH - 1, node.z);
        neonLight.rotation.y = -angle;
        scene.add(neonLight);
        trackMeshes.push(neonLight);
      }
    }
  }
}

// Build ramps/jumps at specific track sections
function buildRamps(scene) {
  var rampMat = new THREE.MeshLambertMaterial({
    color: 0x4488DD,
    emissive: 0x2266BB,
    emissiveIntensity: 0.35
  });

  var rampSpots = [48, 92]; // Track indices for ramps

  for (var r = 0; r < rampSpots.length; r++) {
    var idx = rampSpots[r];
    var node = trackNodes[idx];
    var angle = getTrackAngle(idx);

    // Ramp shape: wedge
    var rampGeo = new THREE.BufferGeometry();
    var w = TRACK_WIDTH * 0.6;
    var h = 2.5;
    var d = 8;

    // Wedge vertices
    var rv = [
      // Bottom face
      -w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, 0, d / 2, -w / 2, 0, d / 2,
      // Top face (angled)
      -w / 2, 0, -d / 2, w / 2, 0, -d / 2, w / 2, h, d / 2, -w / 2, h, d / 2
    ];
    var ri = [
      // Top surface (ramp)
      4, 5, 6, 4, 6, 7,
      // Bottom
      0, 2, 1, 0, 3, 2,
      // Back wall
      2, 6, 5, 2, 5, 1,
      // Front (short side)
      0, 4, 7, 0, 7, 3,
      // Left
      0, 1, 5, 0, 5, 4,
      // Right
      3, 7, 6, 3, 6, 2
    ];

    rampGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
    rampGeo.setIndex(ri);
    rampGeo.computeVertexNormals();

    var ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(node.x, node.y, node.z);
    ramp.rotation.y = -angle - Math.PI / 2;
    scene.add(ramp);
    trackMeshes.push(ramp);

    // Arrow markings on ramp
    var arrowMat = new THREE.MeshBasicMaterial({
      color: 0xFFCC66,
      transparent: true,
      opacity: 0.85
    });
    for (var a = 0; a < 3; a++) {
      var arrowGeo = new THREE.ConeGeometry(0.8, 1.5, 3);
      var arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(
        node.x + Math.cos(angle) * (-2 + a * 2),
        node.y + 0.5 + a * 0.5,
        node.z + Math.sin(angle) * (-2 + a * 2)
      );
      arrow.rotation.x = -Math.PI / 4;
      arrow.rotation.y = -angle;
      scene.add(arrow);
      trackMeshes.push(arrow);
    }
  }
}

// Sky dome with rich gradient
function buildSky() {
  var skyGeometry = new THREE.SphereGeometry(800, 64, 48);
  var skyVertexShader = [
    'varying vec3 vWorldPosition;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
    '  vWorldPosition = worldPosition.xyz;',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');
  var skyFragmentShader = [
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
    '  if (h > 0.2 && h < 0.7) {',
    '    float auroraH = (h - 0.2) / 0.5;',
    '    float wave1 = sin(vUv.x * 12.0 + auroraH * 8.0) * 0.5 + 0.5;',
    '    float wave2 = sin(vUv.x * 8.0 - auroraH * 5.0 + 2.0) * 0.5 + 0.5;',
    '    float auroraStrength = sin(auroraH * 3.14159) * 0.12;',
    '    vec3 aurora = mix(auroraColor1, auroraColor2, wave1);',
    '    color += aurora * auroraStrength * wave2;',
    '  }',
    '  float horizonGlow = exp(-abs(h) * 8.0) * 0.15;',
    '  color += horizonColor * horizonGlow;',
    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');
  var skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      zenithColor: { value: new THREE.Color(0x0D1B33) },
      upperColor: { value: new THREE.Color(0x1A2E4A) },
      midColor: { value: new THREE.Color(0x6B5B95) },
      horizonColor: { value: new THREE.Color(0xC8D5E8) },
      belowColor: { value: new THREE.Color(0x8899CC) },
      auroraColor1: { value: new THREE.Color(0x6688CC) },
      auroraColor2: { value: new THREE.Color(0xAABBEE) }
    },
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide
  });
  scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
}

// Billboard clouds - soft, translucent, animated
function buildClouds() {
  cloudMeshes = [];

  // Create a cloud texture procedurally
  var cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 128;
  var cCtx = cloudCanvas.getContext('2d');

  // Soft fluffy cloud using radial gradients
  cCtx.clearRect(0, 0, 256, 128);
  var cloudPuffs = [
    { x: 128, y: 70, r: 55 },
    { x: 90, y: 75, r: 42 },
    { x: 170, y: 72, r: 45 },
    { x: 60, y: 82, r: 30 },
    { x: 200, y: 80, r: 32 },
    { x: 128, y: 55, r: 35 },
    { x: 105, y: 60, r: 30 },
    { x: 155, y: 58, r: 32 }
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

  var cloudTexture = new THREE.CanvasTexture(cloudCanvas);

  var cloudTints = [0xDDE8FF, 0xCCD5EE, 0xBBCCDD, 0xD5DDEE, 0xC8D5E8];

  for (var i = 0; i < 35; i++) {
    var sizeRoll = Math.random();
    var cloudScale = sizeRoll < 0.5 ? (30 + Math.random() * 25) :
      sizeRoll < 0.85 ? (50 + Math.random() * 40) :
        (80 + Math.random() * 40);
    var cloudH = cloudScale * 0.4;

    var geo = new THREE.PlaneGeometry(cloudScale, cloudH);
    var tint = cloudTints[Math.floor(Math.random() * cloudTints.length)];
    var mat = new THREE.MeshBasicMaterial({
      map: cloudTexture,
      color: tint,
      transparent: true,
      opacity: 0.55 + Math.random() * 0.25,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    var cloud = new THREE.Mesh(geo, mat);

    cloud.position.x = (Math.random() - 0.5) * 1400;
    cloud.position.y = 80 + Math.random() * 150;
    cloud.position.z = (Math.random() - 0.5) * 1400;
    cloud.userData.driftSpeed = 0.015 + Math.random() * 0.03;
    cloud.userData.startX = cloud.position.x;

    scene.add(cloud);
    cloudMeshes.push(cloud);
  }
}

function buildStars() {
  var starGeometry = new THREE.BufferGeometry();
  var starPositions = [];
  var starColors = [];
  var starCount = 300;
  for (var i = 0; i < starCount; i++) {
    var sAngle = Math.random() * Math.PI * 2;
    var sElev = 0.2 + Math.random() * 0.8;
    var sDist = 500 + Math.random() * 300;
    starPositions.push(
      Math.cos(sAngle) * sDist,
      sElev * sDist,
      Math.sin(sAngle) * sDist
    );
    var starHues = [0xFFFFFF, 0xFFDD88, 0xFFAACC, 0x88DDFF, 0xDDBBFF];
    var sColor = new THREE.Color(starHues[Math.floor(Math.random() * starHues.length)]);
    starColors.push(sColor.r, sColor.g, sColor.b);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  var starMaterial = new THREE.PointsMaterial({
    size: 2.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.8
  });
  scene.add(new THREE.Points(starGeometry, starMaterial));
}

function buildSunDecor() {
  var sunGeo = new THREE.SphereGeometry(40, 16, 16);
  var sunMat = new THREE.MeshBasicMaterial({ color: 0xFFEECC });
  var sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(300, 80, -400);
  scene.add(sun);

  var flareGeo = new THREE.SphereGeometry(60, 16, 16);
  var flareMat = new THREE.MeshBasicMaterial({ color: 0xFFEECC, transparent: true, opacity: 0.12 });
  var flare = new THREE.Mesh(flareGeo, flareMat);
  flare.position.copy(sun.position);
  scene.add(flare);

  var flare2Geo = new THREE.SphereGeometry(90, 16, 16);
  var flare2Mat = new THREE.MeshBasicMaterial({ color: 0xFFDDAA, transparent: true, opacity: 0.06 });
  var flare2 = new THREE.Mesh(flare2Geo, flare2Mat);
  flare2.position.copy(sun.position);
  scene.add(flare2);
}

// Rainbow removed for Crystal Kingdom theme

// Camera
var cameraOffset = { x: 0, y: 6, z: 12 };
var cameraShake = { x: 0, y: 0 };
var currentFOV = 70;

function updateCamera(pl) {
  if (!pl || !camera) return;

  // Close camera behind the kart (Mario Kart style)
  var camDist = 5.0, camH = 2.8;

  var idealX = pl.x - Math.cos(pl.ang) * camDist;
  var idealZ = pl.z - Math.sin(pl.ang) * camDist;
  var idealY = pl.y + camH;

  if (pl.boostTimer > 0) {
    cameraShake.x = (Math.random() - 0.5) * 0.15;
    cameraShake.y = (Math.random() - 0.5) * 0.1;
  } else {
    cameraShake.x *= 0.85;
    cameraShake.y *= 0.85;
  }

  // Tighter follow - no lag/pull-back during boosts
  var lerpFactor = 0.18 + Math.min(pl.spd * 0.1, 0.22);
  if (pl.boostTimer > 0) lerpFactor = Math.max(lerpFactor, 0.6);
  camera.position.x += (idealX - camera.position.x) * lerpFactor + cameraShake.x;
  camera.position.y += (idealY - camera.position.y) * lerpFactor + cameraShake.y;
  camera.position.z += (idealZ - camera.position.z) * lerpFactor;

  var lookAhead = 2.0;
  var lookX = pl.x + Math.cos(pl.ang) * lookAhead;
  var lookZ = pl.z + Math.sin(pl.ang) * lookAhead;
  camera.lookAt(new THREE.Vector3(lookX, pl.y + 1.4, lookZ));

  // 影をプレイヤーに追従させる（近くシャープ、遠くはカット）
  if (window._sunLight && window._sunLight.shadow) {
    var sl = window._sunLight;
    sl.position.set(pl.x + 100, pl.y + 120, pl.z - 150);
    sl.target.position.set(pl.x, pl.y, pl.z);
    sl.target.updateMatrixWorld();
  }
}

// Animate clouds (call each frame)
function updateClouds(dt) {
  var timeScale = (dt || 0.016) * 60;
  for (var i = 0; i < cloudMeshes.length; i++) {
    var c = cloudMeshes[i];
    c.position.x += c.userData.driftSpeed * timeScale;
    // Wrap around
    if (c.position.x > 700) c.position.x = -700;
    // Billboard: face camera
    if (camera) c.lookAt(camera.position);
  }
}

// Drift particles using sprites for soft smoke
function createDriftParticles(scene) {
  var particleCount = 25;

  // Create smoke sprite texture
  var smokeCanvas = document.createElement('canvas');
  smokeCanvas.width = 64;
  smokeCanvas.height = 64;
  var sCtx = smokeCanvas.getContext('2d');
  var grad = sCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.4, 'rgba(220,220,220,0.4)');
  grad.addColorStop(1, 'rgba(200,200,200,0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 64, 64);
  var smokeTex = new THREE.CanvasTexture(smokeCanvas);

  // Left drift particles
  var leftGroup = new THREE.Group();
  for (var i = 0; i < particleCount; i++) {
    var spriteMat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.6, 0.6, 1);
    sprite.userData = { active: false, life: 0, velocity: { x: 0, y: 0, z: 0 } };
    leftGroup.add(sprite);
  }
  scene.add(leftGroup);
  particles.driftLeft = leftGroup;

  // Right drift particles
  var rightGroup = new THREE.Group();
  for (var i = 0; i < particleCount; i++) {
    var spriteMat2 = new THREE.SpriteMaterial({
      map: smokeTex,
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    var sprite2 = new THREE.Sprite(spriteMat2);
    sprite2.scale.set(0.6, 0.6, 1);
    sprite2.userData = { active: false, life: 0, velocity: { x: 0, y: 0, z: 0 } };
    rightGroup.add(sprite2);
  }
  scene.add(rightGroup);
  particles.driftRight = rightGroup;
}

function updateDriftParticles(player, dt) {
  if (!player || !particles.driftLeft || !particles.driftRight) return;

  // Use actual delta time
  dt = dt || 0.016;

  function updateGroup(group) {
    for (var i = 0; i < group.children.length; i++) {
      var p = group.children[i];
      if (p.userData.active) {
        p.position.x += p.userData.velocity.x * dt;
        p.position.y += p.userData.velocity.y * dt;
        p.position.z += p.userData.velocity.z * dt;

        p.userData.life -= dt;
        var lifeRatio = Math.max(0, p.userData.life / 1.0);
        p.material.opacity = lifeRatio * 0.6;

        // Fade to grey
        var gv = 1.0 - (1 - lifeRatio) * 0.3;
        p.material.color.setRGB(gv, gv, gv);

        // Scale up
        var scale = 0.6 + (1 - lifeRatio) * 1.2;
        p.scale.set(scale, scale, 1);

        if (p.userData.life <= 0) {
          p.userData.active = false;
          p.material.opacity = 0;
        }
      }
    }
  }

  updateGroup(particles.driftLeft);
  updateGroup(particles.driftRight);

  // Emit new particles if drifting
  if (player.drifting) {
    var emitChance = 0.35;
    var wheelOffset = 1.2;
    var rearOffset = 1.5;

    var leftX = player.x + Math.cos(player.ang + Math.PI / 2) * wheelOffset + Math.cos(player.ang) * rearOffset;
    var leftZ = player.z + Math.sin(player.ang + Math.PI / 2) * wheelOffset + Math.sin(player.ang) * rearOffset;
    var rightX = player.x - Math.cos(player.ang + Math.PI / 2) * wheelOffset + Math.cos(player.ang) * rearOffset;
    var rightZ = player.z - Math.sin(player.ang + Math.PI / 2) * wheelOffset + Math.sin(player.ang) * rearOffset;

    if (Math.random() < emitChance) {
      for (var i = 0; i < particles.driftLeft.children.length; i++) {
        var p = particles.driftLeft.children[i];
        if (!p.userData.active) {
          p.userData.active = true;
          p.userData.life = 1.0;
          p.position.set(leftX, player.y + 0.2, leftZ);
          var outAng = player.ang + Math.PI / 2;
          p.userData.velocity.x = Math.cos(outAng) * 2 + (Math.random() - 0.5);
          p.userData.velocity.y = 1 + Math.random() * 0.5;
          p.userData.velocity.z = Math.sin(outAng) * 2 + (Math.random() - 0.5);
          p.scale.set(0.6, 0.6, 1);
          break;
        }
      }
    }

    if (Math.random() < emitChance) {
      for (var i = 0; i < particles.driftRight.children.length; i++) {
        var p = particles.driftRight.children[i];
        if (!p.userData.active) {
          p.userData.active = true;
          p.userData.life = 1.0;
          p.position.set(rightX, player.y + 0.2, rightZ);
          var outAng2 = player.ang - Math.PI / 2;
          p.userData.velocity.x = Math.cos(outAng2) * 2 + (Math.random() - 0.5);
          p.userData.velocity.y = 1 + Math.random() * 0.5;
          p.userData.velocity.z = Math.sin(outAng2) * 2 + (Math.random() - 0.5);
          p.scale.set(0.6, 0.6, 1);
          break;
        }
      }
    }
  }
}

function createBoostEffect(scene) {
  // Boost flame sprites
  var boostGroup = new THREE.Group();
  var particleCount = 18;

  // Fire sprite texture
  var fireCanvas = document.createElement('canvas');
  fireCanvas.width = 64;
  fireCanvas.height = 64;
  var fCtx = fireCanvas.getContext('2d');
  var fGrad = fCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
  fGrad.addColorStop(0, 'rgba(255,220,100,1)');
  fGrad.addColorStop(0.3, 'rgba(255,130,0,0.8)');
  fGrad.addColorStop(0.7, 'rgba(255,50,0,0.3)');
  fGrad.addColorStop(1, 'rgba(200,0,0,0)');
  fCtx.fillStyle = fGrad;
  fCtx.fillRect(0, 0, 64, 64);
  var fireTex = new THREE.CanvasTexture(fireCanvas);

  for (var i = 0; i < particleCount; i++) {
    var mat = new THREE.SpriteMaterial({
      map: fireTex,
      color: 0xFF6600,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 1.0, 1);
    sprite.userData = { active: false, life: 0, velocity: { x: 0, y: 0, z: 0 } };
    boostGroup.add(sprite);
  }

  scene.add(boostGroup);
  particles.boostFlame = boostGroup;
}

function updateBoostEffect(player, dt) {
  if (!player || !particles.boostFlame) return;

  // Use actual delta time
  dt = dt || 0.016;

  for (var i = 0; i < particles.boostFlame.children.length; i++) {
    var p = particles.boostFlame.children[i];
    if (p.userData.active) {
      p.position.x += p.userData.velocity.x * dt;
      p.position.y += p.userData.velocity.y * dt;
      p.position.z += p.userData.velocity.z * dt;

      p.userData.life -= dt * 3;
      var lifeRatio = Math.max(0, p.userData.life);
      p.material.opacity = lifeRatio * 0.9;

      // Color from yellow to red
      p.material.color.setRGB(1.0, lifeRatio * 0.5, 0);

      // Scale down as it ages
      var scale = 0.8 + lifeRatio * 0.5;
      p.scale.set(scale, scale * 1.3, 1);

      if (p.userData.life <= 0) {
        p.userData.active = false;
        p.material.opacity = 0;
      }
    }
  }

  // Emit new boost particles
  if (player.boostTimer > 0) {
    if (Math.random() < 0.5) {
      for (var i = 0; i < particles.boostFlame.children.length; i++) {
        var p = particles.boostFlame.children[i];
        if (!p.userData.active) {
          p.userData.active = true;
          p.userData.life = 1.0;

          var exhaustX = player.x + Math.sin(player.ang) * 2;
          var exhaustZ = player.z + Math.cos(player.ang) * 2;
          p.position.set(exhaustX, player.y + 0.5 + Math.random() * 0.3, exhaustZ);

          p.userData.velocity.x = Math.sin(player.ang) * 4 + (Math.random() - 0.5);
          p.userData.velocity.y = (Math.random() - 0.3) * 0.5;
          p.userData.velocity.z = Math.cos(player.ang) * 4 + (Math.random() - 0.5);

          p.scale.set(0.8, 1.0, 1);
          break;
        }
      }
    }
  }
}

// Speed lines overlay
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

// Render scene
function renderScene() {
  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

function handleResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update composer size
  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  if (speedLinesCanvas) {
    speedLinesCanvas.width = window.innerWidth;
    speedLinesCanvas.height = window.innerHeight;
  }
}

window.addEventListener('resize', function () {
  checkOrientation();
  handleResize();
});
