// Track Generation Module for Drift Racers
// Mario Kart-style 3D racing track with Three.js r128

var trackNodes = [];
var trackMeshes = [];

// Generate track centerline points with smooth curves and elevation
function generateTrack() {
    trackNodes = [];
    for (var i = 0; i < TRACK_POINTS; i++) {
        var t = (i / TRACK_POINTS) * Math.PI * 2;

        // Complex radius formula for interesting curves
        var r = 280 + 80 * Math.sin(t * 2) + 50 * Math.cos(t * 3) + 30 * Math.sin(t * 5 + 1);

        // Height variation for elevation changes (min=1, max=7, ground at y=-2)
        var y = 4 + 2 * Math.sin(t * 3) + 1 * Math.cos(t * 2 + 0.5);

        var x = r * Math.cos(t);
        var z = r * Math.sin(t);

        trackNodes.push({ x: x, y: y, z: z });
    }
}

// Get track node at index (with wrapping)
function getTrackPoint(i) {
    var idx = ((i % TRACK_POINTS) + TRACK_POINTS) % TRACK_POINTS;
    return trackNodes[idx];
}

// Get angle between point i and i+1
function getTrackAngle(i) {
    var p1 = getTrackPoint(i);
    var p2 = getTrackPoint(i + 1);
    return Math.atan2(p2.z - p1.z, p2.x - p1.x);
}

// Get normalized direction vector from point i to i+1
function getTrackDir(i) {
    var p1 = getTrackPoint(i);
    var p2 = getTrackPoint(i + 1);
    var dx = p2.x - p1.x;
    var dz = p2.z - p1.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    return { x: dx / len, z: dz / len };
}

// Find nearest track point index to world position
function nearestTrackIndex(wx, wz) {
    var minDist = Infinity;
    var nearestIdx = 0;

    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var dx = node.x - wx;
        var dz = node.z - wz;
        var dist = dx * dx + dz * dz;

        if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
        }
    }

    return nearestIdx;
}

// Distance from world position to nearest track point
function trackDist(wx, wz) {
    var idx = nearestTrackIndex(wx, wz);
    var node = trackNodes[idx];
    var dx = node.x - wx;
    var dz = node.z - wz;
    return Math.sqrt(dx * dx + dz * dz);
}

// Create road texture - bright base with neon lane markings
function createAsphaltTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    var ctx = canvas.getContext('2d');

    // Crystal white base
    ctx.fillStyle = '#DDE5F0';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle sparkle dots
    for (var i = 0; i < 200; i++) {
        var sx = Math.random() * 512;
        var sy = Math.random() * 512;
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.fillStyle = ['#CCddFF','#E8EEFF','#BBCCEE'][Math.floor(Math.random() * 3)];
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Left edge - sapphire blue line
    ctx.fillStyle = '#4488DD';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#4488DD';
    ctx.fillRect(8, 0, 5, 512);
    ctx.shadowBlur = 0;

    // Right edge - amethyst line
    ctx.fillStyle = '#8866BB';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#8866BB';
    ctx.fillRect(499, 0, 5, 512);
    ctx.shadowBlur = 0;

    // Center dashed line
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 20]);
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();
    ctx.setLineDash([]);

    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 20);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
}

// Build the main track surface mesh
function buildTrackMesh(scene) {
    var geometry = new THREE.BufferGeometry();
    var vertices = [];
    var uvs = [];
    var indices = [];

    var halfWidth = TRACK_WIDTH / 2;

    // Generate vertices along track
    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);

        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);

        // Left edge
        vertices.push(
            node.x + perpX * halfWidth,
            node.y,
            node.z + perpZ * halfWidth
        );

        // Right edge
        vertices.push(
            node.x - perpX * halfWidth,
            node.y,
            node.z - perpZ * halfWidth
        );

        var v = i / trackNodes.length;
        uvs.push(0, v);
        uvs.push(1, v);
    }

    // Generate triangles
    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 2;
        var i1 = i * 2 + 1;
        var i2 = next * 2;
        var i3 = next * 2 + 1;

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    var asphaltTexture = createAsphaltTexture();
    var material = new THREE.MeshLambertMaterial({
        map: asphaltTexture,
        color: 0x99AACC,
        emissive: 0x1A2244,
        emissiveIntensity: 0.1
    });

    var trackMesh = new THREE.Mesh(geometry, material);
    trackMesh.receiveShadow = false;
    scene.add(trackMesh);
    trackMeshes.push(trackMesh);

    // === Road thickness: side walls and underside ===
    buildRoadWalls(scene);

    buildCurbs(scene);
    buildStartFinish(scene);
}

// Build side walls to give the road thickness (like a bridge/elevated highway)
function buildRoadWalls(scene) {
    var halfWidth = TRACK_WIDTH / 2 + 1.2; // Include curb width
    var wallDepth = 3.0; // How thick the road slab is

    var wallMat = new THREE.MeshLambertMaterial({
        color: 0x554466,
        emissive: 0x221133,
        emissiveIntensity: 0.15
    });

    var undersideMat = new THREE.MeshLambertMaterial({
        color: 0x443355,
        emissive: 0x110022,
        emissiveIntensity: 0.1,
        side: THREE.BackSide
    });

    // Left wall, right wall, and underside
    for (var side = -1; side <= 1; side += 2) {
        var wallVertices = [];
        var wallIndices = [];

        for (var i = 0; i < trackNodes.length; i++) {
            var node = trackNodes[i];
            var angle = getTrackAngle(i);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);

            var edgeX = node.x + perpX * halfWidth * side;
            var edgeZ = node.z + perpZ * halfWidth * side;

            // Top vertex (road surface level)
            wallVertices.push(edgeX, node.y, edgeZ);
            // Bottom vertex (below road)
            wallVertices.push(edgeX, node.y - wallDepth, edgeZ);
        }

        for (var i = 0; i < trackNodes.length; i++) {
            var next = (i + 1) % trackNodes.length;
            var i0 = i * 2;
            var i1 = i * 2 + 1;
            var n0 = next * 2;
            var n1 = next * 2 + 1;

            if (side === 1) {
                wallIndices.push(i0, n0, i1);
                wallIndices.push(i1, n0, n1);
            } else {
                wallIndices.push(i0, i1, n0);
                wallIndices.push(i1, n1, n0);
            }
        }

        var wallGeom = new THREE.BufferGeometry();
        wallGeom.setAttribute('position', new THREE.Float32BufferAttribute(wallVertices, 3));
        wallGeom.setIndex(wallIndices);
        wallGeom.computeVertexNormals();

        var wallMesh = new THREE.Mesh(wallGeom, wallMat);
        scene.add(wallMesh);
        trackMeshes.push(wallMesh);
    }

    // Underside of road (visible from below)
    var underVertices = [];
    var underUvs = [];
    var underIndices = [];

    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);

        underVertices.push(
            node.x + perpX * halfWidth, node.y - wallDepth, node.z + perpZ * halfWidth,
            node.x - perpX * halfWidth, node.y - wallDepth, node.z - perpZ * halfWidth
        );
        var v = i / trackNodes.length;
        underUvs.push(0, v, 1, v);
    }

    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 2, i1 = i * 2 + 1;
        var n0 = next * 2, n1 = next * 2 + 1;
        underIndices.push(i0, i1, n0);
        underIndices.push(i1, n1, n0);
    }

    var underGeom = new THREE.BufferGeometry();
    underGeom.setAttribute('position', new THREE.Float32BufferAttribute(underVertices, 3));
    underGeom.setAttribute('uv', new THREE.Float32BufferAttribute(underUvs, 2));
    underGeom.setIndex(underIndices);
    underGeom.computeVertexNormals();

    var underMesh = new THREE.Mesh(underGeom, undersideMat);
    scene.add(underMesh);
    trackMeshes.push(underMesh);

    // Glowing edge strips on top of side walls (sapphire/amethyst trim)
    var edgeColors = [0x4488DD, 0x8866BB];
    for (var side = -1; side <= 1; side += 2) {
        var edgeVertices = [];
        var edgeIndices = [];
        var edgeWidth = 0.3;

        for (var i = 0; i < trackNodes.length; i++) {
            var node = trackNodes[i];
            var angle = getTrackAngle(i);
            var perpX = -Math.sin(angle);
            var perpZ = Math.cos(angle);

            var ex = node.x + perpX * halfWidth * side;
            var ez = node.z + perpZ * halfWidth * side;

            edgeVertices.push(
                ex - perpX * edgeWidth * side, node.y + 0.05, ez - perpZ * edgeWidth * side,
                ex + perpX * edgeWidth * side, node.y + 0.05, ez + perpZ * edgeWidth * side
            );
        }

        for (var i = 0; i < trackNodes.length; i++) {
            var next = (i + 1) % trackNodes.length;
            var i0 = i * 2, i1 = i * 2 + 1;
            var n0 = next * 2, n1 = next * 2 + 1;
            edgeIndices.push(i0, n0, i1);
            edgeIndices.push(i1, n0, n1);
        }

        var edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgeVertices, 3));
        edgeGeom.setIndex(edgeIndices);
        edgeGeom.computeVertexNormals();

        var eColor = side === -1 ? edgeColors[0] : edgeColors[1];
        var edgeMat = new THREE.MeshLambertMaterial({
            color: eColor,
            emissive: eColor,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.85
        });

        var edgeMesh = new THREE.Mesh(edgeGeom, edgeMat);
        scene.add(edgeMesh);
        trackMeshes.push(edgeMesh);
    }
}

// Create clean red/white alternating curb texture (classic racing style)
function createCurbTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');

    // Sapphire blue and white alternating diagonal stripes
    var stripeWidth = 16;
    for (var i = 0; i < 8; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#4488DD' : '#FFFFFF';
        ctx.fillRect(0, i * stripeWidth, 128, stripeWidth);
    }

    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.encoding = THREE.sRGBEncoding;

    return texture;
}

// Build red/white alternating curbs on both sides of track
function buildCurbs(scene) {
    var curbHeight = 0.3;
    var curbWidth = 1.2;
    var halfWidth = TRACK_WIDTH / 2;

    var curbTexture = createCurbTexture();
    var curbMaterial = new THREE.MeshLambertMaterial({
        map: curbTexture
    });

    // Left curb
    var leftGeometry = new THREE.BufferGeometry();
    var leftVertices = [];
    var leftUvs = [];
    var leftIndices = [];

    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);

        var baseX = node.x + perpX * (halfWidth + curbWidth / 2);
        var baseZ = node.z + perpZ * (halfWidth + curbWidth / 2);

        // Bottom vertices
        leftVertices.push(baseX - perpX * curbWidth / 2, node.y, baseZ - perpZ * curbWidth / 2);
        leftVertices.push(baseX + perpX * curbWidth / 2, node.y, baseZ + perpZ * curbWidth / 2);

        // Top vertices
        leftVertices.push(baseX - perpX * curbWidth / 2, node.y + curbHeight, baseZ - perpZ * curbWidth / 2);
        leftVertices.push(baseX + perpX * curbWidth / 2, node.y + curbHeight, baseZ + perpZ * curbWidth / 2);

        var v = i / trackNodes.length;
        leftUvs.push(0, v, 1, v, 0, v, 1, v);
    }

    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 4;
        var i1 = i * 4 + 1;
        var i2 = i * 4 + 2;
        var i3 = i * 4 + 3;
        var n0 = next * 4;
        var n1 = next * 4 + 1;
        var n2 = next * 4 + 2;
        var n3 = next * 4 + 3;

        // Top face
        leftIndices.push(i2, n2, i3);
        leftIndices.push(i3, n2, n3);
        // Outer face
        leftIndices.push(i0, n0, i2);
        leftIndices.push(i2, n0, n2);
    }

    leftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leftVertices, 3));
    leftGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(leftUvs, 2));
    leftGeometry.setIndex(leftIndices);
    leftGeometry.computeVertexNormals();

    var leftCurb = new THREE.Mesh(leftGeometry, curbMaterial);
    leftCurb.receiveShadow = false;
    scene.add(leftCurb);
    trackMeshes.push(leftCurb);

    // Right curb (mirror of left)
    var rightGeometry = new THREE.BufferGeometry();
    var rightVertices = [];
    var rightUvs = [];
    var rightIndices = [];

    for (var i = 0; i < trackNodes.length; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var perpX = -Math.sin(angle);
        var perpZ = Math.cos(angle);

        var baseX = node.x - perpX * (halfWidth + curbWidth / 2);
        var baseZ = node.z - perpZ * (halfWidth + curbWidth / 2);

        rightVertices.push(baseX - perpX * curbWidth / 2, node.y, baseZ - perpZ * curbWidth / 2);
        rightVertices.push(baseX + perpX * curbWidth / 2, node.y, baseZ + perpZ * curbWidth / 2);
        rightVertices.push(baseX - perpX * curbWidth / 2, node.y + curbHeight, baseZ - perpZ * curbWidth / 2);
        rightVertices.push(baseX + perpX * curbWidth / 2, node.y + curbHeight, baseZ + perpZ * curbWidth / 2);

        var v = i / trackNodes.length;
        rightUvs.push(0, v, 1, v, 0, v, 1, v);
    }

    for (var i = 0; i < trackNodes.length; i++) {
        var next = (i + 1) % trackNodes.length;
        var i0 = i * 4;
        var i1 = i * 4 + 1;
        var i2 = i * 4 + 2;
        var i3 = i * 4 + 3;
        var n0 = next * 4;
        var n1 = next * 4 + 1;
        var n2 = next * 4 + 2;
        var n3 = next * 4 + 3;

        rightIndices.push(i2, n2, i3);
        rightIndices.push(i3, n2, n3);
        rightIndices.push(i1, n1, i3);
        rightIndices.push(i3, n1, n3);
    }

    rightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rightVertices, 3));
    rightGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(rightUvs, 2));
    rightGeometry.setIndex(rightIndices);
    rightGeometry.computeVertexNormals();

    var rightCurb = new THREE.Mesh(rightGeometry, curbMaterial);
    rightCurb.receiveShadow = false;
    scene.add(rightCurb);
    trackMeshes.push(rightCurb);
}

// Create checkered texture
function createCheckeredTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');

    var checkSize = 16;
    for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
            ctx.fillStyle = ((x + y) % 2 === 0) ? '#000000' : '#ffffff';
            ctx.fillRect(x * checkSize, y * checkSize, checkSize, checkSize);
        }
    }

    var checkTex = new THREE.CanvasTexture(canvas);
    checkTex.encoding = THREE.sRGBEncoding;
    return checkTex;
}

// Build start/finish line area with checkered banner and poles
function buildStartFinish(scene) {
    var startNode = trackNodes[0];
    var angle = getTrackAngle(0);
    var perpX = -Math.sin(angle);
    var perpZ = Math.cos(angle);

    // === Ground-level checkered start line ===
    var checkeredTexture = createCheckeredTexture();
    checkeredTexture.wrapS = THREE.RepeatWrapping;
    checkeredTexture.wrapT = THREE.RepeatWrapping;
    checkeredTexture.repeat.set(10, 3);
    var lineWidth = TRACK_WIDTH + 2;
    var lineDepth = 8;
    var lineGeom = new THREE.PlaneGeometry(lineWidth, lineDepth);
    var lineMat = new THREE.MeshLambertMaterial({
        map: checkeredTexture
    });
    var startLine = new THREE.Mesh(lineGeom, lineMat);

    // Lay flat on the road, perpendicular to track direction
    // YXZ order: first Rx (lay flat), then Ry (rotate to match track)
    startLine.rotation.order = 'YXZ';
    startLine.rotation.x = -Math.PI / 2;
    startLine.rotation.y = -angle;
    startLine.position.set(startNode.x, startNode.y + 0.08, startNode.z);
    startLine.receiveShadow = false;
    scene.add(startLine);
    trackMeshes.push(startLine);

    // === Overhead arch/banner ===
    var bannerWidth = TRACK_WIDTH + 6;
    var bannerY = startNode.y + 9;
    var poleHeight = bannerY - startNode.y;

    // Banner
    var bannerCheckTex = createCheckeredTexture();
    bannerCheckTex.wrapS = THREE.RepeatWrapping;
    bannerCheckTex.wrapT = THREE.RepeatWrapping;
    bannerCheckTex.repeat.set(8, 1);
    var bannerGeom = new THREE.BoxGeometry(bannerWidth, 2.5, 0.4);
    var bannerMat = new THREE.MeshLambertMaterial({
        map: bannerCheckTex
    });
    var banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(startNode.x, bannerY, startNode.z);
    banner.rotation.y = -(angle);
    banner.castShadow = true;
    scene.add(banner);
    trackMeshes.push(banner);

    // Support poles (thicker, metallic)
    var poleGeom = new THREE.CylinderGeometry(0.35, 0.4, poleHeight, 12);
    var poleMat = new THREE.MeshLambertMaterial({
        color: 0xcccccc,
        emissive: 0x333333
    });

    var leftPole = new THREE.Mesh(poleGeom, poleMat);
    leftPole.position.set(
        startNode.x + perpX * (bannerWidth / 2),
        startNode.y + poleHeight / 2,
        startNode.z + perpZ * (bannerWidth / 2)
    );
    leftPole.castShadow = true;
    scene.add(leftPole);
    trackMeshes.push(leftPole);

    var rightPole = new THREE.Mesh(poleGeom, poleMat);
    rightPole.position.set(
        startNode.x - perpX * (bannerWidth / 2),
        startNode.y + poleHeight / 2,
        startNode.z - perpZ * (bannerWidth / 2)
    );
    rightPole.castShadow = true;
    scene.add(rightPole);
    trackMeshes.push(rightPole);
}

// Build Crystal Kingdom environment decorations using zone system
// 100 track nodes split into 5 themed zones
function buildTrackDecorations(scene) {
    var useGLB = envModelsLoaded && Object.keys(envModelCache).length > 0;
    var treeTypes = ['tree-a', 'tree-a', 'tree-a']; // Only crystal tree (pink trees removed)
    var HW = TRACK_WIDTH / 2; // half-width shorthand

    // Zone determination
    function getZone(idx) {
        idx = ((idx % TRACK_POINTS) + TRACK_POINTS) % TRACK_POINTS;
        if (idx >= 85 || idx < 5) return 'garden';
        if (idx >= 5 && idx < 25) return 'forest';
        if (idx >= 25 && idx < 45) return 'castle';
        if (idx >= 45 && idx < 65) return 'lake';
        return 'mountain';
    }

    // Zone color palette
    function getZoneColors(zone) {
        switch(zone) {
            case 'forest':   return { pri: 0x4488DD, sec: 0x66AAEE, em: 0x2266AA, bush: 0x2A6644, lamp: 0x4488DD };
            case 'castle':   return { pri: 0xFFCC66, sec: 0xFFDDAA, em: 0xCC9933, bush: 0x3A7744, lamp: 0xFFCC66 };
            case 'lake':     return { pri: 0xE8EEFF, sec: 0xAABBDD, em: 0x6688CC, bush: 0x2A5544, lamp: 0x88AADD };
            case 'mountain': return { pri: 0x8866BB, sec: 0xAA88DD, em: 0x5533AA, bush: 0x335533, lamp: 0x8866BB };
            case 'garden':   return { pri: 0xDDA0BB, sec: 0x9988CC, em: 0xAA6688, bush: 0x3A8855, lamp: 0xFFCC66 };
            default:         return { pri: 0x4488DD, sec: 0x6699CC, em: 0x224488, bush: 0x3A7744, lamp: 0x4488DD };
        }
    }

    // FIXED: Smart Y placement - near objects use ROAD elevation, not underground terrain
    function placeAtTrack(idx, side, distance, callback) {
        var node = trackNodes[idx];
        var angle = getTrackAngle(idx);
        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;
        var px = node.x + perpX * distance;
        var pz = node.z + perpZ * distance;
        var py;
        var shoulderEdge = HW + 8; // road shoulder extends 8 past track edge
        if (distance <= shoulderEdge) {
            // On road or shoulder: same height as road surface
            py = node.y;
        } else if (distance <= shoulderEdge + 25) {
            // Transition: smoothly drop from road to terrain
            var t = (distance - shoulderEdge) / 25;
            t = t * t * (3 - 2 * t); // smoothstep
            var terrainY = getTerrainHeight(px, pz);
            py = node.y * (1 - t) + Math.max(terrainY, node.y - 10) * t;
        } else {
            py = getTerrainHeight(px, pz);
        }
        callback(px, py, pz, angle, node);
    }

    // === SMALL DETAIL HELPERS (new near-track objects) ===

    // Crystal shard cluster for track edge (3x bigger)
    function createCrystalShard(scene, x, y, z, color) {
        var h = 1.5 + Math.random() * 1.5;
        var geo = new THREE.CylinderGeometry(0, 0.35 + Math.random() * 0.2, h, 5);
        var mat = new THREE.MeshLambertMaterial({
            color: color, emissive: color, emissiveIntensity: 0.4,
            transparent: true, opacity: 0.85
        });
        var shard = new THREE.Mesh(geo, mat);
        shard.position.set(x, y + h * 0.4, z);
        shard.rotation.z = (Math.random() - 0.5) * 0.3;
        shard.rotation.y = Math.random() * Math.PI;
        shard.castShadow = true;
        scene.add(shard);
        trackMeshes.push(shard);
        // Secondary shard
        var h2 = h * 0.6;
        var s2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0, 0.2 + Math.random() * 0.15, h2, 5), mat
        );
        s2.position.set(x + (Math.random() - 0.5) * 0.8, y + h2 * 0.35, z + (Math.random() - 0.5) * 0.8);
        s2.rotation.set(0.2 + Math.random() * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4);
        scene.add(s2);
        trackMeshes.push(s2);
    }

    // Bush / hedge for roadside (2x bigger)
    function createBush(scene, x, y, z, color) {
        var r = 1.0 + Math.random() * 0.8;
        var geo = new THREE.SphereGeometry(r, 6, 5);
        var mat = new THREE.MeshLambertMaterial({ color: color || 0x3A7744 });
        var bush = new THREE.Mesh(geo, mat);
        bush.position.set(x, y + r * 0.3, z);
        bush.scale.y = 0.55;
        bush.castShadow = true;
        scene.add(bush);
        trackMeshes.push(bush);
        // Secondary smaller bush
        var r2 = r * 0.6;
        var b2 = new THREE.Mesh(new THREE.SphereGeometry(r2, 5, 4), mat);
        b2.position.set(x + (Math.random() - 0.5) * r, y + r2 * 0.25, z + (Math.random() - 0.5) * r);
        b2.scale.y = 0.5;
        scene.add(b2);
        trackMeshes.push(b2);
    }

    // Rock cluster (2x bigger, multiple rocks)
    function createRock(scene, x, y, z) {
        var r = 0.5 + Math.random() * 0.5;
        var geo = new THREE.DodecahedronGeometry(r, 0);
        var mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.58, 0.1, 0.35 + Math.random() * 0.1)
        });
        var rock = new THREE.Mesh(geo, mat);
        rock.position.set(x, y + r * 0.25, z);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.scale.y = 0.55;
        rock.castShadow = true;
        scene.add(rock);
        trackMeshes.push(rock);
        // Secondary rock
        var r2 = r * 0.65;
        var rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r2, 0), mat);
        rock2.position.set(x + (Math.random() - 0.5) * r * 1.5, y + r2 * 0.2, z + (Math.random() - 0.5) * r * 1.5);
        rock2.rotation.set(Math.random(), Math.random(), Math.random());
        rock2.scale.y = 0.5;
        scene.add(rock2);
        trackMeshes.push(rock2);
    }

    // Glowing bollard (taller, more visible)
    function createBollard(scene, x, y, z, color) {
        var pGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6);
        var pMat = new THREE.MeshLambertMaterial({ color: 0x8899AA });
        var pole = new THREE.Mesh(pGeo, pMat);
        pole.position.set(x, y + 0.9, z);
        pole.castShadow = true;
        scene.add(pole);
        trackMeshes.push(pole);
        var oGeo = new THREE.SphereGeometry(0.3, 6, 6);
        var oMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        var orb = new THREE.Mesh(oGeo, oMat);
        orb.position.set(x, y + 2.0, z);
        scene.add(orb);
        trackMeshes.push(orb);
    }

    // === EXISTING HELPERS (kept) ===

    function createCrystal(scene, x, y, z, size, color, emColor) {
        var cGeo = new THREE.CylinderGeometry(0, size * 0.4, size, 6);
        var cMat = new THREE.MeshLambertMaterial({
            color: color, emissive: emColor, emissiveIntensity: 0.35,
            transparent: true, opacity: 0.85
        });
        var crystal = new THREE.Mesh(cGeo, cMat);
        crystal.position.set(x, y + size / 2, z);
        crystal.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
        crystal.castShadow = true;
        scene.add(crystal);
        trackMeshes.push(crystal);
        var c2 = new THREE.Mesh(
            new THREE.CylinderGeometry(0, size * 0.25, size * 0.6, 6), cMat
        );
        c2.position.set(x + (Math.random() - 0.5) * size, y + size * 0.3, z + (Math.random() - 0.5) * size);
        c2.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, 0.2 + Math.random() * 0.3);
        scene.add(c2);
        trackMeshes.push(c2);
    }

    function createFloatingOrb(scene, x, y, z, color, size) {
        var oGeo = new THREE.SphereGeometry(size, 6, 6);
        var oMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.7 });
        var orb = new THREE.Mesh(oGeo, oMat);
        orb.position.set(x, y, z);
        scene.add(orb);
        trackMeshes.push(orb);
        var gGeo = new THREE.SphereGeometry(size * 3, 6, 6);
        var gMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.08 });
        var glow = new THREE.Mesh(gGeo, gMat);
        glow.position.set(x, y, z);
        scene.add(glow);
        trackMeshes.push(glow);
    }

    function createLampPost(scene, x, y, z, color) {
        var pGeo = new THREE.CylinderGeometry(0.15, 0.2, 5, 6);
        var pMat = new THREE.MeshLambertMaterial({ color: 0x8899AA });
        var pole = new THREE.Mesh(pGeo, pMat);
        pole.position.set(x, y + 2.5, z);
        pole.castShadow = true;
        scene.add(pole);
        trackMeshes.push(pole);
        var oGeo = new THREE.SphereGeometry(0.6, 8, 8);
        var oMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
        var orb = new THREE.Mesh(oGeo, oMat);
        orb.position.set(x, y + 5.3, z);
        scene.add(orb);
        trackMeshes.push(orb);
        var glGeo = new THREE.SphereGeometry(1.8, 8, 8);
        var glMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.12 });
        var glow = new THREE.Mesh(glGeo, glMat);
        glow.position.set(x, y + 5.3, z);
        scene.add(glow);
        trackMeshes.push(glow);
    }

    function createFlowerCluster(scene, x, y, z, color1, color2) {
        var numFlowers = 3 + Math.floor(Math.random() * 3);
        for (var f = 0; f < numFlowers; f++) {
            var fc = (f % 2 === 0) ? color1 : color2;
            var fGeo = new THREE.SphereGeometry(0.2 + Math.random() * 0.2, 5, 5);
            var fMat = new THREE.MeshLambertMaterial({
                color: fc, emissive: fc, emissiveIntensity: 0.15
            });
            var flower = new THREE.Mesh(fGeo, fMat);
            flower.position.set(x + (Math.random() - 0.5) * 1.8, y + 0.15, z + (Math.random() - 0.5) * 1.8);
            scene.add(flower);
            trackMeshes.push(flower);
        }
        var leafGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.1, 6);
        var leafMat = new THREE.MeshLambertMaterial({ color: 0x3A8855 });
        var leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(x, y + 0.05, z);
        scene.add(leaf);
        trackMeshes.push(leaf);
    }

    // === Guardrails ===
    buildGuardrails(scene);

    // ================================================================
    // MAIN DECORATION LOOP: 3 layers per node
    // Layer 1 (NEAR):  road shoulder, dist HW+1 to HW+6 — crystal shards, bushes, flowers, bollards
    // Layer 2 (MID):   dist HW+8 to 30 — ground cover, small trees, rocks, zone features
    // Layer 3 (FAR):   dist 30+ — large trees, buildings, landmarks
    // ================================================================
    for (var i = 0; i < TRACK_POINTS; i++) {
        var zone = getZone(i);
        var zc = getZoneColors(zone);

        // ---- LAYER 1: NEAR (road shoulder) ---- every node gets 2-4 small objects

        // Crystal shards: both sides every node (staggered offset for variety)
        placeAtTrack(i, 1, HW + 1.5 + (i % 3) * 0.4, function(px, py, pz) {
            createCrystalShard(scene, px, py, pz, zc.pri);
        });
        if (i % 2 === 0) {
            placeAtTrack(i, -1, HW + 1.5 + ((i + 1) % 3) * 0.4, function(px, py, pz) {
                createCrystalShard(scene, px, py, pz, zc.pri);
            });
        }

        // Bushes: every 2 nodes, alternating sides
        if (i % 2 === 0) {
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 3 + (i % 3), function(px, py, pz) {
                createBush(scene, px, py, pz, zc.bush);
            });
        }

        // Flowers: every 3 nodes
        if (i % 3 === 0) {
            placeAtTrack(i, (i % 6 < 3) ? 1 : -1, HW + 2.5, function(px, py, pz) {
                createFlowerCluster(scene, px, py, pz, zc.pri, zc.sec);
            });
        }

        // (Bollards removed - too confusing on the track)

        // Rocks: every 5 nodes
        if (i % 5 === 0) {
            placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 4 + (i % 3), function(px, py, pz) {
                createRock(scene, px, py, pz);
            });
        }

        // Lamp posts: every 5 nodes, at road level (GLB if available)
        if (i % 5 === 0) {
            placeAtTrack(i, (i % 10 < 5) ? 1 : -1, HW + 2.5, function(px, py, pz, a, nd) {
                if (useGLB && envModelCache['lamp']) {
                    placeEnvModel(scene, 'lamp', px, nd.y, pz, 8, a + Math.PI / 2);
                } else {
                    createLampPost(scene, px, nd.y, pz, zc.lamp);
                }
            });
        }

        // ---- LAYER 2: MID (ground cover, dist HW+8 to 30) ----

        // Bushes in mid-range every 2 nodes
        if (i % 2 === 0) {
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 10 + (i % 5) * 2, function(px, py, pz) {
                createBush(scene, px, py, pz, zc.bush);
            });
        }
        // Rocks in mid-range every 3 nodes
        if (i % 3 === 0) {
            placeAtTrack(i, (i % 2 === 0) ? -1 : 1, HW + 12 + (i % 4) * 3, function(px, py, pz) {
                createRock(scene, px, py, pz);
            });
        }
        // Flower patches in mid-range every 4 nodes
        if (i % 4 === 0) {
            placeAtTrack(i, (i % 8 < 4) ? 1 : -1, HW + 9 + (i % 3) * 3, function(px, py, pz) {
                createFlowerCluster(scene, px, py, pz, zc.sec, 0xFFFFFF);
            });
        }
        // Floating orbs over track every 4 nodes
        if (i % 4 === 0) {
            placeAtTrack(i, (i % 2 ? 1 : -1), HW + 2, function(px, py, pz, a, nd) {
                createFloatingOrb(scene, px, nd.y + 4 + (i % 4), pz, zc.pri, 0.2);
            });
        }

        // ---- LAYER 3: FAR (zone-specific landmarks, MUCH CLOSER than before) ----

        if (zone === 'forest') {
            // Trees: both sides, dist 38-55
            var fSide = (i % 2 === 0) ? 1 : -1;
            placeAtTrack(i, fSide, 38 + (i % 4) * 5, function(px, py, pz) {
                var tt = treeTypes[i % 3];
                if (useGLB && envModelCache[tt]) {
                    placeEnvModel(scene, tt, px, py, pz, 12 + (i % 4) * 2, i * 1.37);
                } else {
                    createPineTree(scene, px, py, pz);
                }
            });
            if (i % 2 === 0) {
                placeAtTrack(i, -fSide, 42 + (i % 3) * 6, function(px, py, pz) {
                    var tt2 = treeTypes[(i + 1) % 3];
                    if (useGLB && envModelCache[tt2]) {
                        placeEnvModel(scene, tt2, px, py, pz, 13, i * 2.1);
                    } else {
                        createPineTree(scene, px, py, pz);
                    }
                });
            }
            // Crystals every 2 nodes (dist 20-35, was 28-58)
            if (i % 2 === 0) {
                placeAtTrack(i, ((i / 2 | 0) % 2 === 0) ? 1 : -1, 20 + (i % 5) * 3, function(px, py, pz) {
                    if (useGLB && envModelCache['crystal']) {
                        placeEnvModel(scene, 'crystal', px, py, pz, 8 + (i % 3) * 2, i * 0.83);
                    } else {
                        createCrystal(scene, px, py, pz, 2 + (i % 3), 0x4488DD, 0x2266AA);
                    }
                });
            }
            // Floating orbs denser
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 2 ? 1 : -1), HW + 5 + (i % 4) * 3, function(px, py, pz, a, nd) {
                    createFloatingOrb(scene, px, nd.y + 3 + (i % 4), pz, 0x4488DD, 0.25);
                });
            }
            // Crystal obelisks in forest clearings
            if ((i === 8 || i === 14 || i === 20) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 22 + (i % 3) * 4, function(px, py, pz) {
                    placeEnvModel(scene, 'obelisk', px, py, pz, 10, i * 0.9);
                });
            }
        }

        else if (zone === 'castle') {
            // Trees every 2 nodes (dist 40-54)
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, 40 + (i % 3) * 7, function(px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) {
                        placeEnvModel(scene, tt, px, py, pz, 14, i * 1.5);
                    } else {
                        createPineTree(scene, px, py, pz);
                    }
                });
            }
            // Castles CLOSER (dist 40, was 65)
            if (i === 30 || i === 40) {
                placeAtTrack(i, (i === 30) ? -1 : 1, 40, function(px, py, pz) {
                    if (useGLB && envModelCache['castle']) {
                        placeEnvModel(scene, 'castle', px, py, pz, 25, i * 0.5);
                    } else {
                        createBuilding(scene, px, py, pz);
                    }
                });
            }
            // Houses CLOSER (dist 32, was 50)
            if (i === 27 || i === 31 || i === 33 || i === 36 || i === 38 || i === 43) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 32, function(px, py, pz) {
                    if (useGLB && envModelCache['house-a']) {
                        placeEnvModel(scene, 'house-a', px, py, pz, 16, i * 1.05);
                    } else {
                        createBuilding(scene, px, py, pz);
                    }
                });
            }
            // Fountain CLOSER (dist 25, was 38)
            if (i === 35) {
                placeAtTrack(i, 1, 25, function(px, py, pz) {
                    if (useGLB && envModelCache['fountain']) {
                        placeEnvModel(scene, 'fountain', px, py, pz, 12, 0);
                    }
                });
            }
            // Arch gate
            if (i === 28 || i === 42) {
                placeAtTrack(i, (i === 28) ? 1 : -1, 26, function(px, py, pz) {
                    if (useGLB && envModelCache['archgate']) {
                        placeEnvModel(scene, 'archgate', px, py, pz, 16, i * 0.06);
                    }
                });
            }
            // Flowerbeds along castle streets
            if ((i === 26 || i === 29 || i === 32 || i === 37 || i === 41 || i === 44) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 6, function(px, py, pz) {
                    placeEnvModel(scene, 'flowerbed', px, py, pz, 10, i * 1.2);
                });
            }
        }

        else if (zone === 'lake') {
            // Trees sparse (dist 40-60)
            if (i % 3 === 0) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, 40 + (i % 3) * 10, function(px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) {
                        placeEnvModel(scene, tt, px, py, pz, 15, i * 1.8);
                    } else {
                        createPineTree(scene, px, py, pz);
                    }
                });
            }
            // Crystals every 2 nodes, CLOSER (dist 18-30, was 30-62)
            if (i % 2 === 0) {
                placeAtTrack(i, ((i / 2 | 0) % 2 === 0) ? 1 : -1, 18 + (i % 4) * 4, function(px, py, pz) {
                    if (useGLB && envModelCache['crystal']) {
                        placeEnvModel(scene, 'crystal', px, py, pz, 10 + (i % 3) * 2, i * 0.7);
                    } else {
                        createCrystal(scene, px, py, pz, 3 + (i % 3), 0xE8EEFF, 0x6688CC);
                    }
                });
            }
            // Dense floating orbs
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 4 + (i % 5) * 2, function(px, py, pz, a, nd) {
                    createFloatingOrb(scene, px, nd.y + 2 + (i % 5), pz, 0xE8EEFF, 0.22 + (i % 3) * 0.06);
                });
            }
            // Crystal obelisks by the lakeside
            if ((i === 48 || i === 55 || i === 62) && useGLB && envModelCache['obelisk']) {
                placeAtTrack(i, (i % 2 === 0) ? -1 : 1, 20 + (i % 3) * 5, function(px, py, pz) {
                    placeEnvModel(scene, 'obelisk', px, py, pz, 10, i * 0.75);
                });
            }
        }

        else if (zone === 'mountain') {
            // Trees (dist 38-53)
            if (i % 2 === 0) {
                placeAtTrack(i, (i % 4 < 2) ? 1 : -1, 38 + (i % 4) * 5, function(px, py, pz) {
                    var tt = treeTypes[i % 3];
                    if (useGLB && envModelCache[tt]) {
                        placeEnvModel(scene, tt, px, py, pz, 14, i * 1.6);
                    } else {
                        createPineTree(scene, px, py, pz);
                    }
                });
            }
            // Amethyst crystals every 3 nodes, CLOSER (dist 20-34, was 32-62)
            if (i % 3 === 0) {
                placeAtTrack(i, ((i / 3 | 0) % 2 === 0) ? 1 : -1, 20 + (i % 5) * 3, function(px, py, pz) {
                    if (useGLB && envModelCache['crystal']) {
                        placeEnvModel(scene, 'crystal', px, py, pz, 8 + (i % 3) * 2, i * 0.9);
                    } else {
                        createCrystal(scene, px, py, pz, 2.5 + (i % 3), 0x8866BB, 0x5533AA);
                    }
                });
            }
            // Windmills CLOSER
            if (i === 70 || i === 78) {
                placeAtTrack(i, (i === 70) ? 1 : -1, 40, function(px, py, pz) {
                    if (useGLB && envModelCache['windmill']) {
                        placeEnvModel(scene, 'windmill', px, py, pz, 20, i * 1.57);
                    }
                });
            }
        }

        else if (zone === 'garden') {
            // Decorative trees every node (dist 38-48)
            var gSide = (i % 2 === 0) ? 1 : -1;
            placeAtTrack(i, gSide, 38 + (i % 3) * 5, function(px, py, pz) {
                var tt = treeTypes[i % 3];
                if (useGLB && envModelCache[tt]) {
                    placeEnvModel(scene, tt, px, py, pz, 13, i * 1.4);
                } else {
                    createPineTree(scene, px, py, pz);
                }
            });
            // Extra dense flower clusters (every node, both sides)
            placeAtTrack(i, (i % 4 < 2) ? 1 : -1, HW + 4 + (i % 3) * 1.5, function(px, py, pz) {
                createFlowerCluster(scene, px, py, pz, 0x9988CC, 0xDDA0BB);
            });
            // Fountain CLOSER
            if (i === 92) {
                placeAtTrack(i, 1, 24, function(px, py, pz) {
                    if (useGLB && envModelCache['fountain']) {
                        placeEnvModel(scene, 'fountain', px, py, pz, 16, 0);
                    }
                });
            }
            // Gold arch CLOSER
            if (i === 90 || i === 98) {
                placeAtTrack(i, (i === 90) ? -1 : 1, 28, function(px, py, pz) {
                    if (useGLB && envModelCache['archgate']) {
                        placeEnvModel(scene, 'archgate', px, py, pz, 18, i * 0.06);
                    }
                });
            }
            // Flowerbeds lining the royal garden paths
            if ((i === 86 || i === 89 || i === 93 || i === 96 || i === 0 || i === 3) && useGLB && envModelCache['flowerbed']) {
                placeAtTrack(i, (i % 2 === 0) ? 1 : -1, HW + 5, function(px, py, pz) {
                    placeEnvModel(scene, 'flowerbed', px, py, pz, 10, i * 1.1);
                });
            }
        }
    }

    // === Background mountains (faraway, base at ground level) ===
    var mountainPositions = [
        { x: 450, z: 450, h: -2 },
        { x: -450, z: 450, h: -2 },
        { x: 450, z: -450, h: -2 },
        { x: -450, z: -450, h: -2 },
        { x: 0, z: 550, h: -2 },
        { x: 550, z: 0, h: -2 },
        { x: -550, z: 0, h: -2 },
        { x: 0, z: -550, h: -2 },
        { x: 350, z: 550, h: -2 },
        { x: -350, z: -550, h: -2 },
        { x: 550, z: 350, h: -2 },
        { x: -550, z: -350, h: -2 }
    ];
    for (var i = 0; i < mountainPositions.length; i++) {
        var mp = mountainPositions[i];
        var mScale = 45 + i * 3;
        if (useGLB && envModelCache['mountain']) {
            placeEnvModel(scene, 'mountain', mp.x, mp.h, mp.z, mScale, i * 0.79);
        } else {
            var mH = 70 + Math.random() * 50;
            var mR = 50 + Math.random() * 35;
            var mGeo = new THREE.ConeGeometry(mR, mH, 8);
            var mMat = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.6, 0.3, 0.4)
            });
            var mMesh = new THREE.Mesh(mGeo, mMat);
            mMesh.position.set(mp.x, mH / 2, mp.z);
            mMesh.receiveShadow = true;
            scene.add(mMesh);
            trackMeshes.push(mMesh);
        }
    }

    // === Crystal Lake water surfaces (zone: lake, nodes 45-65) ===
    var waterVS = [
        'uniform float uTime;',
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  vUv = uv;',
        '  vec3 pos = position;',
        '  float wave1 = sin(pos.x * 0.3 + uTime * 1.5) * 0.15;',
        '  float wave2 = sin(pos.y * 0.5 + uTime * 2.0) * 0.1;',
        '  float wave3 = cos(pos.x * 0.2 + pos.y * 0.3 + uTime) * 0.08;',
        '  pos.z += wave1 + wave2 + wave3;',
        '  vec4 worldPos = modelMatrix * vec4(pos, 1.0);',
        '  vWorldPos = worldPos.xyz;',
        '  vNormal = normalize(normalMatrix * normal);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
        '}'
    ].join('\n');
    var waterFS = [
        'uniform float uTime;',
        'uniform vec3 uWaterColor;',
        'uniform vec3 uDeepColor;',
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  float ripple1 = sin(vUv.x * 20.0 + uTime * 2.0) * 0.5 + 0.5;',
        '  float ripple2 = sin(vUv.y * 15.0 - uTime * 1.5) * 0.5 + 0.5;',
        '  float ripple = ripple1 * ripple2;',
        '  vec3 baseColor = mix(uDeepColor, uWaterColor, ripple * 0.4 + 0.3);',
        '  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);',
        '  vec3 highlight = vec3(0.7, 0.75, 0.9) * fresnel * 0.5;',
        '  float sparkle = pow(sin(vUv.x * 40.0 + uTime * 3.0) * sin(vUv.y * 35.0 - uTime * 2.5), 8.0) * 0.3;',
        '  vec3 finalColor = baseColor + highlight + vec3(sparkle);',
        '  gl_FragColor = vec4(finalColor, 0.7);',
        '}'
    ].join('\n');

    // Place water near Crystal Lake zone
    var waterPositions = [
        {x: 200, z: 200, w: 150, h: 100},
        {x: -300, z: 150, w: 80, h: 120},
        {x: 100, z: -350, w: 100, h: 80}
    ];
    for (var wi = 0; wi < waterPositions.length; wi++) {
        var wp = waterPositions[wi];
        var waterGeometry = new THREE.PlaneGeometry(wp.w, wp.h, 32, 32);
        var waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uWaterColor: { value: new THREE.Color(0x4477CC) },
                uDeepColor: { value: new THREE.Color(0x1A2E4A) }
            },
            vertexShader: waterVS,
            fragmentShader: waterFS,
            transparent: true,
            side: THREE.DoubleSide
        });
        var water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.set(wp.x, -1.5, wp.z);
        water.receiveShadow = true;
        water.userData.isWater = true;
        scene.add(water);
        trackMeshes.push(water);
    }

    // Build track structures (bridges, tunnels, ramps)
    buildBridgePillars(scene);
    buildTunnels(scene);
    buildRamps(scene);
}

// Create a pine tree (Mario Kart style - rounder, cartoonier)
function createPineTree(scene, x, y, z) {
    var trunkHeight = 3 + Math.random() * 2;
    var trunkRadius = 0.3 + Math.random() * 0.15;

    var trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.3, trunkHeight, 8);
    var trunkMaterial = new THREE.MeshLambertMaterial({
        color: 0x7B5B3A
    });

    var trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, y + trunkHeight / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    trackMeshes.push(trunk);

    // Layered cone foliage (3 tiers like Mario Kart pine trees)
    var tiers = 3;
    for (var t = 0; t < tiers; t++) {
        var tierH = (3.5 - t * 0.8) + Math.random() * 0.5;
        var tierR = (3.0 - t * 0.6) + Math.random() * 0.5;
        var tierY = y + trunkHeight + t * 2.2;
        var hue = 0.28 + Math.random() * 0.08;
        var foliageGeometry = new THREE.ConeGeometry(tierR, tierH, 8);
        var foliageMaterial = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(hue, 0.65, 0.32 + t * 0.05)
        });
        var foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(x, tierY + tierH / 2, z);
        foliage.castShadow = true;
        scene.add(foliage);
        trackMeshes.push(foliage);
    }
}

// Create an oak tree (round, fluffy Mario Kart style)
function createOakTree(scene, x, y, z) {
    var trunkHeight = 3 + Math.random() * 2;
    var trunkRadius = 0.4 + Math.random() * 0.2;

    var trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.3, trunkHeight, 8);
    var trunkMaterial = new THREE.MeshLambertMaterial({
        color: 0x7B5533
    });

    var trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, y + trunkHeight / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    trackMeshes.push(trunk);

    // Cluster of spheres for fluffy canopy
    var mainRadius = 3 + Math.random() * 1.5;
    var hue = 0.25 + Math.random() * 0.12;
    var baseColor = new THREE.Color().setHSL(hue, 0.6, 0.38);

    var foliageGeometry = new THREE.SphereGeometry(mainRadius, 10, 8);
    var foliageMaterial = new THREE.MeshLambertMaterial({
        color: baseColor
    });

    var foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.set(x, y + trunkHeight + mainRadius * 0.65, z);
    foliage.castShadow = true;
    scene.add(foliage);
    trackMeshes.push(foliage);

    // Extra puffs for volume
    for (var p = 0; p < 3; p++) {
        var pAngle = (p / 3) * Math.PI * 2 + Math.random();
        var pR = mainRadius * 0.6;
        var pGeom = new THREE.SphereGeometry(pR, 8, 6);
        var pMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(hue + (Math.random() - 0.5) * 0.04, 0.55, 0.35 + Math.random() * 0.08)
        });
        var pMesh = new THREE.Mesh(pGeom, pMat);
        pMesh.position.set(
            x + Math.cos(pAngle) * mainRadius * 0.5,
            y + trunkHeight + mainRadius * 0.5 + Math.random() * 1.5,
            z + Math.sin(pAngle) * mainRadius * 0.5
        );
        pMesh.castShadow = true;
        scene.add(pMesh);
        trackMeshes.push(pMesh);
    }
}

// Create a palm tree
function createPalmTree(scene, x, y, z) {
    var trunkHeight = 6 + Math.random() * 3;
    var trunkRadius = 0.35;

    var trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.5, trunkHeight, 8);
    var trunkMaterial = new THREE.MeshLambertMaterial({
        color: 0x8b7355
    });

    var trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, y + trunkHeight / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);
    trackMeshes.push(trunk);

    // Palm fronds (cluster of spheres)
    var frondCount = 6;
    for (var i = 0; i < frondCount; i++) {
        var angle = (i / frondCount) * Math.PI * 2;
        var frondRadius = 1.2;
        var frondDistance = 2;

        var frondGeometry = new THREE.SphereGeometry(frondRadius, 6, 6);
        var frondMaterial = new THREE.MeshLambertMaterial({
            color: 0x44cc55
        });

        var frond = new THREE.Mesh(frondGeometry, frondMaterial);
        frond.position.set(
            x + Math.cos(angle) * frondDistance,
            y + trunkHeight + 1,
            z + Math.sin(angle) * frondDistance
        );
        frond.castShadow = true;
        scene.add(frond);
        trackMeshes.push(frond);
    }
}

// Create clean glowing guardrails along ENTIRE track (no rainbow lines cutting corners)
function buildGuardrails(scene) {
    var railSpacing = 3;
    var halfWidth = TRACK_WIDTH / 2;
    var railDist = halfWidth + 1.5;

    // Crystal Kingdom - sapphire left, amethyst right
    var leftColor = 0x4488DD;
    var rightColor = 0x8866BB;

    // Translucent post material
    var postMat = new THREE.MeshLambertMaterial({
        color: 0xBBCCFF,
        transparent: true, opacity: 0.5,
        emissive: 0x6688CC, emissiveIntensity: 0.25
    });

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

            // Small glowing post
            var postGeom = new THREE.CylinderGeometry(0.06, 0.1, 1.5, 5);
            var post = new THREE.Mesh(postGeom, postMat);
            post.position.set(px, node.y + 0.75, pz);
            scene.add(post);
            trackMeshes.push(post);

            // Connect beam to next post (every post, short segments = follows curves)
            var npx = nextNode.x + nextPerpX * side * railDist;
            var npz = nextNode.z + nextPerpZ * side * railDist;

            var dx = npx - px, dz = npz - pz;
            var beamLen = Math.sqrt(dx * dx + dz * dz);
            var beamAng = Math.atan2(dz, dx);

            var bColor = (side === -1) ? leftColor : rightColor;

            // Single thin glowing rail beam
            var beamGeom = new THREE.BoxGeometry(beamLen, 0.08, 0.04);
            var beamMat = new THREE.MeshLambertMaterial({
                color: bColor, emissive: bColor, emissiveIntensity: 0.6,
                transparent: true, opacity: 0.7
            });
            var beam = new THREE.Mesh(beamGeom, beamMat);
            beam.position.set((px + npx) / 2, node.y + 1.2, (pz + npz) / 2);
            beam.rotation.y = -beamAng;
            scene.add(beam);
            trackMeshes.push(beam);
        }
    }
}

// Legacy function for compatibility
function createGuardrail(scene, trackIdx) {
    // Now handled by buildGuardrails
}

// Create a building
function createBuilding(scene, x, y, z) {
    var buildingWidth = 10 + Math.random() * 8;
    var buildingHeight = 12 + Math.random() * 15;
    var buildingDepth = 10 + Math.random() * 8;

    var colors = [0xff5555, 0x5555ff, 0x55ff55, 0xffff55, 0xff55ff, 0x55ffff];
    var wallColor = colors[Math.floor(Math.random() * colors.length)];

    var wallGeometry = new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth);
    var wallMaterial = new THREE.MeshLambertMaterial({
        color: wallColor
    });

    var walls = new THREE.Mesh(wallGeometry, wallMaterial);
    walls.position.set(x, y + buildingHeight / 2, z);
    walls.castShadow = true;
    walls.receiveShadow = false;
    scene.add(walls);
    trackMeshes.push(walls);

    // Roof detail
    var roofGeometry = new THREE.BoxGeometry(buildingWidth * 0.8, 2, buildingDepth * 0.8);
    var roofMaterial = new THREE.MeshLambertMaterial({
        color: 0x333333
    });

    var roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(x, y + buildingHeight + 1, z);
    roof.castShadow = true;
    scene.add(roof);
    trackMeshes.push(roof);
}

// Create billboard
function createBillboard(scene, x, y, z, angle) {
    // Pole
    var poleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 5, 8);
    var poleMaterial = new THREE.MeshLambertMaterial({
        color: 0x444444
    });

    var pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, y + 2.5, z);
    pole.castShadow = true;
    scene.add(pole);
    trackMeshes.push(pole);

    // Sign
    var colors = [0xff3333, 0x33ff33, 0x3333ff, 0xffff33, 0xff33ff];
    var signColor = colors[Math.floor(Math.random() * colors.length)];

    var signGeometry = new THREE.BoxGeometry(6, 3, 0.2);
    var signMaterial = new THREE.MeshLambertMaterial({
        color: signColor,
        emissive: signColor,
        emissiveIntensity: 0.3
    });

    var sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(x, y + 6.5, z);
    sign.rotation.y = angle + Math.PI / 2;
    sign.castShadow = true;
    scene.add(sign);
    trackMeshes.push(sign);
}

// Create spectator stand
function createSpectatorStand(scene, node, angle, side) {
    var distance = TRACK_WIDTH / 2 + 15;
    var perpX = -Math.sin(angle) * side;
    var perpZ = Math.cos(angle) * side;

    var standX = node.x + perpX * distance;
    var standZ = node.z + perpZ * distance;

    var stepCount = 5;
    var stepWidth = 20;
    var stepDepth = 3;
    var stepHeight = 1.5;

    for (var i = 0; i < stepCount; i++) {
        var stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
        var stepMaterial = new THREE.MeshLambertMaterial({
            color: (i % 2 === 0) ? 0xdddddd : 0xaaaaaa
        });

        var step = new THREE.Mesh(stepGeometry, stepMaterial);
        step.position.set(
            standX + perpX * i * stepDepth,
            node.y + i * stepHeight,
            standZ + perpZ * i * stepDepth
        );
        step.rotation.y = angle;
        step.castShadow = true;
        step.receiveShadow = true;
        scene.add(step);
        trackMeshes.push(step);
    }
}

// 水面アニメーション更新（毎フレーム呼ぶ）
function updateWaterSurfaces() {
    if (!trackMeshes) return;
    var time = (typeof clock !== 'undefined' && clock) ? clock.getElapsedTime() : fr * 0.016;
    for (var i = 0; i < trackMeshes.length; i++) {
        var mesh = trackMeshes[i];
        if (mesh.userData && mesh.userData.isWater && mesh.material && mesh.material.uniforms) {
            mesh.material.uniforms.uTime.value = time;
        }
    }
}
