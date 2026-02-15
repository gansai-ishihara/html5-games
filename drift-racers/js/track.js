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

    // Bright lavender-white base
    ctx.fillStyle = '#E8E0F0';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle sparkle dots
    for (var i = 0; i < 200; i++) {
        var sx = Math.random() * 512;
        var sy = Math.random() * 512;
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.fillStyle = ['#DDCCFF','#FFccEE','#ccDDFF'][Math.floor(Math.random() * 3)];
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Left edge - cyan neon line
    ctx.fillStyle = '#00EEFF';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00EEFF';
    ctx.fillRect(8, 0, 5, 512);
    ctx.shadowBlur = 0;

    // Right edge - pink neon line
    ctx.fillStyle = '#FF55BB';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#FF55BB';
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
        color: 0x887799,
        emissive: 0x221133,
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

    // Glowing edge strips on top of side walls (neon trim)
    var edgeColors = [0x00EEFF, 0xFF55BB];
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

    // Red and white alternating diagonal stripes
    var stripeWidth = 16;
    for (var i = 0; i < 8; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#EE2244' : '#FFFFFF';
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
    checkeredTexture.repeat.set(7, 2);
    var lineWidth = TRACK_WIDTH;
    var lineDepth = 4;
    var lineGeom = new THREE.PlaneGeometry(lineWidth, lineDepth);
    var lineMat = new THREE.MeshLambertMaterial({
        map: checkeredTexture
    });
    var startLine = new THREE.Mesh(lineGeom, lineMat);

    // Lay flat on the road, perpendicular to track direction
    startLine.rotation.x = -Math.PI / 2;
    startLine.rotation.z = -angle;
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

// Build impressive environment decorations using GLB models
function buildTrackDecorations(scene) {
    var useGLB = envModelsLoaded && Object.keys(envModelCache).length > 0;

    // Trees - deterministic placement along the track
    // Place trees every 1 node, alternating sides, 3 distance bands
    var treeTypes = ['tree-a', 'tree-b', 'tree-c'];
    var treeDists = [38, 55, 75, 100, 130]; // 5 distance bands
    var treeScales = [30, 40, 35, 45, 50];  // scale per band
    for (var i = 6; i < trackNodes.length - 5; i++) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);

        // Each node gets 1-2 trees based on index pattern
        var band = i % treeDists.length;
        var side = (i % 2 === 0) ? 1 : -1;
        var distance = treeDists[band];

        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;

        var treeX = node.x + perpX * distance;
        var treeZ = node.z + perpZ * distance;
        var treeY = getTerrainHeight(treeX, treeZ);

        var treeType = treeTypes[i % 3];
        var treeScale = treeScales[band];
        var treeRot = (i * 1.37) % (Math.PI * 2); // deterministic rotation

        if (useGLB && envModelCache[treeType]) {
            placeEnvModel(scene, treeType, treeX, treeY, treeZ, treeScale, treeRot);
        } else {
            createPineTree(scene, treeX, treeY, treeZ);
        }

        // Add second tree on opposite side every 3rd node for density
        if (i % 3 === 0) {
            var dist2 = treeDists[(band + 2) % treeDists.length];
            var tx2 = node.x + perpX * (-1) * dist2;
            var tz2 = node.z + perpZ * (-1) * dist2;
            var ty2 = getTerrainHeight(tx2, tz2);
            var type2 = treeTypes[(i + 1) % 3];
            var scale2 = treeScales[(band + 2) % treeScales.length];
            if (useGLB && envModelCache[type2]) {
                placeEnvModel(scene, type2, tx2, ty2, tz2, scale2, (i * 2.47) % (Math.PI * 2));
            } else {
                createPineTree(scene, tx2, ty2, tz2);
            }
        }
    }

    // Crystal rocks - deterministic placement every 3 nodes
    for (var i = 7; i < trackNodes.length - 5; i += 3) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);

        var side = ((i / 3 | 0) % 2 === 0) ? 1 : -1;
        var distance = 30 + (i % 5) * 8;

        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;

        var rockX = node.x + perpX * distance;
        var rockZ = node.z + perpZ * distance;
        var rockY = getTerrainHeight(rockX, rockZ);
        var rockScale = 16 + (i % 4) * 4;
        var rockRot = (i * 0.83) % (Math.PI * 2);

        if (useGLB && envModelCache['crystal']) {
            placeEnvModel(scene, 'crystal', rockX, rockY, rockZ, rockScale, rockRot);
        } else {
            var rockSize = 1 + (i % 3);
            var rockGeometry = new THREE.DodecahedronGeometry(rockSize, 0);
            var rockMaterial = new THREE.MeshLambertMaterial({
                color: 0x8855CC, roughness: 0.3, metalness: 0.6,
                emissive: 0x4422AA, emissiveIntensity: 0.2
            });
            var rock = new THREE.Mesh(rockGeometry, rockMaterial);
            rock.position.set(rockX, rockY + rockSize / 2, rockZ);
            rock.rotation.set(i * 0.5, i * 0.7, i * 0.3);
            rock.receiveShadow = true;
            rock.castShadow = true;
            scene.add(rock);
            trackMeshes.push(rock);
        }
    }

    // Glowing energy barrier guardrails
    buildGuardrails(scene);

    // Fantasy buildings: Star Houses and Dream Tower
    var buildingPositions = [
        { trackIdx: 15, side: 1, distance: 60, type: 'house-a' },
        { trackIdx: 30, side: -1, distance: 70, type: 'castle' },
        { trackIdx: 45, side: 1, distance: 65, type: 'house-a' },
        { trackIdx: 60, side: -1, distance: 55, type: 'castle' },
        { trackIdx: 75, side: 1, distance: 75, type: 'house-a' },
        { trackIdx: 85, side: -1, distance: 80, type: 'castle' }
    ];

    for (var i = 0; i < buildingPositions.length; i++) {
        var bp = buildingPositions[i];
        var node = trackNodes[bp.trackIdx];
        var angle = getTrackAngle(bp.trackIdx);

        var perpX = -Math.sin(angle) * bp.side;
        var perpZ = Math.cos(angle) * bp.side;

        var buildingX = node.x + perpX * bp.distance;
        var buildingZ = node.z + perpZ * bp.distance;
        var buildingY = getTerrainHeight(buildingX, buildingZ);
        var bScale = (bp.type === 'castle') ? 55 : 35;

        if (useGLB && envModelCache[bp.type]) {
            placeEnvModel(scene, bp.type, buildingX, buildingY, buildingZ, bScale, i * 1.05);
        } else {
            createBuilding(scene, buildingX, buildingY, buildingZ);
        }
    }

    // Floating islands (replacing background mountains)
    var mountainPositions = [
        { x: 400, z: 400, h: 40 },
        { x: -400, z: 400, h: 60 },
        { x: 400, z: -400, h: 30 },
        { x: -400, z: -400, h: 50 },
        { x: 0, z: 500, h: 70 },
        { x: 500, z: 0, h: 45 },
        { x: -500, z: 0, h: 55 },
        { x: 0, z: -500, h: 35 }
    ];

    for (var i = 0; i < mountainPositions.length; i++) {
        var mp = mountainPositions[i];
        var mScale = 80 + i * 5;
        var mRot = i * 0.79;

        if (useGLB && envModelCache['mountain']) {
            placeEnvModel(scene, 'mountain', mp.x, mp.h, mp.z, mScale, mRot);
        } else {
            // Fallback: cone mountain
            var mountainHeight = 80 + Math.random() * 60;
            var mountainRadius = 60 + Math.random() * 40;
            var mountainGeometry = new THREE.ConeGeometry(mountainRadius, mountainHeight, 8);
            var mountainMaterial = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.75, 0.4, 0.5),
                roughness: 0.6, metalness: 0.2
            });
            var mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
            mountain.position.set(mp.x, mountainHeight / 2, mp.z);
            mountain.receiveShadow = true;
            scene.add(mountain);
            trackMeshes.push(mountain);
        }
    }

    // 魔法の水面 - ShaderMaterialで波アニメーション + 反射
    var waterVS = [
        'uniform float uTime;',
        'varying vec2 vUv;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormal;',
        'void main() {',
        '  vUv = uv;',
        '  vec3 pos = position;',
        '  // 複数の波を重ね合わせ',
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
        '  // 波紋パターン',
        '  float ripple1 = sin(vUv.x * 20.0 + uTime * 2.0) * 0.5 + 0.5;',
        '  float ripple2 = sin(vUv.y * 15.0 - uTime * 1.5) * 0.5 + 0.5;',
        '  float ripple = ripple1 * ripple2;',
        '  // 水面の色',
        '  vec3 baseColor = mix(uDeepColor, uWaterColor, ripple * 0.4 + 0.3);',
        '  // 光の反射（フレネル近似）',
        '  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);',
        '  vec3 highlight = vec3(0.8, 0.7, 1.0) * fresnel * 0.5;',
        '  // きらめき',
        '  float sparkle = pow(sin(vUv.x * 40.0 + uTime * 3.0) * sin(vUv.y * 35.0 - uTime * 2.5), 8.0) * 0.3;',
        '  vec3 finalColor = baseColor + highlight + vec3(sparkle);',
        '  gl_FragColor = vec4(finalColor, 0.7);',
        '}'
    ].join('\n');

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
                uWaterColor: { value: new THREE.Color(0x5533EE) },
                uDeepColor: { value: new THREE.Color(0x2211AA) }
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

    // Fantasy lamp posts along the track every 10 nodes
    var lampColors = [0x00CCFF, 0xFF66AA, 0xAAFF44, 0xFFCC00, 0xCC77FF, 0xFF8844];
    for (var i = 0; i < trackNodes.length; i += 10) {
        var node = trackNodes[i];
        var angle = getTrackAngle(i);
        var side = (i % 20 === 0) ? 1 : -1;
        var lampDist = TRACK_WIDTH / 2 + 4;
        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;
        var lx = node.x + perpX * lampDist;
        var lz = node.z + perpZ * lampDist;

        // Pole
        var poleGeom = new THREE.CylinderGeometry(0.15, 0.2, 5, 6);
        var poleMat = new THREE.MeshLambertMaterial({
            color: 0x888899, metalness: 0.7, roughness: 0.2
        });
        var pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.set(lx, node.y + 2.5, lz);
        pole.castShadow = true;
        scene.add(pole);
        trackMeshes.push(pole);

        // Lamp orb on top
        var lampColor = lampColors[Math.floor(i / 10) % lampColors.length];
        var orbGeom = new THREE.SphereGeometry(0.6, 8, 8);
        var orbMat = new THREE.MeshBasicMaterial({
            color: lampColor,
            transparent: true,
            opacity: 0.9
        });
        var orb = new THREE.Mesh(orbGeom, orbMat);
        orb.position.set(lx, node.y + 5.3, lz);
        scene.add(orb);
        trackMeshes.push(orb);

        // Lamp glow halo
        var glowGeom = new THREE.SphereGeometry(1.8, 8, 8);
        var glowMat = new THREE.MeshBasicMaterial({
            color: lampColor,
            transparent: true,
            opacity: 0.12
        });
        var glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.set(lx, node.y + 5.3, lz);
        scene.add(glow);
        trackMeshes.push(glow);
    }

    // Floating light orbs scattered in the air near the track
    var orbColors = [0x88EEFF, 0xFFBBDD, 0xBBFFAA, 0xFFEE88, 0xDDBBFF];
    for (var i = 0; i < 60; i++) {
        var trackIdx = Math.floor(Math.random() * trackNodes.length);
        var node = trackNodes[trackIdx];
        var angle = getTrackAngle(trackIdx);
        var side = (Math.random() > 0.5) ? 1 : -1;
        var dist = 5 + Math.random() * 30;
        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;
        var ox = node.x + perpX * dist;
        var oz = node.z + perpZ * dist;
        var oy = node.y + 3 + Math.random() * 12;

        var oColor = orbColors[Math.floor(Math.random() * orbColors.length)];
        var oSize = 0.2 + Math.random() * 0.4;

        var fOrbGeom = new THREE.SphereGeometry(oSize, 6, 6);
        var fOrbMat = new THREE.MeshBasicMaterial({
            color: oColor,
            transparent: true,
            opacity: 0.7
        });
        var fOrb = new THREE.Mesh(fOrbGeom, fOrbMat);
        fOrb.position.set(ox, oy, oz);
        scene.add(fOrb);
        trackMeshes.push(fOrb);

        // Each floating orb has a soft glow
        var fGlowGeom = new THREE.SphereGeometry(oSize * 3, 6, 6);
        var fGlowMat = new THREE.MeshBasicMaterial({
            color: oColor,
            transparent: true,
            opacity: 0.06
        });
        var fGlow = new THREE.Mesh(fGlowGeom, fGlowMat);
        fGlow.position.set(ox, oy, oz);
        scene.add(fGlow);
        trackMeshes.push(fGlow);
    }

    // Trackside flower gardens (small colorful patches near the road)
    var gardenColors = [0xFF66AA, 0xFFAA33, 0xAA44FF, 0x44CCFF, 0xFFDD44];
    for (var i = 0; i < 25; i++) {
        var trackIdx = Math.floor(Math.random() * trackNodes.length);
        var node = trackNodes[trackIdx];
        var angle = getTrackAngle(trackIdx);
        var side = (Math.random() > 0.5) ? 1 : -1;
        var dist = TRACK_WIDTH / 2 + 3 + Math.random() * 8;
        var perpX = -Math.sin(angle) * side;
        var perpZ = Math.cos(angle) * side;
        var gx = node.x + perpX * dist;
        var gz = node.z + perpZ * dist;

        // Small cluster of colorful sphere "flowers"
        var clusterColor = gardenColors[Math.floor(Math.random() * gardenColors.length)];
        var numFlowers = 4 + Math.floor(Math.random() * 6);
        for (var f = 0; f < numFlowers; f++) {
            var fGeom = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 6, 6);
            var fMat = new THREE.MeshLambertMaterial({
                color: clusterColor,
                emissive: clusterColor,
                emissiveIntensity: 0.2,
                roughness: 0.5
            });
            var flower = new THREE.Mesh(fGeom, fMat);
            flower.position.set(
                gx + (Math.random() - 0.5) * 3,
                node.y + 0.2 + Math.random() * 0.3,
                gz + (Math.random() - 0.5) * 3
            );
            scene.add(flower);
            trackMeshes.push(flower);
        }
        // Stem/leaf underneath
        var leafGeom = new THREE.CylinderGeometry(1.5, 2, 0.15, 8);
        var leafMat = new THREE.MeshLambertMaterial({color: 0x33AA55, roughness: 0.8});
        var leaf = new THREE.Mesh(leafGeom, leafMat);
        leaf.position.set(gx, node.y + 0.08, gz);
        scene.add(leaf);
        trackMeshes.push(leaf);
    }

    // Fantasy windmills scattered along the track
    var windmillPositions = [
        { trackIdx: 10, side: 1, distance: 50 },
        { trackIdx: 35, side: -1, distance: 60 },
        { trackIdx: 55, side: 1, distance: 55 },
        { trackIdx: 80, side: -1, distance: 65 }
    ];
    for (var i = 0; i < windmillPositions.length; i++) {
        var wp = windmillPositions[i];
        var node = trackNodes[wp.trackIdx];
        var angle = getTrackAngle(wp.trackIdx);
        var perpX = -Math.sin(angle) * wp.side;
        var perpZ = Math.cos(angle) * wp.side;
        var wmX = node.x + perpX * wp.distance;
        var wmZ = node.z + perpZ * wp.distance;
        var wmY = getTerrainHeight(wmX, wmZ);
        var wmScale = 40;
        if (useGLB && envModelCache['windmill']) {
            placeEnvModel(scene, 'windmill', wmX, wmY, wmZ, wmScale, i * 1.57);
        }
    }

    // Crystal fountains at scenic points along the track
    var fountainPositions = [
        { trackIdx: 20, side: 1, distance: 35 },
        { trackIdx: 45, side: -1, distance: 40 },
        { trackIdx: 70, side: 1, distance: 38 },
        { trackIdx: 90, side: -1, distance: 42 }
    ];
    for (var i = 0; i < fountainPositions.length; i++) {
        var fp = fountainPositions[i];
        var node = trackNodes[fp.trackIdx];
        var angle = getTrackAngle(fp.trackIdx);
        var perpX = -Math.sin(angle) * fp.side;
        var perpZ = Math.cos(angle) * fp.side;
        var ftX = node.x + perpX * fp.distance;
        var ftZ = node.z + perpZ * fp.distance;
        var ftY = getTerrainHeight(ftX, ftZ);
        var ftScale = 26;
        if (useGLB && envModelCache['fountain']) {
            placeEnvModel(scene, 'fountain', ftX, ftY, ftZ, ftScale, i * 1.57);
        }
    }

    // Magical arch gates along the track
    var archgatePositions = [
        { trackIdx: 15, side: 1, distance: 32 },
        { trackIdx: 40, side: -1, distance: 36 },
        { trackIdx: 60, side: 1, distance: 34 },
        { trackIdx: 85, side: -1, distance: 38 }
    ];
    for (var i = 0; i < archgatePositions.length; i++) {
        var ag = archgatePositions[i];
        var node = trackNodes[ag.trackIdx];
        var angle = getTrackAngle(ag.trackIdx);
        var perpX = -Math.sin(angle) * ag.side;
        var perpZ = Math.cos(angle) * ag.side;
        var agX = node.x + perpX * ag.distance;
        var agZ = node.z + perpZ * ag.distance;
        var agY = getTerrainHeight(agX, agZ);
        var agScale = 32;
        if (useGLB && envModelCache['archgate']) {
            placeEnvModel(scene, 'archgate', agX, agY, agZ, agScale, ag.trackIdx * 0.06);
        }
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
        color: 0x7B5B3A,
        roughness: 0.85,
        metalness: 0.0
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
            color: new THREE.Color().setHSL(hue, 0.65, 0.32 + t * 0.05),
            roughness: 0.75,
            metalness: 0.0
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
        color: 0x7B5533,
        roughness: 0.85,
        metalness: 0.0
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
        color: baseColor,
        roughness: 0.75,
        metalness: 0.0
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
            color: new THREE.Color().setHSL(hue + (Math.random() - 0.5) * 0.04, 0.55, 0.35 + Math.random() * 0.08),
            roughness: 0.8
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
        color: 0x8b7355,
        roughness: 0.85,
        metalness: 0.0
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
            color: 0x44cc55,
            roughness: 0.8,
            metalness: 0.0
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

    // Clean neon colors - cyan left, pink right
    var leftColor = 0x00CCFF;
    var rightColor = 0xFF44AA;

    // Translucent post material
    var postMat = new THREE.MeshLambertMaterial({
        color: 0xBBCCFF, metalness: 0.7, roughness: 0.1,
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
                transparent: true, opacity: 0.7, metalness: 0.4, roughness: 0.1
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
        color: wallColor,
        roughness: 0.7,
        metalness: 0.2
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
        color: 0x333333,
        roughness: 0.6,
        metalness: 0.3
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
        color: 0x444444,
        roughness: 0.5,
        metalness: 0.6
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
        roughness: 0.4,
        metalness: 0.3,
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
            color: (i % 2 === 0) ? 0xdddddd : 0xaaaaaa,
            roughness: 0.8,
            metalness: 0.2
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
