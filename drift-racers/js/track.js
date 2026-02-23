// Track Generation Module for Drift Racers
// Babylon.js engine (migrated from Three.js r128)

var trackNodes = [];
var trackMeshes = [];
var waterTime = 0;

// === HELPERS ===
var _tn = 0;
function tn() { return 'trk' + (_tn++); }

// HSL to Babylon Color3
function hslC3(h, s, l) {
    if (s === 0) return new BABYLON.Color3(l, l, l);
    function h2r(p, q, t) {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return new BABYLON.Color3(h2r(p, q, h + 1 / 3), h2r(p, q, h), h2r(p, q, h - 1 / 3));
}

// Canvas to Babylon Texture
function texFromCanvas(name, cvs) {
    var url = cvs.toDataURL();
    var tex = new BABYLON.Texture(url, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.name = name;
    return tex;
}

// Mesh builder helpers (auto-push to trackMeshes)
function mkCyl(opts, mat) {
    var m = BABYLON.MeshBuilder.CreateCylinder(tn(), opts, scene);
    m.material = mat; trackMeshes.push(m); return m;
}
function mkBox(opts, mat) {
    var m = BABYLON.MeshBuilder.CreateBox(tn(), opts, scene);
    m.material = mat; trackMeshes.push(m); return m;
}
function mkSph(opts, mat) {
    var m = BABYLON.MeshBuilder.CreateSphere(tn(), opts, scene);
    m.material = mat; trackMeshes.push(m); return m;
}
function mkGnd(opts, mat) {
    var m = BABYLON.MeshBuilder.CreateGround(tn(), opts, scene);
    m.material = mat; trackMeshes.push(m); return m;
}
function mkPoly(opts, mat) {
    var m = BABYLON.MeshBuilder.CreatePolyhedron(tn(), opts, scene);
    m.material = mat; trackMeshes.push(m); return m;
}

// Lambert-like StandardMaterial (accepts hex int or Color3 for colors)
function smat(hex, emHex, emInt, alpha) {
    var mat = new BABYLON.StandardMaterial(tn(), scene);
    mat.diffuseColor = (hex instanceof BABYLON.Color3) ? hex : c3(hex);
    mat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    if (emHex !== undefined && emHex !== null) {
        var ec = (emHex instanceof BABYLON.Color3) ? emHex : c3(emHex);
        mat.emissiveColor = ec.scale(emInt !== undefined ? emInt : 1);
    }
    if (alpha !== undefined && alpha < 1) mat.alpha = alpha;
    return mat;
}

// Unlit StandardMaterial (MeshBasicMaterial equivalent)
function umat(hex, alpha) {
    var mat = new BABYLON.StandardMaterial(tn(), scene);
    mat.emissiveColor = c3(hex);
    mat.disableLighting = true;
    mat.specularColor = BABYLON.Color3.Black();
    if (alpha !== undefined && alpha < 1) mat.alpha = alpha;
    return mat;
}

// Cached small crystal gradient textures (per color)
var _crystalTexCache = {};
function getCrystalGradientTex(colorHex) {
    if (_crystalTexCache[colorHex]) return _crystalTexCache[colorHex];
    var col = c3(colorHex);
    var dark = col.scale(0.1);
    var mid = col.scale(0.45);
    var cvs = document.createElement('canvas');
    cvs.width = 16;
    cvs.height = 64;
    var ctx = cvs.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 64);
    var toRgb = function (c) { return 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')'; };
    grad.addColorStop(0, toRgb(dark));
    grad.addColorStop(0.4, toRgb(mid));
    grad.addColorStop(0.75, toRgb(col));
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 64);
    var tex = texFromCanvas(tn(), cvs);
    _crystalTexCache[colorHex] = tex;
    return tex;
}

// === TRACK MATH (unchanged - no Three.js dependencies) ===

function generateTrack() {
    trackNodes = [];
    for (var i = 0; i < TRACK_POINTS; i++) {
        var t = (i / TRACK_POINTS) * Math.PI * 2;
        var r = 280 + 80 * Math.sin(t * 2) + 50 * Math.cos(t * 3) + 30 * Math.sin(t * 5 + 1);
        var y = 4 + 2 * Math.sin(t * 3) + 1 * Math.cos(t * 2 + 0.5);
        var x = r * Math.cos(t);
        var z = r * Math.sin(t);
        trackNodes.push({ x: x, y: y, z: z });
    }
}

function getTrackPoint(i) {
    var idx = ((i % TRACK_POINTS) + TRACK_POINTS) % TRACK_POINTS;
    return trackNodes[idx];
}

function getTrackAngle(i) {
    var p1 = getTrackPoint(i);
    var p2 = getTrackPoint(i + 1);
    return Math.atan2(p2.z - p1.z, p2.x - p1.x);
}

function getTrackDir(i) {
    var p1 = getTrackPoint(i);
    var p2 = getTrackPoint(i + 1);
    var dx = p2.x - p1.x;
    var dz = p2.z - p1.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    return { x: dx / len, z: dz / len };
}

function nearestTrackIndex(wx, wz) {
    var minDist = Infinity;
    var nearestIdx = 0;
    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var dx = node.x - wx;
        var dz = node.z - wz;
        var dist = dx * dx + dz * dz;
        if (dist < minDist) { minDist = dist; nearestIdx = i; }
    }
    return nearestIdx;
}

function trackDist(wx, wz) {
    var idx = nearestTrackIndex(wx, wz);
    var minDist = Infinity;
    for (var offset = -1; offset <= 0; offset++) {
        var i1 = ((idx + offset) % TRACK_POINTS + TRACK_POINTS) % TRACK_POINTS;
        var i2 = (i1 + 1) % TRACK_POINTS;
        var p1 = trackNodes[i1];
        var p2 = trackNodes[i2];
        var segDx = p2.x - p1.x;
        var segDz = p2.z - p1.z;
        var segLenSq = segDx * segDx + segDz * segDz;
        if (segLenSq === 0) continue;
        var t = ((wx - p1.x) * segDx + (wz - p1.z) * segDz) / segLenSq;
        t = Math.max(0, Math.min(1, t));
        var projX = p1.x + t * segDx;
        var projZ = p1.z + t * segDz;
        var dx = wx - projX;
        var dz = wz - projZ;
        var dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

// Helper to add meshes to water reflections
function addToReflections(mesh) {
    if (typeof reflectionTexture !== 'undefined' && reflectionTexture && reflectionTexture.renderList) {
        reflectionTexture.renderList.push(mesh);
    }
}

// === TEXTURES ===

function createAsphaltTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    var ctx = canvas.getContext('2d');
    if (CRYSTAL_KINGDOM) {
        // Dark asphalt with visible purple-blue tint (concept art: sleek dark road)
        ctx.fillStyle = '#10101E';
        ctx.fillRect(0, 0, 1024, 1024);

        // Subtle noise for asphalt aggregate
        ctx.fillStyle = 'rgba(180,170,220,0.03)';
        for (var i = 0; i < 80000; i++) {
            ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 1.5, 1.5);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (var i = 0; i < 30000; i++) {
            ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
        }

        // Crystal-purple wet sheen across road
        var roadGlow = ctx.createLinearGradient(0, 0, 1024, 0);
        roadGlow.addColorStop(0, 'rgba(0,180,255,0.02)');
        roadGlow.addColorStop(0.5, 'rgba(120,160,255,0.06)');
        roadGlow.addColorStop(1, 'rgba(255,100,210,0.02)');
        ctx.fillStyle = roadGlow;
        ctx.fillRect(0, 0, 1024, 1024);

        // Thin sharp dashed line in the center of the road
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 4;
        ctx.setLineDash([80, 80]); // Sharp dashed pattern
        ctx.beginPath();
        ctx.moveTo(512, 0); // Moved from 850 to 512 (true center)
        ctx.lineTo(512, 1024);
        ctx.stroke();

        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = '#2a2a35';
        ctx.fillRect(0, 0, 1024, 1024);
        for (var i = 0; i < 60000; i++) {
            var x = Math.random() * 1024;
            var y = Math.random() * 1024;
            var v = Math.random();
            ctx.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)';
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00aaff';
        ctx.fillStyle = '#0088cc';
        ctx.fillRect(10, 0, 8, 1024);
        ctx.shadowColor = '#aa44ff';
        ctx.fillStyle = '#8833cc';
        ctx.fillRect(1006, 0, 8, 1024);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.setLineDash([60, 40]);
        ctx.beginPath();
        ctx.moveTo(512, 0);
        ctx.lineTo(512, 1024);
        ctx.stroke();
    }

    var tex = texFromCanvas('asphalt', canvas);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = CRYSTAL_KINGDOM ? 30 : 40;
    tex.anisotropicFilteringLevel = 16;
    return tex;
}

function createCurbTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var sw = 16;
    for (var i = 0; i < 8; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#4488DD' : '#FFFFFF';
        ctx.fillRect(0, i * sw, 128, sw);
    }
    var tex = texFromCanvas('curb', canvas);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    return tex;
}

function createCheckeredTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var cs = 16;
    for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
            ctx.fillStyle = ((x + y) % 2 === 0) ? '#000000' : '#ffffff';
            ctx.fillRect(x * cs, y * cs, cs, cs);
        }
    }
    return texFromCanvas('checker', canvas);
}

// === BUILD TRACK MESH ===

function buildTrackMesh(sc) {
    var positions = [];
    var uvs = [];
    var indices = [];
    var halfWidth = TRACK_WIDTH / 2;

    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);
        positions.push(node.x + perpX * halfWidth, node.y, node.z + perpZ * halfWidth);
        positions.push(node.x - perpX * halfWidth, node.y, node.z - perpZ * halfWidth);
        var v = i / trackNodes.length;
        uvs.push(0, v, 1, v);
    }

    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 2, i1 = i * 2 + 1, i2 = next * 2, i3 = next * 2 + 1;
        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
    }

    var asphaltTex = createAsphaltTexture();

    // Bump texture
    var bCanvas = document.createElement('canvas');
    bCanvas.width = 256; bCanvas.height = 256;
    var bCtx = bCanvas.getContext('2d');
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);
    for (var bi = 0; bi < 2000; bi++) {
        var bx = Math.random() * 256, by = Math.random() * 256;
        var bv = Math.floor(120 + Math.random() * 16);
        bCtx.fillStyle = 'rgb(' + bv + ',' + bv + ',' + bv + ')';
        bCtx.fillRect(bx, by, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    var bumpTex = texFromCanvas('asphaltBump', bCanvas);
    bumpTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    bumpTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    bumpTex.uScale = 20;
    bumpTex.vScale = 20;

    var mat = new BABYLON.StandardMaterial('trackRoad', scene);
    mat.diffuseTexture = asphaltTex;
    mat.bumpTexture = bumpTex;
    mat.bumpTexture.level = 0.08; // Just enough for street grain
    if (CRYSTAL_KINGDOM) {
        mat.specularColor = new BABYLON.Color3(0.9, 0.9, 1.0); // Very strong, bright reflection for the sleek look
        mat.specularPower = 128; // Very tight, glassy highlight
        mat.emissiveColor = new BABYLON.Color3(0.04, 0.03, 0.08); // Darker base to contrast with the bright shine
        if (typeof reflectionTexture !== 'undefined' && reflectionTexture) {
            mat.reflectionTexture = reflectionTexture;
            mat.reflectionFresnelParameters = new BABYLON.FresnelParameters();
            mat.reflectionFresnelParameters.bias = 0.5; // High mirror reflection
            mat.reflectionFresnelParameters.power = 1.0;
            mat.reflectionFresnelParameters.leftColor = new BABYLON.Color3(1, 1, 1);
            mat.reflectionFresnelParameters.rightColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        }
    } else {
        mat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.2); // Subtle specular for normal asphalt
        mat.specularPower = 32; // Broader, softer highlight
    }

    var trackMesh = createCustomMesh('trackSurface', positions, indices, uvs, null, sc);
    trackMesh.material = mat;
    trackMeshes.push(trackMesh);
    if (!CRYSTAL_KINGDOM) {
        addToReflections(trackMesh);
    }

    buildRoadWalls(sc);

    // Only generate the generic checkered curbs in normal environments
    if (CRYSTAL_KINGDOM) {
        buildNeonEdges(sc);
    } else {
        buildCurbs(sc);
    }

    buildStartFinish(sc);
}

// Neon light stripes along road edges (Crystal Kingdom)
// Matches concept art: Segmented, parallel bright glowing lines with Cyan -> Magenta -> Blue longitudinal gradients.
function buildNeonEdges(sc) {
    if (!CRYSTAL_KINGDOM) return;

    var halfWidth = TRACK_WIDTH / 2;
    var shoulderWidth = 4.0; // Tighter shoulder so the lines pack closely to the edge

    // Create the texture for the shoulder
    if (!window._neonShoulderTex) {
        var canvas = document.createElement('canvas');
        canvas.width = 1024; // High-res Cross-section (U) for 5 distinct lines
        canvas.height = 2048; // Track length (V)
        var ctx = canvas.getContext('2d');

        // Black out everything (creates the crucial gaps between neon lines)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1024, 2048);

        // Standard compositing ('source-over') prevents the excessive white-out glare on inner edges.

        // 1. Smooth Pulsing Neon (Aura) - For the thick flowing edges, wide soft glow
        var vPulseNeonAura = ctx.createLinearGradient(0, 0, 0, 2048);
        var vPulseNeonCore = ctx.createLinearGradient(0, 0, 0, 2048);

        // They want blocky segments, but the gaps must be strongly blue, not black!
        var bGapAura = 'rgba(20, 100, 255, 0.9)'; // Luminous blue aura for gap
        var cAura = 'rgba(0, 255, 255, 1.0)';
        var mAura = 'rgba(255, 0, 255, 1.0)';

        var bGapCore = '#88ccff'; // Bright light blue core for gap
        var cCore = '#ffffff';
        var mCore = '#ffffff';

        // Aura Stops - BLOCKY (sharp transitions)
        vPulseNeonAura.addColorStop(0.00, bGapAura);

        vPulseNeonAura.addColorStop(0.10, bGapAura);
        vPulseNeonAura.addColorStop(0.15, cAura);
        vPulseNeonAura.addColorStop(0.35, cAura);
        vPulseNeonAura.addColorStop(0.40, bGapAura);

        vPulseNeonAura.addColorStop(0.60, bGapAura);
        vPulseNeonAura.addColorStop(0.65, mAura);
        vPulseNeonAura.addColorStop(0.85, mAura);
        vPulseNeonAura.addColorStop(0.90, bGapAura);

        vPulseNeonAura.addColorStop(1.00, bGapAura);


        // Core Stops - BLOCKY
        vPulseNeonCore.addColorStop(0.00, bGapCore);

        vPulseNeonCore.addColorStop(0.10, bGapCore);
        vPulseNeonCore.addColorStop(0.15, cCore);
        vPulseNeonCore.addColorStop(0.35, cCore);
        vPulseNeonCore.addColorStop(0.40, bGapCore);

        vPulseNeonCore.addColorStop(0.60, bGapCore);
        vPulseNeonCore.addColorStop(0.65, mCore);
        vPulseNeonCore.addColorStop(0.85, mCore);
        vPulseNeonCore.addColorStop(0.90, bGapCore);

        vPulseNeonCore.addColorStop(1.00, bGapCore);

        // 2. Silver Gradient
        var vGradSilver = ctx.createLinearGradient(0, 0, 0, 2048);
        vGradSilver.addColorStop(0.00, '#ffffff');
        vGradSilver.addColorStop(0.50, '#aaddff'); // Slight icy blue/silver tint
        vGradSilver.addColorStop(1.00, '#ffffff');

        var faintWhiteAura = 'rgba(150, 180, 255, 1.0)';

        // Glow Layering Helper to simulate natural bloom without Babylon blowing it out
        function drawNeonLine(x, width, isDashed, dashLen, gapLen, maxGlowWidth, auraStyle, coreStyle, maxGlowAlpha) {
            var layers = 6;
            for (var i = layers; i >= 0; i--) {
                var currentWidth = width + (i * maxGlowWidth / layers);
                var currentX = x - (currentWidth - width) / 2;

                ctx.globalAlpha = (i === 0) ? 1.0 : (maxGlowAlpha / layers);

                if (isDashed) {
                    for (var y = 0; y < 2048; y += (dashLen + gapLen)) {
                        ctx.fillStyle = (i === 0) ? coreStyle : auraStyle;
                        ctx.fillRect(currentX, y, currentWidth, dashLen);
                    }
                } else {
                    ctx.fillStyle = (i === 0) ? coreStyle : auraStyle;
                    ctx.fillRect(currentX, 0, currentWidth, 2048);
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // --- DRAW THE NEON TUBE (1024 total width, tracking inner left/right edges) ---
        // X = 1024 is inner edge touching the asphalt, X = 0 is outer empty edge

        // 1. Inner thin line bounds the track perfectly (Solid bright white/cyan)
        drawNeonLine(960, 12, false, 0, 0, 30, vGradSilver, '#ffffff', 0.8);

        // 2. Main Thick Glowing Segmented Tube (Wide, fills a large part of the edge)
        drawNeonLine(650, 220, false, 0, 0, 180, vPulseNeonAura, vPulseNeonCore, 1.0);

        // 3. Outer thin line mirroring the main colors
        drawNeonLine(350, 16, false, 0, 0, 50, vPulseNeonAura, '#ffffff', 0.7);

        // 4. Outermost thin faint boundary line
        drawNeonLine(200, 8, false, 0, 0, 30, faintWhiteAura, '#ffffff', 0.5);

        window._neonShoulderTex = texFromCanvas('neonShoulder', canvas);
        window._neonShoulderTex.hasAlpha = false;
        window._neonShoulderTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        window._neonShoulderTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        // Do NOT use high vScale. We want the segments to stretch elegantly
        window._neonShoulderTex.vScale = 1.0;
    }

    var sMat = new BABYLON.StandardMaterial('neonShoulderMat', scene);
    sMat.diffuseTexture = window._neonShoulderTex;
    sMat.emissiveTexture = window._neonShoulderTex;
    sMat.specularColor = BABYLON.Color3.Black(); // No specular, pure glow

    // NO ALPHA_ADD. We explicitly painted the bloom. Just output the colors straight.
    sMat.emissiveColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    sMat.disableLighting = true;
    sMat.backFaceCulling = false;
    // Standard blending
    sMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
    sMat.alpha = 1.0;

    // Build the shoulder meshes left and right
    for (var sideIdx = 0; sideIdx < 2; sideIdx++) {
        var side = sideIdx === 0 ? -1 : 1;
        var ev = [], ei = [], eu = [];

        var cumulativeDistance = 0;

        for (var i = 0; i <= trackNodes.length; i++) { // UV mapping seam fix: <= instead of <
            var nodeIdx = i % trackNodes.length;
            var node = trackNodes[nodeIdx];

            // Calculate physical distance from the previous node to ensure uniform UV texture mapping
            if (i > 0) {
                var prevNodeIdx = (i - 1) % trackNodes.length;
                var prevNode = trackNodes[prevNodeIdx];
                var dx = node.x - prevNode.x;
                var dz = node.z - prevNode.z;
                cumulativeDistance += Math.sqrt(dx * dx + dz * dz);
            }

            var angle = getTrackAngle(nodeIdx);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);

            // Inner vertex (touching track edge)
            var ix = node.x + perpX * side * halfWidth;
            var iz = node.z + perpZ * side * halfWidth;
            // Outer vertex
            var ox = node.x + perpX * side * (halfWidth + shoulderWidth);
            var oz = node.z + perpZ * side * (halfWidth + shoulderWidth);

            var yRender = node.y + 0.05; // Slightly above asphalt to avoid z-fight

            if (side === -1) {
                // Left side: ox is further left. 
                // We want outer band (U=0) at ox. Inner band (U=1) at ix.
                ev.push(ox, yRender, oz);
                ev.push(ix, yRender, iz);
            } else {
                // Right side: ix is left-most relative to the shoulder outwards.
                // We want Inner band (U=1) at ix. Outer band (U=0) at ox.
                ev.push(ix, yRender, iz);
                ev.push(ox, yRender, oz);
            }

            // V repeats based on actual distance, not node index. 
            // 0.15 creates the chunky repeating segments the user requested earlier.
            var v = cumulativeDistance * 0.15;

            if (side === -1) {
                eu.push(0, v, 1, v);
            } else {
                eu.push(1, v, 0, v);
            }
        }

        for (var i = 0; i < trackNodes.length; i++) {
            var next = i + 1; // Direct next, no modulo because node[0] is cloned at end
            var i0 = i * 2, i1 = i * 2 + 1;
            var n0 = next * 2, n1 = next * 2 + 1;
            ei.push(i0, i1, n0);
            ei.push(i1, n1, n0);
        }

        var sMesh = createCustomMesh('neonShoulderMesh_' + sideIdx, ev, ei, eu, null, sc);
        sMesh.material = sMat;
        trackMeshes.push(sMesh);

        // EXCLUDE FROM GLOW LAYER:
        // We carefully painted our own bloom on the 2D canvas for exact 5-line separation.
        // If we don't exclude this mesh, Babylon's global GlowLayer will see the high emissiveColor
        // and indiscriminately blast the entire shoulder with additive whiteout glare, destroying the lines.
        if (window._glowLayer) {
            window._glowLayer.addExcludedMesh(sMesh);
        }
    }
}

// === ROAD WALLS ===

function buildRoadWalls(sc) {
    var halfWidth = TRACK_WIDTH / 2 + 1.2;
    var wallDepth = 3.0;

    var undersideMat = new BABYLON.StandardMaterial('underMat', scene);
    undersideMat.diffuseColor = c3(CRYSTAL_KINGDOM ? 0x100A20 : 0x221133);
    undersideMat.specularColor = BABYLON.Color3.Black();
    undersideMat.backFaceCulling = false;

    // Underside
    var uv = [], uu = [], ui = [];
    var cumulativeDistance = 0;

    for (var i = 0; i <= trackNodes.length; i++) {
        var nodeIdx = i % trackNodes.length;
        var node = trackNodes[nodeIdx];

        if (i > 0) {
            var prevNodeIdx = (i - 1) % trackNodes.length;
            var prevNode = trackNodes[prevNodeIdx];
            var dx = node.x - prevNode.x;
            var dz = node.z - prevNode.z;
            cumulativeDistance += Math.sqrt(dx * dx + dz * dz);
        }

        var angle = getTrackAngle(nodeIdx);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);
        uv.push(node.x + perpX * halfWidth, node.y - wallDepth, node.z + perpZ * halfWidth);
        uv.push(node.x - perpX * halfWidth, node.y - wallDepth, node.z - perpZ * halfWidth);

        // Use exact distance for consistent mapping
        var v = cumulativeDistance * 0.01;
        uu.push(0, v, 1, v);
    }
    for (var i = 0; i < trackNodes.length; i++) {
        var next = i + 1;
        var i0 = i * 2, i1 = i * 2 + 1, n0 = next * 2, n1 = next * 2 + 1;
        ui.push(i0, i1, n0); ui.push(i1, n1, n0);
    }
    var um = createCustomMesh('underside', uv, ui, uu, null, sc);
    um.material = undersideMat;
    trackMeshes.push(um);
}

// === CURBS ===

function buildCurbs(sc) {
    var curbHeight = 0.3;
    var curbWidth = 1.2;
    var halfWidth = TRACK_WIDTH / 2;

    var curbTex = createCurbTexture();
    var curbMat = new BABYLON.StandardMaterial('curbMat', scene);
    curbMat.diffuseTexture = curbTex;
    if (CRYSTAL_KINGDOM) {
        curbMat.emissiveColor = new BABYLON.Color3(0.15, 0.25, 0.5);
        curbMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.5);
    } else {
        curbMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    }
    curbMat.specularPower = 24;

    for (var curbSide = -1; curbSide <= 1; curbSide += 2) {
        var cv = [], cu = [], ci = [];
        var sign = curbSide;
        for (var i = 0; i < trackNodes.length; i++) {
            var node = trackNodes[i];
            var angle = getTrackAngle(i);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);
            var baseX = node.x + perpX * sign * (halfWidth + curbWidth / 2);
            var baseZ = node.z + perpZ * sign * (halfWidth + curbWidth / 2);
            cv.push(baseX - perpX * curbWidth / 2, node.y, baseZ - perpZ * curbWidth / 2);
            cv.push(baseX + perpX * curbWidth / 2, node.y, baseZ + perpZ * curbWidth / 2);
            cv.push(baseX - perpX * curbWidth / 2, node.y + curbHeight, baseZ - perpZ * curbWidth / 2);
            cv.push(baseX + perpX * curbWidth / 2, node.y + curbHeight, baseZ + perpZ * curbWidth / 2);
            var v = i / trackNodes.length;
            cu.push(0, v, 1, v, 0, v, 1, v);
        }
        for (var i = 0; i < trackNodes.length; i++) {
            var next = (i + 1) % trackNodes.length;
            var i0 = i * 4, i1 = i * 4 + 1, i2 = i * 4 + 2, i3 = i * 4 + 3;
            var n0 = next * 4, n1 = next * 4 + 1, n2 = next * 4 + 2, n3 = next * 4 + 3;
            ci.push(i2, n2, i3); ci.push(i3, n2, n3);
            if (curbSide === -1) {
                ci.push(i0, n0, i2); ci.push(i2, n0, n2);
            } else {
                ci.push(i1, n1, i3); ci.push(i3, n1, n3);
            }
        }
        var cm = createCustomMesh('curb' + curbSide, cv, ci, cu, null, sc);
        cm.material = curbMat;
        trackMeshes.push(cm);
    }
}

// === START / FINISH ===

function buildStartFinish(sc) {
    var startNode = trackNodes[0];
    var angle = getTrackAngle(0);
    var perpX = -Math.sin(angle);
    var perpZ = Math.cos(angle);

    // Ground checkered line
    var checkTex = createCheckeredTexture();
    checkTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    checkTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    checkTex.uScale = 10;
    checkTex.vScale = 3;
    var lineW = TRACK_WIDTH + 2;
    var lineD = 8;
    var lineMat = new BABYLON.StandardMaterial(tn(), scene);
    lineMat.diffuseTexture = checkTex;
    lineMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    var startLine = mkGnd({ width: lineW, height: lineD }, lineMat);
    startLine.rotation.y = -angle + Math.PI / 2;
    startLine.position.copyFromFloats(startNode.x, startNode.y + 0.08, startNode.z);

    // Overhead banner
    var bannerW = TRACK_WIDTH + 6;
    var bannerY = startNode.y + 9;
    var poleH = bannerY - startNode.y;
    var bannerCheckTex = createCheckeredTexture();
    bannerCheckTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    bannerCheckTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    bannerCheckTex.uScale = 8;
    bannerCheckTex.vScale = 1;
    var bannerMat = new BABYLON.StandardMaterial(tn(), scene);
    bannerMat.diffuseTexture = bannerCheckTex;
    bannerMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    var banner = mkBox({ width: bannerW, height: 2.5, depth: 0.4 }, bannerMat);
    banner.position.copyFromFloats(startNode.x, bannerY, startNode.z);
    banner.rotation.y = -(angle) + Math.PI / 2;

    // Support poles
    var poleMat = new BABYLON.StandardMaterial(tn(), scene);
    poleMat.diffuseColor = c3(0xcccccc);
    poleMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.7);
    poleMat.specularPower = 48;
    var lp = mkCyl({ diameterTop: 0.7, diameterBottom: 0.8, height: poleH, tessellation: 12 }, poleMat);
    lp.position.copyFromFloats(
        startNode.x + perpX * (bannerW / 2), startNode.y + poleH / 2, startNode.z + perpZ * (bannerW / 2)
    );
    var rp = mkCyl({ diameterTop: 0.7, diameterBottom: 0.8, height: poleH, tessellation: 12 }, poleMat);
    rp.position.copyFromFloats(
        startNode.x - perpX * (bannerW / 2), startNode.y + poleH / 2, startNode.z - perpZ * (bannerW / 2)
    );
}

// === TRACK DECORATIONS ===

function buildTrackDecorations(sc) {
    var useGLB = envModelsLoaded && Object.keys(envModelCache).length > 0;
    var treeTypes = ['tree-a', 'tree-a', 'tree-a'];
    var HW = TRACK_WIDTH / 2;

    function getZone(idx) {
        idx = ((idx % TRACK_POINTS) + TRACK_POINTS) % TRACK_POINTS;
        if (idx >= 85 || idx < 5) return 'garden';
        if (idx >= 5 && idx < 25) return 'forest';
        if (idx >= 25 && idx < 45) return 'castle';
        if (idx >= 45 && idx < 65) return 'lake';
        return 'mountain';
    }

    function getZoneColors(zone) {
        switch (zone) {
            case 'forest': return { pri: 0x66AAFF, sec: 0xFF77CC, em: 0x2266AA, bush: 0x2A6644, lamp: 0x4488DD };
            case 'castle': return { pri: 0xFF88BB, sec: 0xBB88FF, em: 0xCC9933, bush: 0x3A7744, lamp: 0xFFCC66 };
            case 'lake': return { pri: 0x88CCFF, sec: 0xCC88FF, em: 0x6688CC, bush: 0x2A5544, lamp: 0x88AADD };
            case 'mountain': return { pri: 0xAA77EE, sec: 0xFF99CC, em: 0x5533AA, bush: 0x335533, lamp: 0x8866BB };
            case 'garden': return { pri: 0xFF77AA, sec: 0xBB88FF, em: 0xAA6688, bush: 0x3A8855, lamp: 0xFFCC66 };
            default: return { pri: 0x66AAFF, sec: 0xFF77CC, em: 0x224488, bush: 0x3A7744, lamp: 0x4488DD };
        }
    }

    function placeAtTrack(idx, side, distance, callback) {
        var node = trackNodes[idx];
        var angle = getTrackAngle(idx);
        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;
        var px = node.x + perpX * distance;
        var pz = node.z + perpZ * distance;
        var py;
        var shoulderEdge = HW + 8;
        if (distance <= shoulderEdge) {
            py = node.y;
        } else if (distance <= shoulderEdge + 25) {
            var t = (distance - shoulderEdge) / 25;
            t = t * t * (3 - 2 * t);
            var terrainY = getTerrainHeight(px, pz);
            py = node.y * (1 - t) + Math.max(terrainY, node.y - 10) * t;
        } else {
            py = getTerrainHeight(px, pz);
        }
        // Bury base slightly so geometric intersections on sloped terrain are hidden
        callback(px, py - 0.7, pz, angle, node);
    }

    // === SMALL DETAIL HELPERS ===

    function createCrystalShard(sc, x, y, z, color) {
        // Use Trellis crystal-pillars for small roadside crystals (small scale to avoid overlapping track)
        var model = envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (envModelCache[model]) {
            placeEnvModel(sc, model, x, y, z, 0.6 + Math.random() * 0.4, Math.random() * Math.PI * 2);
        }
    }

    function createBush(sc, x, y, z, color) {
        var r = 1.0 + Math.random() * 0.8;
        var mat = smat(color || 0x3A7744);
        var b = mkSph({ diameter: r * 2, segments: 6 }, mat);
        b.position.copyFromFloats(x, y + r * 0.3, z);
        b.scaling.y = 0.55;
        var r2 = r * 0.6;
        var b2 = mkSph({ diameter: r2 * 2, segments: 5 }, mat);
        b2.position.copyFromFloats(x + (Math.random() - 0.5) * r, y + r2 * 0.25, z + (Math.random() - 0.5) * r);
        b2.scaling.y = 0.5;
    }

    function createRock(sc, x, y, z) {
        var r = 0.5 + Math.random() * 0.5;
        var mat = smat(hslC3(0.58, 0.1, 0.35 + Math.random() * 0.1));
        var rock = mkPoly({ type: 2, size: r }, mat);
        rock.position.copyFromFloats(x, y + r * 0.25, z);
        rock.rotation.copyFromFloats(Math.random(), Math.random(), Math.random());
        rock.scaling.y = 0.55;
        var r2 = r * 0.65;
        var rock2 = mkPoly({ type: 2, size: r2 }, mat);
        rock2.position.copyFromFloats(x + (Math.random() - 0.5) * r * 1.5, y + r2 * 0.2, z + (Math.random() - 0.5) * r * 1.5);
        rock2.rotation.copyFromFloats(Math.random(), Math.random(), Math.random());
        rock2.scaling.y = 0.5;
    }

    function createBollard(sc, x, y, z, color) {
        var pole = mkCyl({ diameterTop: 0.24, diameterBottom: 0.36, height: 1.8, tessellation: 6 }, smat(0x8899AA));
        pole.position.copyFromFloats(x, y + 0.9, z);
        var orb = mkSph({ diameter: 0.6, segments: 6 }, umat(color, 0.9));
        orb.position.copyFromFloats(x, y + 2.0, z);
    }

    function createCrystal(sc, x, y, z, size, color, emColor) {
        // Use Trellis crystal-pillars (concept art quality)
        var model = envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (envModelCache[model]) {
            placeEnvModel(sc, model, x, y, z, size * 0.8, Math.random() * Math.PI * 2);
        }
        // No procedural fallback - cones removed per user request
    }

    function createFloatingOrb(sc, x, y, z, color, size) {
        var orbSize = CRYSTAL_KINGDOM ? size * 1.5 : size;
        var orb = mkSph({ diameter: orbSize * 2, segments: 12 }, umat(color, 0.95));
        orb.position.copyFromFloats(x, y, z);
        // Removed the fake glow sphere; post-process bloom will handle the halo naturally.
    }

    function createLampPost(sc, x, y, z, color) {
        var pole = mkCyl({ diameterTop: 0.3, diameterBottom: 0.4, height: 5, tessellation: 6 }, smat(0x8899AA));
        pole.position.copyFromFloats(x, y + 2.5, z);
        var orb = mkSph({ diameter: 1.2, segments: 8 }, umat(color, 0.9));
        orb.position.copyFromFloats(x, y + 5.3, z);
        var glow = mkSph({ diameter: 3.6, segments: 8 }, umat(color, 0.12));
        glow.position.copyFromFloats(x, y + 5.3, z);
    }

    var flowerPalette = [0xFF77AA, 0x66AAFF, 0xBB88FF, 0xFFAACC, 0x88DDFF, 0xDD88EE, 0xFFFFFF];

    function createFlowerCluster(sc, x, y, z, color1, color2) {
        var numFlowers = 8 + Math.floor(Math.random() * 5);
        var spread = 4.0;
        for (var f = 0; f < numFlowers; f++) {
            var fc;
            if (f < 3) fc = color1;
            else if (f < 6) fc = color2;
            else fc = flowerPalette[Math.floor(Math.random() * flowerPalette.length)];
            // Bigger flowers with more variation
            var fSize = 0.8 + Math.random() * 1.2;
            var fMat = smat(fc, fc, 0.4);
            fMat.emissiveColor = c3(fc).scale(0.25);
            var flower = mkSph({ diameter: fSize, segments: 5 }, fMat);
            flower.position.copyFromFloats(
                x + (Math.random() - 0.5) * spread,
                y + 0.15 + Math.random() * 0.5,
                z + (Math.random() - 0.5) * spread
            );
            flower.scaling.y = 0.6 + Math.random() * 0.3;
        }
        // Extra tiny accent flowers
        for (var t = 0; t < 4; t++) {
            var tc = flowerPalette[Math.floor(Math.random() * flowerPalette.length)];
            var tMat = smat(tc, tc, 0.35);
            tMat.emissiveColor = c3(tc).scale(0.3);
            var tiny = mkSph({ diameter: 0.4 + Math.random() * 0.3, segments: 4 }, tMat);
            tiny.position.copyFromFloats(
                x + (Math.random() - 0.5) * (spread + 1),
                y + 0.1 + Math.random() * 0.2,
                z + (Math.random() - 0.5) * (spread + 1)
            );
        }
    }

    var _aiCrystalTex = null;
    var _aiCastleTex = null;
    function getAICrystalTex(sc) {
        if (_aiCrystalTex) return _aiCrystalTex;
        _aiCrystalTex = new BABYLON.Texture('images/crystal_tex.png', sc);
        _aiCrystalTex.uScale = 2;
        _aiCrystalTex.vScale = 2;
        return _aiCrystalTex;
    }
    function getAICastleTex(sc) {
        if (_aiCastleTex) return _aiCastleTex;
        _aiCastleTex = new BABYLON.Texture('images/castle_tex.png', sc);
        _aiCastleTex.uScale = 3;
        _aiCastleTex.vScale = 3;
        return _aiCastleTex;
    }

    function createMegaCrystal(sc, x, y, z, color, scale, emission) {
        // Use Trellis crystal-pillars model (from concept art crop)
        var model = envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (envModelCache[model]) {
            placeEnvModel(sc, model, x, y, z, scale * 2.0, Math.random() * Math.PI * 2);
            // Smaller crystal-pillars around
            var numShards = 2 + Math.floor(Math.random() * 2);
            for (var s = 0; s < numShards; s++) {
                var sD = scale * 1.5;
                var sAng = (s / numShards) * Math.PI * 2;
                var sScale = scale * (0.5 + Math.random() * 0.6);
                placeEnvModel(sc, model,
                    x + Math.cos(sAng) * sD, y, z + Math.sin(sAng) * sD,
                    sScale, Math.random() * Math.PI * 2);
            }
        }
    }

    function createCrystalCastle(sc, x, y, z) {
        if (!CRYSTAL_KINGDOM) return;
        // Use GLB castle model if available, with crystal GLB spires around it
        if (envModelCache['crystal-castle-b']) {
            placeEnvModel(sc, 'crystal-castle-b', x, y, z, 40, 0);
        }
        // Surround with Trellis crystal-pillars (concept art quality)
        var cpModel = envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (envModelCache[cpModel]) {
            var spireAngles = [1.2, -1.2, 2.5, -2.5, 0.8, 3.8, -0.8];
            var spireDists = [30, 30, 50, 50, 60, 60, 60];
            var spireScales = [35, 35, 25, 25, 20, 20, 20];
            for (var i = 0; i < spireAngles.length; i++) {
                var px = x + Math.cos(spireAngles[i]) * spireDists[i];
                var pz = z + Math.sin(spireAngles[i]) * spireDists[i];
                placeEnvModel(sc, cpModel, px, y, pz, spireScales[i], Math.random() * Math.PI * 2);
            }
        }
        if (window._vlsMesh) {
            window._vlsMesh.position.copyFromFloats(x, y + 100, z);
        }
    }

    // === GROUND CRYSTAL LIGHTS (reduced: every 5th point, one side, smaller, dimmer) ===
    if (CRYSTAL_KINGDOM) {
        var lightColors = [0x44BBFF, 0xBB66FF, 0xFF77AA, 0x66FFAA, 0xFFCC44];
        for (var li = 0; li < TRACK_POINTS; li += 5) {
            var ls = (li % 10 < 5) ? -1 : 1; // Alternate sides
            var lNode = trackNodes[li];
            var lAngle = getTrackAngle(li);
            var lPerpX = -Math.sin(lAngle) * ls;
            var lPerpZ = Math.cos(lAngle) * ls;
            var lDist = HW + 1.5;
            var lx = lNode.x + lPerpX * lDist;
            var lz = lNode.z + lPerpZ * lDist;
            var lCol = lightColors[li % lightColors.length];
            var crystLight = mkSph({ diameter: 0.35, segments: 4 }, umat(lCol, 0.4));
            crystLight.position.copyFromFloats(lx, lNode.y + 0.2, lz);
        }
    }

    // Ground zone tiles removed - they were nearly invisible dark patches adding draw calls

    // Floating island platforms removed (concept art has floating crystals, not platforms)
    // Non-CK floating islands kept
    if (!CRYSTAL_KINGDOM) {
        var islandPositions = [
            { x: 150, z: 200, y: 35, s: 25 }, { x: -200, z: 100, y: 45, s: 30 },
            { x: 100, z: -250, y: 40, s: 22 }, { x: -150, z: -200, y: 50, s: 28 },
            { x: 250, z: -100, y: 38, s: 20 }, { x: -300, z: -150, y: 42, s: 26 },
            { x: 350, z: 200, y: 36, s: 24 }
        ];
        for (var ii = 0; ii < islandPositions.length; ii++) {
            var ip = islandPositions[ii];
            var platMat = smat(0x6677AA, 0x334466, 0.25, 0.9);
            var plat = mkCyl(
                { diameterTop: ip.s * 1.2, diameterBottom: ip.s * 0.5, height: ip.s * 0.35, tessellation: 5 },
                platMat
            );
            plat.position.copyFromFloats(ip.x, ip.y, ip.z);
            for (var ust = 0; ust < 3; ust++) {
                var ustAng = Math.random() * Math.PI * 2;
                var ustDist = ip.s * (0.1 + Math.random() * 0.3);
                var ustH = ip.s * (0.15 + Math.random() * 0.2);
                var ustR = ip.s * 0.04;
                var stal = mkCyl({ diameterTop: ustR * 2, diameterBottom: 0, height: ustH, tessellation: 3 }, platMat);
                stal.position.copyFromFloats(
                    ip.x + Math.cos(ustAng) * ustDist,
                    ip.y - ip.s * 0.17 - ustH / 2,
                    ip.z + Math.sin(ustAng) * ustDist
                );
            }
            if (useGLB && envModelCache['crystal']) {
                placeEnvModel(sc, 'crystal', ip.x, ip.y + ip.s * 0.15, ip.z, ip.s * 0.8, ii * 1.5);
            }
        }
    }

    // === DENSE FLOWER & CRYSTAL CARPET (fill ALL space around track - NO GAPS!) ===
    if (CRYSTAL_KINGDOM) {
        var carpetFlMats = flowerPalette.map(function (fc) {
            var m = smat(fc, fc, 0.35);
            m.emissiveColor = c3(fc).scale(0.20); // Visible but not bloom white-out
            return m;
        });
        var carpetGrassMat = smat(0x3A8855, 0x225533, 0.2);

        // Collect carpet meshes for merging (massive perf boost)
        var _carpetGrass = [];
        var _carpetFlowers = [[], [], [], [], [], [], []]; // per color

        // Carpet-only mesh creators (NOT added to trackMeshes - will be merged)
        function _ccyl(opts, mat) {
            var m = BABYLON.MeshBuilder.CreateCylinder(tn(), opts, scene);
            if (mat) m.material = mat;
            return m;
        }
        function _csph(opts, mat) {
            var m = BABYLON.MeshBuilder.CreateSphere(tn(), opts, scene);
            if (mat) m.material = mat;
            return m;
        }

        function miniPatch(px, py, pz, spread) {
            var n = 2 + Math.floor(Math.random() * 3);
            for (var mp = 0; mp < n; mp++) {
                var ci = Math.floor(Math.random() * carpetFlMats.length);
                var fsz = 0.5 + Math.random() * 1.0;
                var fl = _csph({ diameter: fsz, segments: 3 }, carpetFlMats[ci]);
                fl.position.copyFromFloats(
                    px + (Math.random() - 0.5) * spread * 2,
                    py + 0.1 + Math.random() * 0.35,
                    pz + (Math.random() - 0.5) * spread * 2
                );
                fl.scaling.y = 0.4;
                _carpetFlowers[ci].push(fl);
            }
        }

        var carpetBands = [
            { d: HW + 1, sp: 7, ch: 1.0 },
            { d: HW + 5, sp: 7, ch: 1.0 },
            { d: HW + 10, sp: 8, ch: 1.0 },
            { d: HW + 16, sp: 8, ch: 0.9 },
            { d: HW + 23, sp: 9, ch: 0.8 },
            { d: HW + 31, sp: 9, ch: 0.7 },
            { d: HW + 40, sp: 10, ch: 0.6 },
            { d: HW + 50, sp: 10, ch: 0.5 },
        ];

        for (var cpi = 0; cpi < TRACK_POINTS; cpi += 1) {
            var cpZc = getZoneColors(getZone(cpi));
            for (var cps = -1; cps <= 1; cps += 2) {
                for (var cpb = 0; cpb < carpetBands.length; cpb++) {
                    if (Math.random() > carpetBands[cpb].ch) continue;
                    var cpDist = carpetBands[cpb].d + (Math.random() - 0.5) * 3;
                    var cpSp = carpetBands[cpb].sp;
                    placeAtTrack(cpi, cps, cpDist, function (px, py, pz) {
                        var r = Math.random();
                        if (r < 0.75) {
                            miniPatch(px, py, pz, cpSp);
                        } else {
                            createCrystalShard(sc, px, py, pz, cpZc.pri);
                        }
                    });
                }
            }
        }

        // Merge carpet meshes for performance (thousands of meshes → ~8 draw calls)
        for (var cfi = 0; cfi < _carpetFlowers.length; cfi++) {
            if (_carpetFlowers[cfi].length > 1) {
                var mergedF = BABYLON.Mesh.MergeMeshes(_carpetFlowers[cfi], true, true, undefined, false, true);
                if (mergedF) { mergedF.material = carpetFlMats[cfi]; trackMeshes.push(mergedF); }
            }
        }
    }

    // === EPIC STRUCTURES ===
    if (CRYSTAL_KINGDOM) {
        // Centerpiece Castle
        createCrystalCastle(sc, 0, getTerrainHeight(0, 400), 400);

        // Background Mega Crystals (well behind track edge)
        for (var m = 0; m < TRACK_POINTS; m += 5) {
            var mNode = trackNodes[m];
            var mAngle = getTrackAngle(m);
            var mSide = (m % 10 < 5) ? 1 : -1;
            var mDist = 80 + Math.random() * 100; // Far background (min 80 from center)
            var mPx = mNode.x - Math.sin(mAngle) * mSide * mDist;
            var mPz = mNode.z + Math.cos(mAngle) * mSide * mDist;
            var mPy = getTerrainHeight(mPx, mPz);
            var mZc = getZoneColors(getZone(m));
            var mScale = 12 + Math.random() * 15;
            createMegaCrystal(sc, mPx, mPy - 10, mPz, mZc.pri, mScale, 0.5);
        }

        // Midground Mega Crystals (outside track shoulder)
        for (var mm = 2; mm < TRACK_POINTS; mm += 8) {
            var mmNode = trackNodes[mm];
            var mmAngle = getTrackAngle(mm);
            var mmSide = (mm % 2 === 0) ? -1 : 1;
            var mmDist = 50 + Math.random() * 25; // Min 50 from center (was 30)
            var mmPx = mmNode.x - Math.sin(mmAngle) * mmSide * mmDist;
            var mmPz = mmNode.z + Math.cos(mmAngle) * mmSide * mmDist;
            var mmPy = getTerrainHeight(mmPx, mmPz);
            var mmZc = getZoneColors(getZone(mm));
            var mmScale = 6 + Math.random() * 8;
            createMegaCrystal(sc, mmPx, mmPy - 5, mmPz, mmZc.sec, mmScale, 0.6);
        }
    }

    // === MAIN DECORATION LOOP ===
    for (var i = 0; i < TRACK_POINTS; i++) {
        var zone = getZone(i);
        var zc = getZoneColors(zone);

        if (CRYSTAL_KINGDOM && i % 3 === 0) {
            // Road-side GLB crystals (reduced density for GLB models)
            var ds = (i % 6 < 3) ? 1 : -1;
            placeAtTrack(i, ds, HW + 4 + Math.random() * 4, function (px, py, pz) {
                createCrystal(sc, px, py, pz, 2 + Math.random() * 2, zc.pri, zc.sec);
            });
        }

        // LAYER 1: NEAR (flowers + crystal shards only - concept art has no green bushes/rocks)
        if (i % 2 === 0) {
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 2.5, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, zc.pri, zc.sec);
            });
        }
        if (i % 3 === 0) {
            placeAtTrack(i, (i % 6 < 3) ? -1 : 1, HW + 3.5, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, zc.sec, flowerPalette[i % flowerPalette.length]);
            });
        }

        // LAYER 2: MID (flowers only)
        if (i % 4 === 0) {
            placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 9 + (i % 3) * 3, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, zc.sec, 0xFFFFFF);
            });
        }

        // LAYER 3: FAR (zone-specific)
        if (zone === 'forest') {
            var fSide = (i % 2 === 0) ? 1 : -1;
            placeAtTrack(i, fSide, 38 + (i % 4) * 5, function (px, py, pz) {
                var tt = treeTypes[i % 3];
                if (useGLB && envModelCache[tt]) placeEnvModel(sc, tt, px, py, pz, 12 + (i % 4) * 2, i * 1.37);
                else createPineTree(sc, px, py, pz);
            });
            if (i % 2 === 0) {
                placeAtTrack(i, -fSide, 42 + (i % 3) * 6, function (px, py, pz) {
                    var tt2 = treeTypes[(i + 1) % 3];
                    if (useGLB && envModelCache[tt2]) placeEnvModel(sc, tt2, px, py, pz, 13, i * 2.1);
                    else createPineTree(sc, px, py, pz);
                });
            }
            if (i % 2 === 0) {
                placeAtTrack(i, ((i / 2 | 0) % 2 === 0) ? 1 : -1, 20 + (i % 5) * 3, function (px, py, pz) {
                    if (useGLB && envModelCache['crystal']) placeEnvModel(sc, 'crystal', px, py, pz, 8 + (i % 3) * 2, i * 0.83);
                    else createCrystal(sc, px, py, pz, 2 + (i % 3), 0x4488DD, 0x2266AA);
                });
            }
            // Floating orbs removed
            if ((i === 8 || i === 14 || i === 20) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 35 + (i % 3) * 4, function (px, py, pz) {
                    placeEnvModel(sc, 'obelisk', px, py, pz, 10, i * 0.9);
                });
            }
            if (i % 3 === 0 && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 6 < 3) ? 1 : -1, HW + 5 + (i % 3) * 2, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 8 + (i % 3) * 2, i * 0.8);
                });
            }
            // Trellis crystal pillars in forest
            if (i % 5 === 0 && useGLB && envModelCache['crystal-pillars']) {
                placeAtTrack(i, (i % 10 < 5) ? 1 : -1, 50 + (i % 3) * 8, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-pillars', px, py, pz, 14 + (i % 3) * 3, i * 1.2);
                });
            }
        }

        else if (zone === 'castle') {
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, 40 + (i % 3) * 7, function (px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) placeEnvModel(sc, tt, px, py, pz, 14, i * 1.5);
                    else createPineTree(sc, px, py, pz);
                });
            }
            if (i === 30 || i === 40) {
                placeAtTrack(i, (i === 30) ? -1 : 1, 65, function (px, py, pz) {
                    if (useGLB && envModelCache['castle']) {
                        var castle = placeEnvModel(sc, 'castle', px, py, pz, 80, i * 0.5);
                        // Make castle look crystalline/glassy
                        castle.getChildMeshes().forEach(function (m) {
                            if (m.material) {
                                m.material.alpha = 0.8;
                                m.material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.2);
                            }
                        });
                        addToReflections(castle);
                    } else if (!CRYSTAL_KINGDOM) {
                        createBuilding(sc, px, py, pz);
                    }
                });
            }
            if (i === 27 || i === 31 || i === 33 || i === 36 || i === 38 || i === 43) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 45, function (px, py, pz) {
                    if (useGLB && envModelCache['house-a']) placeEnvModel(sc, 'house-a', px, py, pz, 16, i * 1.05);
                    else if (!CRYSTAL_KINGDOM) createBuilding(sc, px, py, pz);
                });
            }
            if (i === 35) {
                placeAtTrack(i, 1, 38, function (px, py, pz) {
                    if (useGLB && envModelCache['fountain']) placeEnvModel(sc, 'fountain', px, py, pz, 12, 0);
                });
            }
            if (false && (i === 28 || i === 42)) { // archgate removed - overlaps course
            }
            if ((i === 26 || i === 29 || i === 32 || i === 37 || i === 41 || i === 44) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 6, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 10, i * 1.2);
                });
            }
            // Trellis crystal castle in castle zone
            if ((i === 33 || i === 38) && useGLB && envModelCache['crystal-castle-b']) {
                placeAtTrack(i, (i === 33) ? 1 : -1, 70, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-castle-b', px, py, pz, 18, i * 0.8);
                });
            }
            // Trellis crystal arch in castle zone
            if ((i === 28 || i === 42) && useGLB && envModelCache['crystal-arch-b']) {
                placeAtTrack(i, (i === 28) ? -1 : 1, 50, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-arch-b', px, py, pz, 16, i * 0.7);
                });
            }
            // Trellis flower garden in castle zone
            if (i % 4 === 0 && useGLB && envModelCache['flower-garden']) {
                placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 25 + (i % 3) * 5, function (px, py, pz) {
                    placeEnvModel(sc, 'flower-garden', px, py, pz, 8, i * 0.9);
                });
            }
        }

        else if (zone === 'lake') {
            if (i % 3 === 0) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 40 + (i % 3) * 10, function (px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) placeEnvModel(sc, tt, px, py, pz, 15, i * 1.8);
                    else createPineTree(sc, px, py, pz);
                });
            }
            if (i % 2 === 0) {
                placeAtTrack(i, ((i / 2 | 0) % 2 === 0) ? 1 : -1, 28 + (i % 4) * 4, function (px, py, pz) {
                    if (useGLB && envModelCache['crystal']) placeEnvModel(sc, 'crystal', px, py, pz, 10 + (i % 3) * 2, i * 0.7);
                    else createCrystal(sc, px, py, pz, 3 + (i % 3), 0xE8EEFF, 0x6688CC);
                });
            }
            // Floating orbs removed (user: 白い丸が気に食わない)
            if ((i === 48 || i === 55 || i === 62) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? -1 : 1, 35 + (i % 3) * 5, function (px, py, pz) {
                    placeEnvModel(sc, 'obelisk', px, py, pz, 10, i * 0.75);
                });
            }
            if (i % 4 === 0 && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 5, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 9, i * 0.65);
                });
            }
            // Trellis floating crystals in lake zone
            if (i % 4 === 0 && useGLB && envModelCache['floating-crystals']) {
                placeAtTrack(i, (i % 8 < 4) ? 1 : -1, 45 + (i % 3) * 8, function (px, py, pz) {
                    placeEnvModel(sc, 'floating-crystals', px, py, pz, 10 + (i % 3) * 2, i * 0.6);
                });
            }
            // Trellis crystal pillars in lake zone
            if (i % 6 === 0 && useGLB && envModelCache['crystal-pillars']) {
                placeAtTrack(i, (i % 12 < 6) ? -1 : 1, 55 + (i % 4) * 5, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-pillars', px, py, pz, 16, i * 1.1);
                });
            }
        }

        else if (zone === 'mountain') {
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, 38 + (i % 4) * 5, function (px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) placeEnvModel(sc, tt, px, py, pz, 14, i * 1.6);
                    else createPineTree(sc, px, py, pz);
                });
            }
            if (i % 3 === 0) {
                placeAtTrack(i, ((i / 3 | 0) % 2 === 0) ? 1 : -1, 20 + (i % 5) * 3, function (px, py, pz) {
                    if (useGLB && envModelCache['crystal']) placeEnvModel(sc, 'crystal', px, py, pz, 8 + (i % 3) * 2, i * 0.9);
                    else createCrystal(sc, px, py, pz, 2.5 + (i % 3), 0x8866BB, 0x5533AA);
                });
            }
            if (i === 70 || i === 78) {
                placeAtTrack(i, (i === 70) ? 1 : -1, 55, function (px, py, pz) {
                    if (useGLB && envModelCache['windmill']) placeEnvModel(sc, 'windmill', px, py, pz, 20, i * 1.57);
                });
            }
            if (i % 4 === 0 && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 4 + (i % 3), function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 8, i * 1.0);
                });
            }
            // Trellis floating crystals in mountain zone
            if (i % 5 === 0 && useGLB && envModelCache['floating-crystals']) {
                placeAtTrack(i, (i % 10 < 5) ? 1 : -1, 50 + (i % 3) * 6, function (px, py, pz) {
                    placeEnvModel(sc, 'floating-crystals', px, py, pz, 10, i * 0.8);
                });
            }
            // Trellis crystal pillars in mountain
            if ((i === 68 || i === 75 || i === 82) && useGLB && envModelCache['crystal-pillars']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 55, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-pillars', px, py, pz, 18, i * 1.3);
                });
            }
        }

        else if (zone === 'garden') {
            var gSide = (i % 2 === 0) ? 1 : -1;
            placeAtTrack(i, gSide, 38 + (i % 3) * 5, function (px, py, pz) {
                var tt = treeTypes[i % 3];
                if (useGLB && envModelCache[tt]) placeEnvModel(sc, tt, px, py, pz, 13, i * 1.4);
                else createPineTree(sc, px, py, pz);
            });
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 4 + (i % 3) * 1.5, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, 0x9988CC, 0xDDA0BB);
            });
            if (i === 92) {
                placeAtTrack(i, 1, 38, function (px, py, pz) {
                    if (useGLB && envModelCache['fountain']) placeEnvModel(sc, 'fountain', px, py, pz, 16, 0);
                });
            }
            if (false && (i === 90 || i === 98)) { // archgate removed - overlaps course
            }
            if ((i === 86 || i === 89 || i === 93 || i === 96 || i === 0 || i === 3) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 5, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 10, i * 1.1);
                });
            }
            // Trellis flower garden in garden zone
            if (i % 3 === 0 && useGLB && envModelCache['flower-garden']) {
                placeAtTrack(i, (i % 6 < 3) ? 1 : -1, HW + 22 + (i % 4) * 4, function (px, py, pz) {
                    placeEnvModel(sc, 'flower-garden', px, py, pz, 8, i * 0.95);
                });
            }
            // Trellis crystal arch in garden zone
            if ((i === 90 || i === 97) && useGLB && envModelCache['crystal-arch-b']) {
                placeAtTrack(i, (i === 90) ? 1 : -1, 48, function (px, py, pz) {
                    placeEnvModel(sc, 'crystal-arch-b', px, py, pz, 15, i * 0.65);
                });
            }
        }
    }

    // Crystal bridge arches and road arches removed (overlapped road, not in concept art)

    // === GIANT CRYSTAL FORMATIONS (Crystal Kingdom) ===
    if (CRYSTAL_KINGDOM) {
        // Place MASSIVE crystals near track using Trellis crystal-pillars (concept art)
        var giantModel = envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (useGLB && envModelCache[giantModel]) {
            // Regular giant crystals every 12 nodes (pushed further from track)
            for (var gi = 0; gi < TRACK_POINTS; gi += 12) {
                var gSide = ((gi / 12 | 0) % 2 === 0) ? 1 : -1;
                var gDist = 80 + (gi % 7) * 10; // Min 80 from center (was 45)
                var gNode = trackNodes[gi];
                var gAngle = getTrackAngle(gi);
                var gPerpX = -Math.sin(gAngle);
                var gPerpZ = Math.cos(gAngle);
                var gx = gNode.x + gPerpX * gSide * gDist;
                var gz = gNode.z + gPerpZ * gSide * gDist;
                var gScale = 20 + (gi % 5) * 8; // Smaller (was 30+15)
                placeEnvModel(sc, giantModel, gx, gNode.y, gz, gScale, gi * 0.73);
            }
            // Hero crystals at key viewpoints (further from track, moderate scale)
            var heroCrystals = [
                { idx: 12, side: 1, dist: 130, scale: 45 },
                { idx: 37, side: -1, dist: 140, scale: 40 },
                { idx: 55, side: 1, dist: 135, scale: 50 },
                { idx: 78, side: -1, dist: 150, scale: 42 },
                { idx: 25, side: 1, dist: 160, scale: 50 },
                { idx: 42, side: -1, dist: 170, scale: 55 },
                { idx: 90, side: 1, dist: 150, scale: 45 },
            ];
            for (var hi = 0; hi < heroCrystals.length; hi++) {
                var hc = heroCrystals[hi];
                var hNode = trackNodes[hc.idx];
                var hAngle = getTrackAngle(hc.idx);
                var hPerpX = -Math.sin(hAngle);
                var hPerpZ = Math.cos(hAngle);
                var hx = hNode.x + hPerpX * hc.side * hc.dist;
                var hz = hNode.z + hPerpZ * hc.side * hc.dist;
                placeEnvModel(sc, giantModel, hx, hNode.y, hz, hc.scale, hi * 1.37);
            }
        }

        // Floating crystals in the sky using GLB
        var floatingCrystals = [
            { x: 100, y: 80, z: 150, s: 25 },
            { x: -180, y: 100, z: 80, s: 30 },
            { x: 200, y: 90, z: -120, s: 22 },
            { x: -100, y: 110, z: -200, s: 28 },
            { x: 50, y: 70, z: -50, s: 20 },
            { x: -250, y: 95, z: -50, s: 26 },
            { x: 300, y: 85, z: 100, s: 22 },
            { x: -50, y: 105, z: 250, s: 28 },
            { x: 150, y: 75, z: -250, s: 22 },
            { x: -200, y: 90, z: 250, s: 24 },
            { x: 350, y: 80, z: -50, s: 20 },
            { x: -300, y: 85, z: -200, s: 26 },
        ];
        var floatModel = envModelCache['floating-crystals'] ? 'floating-crystals' :
            envModelCache['crystal-pillars'] ? 'crystal-pillars' : 'crystal';
        if (useGLB && envModelCache[floatModel]) {
            for (var fi = 0; fi < floatingCrystals.length; fi++) {
                var fc = floatingCrystals[fi];
                placeEnvModel(sc, floatModel, fc.x, fc.y, fc.z, fc.s, fi * 1.2);
            }
        }
    }

    // === Background mountains (pushed far back, silhouette only) ===
    var mountainPositions = [
        { x: 900, z: 900 }, { x: -900, z: 900 }, { x: 900, z: -900 }, { x: -900, z: -900 },
        { x: 0, z: 1050 }, { x: 1050, z: 0 }, { x: -1050, z: 0 }, { x: 0, z: -1050 },
        { x: 650, z: 1050 }, { x: -650, z: -1050 }, { x: 1050, z: 650 }, { x: -1050, z: -650 }
    ];
    for (var mi = 0; mi < mountainPositions.length; mi++) {
        var mp = mountainPositions[mi];
        var mH = 150 + Math.random() * 120;
        var mR = 120 + Math.random() * 80;
        var mMat = new BABYLON.StandardMaterial(tn(), scene);
        if (CRYSTAL_KINGDOM) {
            // Very faint purple silhouette mountains - atmosphere only
            var mHue = 0.68 + Math.random() * 0.08;
            mMat.diffuseColor = hslC3(mHue, 0.4, 0.10);
            mMat.emissiveColor = hslC3(mHue, 0.6, 0.06 + Math.random() * 0.03);
            mMat.specularColor = BABYLON.Color3.Black();
            mMat.alpha = 0.2 + Math.random() * 0.1; // Very transparent
        } else {
            mMat.diffuseColor = hslC3(0.7, 0.25, 0.15 + Math.random() * 0.08);
            mMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        }
        var mMesh = mkCyl(
            { diameterTop: 8, diameterBottom: mR * 2, height: mH, tessellation: 10 },
            mMat
        );
        mMesh.position.copyFromFloats(mp.x, mH / 2 - 25, mp.z);
    }

    // === WATER SURFACES ===
    var waterVS = [
        'precision highp float;',
        'attribute vec3 position;',
        'attribute vec3 normal;',
        'attribute vec2 uv;',
        'uniform mat4 worldViewProjection;',
        'uniform mat4 world;',
        'uniform float uTime;',
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  vUv = uv;',
        '  vec3 pos = position;',
        '  float wave1 = sin(pos.x * 0.3 + uTime * 1.5) * 0.15;',
        '  float wave2 = sin(pos.z * 0.5 + uTime * 2.0) * 0.1;',
        '  float wave3 = cos(pos.x * 0.2 + pos.z * 0.3 + uTime) * 0.08;',
        '  pos.y += wave1 + wave2 + wave3;',
        '  vec4 worldPos = world * vec4(pos, 1.0);',
        '  vWorldPos = worldPos.xyz;',
        '  vNormal = normalize((world * vec4(normal, 0.0)).xyz);',
        '  gl_Position = worldViewProjection * vec4(pos, 1.0);',
        '}'
    ].join('\n');

    var waterFS = [
        'precision highp float;',
        'uniform float uTime;',
        'uniform vec3 uWaterColor;',
        'uniform vec3 uDeepColor;',
        'uniform sampler2D reflectionSampler;',
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float ripple1 = sin(vUv.x * 20.0 + uTime * 2.5) * 0.5 + 0.5;',
        '  float ripple2 = sin(vUv.y * 15.0 - uTime * 1.8) * 0.5 + 0.5;',
        '  float ripple3 = sin((vUv.x + vUv.y) * 12.0 + uTime * 1.4) * 0.5 + 0.5;',
        '  float ripple = ripple1 * ripple2 * 0.7 + ripple3 * 0.3;',
        '  vec3 baseColor = mix(uDeepColor, uWaterColor, ripple * 0.55 + 0.3);',
        '  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0))), 3.0);',
        '  vec2 refUV = gl_FragCoord.xy / vec2(800.0, 600.0);', // fallback scale
        '  vec3 reflection = texture2D(reflectionSampler, refUV).rgb;',
        '  vec3 highlight = mix(reflection, vec3(0.8, 0.9, 1.0), 0.2) * fresnel * 0.9;',
        '  float sparkle = pow(max(0.0, sin(vUv.x * 60.0 + uTime * 4.0) * sin(vUv.y * 50.0 - uTime * 3.5)), 15.0) * 1.2;',
        '  vec3 finalColor = baseColor + highlight + vec3(sparkle * 0.5);',
        '  float edgeFade = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));',
        '  gl_FragColor = vec4(finalColor, 0.85 * edgeFade);',
        '}'
    ].join('\n');

    BABYLON.Effect.ShadersStore['waterVertexShader'] = waterVS;
    BABYLON.Effect.ShadersStore['waterFragmentShader'] = waterFS;

    var waterPositions = CRYSTAL_KINGDOM ? [
        { x: 0, z: 0, w: 550, h: 550 }, // Inside the track loop only
    ] : [
        { x: 200, z: 200, w: 150, h: 100 },
        { x: -300, z: 150, w: 80, h: 120 },
        { x: 100, z: -350, w: 100, h: 80 }
    ];
    for (var wi = 0; wi < waterPositions.length; wi++) {
        var wp = waterPositions[wi];
        var waterMat = new BABYLON.ShaderMaterial('water' + wi, scene, {
            vertex: 'water',
            fragment: 'water'
        }, {
            attributes: ['position', 'normal', 'uv'],
            uniforms: ['worldViewProjection', 'world', 'uTime', 'uWaterColor', 'uDeepColor'],
            samplers: ['reflectionSampler'],
            needAlphaBlending: true
        });
        waterMat.setFloat('uTime', 0);
        if (reflectionTexture) waterMat.setTexture('reflectionSampler', reflectionTexture);
        if (CRYSTAL_KINGDOM) {
            waterMat.setColor3('uWaterColor', c3(0x1A2844));
            waterMat.setColor3('uDeepColor', c3(0x0A1020));
        } else {
            waterMat.setColor3('uWaterColor', c3(0x4477CC));
            waterMat.setColor3('uDeepColor', c3(0x1A2E4A));
        }
        waterMat.backFaceCulling = false;

        var waterSubs = CRYSTAL_KINGDOM ? 128 : 32;
        var water = BABYLON.MeshBuilder.CreateGround('water' + wi, {
            width: wp.w, height: wp.h, subdivisions: waterSubs
        }, scene);
        water.position.copyFromFloats(wp.x, -1.0, wp.z); // Raised slightly to ensure visibility
        water.material = waterMat;
        water.metadata = { isWater: true };
        trackMeshes.push(water);
    }

    // Build track structures
    buildBridgePillars(sc);
    buildTunnels(sc);
    buildRamps(sc);
}

// === TREE FUNCTIONS ===

function createPineTree(sc, x, y, z) {
    var trunkH = 3 + Math.random() * 2;
    var trunkR = 0.3 + Math.random() * 0.15;
    var trunk = mkCyl(
        { diameterTop: trunkR * 2, diameterBottom: trunkR * 2.6, height: trunkH, tessellation: 8 },
        smat(0x7B5B3A)
    );
    trunk.position.copyFromFloats(x, y + trunkH / 2, z);
    for (var t = 0; t < 3; t++) {
        var tierH = (3.5 - t * 0.8) + Math.random() * 0.5;
        var tierR = (3.0 - t * 0.6) + Math.random() * 0.5;
        var tierY = y + trunkH + t * 2.2;
        var hue = 0.28 + Math.random() * 0.08;
        var foliage = mkCyl(
            { diameterTop: 0, diameterBottom: tierR * 2, height: tierH, tessellation: 8 },
            smat(hslC3(hue, 0.65, 0.32 + t * 0.05))
        );
        foliage.position.copyFromFloats(x, tierY + tierH / 2, z);
    }
}

function createOakTree(sc, x, y, z) {
    var trunkH = 3 + Math.random() * 2;
    var trunkR = 0.4 + Math.random() * 0.2;
    var trunk = mkCyl(
        { diameterTop: trunkR * 2, diameterBottom: trunkR * 2.6, height: trunkH, tessellation: 8 },
        smat(0x7B5533)
    );
    trunk.position.copyFromFloats(x, y + trunkH / 2, z);
    var mainR = 3 + Math.random() * 1.5;
    var hue = 0.25 + Math.random() * 0.12;
    var foliage = mkSph({ diameter: mainR * 2, segments: 10 }, smat(hslC3(hue, 0.6, 0.38)));
    foliage.position.copyFromFloats(x, y + trunkH + mainR * 0.65, z);
    for (var p = 0; p < 3; p++) {
        var pAngle = (p / 3) * Math.PI * 2 + Math.random();
        var pR = mainR * 0.6;
        var pMesh = mkSph(
            { diameter: pR * 2, segments: 8 },
            smat(hslC3(hue + (Math.random() - 0.5) * 0.04, 0.55, 0.35 + Math.random() * 0.08))
        );
        pMesh.position.copyFromFloats(
            x + Math.cos(pAngle) * mainR * 0.5,
            y + trunkH + mainR * 0.5 + Math.random() * 1.5,
            z + Math.sin(pAngle) * mainR * 0.5
        );
    }
}

function createPalmTree(sc, x, y, z) {
    var trunkH = 6 + Math.random() * 3;
    var trunk = mkCyl(
        { diameterTop: 0.7, diameterBottom: 1.05, height: trunkH, tessellation: 8 },
        smat(0x8b7355)
    );
    trunk.position.copyFromFloats(x, y + trunkH / 2, z);
    for (var i = 0; i < 6; i++) {
        var angle = (i / 6) * Math.PI * 2;
        var frond = mkSph({ diameter: 2.4, segments: 6 }, smat(0x44cc55));
        frond.position.copyFromFloats(x + Math.cos(angle) * 2, y + trunkH + 1, z + Math.sin(angle) * 2);
    }
}

// === GUARDRAILS ===

function buildGuardrails(sc) {
    var railSpacing = 2;
    var halfWidth = TRACK_WIDTH / 2;
    var railDist = halfWidth + 1.3;

    var postMat = smat(0xBBCCFF, 0x6688CC, 0.3, 0.6);
    var leftBeamMat = smat(0x4488DD, 0x4488DD, 0.6, 0.75);
    var rightBeamMat = smat(0x8866BB, 0x8866BB, 0.6, 0.75);

    for (var i = 0; i < trackNodes.length; i += railSpacing) {
        var node = getTrackPoint(i);
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);
        var nextI = (i + railSpacing) % trackNodes.length;
        var nextNode = getTrackPoint(nextI);
        var nextAngle = getTrackAngle(nextI);
        var nextPerpX = -Math.sin(nextAngle);
        var nextPerpZ = Math.cos(nextAngle);

        for (var side = -1; side <= 1; side += 2) {
            var px = node.x + perpX * side * railDist;
            var pz = node.z + perpZ * side * railDist;
            var npx = nextNode.x + nextPerpX * side * railDist;
            var npz = nextNode.z + nextPerpZ * side * railDist;
            var dx = npx - px, dz = npz - pz;
            var beamLen = Math.sqrt(dx * dx + dz * dz);
            var beamAng = Math.atan2(dz, dx);
            var bMat = (side === 1) ? leftBeamMat : rightBeamMat;
            var beam = mkBox({ width: beamLen, height: 0.12, depth: 0.06 }, bMat);
            beam.position.copyFromFloats((px + npx) / 2, node.y + 1.2, (pz + npz) / 2);
            beam.rotation.y = -beamAng;
        }
    }
}

function createGuardrail(sc, trackIdx) {
    // Legacy no-op
}

// === BUILDINGS ===

function createBuilding(sc, x, y, z) {
    var bw = 10 + Math.random() * 8;
    var bh = 12 + Math.random() * 15;
    var bd = 10 + Math.random() * 8;
    var colors = [0xff5555, 0x5555ff, 0x55ff55, 0xffff55, 0xff55ff, 0x55ffff];
    var wallColor = colors[Math.floor(Math.random() * colors.length)];
    var walls = mkBox({ width: bw, height: bh, depth: bd }, smat(wallColor));
    walls.position.copyFromFloats(x, y + bh / 2, z);
    var roof = mkBox({ width: bw * 0.8, height: 2, depth: bd * 0.8 }, smat(0x333333));
    roof.position.copyFromFloats(x, y + bh + 1, z);
}

function createBillboard(sc, x, y, z, angle) {
    var pole = mkCyl({ diameterTop: 0.4, diameterBottom: 0.4, height: 5, tessellation: 8 }, smat(0x444444));
    pole.position.copyFromFloats(x, y + 2.5, z);
    var colors = [0xff3333, 0x33ff33, 0x3333ff, 0xffff33, 0xff33ff];
    var signColor = colors[Math.floor(Math.random() * colors.length)];
    var sign = mkBox({ width: 6, height: 3, depth: 0.2 }, smat(signColor, signColor, 0.3));
    sign.position.copyFromFloats(x, y + 6.5, z);
    sign.rotation.y = angle + Math.PI / 2;
}

function createSpectatorStand(sc, node, angle, side) {
    var distance = TRACK_WIDTH / 2 + 15;
    var perpX = -Math.sin(angle) * side;
    var perpZ = Math.cos(angle) * side;
    var standX = node.x + perpX * distance;
    var standZ = node.z + perpZ * distance;
    for (var i = 0; i < 5; i++) {
        var step = mkBox({ width: 20, height: 1.5, depth: 3 }, smat((i % 2 === 0) ? 0xdddddd : 0xaaaaaa));
        step.position.copyFromFloats(standX + perpX * i * 3, node.y + i * 1.5, standZ + perpZ * i * 3);
        step.rotation.y = angle;
    }
}

// === WATER SURFACE UPDATE ===

function updateWaterSurfaces(dt) {
    if (!trackMeshes) return;
    waterTime += (dt || 0.016);
    for (var i = 0; i < trackMeshes.length; i++) {
        var mesh = trackMeshes[i];
        if (mesh.metadata && mesh.metadata.isWater && mesh.material && mesh.material.setFloat) {
            mesh.material.setFloat('uTime', waterTime);
        }
        // Bobbing animations for floating crystals
        if (mesh.metadata && mesh.metadata.bob) {
            var m = mesh.metadata;
            mesh.position.y += Math.sin(waterTime * m.bobSpd + m.bobOff) * 0.005;
            mesh.rotation.y += m.rotSpd * 0.01;
        }
    }
}
