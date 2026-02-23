"""
Fix Sora's protruding mouth/lower face in GLB using Blender.
Blender GLB coordinate system: X=left/right, Z=up/down, Y=front/back

v2: More aggressive flattening
- Lower 40% of head (was 30%)
- Correction rate 0.97 (was 0.92)
- Face width 0.18 (was 0.12)
- Target Y = face surface (forehead level) for truly flat result
"""
import bpy
import numpy as np
import sys

INPUT = "models/sora-kart-backup.glb"  # Use original backup
OUTPUT = "models/sora-kart-fixed.glb"

# Clear scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import GLB
print(f"Importing {INPUT}...")
bpy.ops.import_scene.gltf(filepath=INPUT)

mesh_objs = [obj for obj in bpy.data.objects if obj.type == 'MESH']
main_obj = max(mesh_objs, key=lambda o: len(o.data.vertices))
mesh = main_obj.data
mat = main_obj.matrix_world
mat_inv = mat.inverted()

# Get world-space vertices
verts_world = np.array([(mat @ v.co).to_tuple() for v in mesh.vertices])
print(f"Vertices: {len(verts_world)}")
print(f"X: {verts_world[:,0].min():.3f} to {verts_world[:,0].max():.3f} (left/right)")
print(f"Y: {verts_world[:,1].min():.3f} to {verts_world[:,1].max():.3f} (front/back)")
print(f"Z: {verts_world[:,2].min():.3f} to {verts_world[:,2].max():.3f} (up/down)")

# === HEAD REGION: top 30% by Z (up) ===
z_vals = verts_world[:,2]
head_z_threshold = np.percentile(z_vals, 70)
head_mask = z_vals > head_z_threshold
head_verts = verts_world[head_mask]

head_cx = head_verts[:,0].mean()  # center X
head_cy = head_verts[:,1].mean()  # center Y (front/back)
head_z_min = head_verts[:,2].min()
head_z_max = head_verts[:,2].max()
head_z_range = head_z_max - head_z_min

print(f"\nHead (Z > {head_z_threshold:.3f}): {head_mask.sum()} verts")
print(f"  Center: X={head_cx:.3f}, Y={head_cy:.3f}")
print(f"  Z range: {head_z_min:.3f} to {head_z_max:.3f} (range={head_z_range:.3f})")
print(f"  Y range: {head_verts[:,1].min():.3f} to {head_verts[:,1].max():.3f}")

# === FACE FRONT: which Y direction is the face? ===
center_x_band = np.abs(verts_world[:,0] - head_cx) < 0.08
head_center = head_mask & center_x_band

y_mean = verts_world[head_center, 1].mean()
y_max = verts_world[head_center, 1].max()
y_min = verts_world[head_center, 1].min()
print(f"  Head center Y: mean={y_mean:.3f}, min={y_min:.3f}, max={y_max:.3f}")

# Forehead reference (upper 40% of head = eye+forehead area)
upper_head_z = head_z_min + head_z_range * 0.6
upper_mask = head_mask & (z_vals > upper_head_z) & center_x_band

if upper_mask.sum() > 0:
    upper_y_max = verts_world[upper_mask, 1].max()
    upper_y_min = verts_world[upper_mask, 1].min()
    upper_y_mean = verts_world[upper_mask, 1].mean()
    print(f"\n  Upper head Y: min={upper_y_min:.3f}, max={upper_y_max:.3f}, mean={upper_y_mean:.3f}")

    dist_to_max = upper_y_max - upper_y_mean
    dist_to_min = upper_y_mean - upper_y_min
    face_dir = 1 if dist_to_max >= dist_to_min else -1
    # Use 80th percentile for reference (slightly recessed from peak)
    if face_dir > 0:
        face_front_ref = np.percentile(verts_world[upper_mask, 1], 80)
    else:
        face_front_ref = np.percentile(verts_world[upper_mask, 1], 20)
    print(f"  Face direction: {'Y+' if face_dir > 0 else 'Y-'}")
    print(f"  Face front ref Y: {face_front_ref:.3f}")

# === MOUTH ZONE: lower 40% of head height (expanded from 30%) ===
mouth_z_high = head_z_min + head_z_range * 0.40  # lower 40% of head
mouth_z_low = head_z_min  # bottom of head
# Eye zone to AVOID: 45-75% of head height
eye_z_low = head_z_min + head_z_range * 0.45
eye_z_high = head_z_min + head_z_range * 0.75

print(f"\n  Mouth zone Z: {mouth_z_low:.3f} to {mouth_z_high:.3f}")
print(f"  Eye zone Z (AVOID): {eye_z_low:.3f} to {eye_z_high:.3f}")

# Mouth vertices: in mouth zone, wider center band (0.18 vs 0.12)
mouth_zone = head_mask & (z_vals > mouth_z_low) & (z_vals < mouth_z_high)
center_face = np.abs(verts_world[:,0] - head_cx) < 0.18  # wider coverage

# Target Y: same as forehead surface (truly flat face)
target_y = face_front_ref

if face_dir > 0:
    protrude_mask = mouth_zone & center_face & (verts_world[:,1] > target_y)
else:
    protrude_mask = mouth_zone & center_face & (verts_world[:,1] < target_y)

print(f"\nTarget Y for mouth: {target_y:.3f}")
print(f"Protruding mouth vertices: {protrude_mask.sum()}")

if protrude_mask.sum() > 0:
    before_y = verts_world[protrude_mask, 1]
    print(f"  Before Y range: {before_y.min():.3f} to {before_y.max():.3f}")

    indices = np.where(protrude_mask)[0]
    for idx in indices:
        world_co = mat @ mesh.vertices[idx].co
        if face_dir > 0:
            excess = world_co.y - target_y
        else:
            excess = target_y - world_co.y

        if excess > 0:
            # Boundary softening near edges (narrower transition)
            z_pos = world_co.z
            z_factor = 1.0
            if z_pos > mouth_z_high - 0.008:
                z_factor = (mouth_z_high - z_pos) / 0.008
            z_factor = max(0.0, min(1.0, z_factor))

            # Much more aggressive correction: 0.97 (was 0.92)
            correction = excess * 0.97 * z_factor
            world_co.y -= correction * face_dir
            mesh.vertices[idx].co = mat_inv @ world_co

    print(f"  Modified {len(indices)} vertices")

    # Smooth ONLY mouth area (not eyes!)
    mesh.update()
    bpy.context.view_layer.objects.active = main_obj

    # Deselect all
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')

    # Select only mouth vertices
    for idx in indices:
        mesh.vertices[idx].select = True

    bpy.ops.object.mode_set(mode='EDIT')
    for _ in range(2):
        bpy.ops.mesh.vertices_smooth(factor=0.2)  # gentler smooth to preserve flatness
    bpy.ops.object.mode_set(mode='OBJECT')
    print("  Applied gentle smoothing to mouth only")

# Also handle transition zone just above mouth (wider transition)
trans_z_high = mouth_z_high + 0.025
trans_mask = head_mask & (z_vals > mouth_z_high) & (z_vals < trans_z_high) & center_face
if face_dir > 0:
    trans_mask = trans_mask & (verts_world[:,1] > target_y)
else:
    trans_mask = trans_mask & (verts_world[:,1] < target_y)

if trans_mask.sum() > 0:
    for idx in np.where(trans_mask)[0]:
        world_co = mat @ mesh.vertices[idx].co
        if face_dir > 0:
            excess = world_co.y - target_y
        else:
            excess = target_y - world_co.y
        if excess > 0:
            t = (world_co.z - mouth_z_high) / (trans_z_high - mouth_z_high)
            correction = excess * 0.97 * (1.0 - t)
            world_co.y -= correction * face_dir
            mesh.vertices[idx].co = mat_inv @ world_co
    print(f"  Smoothed {trans_mask.sum()} transition vertices")

mesh.update()

# Export
print(f"\nExporting to {OUTPUT}...")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
)
print("Done!")
