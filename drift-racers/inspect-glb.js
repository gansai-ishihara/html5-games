const fs = require('fs');
const path = process.argv[2] || 'models/castle.glb';
const stat = fs.statSync(path);
console.log('File:', path);
console.log('Size:', (stat.size / 1024 / 1024).toFixed(2), 'MB');

const buf = fs.readFileSync(path);
const magic = buf.toString('ascii', 0, 4);
const version = buf.readUInt32LE(4);
console.log('GLB version:', version);

const chunk0Len = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + chunk0Len));

console.log('\nNodes:', json.nodes ? json.nodes.length : 0);
console.log('Meshes:', json.meshes ? json.meshes.length : 0);
console.log('Materials:', json.materials ? json.materials.length : 0);
console.log('Textures:', json.textures ? json.textures.length : 0);
console.log('Images:', json.images ? json.images.length : 0);

if (json.nodes) {
  console.log('\n--- Nodes ---');
  json.nodes.forEach(function(n, i) {
    var hasMesh = n.mesh !== undefined;
    var info = 'Node ' + i + ': ' + (n.name || '(unnamed)');
    if (hasMesh) info += ' [mesh:' + n.mesh + ']';
    if (n.children) info += ' [children:' + n.children.join(',') + ']';
    if (n.translation) info += ' pos:(' + n.translation.map(function(v){return v.toFixed(1)}).join(',') + ')';
    if (n.scale) info += ' scale:(' + n.scale.map(function(v){return v.toFixed(2)}).join(',') + ')';
    console.log('  ' + info);
  });
}

if (json.meshes) {
  console.log('\n--- Meshes ---');
  json.meshes.forEach(function(m, i) {
    var vertCount = 0;
    m.primitives.forEach(function(p) {
      if (p.attributes && p.attributes.POSITION !== undefined && json.accessors) {
        vertCount += json.accessors[p.attributes.POSITION].count;
      }
    });
    console.log('  Mesh ' + i + ': ' + (m.name || '(unnamed)') + ' (' + m.primitives.length + ' prims, ~' + vertCount + ' verts)');
  });
}
