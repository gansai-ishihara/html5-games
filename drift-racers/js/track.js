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
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return new BABYLON.Color3(h2r(p, q, h + 1/3), h2r(p, q, h), h2r(p, q, h - 1/3));
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

// === TEXTURES ===

function createAsphaltTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    var ctx = canvas.getContext('2d');
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

    var tex = texFromCanvas('asphalt', canvas);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = 40;
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
    mat.bumpTexture.level = 0.15;
    mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.4);
    mat.specularPower = 32;

    var trackMesh = createCustomMesh('trackSurface', positions, indices, uvs, null, sc);
    trackMesh.material = mat;
    trackMeshes.push(trackMesh);

    buildRoadWalls(sc);
    buildCurbs(sc);
    buildStartFinish(sc);
}

// === ROAD WALLS ===

function buildRoadWalls(sc) {
    var halfWidth = TRACK_WIDTH / 2 + 1.2;
    var wallDepth = 3.0;

    var wallMat = new BABYLON.StandardMaterial('wallMat', scene);
    wallMat.diffuseColor = c3(0x332244);
    wallMat.specularColor = BABYLON.Color3.Black();

    var undersideMat = new BABYLON.StandardMaterial('underMat', scene);
    undersideMat.diffuseColor = c3(0x221133);
    undersideMat.specularColor = BABYLON.Color3.Black();
    undersideMat.backFaceCulling = false;

    // Left and right walls
    for (var side = -1; side <= 1; side += 2) {
        var wv = [], wi = [];
        for (var i = 0; i < trackNodes.length; i++) {
            var node = trackNodes[i];
            var angle = getTrackAngle(i);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);
            var ex = node.x + perpX * halfWidth * side;
            var ez = node.z + perpZ * halfWidth * side;
            wv.push(ex, node.y, ez);
            wv.push(ex, node.y - wallDepth, ez);
        }
        for (var i = 0; i < trackNodes.length; i++) {
            var next = (i + 1) % trackNodes.length;
            var i0 = i * 2, i1 = i * 2 + 1, n0 = next * 2, n1 = next * 2 + 1;
            if (side === 1) { wi.push(i0, n0, i1); wi.push(i1, n0, n1); }
            else { wi.push(i0, i1, n0); wi.push(i1, n1, n0); }
        }
        var wm = createCustomMesh('wall' + side, wv, wi, null, null, sc);
        wm.material = wallMat;
        trackMeshes.push(wm);
    }

    // Underside
    var uv = [], uu = [], ui = [];
    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);
        uv.push(node.x + perpX * halfWidth, node.y - wallDepth, node.z + perpZ * halfWidth);
        uv.push(node.x - perpX * halfWidth, node.y - wallDepth, node.z - perpZ * halfWidth);
        var v = i / trackNodes.length;
        uu.push(0, v, 1, v);
    }
    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 2, i1 = i * 2 + 1, n0 = next * 2, n1 = next * 2 + 1;
        ui.push(i0, i1, n0); ui.push(i1, n1, n0);
    }
    var um = createCustomMesh('underside', uv, ui, uu, null, sc);
    um.material = undersideMat;
    trackMeshes.push(um);

    // Glowing edge strips
    var edgeColors = [0x4488DD, 0x8866BB];
    for (var side = -1; side <= 1; side += 2) {
        var ev = [], ei = [];
        var edgeWidth = 0.3;
        for (var i = 0; i < trackNodes.length; i++) {
            var node = trackNodes[i];
            var angle = getTrackAngle(i);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);
            var ex = node.x + perpX * halfWidth * side;
            var ez = node.z + perpZ * halfWidth * side;
            ev.push(ex - perpX * edgeWidth * side, node.y + 0.05, ez - perpZ * edgeWidth * side);
            ev.push(ex + perpX * edgeWidth * side, node.y + 0.05, ez + perpZ * edgeWidth * side);
        }
        for (var i = 0; i < trackNodes.length; i++) {
            var next = (i + 1) % trackNodes.length;
            var i0 = i * 2, i1 = i * 2 + 1, n0 = next * 2, n1 = next * 2 + 1;
            ei.push(i0, n0, i1); ei.push(i1, n0, n1);
        }
        var eColor = side === -1 ? edgeColors[0] : edgeColors[1];
        var eMat = new BABYLON.StandardMaterial(tn(), scene);
        eMat.diffuseColor = c3(eColor);
        eMat.emissiveColor = c3(eColor).scale(0.8);
        eMat.specularColor = c3(eColor).scale(0.5);
        eMat.specularPower = 16;
        eMat.alpha = 0.9;
        var em = createCustomMesh('edge' + side, ev, ei, null, null, sc);
        em.material = eMat;
        trackMeshes.push(em);
    }
}

// === CURBS ===

function buildCurbs(sc) {
    var curbHeight = 0.3;
    var curbWidth = 1.2;
    var halfWidth = TRACK_WIDTH / 2;

    var curbTex = createCurbTexture();
    var curbMat = new BABYLON.StandardMaterial('curbMat', scene);
    curbMat.diffuseTexture = curbTex;
    curbMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
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
            case 'forest': return { pri: 0x4488DD, sec: 0x66AAEE, em: 0x2266AA, bush: 0x2A6644, lamp: 0x4488DD };
            case 'castle': return { pri: 0xFFCC66, sec: 0xFFDDAA, em: 0xCC9933, bush: 0x3A7744, lamp: 0xFFCC66 };
            case 'lake': return { pri: 0xE8EEFF, sec: 0xAABBDD, em: 0x6688CC, bush: 0x2A5544, lamp: 0x88AADD };
            case 'mountain': return { pri: 0x8866BB, sec: 0xAA88DD, em: 0x5533AA, bush: 0x335533, lamp: 0x8866BB };
            case 'garden': return { pri: 0xDDA0BB, sec: 0x9988CC, em: 0xAA6688, bush: 0x3A8855, lamp: 0xFFCC66 };
            default: return { pri: 0x4488DD, sec: 0x6699CC, em: 0x224488, bush: 0x3A7744, lamp: 0x4488DD };
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
        callback(px, py, pz, angle, node);
    }

    // === SMALL DETAIL HELPERS ===

    function createCrystalShard(sc, x, y, z, color) {
        var h = 1.5 + Math.random() * 1.5;
        var mat = smat(color, color, 0.4, 0.85);
        var s = mkCyl({ diameterTop: 0, diameterBottom: (0.35 + Math.random() * 0.2) * 2, height: h, tessellation: 5 }, mat);
        s.position.copyFromFloats(x, y + h * 0.4, z);
        s.rotation.z = (Math.random() - 0.5) * 0.3;
        s.rotation.y = Math.random() * Math.PI;
        var h2 = h * 0.6;
        var s2 = mkCyl({ diameterTop: 0, diameterBottom: (0.2 + Math.random() * 0.15) * 2, height: h2, tessellation: 5 }, mat);
        s2.position.copyFromFloats(x + (Math.random() - 0.5) * 0.8, y + h2 * 0.35, z + (Math.random() - 0.5) * 0.8);
        s2.rotation.copyFromFloats(0.2 + Math.random() * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
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
        var mat = new BABYLON.StandardMaterial(tn(), scene);
        mat.diffuseColor = c3(color);
        mat.emissiveColor = c3(emColor).scale(0.55);
        mat.specularColor = c3(color).scale(0.4);
        mat.specularPower = 16;
        mat.alpha = 0.85;
        var c1 = mkCyl({ diameterTop: 0, diameterBottom: size * 0.8, height: size, tessellation: 6 }, mat);
        c1.position.copyFromFloats(x, y + size / 2, z);
        c1.rotation.copyFromFloats(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
        var c2 = mkCyl({ diameterTop: 0, diameterBottom: size * 0.5, height: size * 0.6, tessellation: 6 }, mat);
        c2.position.copyFromFloats(x + (Math.random() - 0.5) * size, y + size * 0.3, z + (Math.random() - 0.5) * size);
        c2.rotation.copyFromFloats(Math.random() * 0.5, Math.random() * Math.PI, 0.2 + Math.random() * 0.3);
    }

    function createFloatingOrb(sc, x, y, z, color, size) {
        var orb = mkSph({ diameter: size * 2, segments: 6 }, umat(color, 0.7));
        orb.position.copyFromFloats(x, y, z);
        var glow = mkSph({ diameter: size * 6, segments: 6 }, umat(color, 0.08));
        glow.position.copyFromFloats(x, y, z);
    }

    function createLampPost(sc, x, y, z, color) {
        var pole = mkCyl({ diameterTop: 0.3, diameterBottom: 0.4, height: 5, tessellation: 6 }, smat(0x8899AA));
        pole.position.copyFromFloats(x, y + 2.5, z);
        var orb = mkSph({ diameter: 1.2, segments: 8 }, umat(color, 0.9));
        orb.position.copyFromFloats(x, y + 5.3, z);
        var glow = mkSph({ diameter: 3.6, segments: 8 }, umat(color, 0.12));
        glow.position.copyFromFloats(x, y + 5.3, z);
    }

    function createFlowerCluster(sc, x, y, z, color1, color2) {
        var numFlowers = 3 + Math.floor(Math.random() * 3);
        for (var f = 0; f < numFlowers; f++) {
            var fc = (f % 2 === 0) ? color1 : color2;
            var flower = mkSph({ diameter: (0.2 + Math.random() * 0.2) * 2, segments: 5 }, smat(fc, fc, 0.15));
            flower.position.copyFromFloats(x + (Math.random() - 0.5) * 1.8, y + 0.15, z + (Math.random() - 0.5) * 1.8);
        }
        var leaf = mkCyl({ diameterTop: 1.8, diameterBottom: 2.2, height: 0.1, tessellation: 6 }, smat(0x3A8855));
        leaf.position.copyFromFloats(x, y + 0.05, z);
    }

    // === Guardrails ===
    buildGuardrails(sc);

    // === CRYSTAL ARCH GATES ===
    var archNodes = [10, 20, 30, 42, 52, 62, 72, 82, 92];
    for (var ai = 0; ai < archNodes.length; ai++) {
        var aIdx = archNodes[ai];
        var aNode = trackNodes[aIdx];
        var aAngle = getTrackAngle(aIdx);
        var aPerpX = -Math.sin(aAngle);
        var aPerpZ = Math.cos(aAngle);
        var aZC = getZoneColors(getZone(aIdx));
        var archW = TRACK_WIDTH + 4;
        var archH = 10;
        var pillarMat = smat(aZC.pri, aZC.em, 0.3, 0.85);
        var lpg = mkCyl({ diameterTop: 1.0, diameterBottom: 1.3, height: archH, tessellation: 6 }, pillarMat);
        lpg.position.copyFromFloats(aNode.x + aPerpX * archW / 2, aNode.y + archH / 2, aNode.z + aPerpZ * archW / 2);
        var rpg = mkCyl({ diameterTop: 1.0, diameterBottom: 1.3, height: archH, tessellation: 6 }, pillarMat);
        rpg.position.copyFromFloats(aNode.x - aPerpX * archW / 2, aNode.y + archH / 2, aNode.z - aPerpZ * archW / 2);
        var beamMat = smat(aZC.sec, aZC.pri, 0.4, 0.8);
        var beam = mkBox({ width: archW, height: 0.8, depth: 0.6 }, beamMat);
        beam.position.copyFromFloats(aNode.x, aNode.y + archH, aNode.z);
        beam.rotation.y = -aAngle + Math.PI / 2;
        var gemMat = smat(aZC.pri, aZC.pri, 0.6, 0.9);
        var gem = mkPoly({ type: 1, size: 0.8 }, gemMat);
        gem.position.copyFromFloats(aNode.x, aNode.y + archH + 0.8, aNode.z);
    }

    // === CRYSTAL FENCE ===
    for (var fi = 0; fi < TRACK_POINTS; fi += 2) {
        var fNode = trackNodes[fi];
        var fAngle = getTrackAngle(fi);
        var fPerpX = -Math.sin(fAngle);
        var fPerpZ = Math.cos(fAngle);
        var fZC = getZoneColors(getZone(fi));
        var fDist = HW + 4;
        var fenceH = 1.2;
        for (var fSide = -1; fSide <= 1; fSide += 2) {
            var fx = fNode.x + fPerpX * fSide * fDist;
            var fz = fNode.z + fPerpZ * fSide * fDist;
            var fp = mkBox({ width: 0.3, height: fenceH, depth: 0.3 }, smat(fZC.pri, fZC.em, 0.25, 0.7));
            fp.position.copyFromFloats(fx, fNode.y + fenceH / 2, fz);
            if (fi % 4 === 0) {
                var cap = mkSph({ diameter: 0.5, segments: 6 }, umat(fZC.pri, 0.8));
                cap.position.copyFromFloats(fx, fNode.y + fenceH + 0.2, fz);
            }
        }
    }

    // === GROUND ZONE TILES ===
    for (var gi = 0; gi < TRACK_POINTS; gi += 3) {
        var gNode = trackNodes[gi];
        var gAngle = getTrackAngle(gi);
        var gPerpX = -Math.sin(gAngle);
        var gPerpZ = Math.cos(gAngle);
        var gZone = getZone(gi);
        for (var gSide = -1; gSide <= 1; gSide += 2) {
            var tileW = 12;
            var tileDist = HW + 3 + tileW / 2;
            var tx = gNode.x + gPerpX * gSide * tileDist;
            var tz = gNode.z + gPerpZ * gSide * tileDist;
            var tileColor;
            switch (gZone) {
                case 'forest': tileColor = 0x1A5533; break;
                case 'castle': tileColor = 0x887766; break;
                case 'lake': tileColor = 0x334466; break;
                case 'mountain': tileColor = 0x554455; break;
                case 'garden': tileColor = 0x557744; break;
                default: tileColor = 0x336644; break;
            }
            var tile = mkGnd({ width: tileW, height: 8 }, smat(tileColor));
            tile.rotation.y = -gAngle;
            tile.position.copyFromFloats(tx, gNode.y - 1.8, tz);
        }
    }

    // === CRYSTAL STALAGMITE CLUSTERS ===
    for (var si = 0; si < TRACK_POINTS; si += 4) {
        var sZone = getZone(si);
        var sZC = getZoneColors(sZone);
        var sSide = ((si / 4 | 0) % 2 === 0) ? 1 : -1;
        placeAtTrack(si, sSide, HW + 8 + (si % 5) * 2, function (px, py, pz) {
            var count = 5 + (si % 4);
            for (var ci = 0; ci < count; ci++) {
                var ch = 1.5 + Math.random() * 4;
                var cr = 0.15 + Math.random() * 0.25;
                var stal = mkCyl(
                    { diameterTop: 0, diameterBottom: cr * 2, height: ch, tessellation: 5 },
                    smat(sZC.pri, sZC.em, 0.3, 0.8)
                );
                stal.position.copyFromFloats(px + (Math.random() - 0.5) * 3, py + ch / 2, pz + (Math.random() - 0.5) * 3);
                stal.rotation.z = (Math.random() - 0.5) * 0.2;
            }
        });
    }

    // === FLOATING CRYSTAL ISLANDS ===
    var islandPositions = [
        { x: 150, z: 200, y: 35, s: 20 }, { x: -200, z: 100, y: 45, s: 25 },
        { x: 100, z: -250, y: 40, s: 18 }, { x: -150, z: -200, y: 50, s: 22 },
        { x: 250, z: -100, y: 38, s: 15 }
    ];
    for (var ii = 0; ii < islandPositions.length; ii++) {
        var ip = islandPositions[ii];
        var plat = mkCyl(
            { diameterTop: ip.s * 1.2, diameterBottom: ip.s * 0.6, height: ip.s * 0.3, tessellation: 8 },
            smat(0x6677AA, 0x334466, 0.2)
        );
        plat.position.copyFromFloats(ip.x, ip.y, ip.z);
        for (var ci = 0; ci < 4; ci++) {
            var cH = ip.s * 0.3 + Math.random() * ip.s * 0.4;
            var cR = ip.s * 0.05 + Math.random() * ip.s * 0.05;
            var cr = mkCyl(
                { diameterTop: 0, diameterBottom: cR * 2, height: cH, tessellation: 5 },
                smat(0x6699FF, 0x4477DD, 0.4, 0.85)
            );
            cr.position.copyFromFloats(
                ip.x + (Math.random() - 0.5) * ip.s * 0.5,
                ip.y + ip.s * 0.15 + cH / 2,
                ip.z + (Math.random() - 0.5) * ip.s * 0.5
            );
            cr.rotation.z = (Math.random() - 0.5) * 0.3;
        }
    }

    // === ROCKY SPIRES ===
    for (var ri = 0; ri < TRACK_POINTS; ri += 8) {
        var rSide = ((ri / 8 | 0) % 2 === 0) ? 1 : -1;
        placeAtTrack(ri, rSide, 25 + (ri % 6) * 4, function (px, py, pz) {
            var spireH = 8 + Math.random() * 12;
            var spireR = 1.5 + Math.random() * 2;
            var spire = mkCyl(
                { diameterTop: 0, diameterBottom: spireR * 2, height: spireH, tessellation: 6 },
                smat(hslC3(0.6 + Math.random() * 0.1, 0.3, 0.35))
            );
            spire.position.copyFromFloats(px, py + spireH / 2, pz);
            spire.scaling.copyFromFloats(0.7 + Math.random() * 0.6, 1, 0.7 + Math.random() * 0.6);
        });
    }

    // === MAIN DECORATION LOOP ===
    for (var i = 0; i < TRACK_POINTS; i++) {
        var zone = getZone(i);
        var zc = getZoneColors(zone);

        // LAYER 1: NEAR
        placeAtTrack(i, 1, HW + 1.5 + (i % 3) * 0.4, function (px, py, pz) {
            createCrystalShard(sc, px, py, pz, zc.pri);
        });
        if (i % 2 === 0) {
            placeAtTrack(i, -1, HW + 1.5 + ((i + 1) % 3) * 0.4, function (px, py, pz) {
                createCrystalShard(sc, px, py, pz, zc.pri);
            });
        }
        if (i % 2 === 0) {
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 3 + (i % 3), function (px, py, pz) {
                createBush(sc, px, py, pz, zc.bush);
            });
        }
        if (i % 3 === 0) {
            placeAtTrack(i, (i % 6 < 3) ? 1 : -1, HW + 2.5, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, zc.pri, zc.sec);
            });
        }
        if (i % 5 === 0) {
            placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 4 + (i % 3), function (px, py, pz) {
                createRock(sc, px, py, pz);
            });
        }
        if (i % 5 === 0) {
            placeAtTrack(i, (i % 10 < 5) ? 1 : -1, HW + 2.5, function (px, py, pz, a, nd) {
                if (useGLB && envModelCache['lamp']) {
                    placeEnvModel(sc, 'lamp', px, nd.y, pz, 8, a + Math.PI / 2);
                } else {
                    createLampPost(sc, px, nd.y, pz, zc.lamp);
                }
            });
        }

        // LAYER 2: MID
        if (i % 2 === 0) {
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 10 + (i % 5) * 2, function (px, py, pz) {
                createBush(sc, px, py, pz, zc.bush);
            });
        }
        if (i % 3 === 0) {
            placeAtTrack(i, (i % 2 === 0) ? -1 : 1, HW + 12 + (i % 4) * 3, function (px, py, pz) {
                createRock(sc, px, py, pz);
            });
        }
        if (i % 4 === 0) {
            placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 9 + (i % 3) * 3, function (px, py, pz) {
                createFlowerCluster(sc, px, py, pz, zc.sec, 0xFFFFFF);
            });
        }
        if (i % 4 === 0) {
            placeAtTrack(i, (i % 2 ? 1 : -1), HW + 2, function (px, py, pz, a, nd) {
                createFloatingOrb(sc, px, nd.y + 4 + (i % 4), pz, zc.pri, 0.2);
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
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 2 ? 1 : -1), HW + 5 + (i % 4) * 3, function (px, py, pz, a, nd) {
                    createFloatingOrb(sc, px, nd.y + 3 + (i % 4), pz, 0x4488DD, 0.25);
                });
            }
            if ((i === 8 || i === 14 || i === 20) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 35 + (i % 3) * 4, function (px, py, pz) {
                    placeEnvModel(sc, 'obelisk', px, py, pz, 10, i * 0.9);
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
                placeAtTrack(i, (i === 30) ? -1 : 1, 55, function (px, py, pz) {
                    if (useGLB && envModelCache['castle']) placeEnvModel(sc, 'castle', px, py, pz, 25, i * 0.5);
                    else createBuilding(sc, px, py, pz);
                });
            }
            if (i === 27 || i === 31 || i === 33 || i === 36 || i === 38 || i === 43) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 45, function (px, py, pz) {
                    if (useGLB && envModelCache['house-a']) placeEnvModel(sc, 'house-a', px, py, pz, 16, i * 1.05);
                    else createBuilding(sc, px, py, pz);
                });
            }
            if (i === 35) {
                placeAtTrack(i, 1, 38, function (px, py, pz) {
                    if (useGLB && envModelCache['fountain']) placeEnvModel(sc, 'fountain', px, py, pz, 12, 0);
                });
            }
            if (i === 28 || i === 42) {
                placeAtTrack(i, (i === 28) ? 1 : -1, 42, function (px, py, pz) {
                    if (useGLB && envModelCache['archgate']) placeEnvModel(sc, 'archgate', px, py, pz, 16, i * 0.06);
                });
            }
            if ((i === 26 || i === 29 || i === 32 || i === 37 || i === 41 || i === 44) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 6, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 10, i * 1.2);
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
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 4 + (i % 5) * 2, function (px, py, pz, a, nd) {
                    createFloatingOrb(sc, px, nd.y + 2 + (i % 5), pz, 0xE8EEFF, 0.22 + (i % 3) * 0.06);
                });
            }
            if ((i === 48 || i === 55 || i === 62) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? -1 : 1, 35 + (i % 3) * 5, function (px, py, pz) {
                    placeEnvModel(sc, 'obelisk', px, py, pz, 10, i * 0.75);
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
            if (i === 90 || i === 98) {
                placeAtTrack(i, (i === 90) ? -1 : 1, 42, function (px, py, pz) {
                    if (useGLB && envModelCache['archgate']) placeEnvModel(sc, 'archgate', px, py, pz, 18, i * 0.06);
                });
            }
            if ((i === 86 || i === 89 || i === 93 || i === 96 || i === 0 || i === 3) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 5, function (px, py, pz) {
                    placeEnvModel(sc, 'flowerbed', px, py, pz, 10, i * 1.1);
                });
            }
        }
    }

    // === Background mountains ===
    var mountainPositions = [
        { x: 450, z: 450 }, { x: -450, z: 450 }, { x: 450, z: -450 }, { x: -450, z: -450 },
        { x: 0, z: 550 }, { x: 550, z: 0 }, { x: -550, z: 0 }, { x: 0, z: -550 },
        { x: 350, z: 550 }, { x: -350, z: -550 }, { x: 550, z: 350 }, { x: -550, z: -350 }
    ];
    for (var mi = 0; mi < mountainPositions.length; mi++) {
        var mp = mountainPositions[mi];
        var mScale = 45 + mi * 3;
        if (useGLB && envModelCache['mountain']) {
            placeEnvModel(sc, 'mountain', mp.x, -2, mp.z, mScale, mi * 0.79);
        } else {
            var mH = 70 + Math.random() * 50;
            var mR = 50 + Math.random() * 35;
            var mMesh = mkCyl(
                { diameterTop: 0, diameterBottom: mR * 2, height: mH, tessellation: 8 },
                smat(hslC3(0.6, 0.3, 0.4))
            );
            mMesh.position.copyFromFloats(mp.x, mH / 2, mp.z);
        }
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
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float ripple1 = sin(vUv.x * 20.0 + uTime * 2.0) * 0.5 + 0.5;',
        '  float ripple2 = sin(vUv.y * 15.0 - uTime * 1.5) * 0.5 + 0.5;',
        '  float ripple3 = sin((vUv.x + vUv.y) * 12.0 + uTime * 1.2) * 0.5 + 0.5;',
        '  float ripple = ripple1 * ripple2 * 0.7 + ripple3 * 0.3;',
        '  vec3 baseColor = mix(uDeepColor, uWaterColor, ripple * 0.45 + 0.3);',
        '  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0))), 3.0);',
        '  vec3 skyReflect = vec3(0.35, 0.4, 0.55);',
        '  vec3 highlight = mix(vec3(0.6, 0.65, 0.8), skyReflect, fresnel) * fresnel * 0.7;',
        '  float sparkle = pow(max(0.0, sin(vUv.x * 40.0 + uTime * 3.0) * sin(vUv.y * 35.0 - uTime * 2.5)), 12.0) * 0.6;',
        '  float sparkle2 = pow(max(0.0, sin(vUv.x * 55.0 - uTime * 4.0) * sin(vUv.y * 50.0 + uTime * 3.5)), 16.0) * 0.3;',
        '  vec3 finalColor = baseColor + highlight + vec3(sparkle + sparkle2);',
        '  float edgeFade = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));',
        '  gl_FragColor = vec4(finalColor, 0.75 * edgeFade);',
        '}'
    ].join('\n');

    BABYLON.Effect.ShadersStore['waterVertexShader'] = waterVS;
    BABYLON.Effect.ShadersStore['waterFragmentShader'] = waterFS;

    var waterPositions = [
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
            needAlphaBlending: true
        });
        waterMat.setFloat('uTime', 0);
        waterMat.setColor3('uWaterColor', c3(0x4477CC));
        waterMat.setColor3('uDeepColor', c3(0x1A2E4A));
        waterMat.backFaceCulling = false;

        var water = BABYLON.MeshBuilder.CreateGround('water' + wi, {
            width: wp.w, height: wp.h, subdivisions: 32
        }, scene);
        water.position.copyFromFloats(wp.x, -1.5, wp.z);
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
    }
}
