// items.js - Item boxes, traps, and projectiles for drift-racers
// Mario Kart-style 3D racing game using Three.js r128
// Dependencies: ITEMS, TRACK_POINTS, TRACK_WIDTH, getTrackPoint, getTrackAngle

var itemBoxes = [];
var itemBoxMeshes = [];
var traps = [];
var trapMeshes = [];
var projectiles = [];
var projMeshes = [];
var energyRings = [];
var energyRingMeshes = [];

// Helper function to create question mark texture
function createQuestionMarkTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 64);

    var texture = new THREE.CanvasTexture(canvas);
    return texture;
}

// Generate item boxes along the track
function generateItemBoxes(scene) {
    var questionTexture = createQuestionMarkTexture();

    for (var i = 10; i < TRACK_POINTS - 5; i += 10) {
        var trackPoint = getTrackPoint(i);
        var trackAngle = getTrackAngle(i);

        // Perpendicular angle (90 degrees to track direction)
        var perpAngle = trackAngle + Math.PI / 2;

        // Place 3 boxes: left, center, right
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

            // Create visual mesh - Mario Kart style item box
            var group = new THREE.Group();

            // Main rainbow-tinted cube - more Mario Kart feel
            var cubeGeometry = new THREE.BoxGeometry(2.2, 2.2, 2.2);
            var rainbowHue = (i * 0.12 + j * 0.33) % 1.0;
            var cubeColor = new THREE.Color().setHSL(rainbowHue, 0.9, 0.55);
            var cubeMaterial = new THREE.MeshLambertMaterial({
                color: cubeColor,
                emissive: cubeColor,
                emissiveIntensity: 0.4,
                transparent: true,
                opacity: 0.8
            });
            var cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
            cubeMesh.castShadow = true;
            group.add(cubeMesh);

            // Question marks on each face
            var qMarkGeometry = new THREE.PlaneGeometry(1.8, 1.8);
            var qMarkMaterial = new THREE.MeshBasicMaterial({
                map: questionTexture,
                transparent: true,
                side: THREE.DoubleSide
            });

            // Front face
            var qMarkFront = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkFront.position.z = 1.11;
            group.add(qMarkFront);

            // Back face
            var qMarkBack = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkBack.position.z = -1.11;
            qMarkBack.rotation.y = Math.PI;
            group.add(qMarkBack);

            // Right face
            var qMarkRight = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkRight.position.x = 1.11;
            qMarkRight.rotation.y = Math.PI / 2;
            group.add(qMarkRight);

            // Left face
            var qMarkLeft = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkLeft.position.x = -1.11;
            qMarkLeft.rotation.y = -Math.PI / 2;
            group.add(qMarkLeft);

            // Top face
            var qMarkTop = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkTop.position.y = 1.11;
            qMarkTop.rotation.x = -Math.PI / 2;
            group.add(qMarkTop);

            // Bottom face
            var qMarkBottom = new THREE.Mesh(qMarkGeometry, qMarkMaterial);
            qMarkBottom.position.y = -1.11;
            qMarkBottom.rotation.x = Math.PI / 2;
            group.add(qMarkBottom);

            group.position.set(box.x, box.y, box.z);
            scene.add(group);
            itemBoxMeshes.push(group);
        }
    }
}

// Add a trap/bomb on the track
function addTrap(scene, x, y, z, owner) {
    var trap = {
        x: x,
        y: y,
        z: z,
        life: 600,
        owner: owner || null
    };

    traps.push(trap);

    // Create spiky bomb visual
    var group = new THREE.Group();

    // Main bomb sphere
    var sphereGeometry = new THREE.SphereGeometry(1.2, 12, 8);
    var sphereMaterial = new THREE.MeshLambertMaterial({
        color: 0x222222
    });
    var sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    group.add(sphere);

    // Add spikes around the sphere
    var spikeGeometry = new THREE.ConeGeometry(0.3, 0.8, 6);
    var spikeMaterial = new THREE.MeshLambertMaterial({
        color: 0x111111
    });

    var spikePositions = [
        {x: 1.2, y: 0, z: 0, rx: 0, rz: Math.PI/2},
        {x: -1.2, y: 0, z: 0, rx: 0, rz: -Math.PI/2},
        {x: 0, y: 0, z: 1.2, rx: 0, rz: 0},
        {x: 0, y: 0, z: -1.2, rx: 0, rz: Math.PI},
        {x: 0, y: 1.2, z: 0, rx: 0, rz: 0},
        {x: 0, y: -1.2, z: 0, rx: Math.PI, rz: 0},
        {x: 0.85, y: 0.85, z: 0, rx: Math.PI/4, rz: Math.PI/2},
        {x: -0.85, y: 0.85, z: 0, rx: Math.PI/4, rz: -Math.PI/2}
    ];

    for (var i = 0; i < spikePositions.length; i++) {
        var spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
        spike.position.set(spikePositions[i].x, spikePositions[i].y, spikePositions[i].z);
        spike.rotation.x = spikePositions[i].rx;
        spike.rotation.z = spikePositions[i].rz;
        spike.castShadow = true;
        group.add(spike);
    }

    // Red blinking light on top
    var lightGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    var lightMaterial = new THREE.MeshLambertMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1.0
    });
    var light = new THREE.Mesh(lightGeometry, lightMaterial);
    light.position.y = 1.5;
    group.add(light);
    group.userData.light = light;

    group.position.set(x, y, z);
    scene.add(group);
    trapMeshes.push(group);
}

// Fire a homing projectile
function addProjectile(scene, x, y, z, ang, owner) {
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

    // Create projectile visual
    var group = new THREE.Group();

    // Main body - red sphere
    var bodyGeometry = new THREE.SphereGeometry(0.6, 8, 6);
    var bodyMaterial = new THREE.MeshLambertMaterial({
        color: 0xff0000,
        emissive: 0x880000,
        emissiveIntensity: 0.8
    });
    var body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    group.add(body);

    // Fire trail - elongated box behind
    var trailGeometry = new THREE.BoxGeometry(0.4, 0.4, 1.2);
    var trailMaterial = new THREE.MeshLambertMaterial({
        color: 0xff6600,
        emissive: 0xff6600,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.7
    });
    var trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.z = -0.8;
    group.add(trail);

    group.position.set(projectile.x, projectile.y, projectile.z);
    group.rotation.y = ang;
    scene.add(group);
    projMeshes.push(group);
}

// Update item boxes each frame
function updateItemBoxes() {
    for (var i = 0; i < itemBoxes.length; i++) {
        var box = itemBoxes[i];
        var mesh = itemBoxMeshes[i];

        if (!box.active) {
            // Respawn countdown
            box.respawn--;
            if (box.respawn <= 0) {
                box.active = true;
                mesh.visible = true;
            }
        } else {
            // Spin the box - faster, more noticeable
            mesh.rotation.y += 0.04;
            mesh.rotation.x = Math.sin(Date.now() * 0.002) * 0.15;

            // Bouncy floating animation
            var floatOffset = Math.sin(Date.now() * 0.004 + i * 0.5) * 0.5;
            mesh.position.y = box.baseY + floatOffset;

            // Cycle emissive color for rainbow shimmer
            if (mesh.children[0] && mesh.children[0].material) {
              var hue = ((Date.now() * 0.001) + i * 0.1) % 1.0;
              mesh.children[0].material.emissive.setHSL(hue, 0.8, 0.35);
            }
        }
    }
}

// Update projectiles each frame
function updateProjectiles(scene, racers) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
        var proj = projectiles[i];
        var mesh = projMeshes[i];

        // Find nearest enemy racer (not owner)
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

            // Normalize angle difference to -PI to PI
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Steer with max turn rate
            if (angleDiff > 0.06) {
                proj.ang += 0.06;
            } else if (angleDiff < -0.06) {
                proj.ang -= 0.06;
            } else {
                proj.ang += angleDiff;
            }
        }

        // Move projectile
        proj.x += Math.cos(proj.ang) * proj.spd;
        proj.z += Math.sin(proj.ang) * proj.spd;

        // Decrement life
        proj.life--;

        // Update mesh
        mesh.position.set(proj.x, proj.y, proj.z);
        mesh.rotation.y = proj.ang;

        // Remove if life expired
        if (proj.life <= 0) {
            scene.remove(mesh);
            projectiles.splice(i, 1);
            projMeshes.splice(i, 1);
        }
    }
}

// Update traps each frame
function updateTraps(scene) {
    var frameCount = Date.now() / 16;

    for (var i = traps.length - 1; i >= 0; i--) {
        var trap = traps[i];
        var mesh = trapMeshes[i];

        // Decrement life
        trap.life--;

        // Rotate for visual effect
        mesh.rotation.y += 0.02;

        // Blink the red light
        if (mesh.userData.light) {
            var blinkOn = Math.floor(frameCount / 15) % 2 === 0;
            mesh.userData.light.material.emissiveIntensity = blinkOn ? 1.0 : 0.2;
        }

        // Remove if life expired
        if (trap.life <= 0) {
            scene.remove(mesh);
            traps.splice(i, 1);
            trapMeshes.splice(i, 1);
        }
    }
}

// Generate energy rings along the track
function generateEnergyRings(scene) {
    energyRings = [];
    energyRingMeshes = [];

    // Place rings every 5 track points, offset from item boxes
    for (var i = 3; i < TRACK_POINTS; i += 5) {
        var trackPoint = getTrackPoint(i);
        var trackAngle = getTrackAngle(i);
        var perpAngle = trackAngle + Math.PI / 2;

        // Alternate sides: left, center, right
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
        var group = new THREE.Group();

        // Diamond shape using two cones
        var topGeo = new THREE.ConeGeometry(0.6, 0.8, 6);
        var botGeo = new THREE.ConeGeometry(0.6, 0.4, 6);
        var ringMat = new THREE.MeshLambertMaterial({
            color: 0x00ddff,
            emissive: 0x0088cc,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: 0.85
        });

        var topMesh = new THREE.Mesh(topGeo, ringMat);
        topMesh.position.y = 0.2;
        group.add(topMesh);

        var botMesh = new THREE.Mesh(botGeo, ringMat);
        botMesh.rotation.x = Math.PI;
        botMesh.position.y = -0.2;
        group.add(botMesh);

        // Inner glow sphere
        var glowGeo = new THREE.SphereGeometry(0.3, 8, 6);
        var glowMat = new THREE.MeshBasicMaterial({
            color: 0x88ffff,
            transparent: true,
            opacity: 0.4
        });
        var glowMesh = new THREE.Mesh(glowGeo, glowMat);
        group.add(glowMesh);

        group.position.set(ring.x, ring.y, ring.z);
        scene.add(group);
        energyRingMeshes.push(group);
    }
}

// Update energy rings each frame
function updateEnergyRings() {
    for (var i = 0; i < energyRings.length; i++) {
        var ring = energyRings[i];
        var mesh = energyRingMeshes[i];

        if (!ring.active) {
            ring.respawn--;
            if (ring.respawn <= 0) {
                ring.active = true;
                mesh.visible = true;
            }
        } else {
            // Spin and float
            mesh.rotation.y += 0.05;
            var floatOffset = Math.sin(Date.now() * 0.003 + i * 0.7) * 0.3;
            mesh.position.y = ring.y + floatOffset;

            // Pulse glow
            var pulse = 0.5 + Math.sin(Date.now() * 0.005 + i) * 0.2;
            if (mesh.children[0] && mesh.children[0].material) {
                mesh.children[0].material.emissiveIntensity = pulse;
            }
        }
    }
}

// ============================================================================
// BOOST PADS - Speed boost panels on the track
// ============================================================================
var boostPads = [];
var boostPadMeshes = [];

function generateBoostPads(scene) {
    boostPads = [];
    boostPadMeshes = [];

    // Place boost pads at specific track positions (every ~25 points, avoiding item boxes)
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

        // Visual: glowing arrow panel on the road
        var group = new THREE.Group();

        // Base plate
        var plateGeo = new THREE.BoxGeometry(6, 0.15, 8);
        var plateMat = new THREE.MeshLambertMaterial({
            color: 0xFF6600,
            emissive: 0xFF4400,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.85
        });
        var plate = new THREE.Mesh(plateGeo, plateMat);
        group.add(plate);

        // Arrow chevrons (3 arrows pointing forward)
        var arrowMat = new THREE.MeshLambertMaterial({
            color: 0xFFDD00,
            emissive: 0xFFAA00,
            emissiveIntensity: 0.8
        });

        for (var a = 0; a < 3; a++) {
            // Each arrow is two angled planes forming a V/chevron
            var chevGeo = new THREE.BoxGeometry(2.0, 0.2, 0.3);
            var leftChev = new THREE.Mesh(chevGeo, arrowMat);
            leftChev.position.set(-0.8, 0.1, -2 + a * 2.5);
            leftChev.rotation.y = 0.4;
            group.add(leftChev);

            var rightChev = new THREE.Mesh(chevGeo, arrowMat);
            rightChev.position.set(0.8, 0.1, -2 + a * 2.5);
            rightChev.rotation.y = -0.4;
            group.add(rightChev);
        }

        // Side glow strips
        var stripMat = new THREE.MeshLambertMaterial({
            color: 0xFF8800,
            emissive: 0xFF6600,
            emissiveIntensity: 0.6
        });
        var stripGeo = new THREE.BoxGeometry(0.3, 0.2, 8);
        group.add(new THREE.Mesh(stripGeo, stripMat).translateX(-3));
        group.add(new THREE.Mesh(stripGeo, stripMat).translateX(3));

        group.position.set(pad.x, pad.y, pad.z);
        group.rotation.y = -trackAngle - Math.PI / 2;
        scene.add(group);
        boostPadMeshes.push(group);
    }
}

function updateBoostPads() {
    var time = Date.now() * 0.003;
    for (var i = 0; i < boostPadMeshes.length; i++) {
        var mesh = boostPadMeshes[i];
        // Pulse the glow
        if (mesh.children[0] && mesh.children[0].material) {
            mesh.children[0].material.emissiveIntensity = 0.4 + Math.sin(time + i) * 0.2;
        }
        // Animate arrows (scroll effect via emissive pulse)
        for (var c = 1; c < mesh.children.length - 2; c++) {
            var child = mesh.children[c];
            if (child.material && child.material.emissive) {
                var phase = (time * 2 + c * 0.5) % 2;
                child.material.emissiveIntensity = phase < 1 ? 0.5 + phase * 0.5 : 1.5 - phase * 0.5;
            }
        }
    }
}
