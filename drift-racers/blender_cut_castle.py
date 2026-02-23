import bpy
import bmesh
import mathutils

input_path = "C:/Users/tsuyo/games/drift-racers/models/castle.glb"
output_path = "C:/Users/tsuyo/games/drift-racers/models/castle-clean.glb"

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=input_path)

obj = None
for o in bpy.data.objects:
    if o.type == 'MESH':
        obj = o
        break

print(f"Mesh: {obj.name}, verts: {len(obj.data.vertices)}")

min_co = mathutils.Vector((float('inf'),) * 3)
max_co = mathutils.Vector((float('-inf'),) * 3)
for v in obj.data.vertices:
    co = obj.matrix_world @ v.co
    for i in range(3):
        min_co[i] = min(min_co[i], co[i])
        max_co[i] = max(max_co[i], co[i])

center = (min_co + max_co) / 2
size = max_co - min_co
print(f"Center: {center}, Size: {size}")

bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(obj.data)
bm.faces.ensure_lookup_table()

# Gentle: only outer edge + bottom + flat vertical panels at edges
outer_radius = max(size.x, size.z) * 0.40
bottom_cut = min_co.y + size.y * 0.05
panel_radius = max(size.x, size.z) * 0.30

faces_to_delete = []
for face in bm.faces:
    fc = obj.matrix_world @ face.calc_center_median()
    dx = fc.x - center.x
    dz = fc.z - center.z
    dist = (dx*dx + dz*dz) ** 0.5

    if dist > outer_radius:
        faces_to_delete.append(face)
        continue

    if fc.y < bottom_cut:
        faces_to_delete.append(face)
        continue

    # Flat vertical panels beyond 30%
    n = face.normal
    if dist > panel_radius and abs(n.y) < 0.15 and face.calc_area() > 0.00003:
        faces_to_delete.append(face)

print(f"Deleting {len(faces_to_delete)} / {len(bm.faces)} faces")
bmesh.ops.delete(bm, geom=faces_to_delete, context='FACES')
bmesh.update_edit_mesh(obj.data)

# Clean loose verts/edges only (no island removal)
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)

bpy.ops.object.mode_set(mode='OBJECT')
print(f"Remaining verts: {len(obj.data.vertices)}")

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)
print(f"Saved: {output_path}")
