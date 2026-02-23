"""
Fix Sora's protruding mouth in the GLB model.
Aggressive approach: flatten the entire lower face area.
"""
import trimesh
import numpy as np

print("Loading sora-kart.glb...")
scene = trimesh.load("models/sora-kart.glb")
mesh = scene.geometry['geometry_0']
verts = mesh.vertices.copy()
print(f"Total vertices: {len(verts)}")

y_vals = verts[:,1]
head_y_threshold = np.percentile(y_vals, 70)
head_mask = y_vals > head_y_threshold
head_verts = verts[head_mask]
head_center_x = head_verts[:,0].mean()
head_center_z = head_verts[:,2].mean()

# Reference: the face surface Z at forehead/eye level
upper_y = np.percentile(head_verts[:,1], 55)
upper_mask = head_mask & (y_vals > upper_y) & (np.abs(verts[:,0] - head_center_x) < 0.08)
face_front_z = np.percentile(verts[upper_mask, 2], 85)
print(f"Face front Z ref: {face_front_z:.3f}")

# Mouth/chin zone: entire lower head
mouth_y_high = head_y_threshold + (head_verts[:,1].max() - head_y_threshold) * 0.40
mouth_zone = (y_vals > head_y_threshold) & (y_vals < mouth_y_high)

# Any vertex in the front-center of the mouth zone that exceeds face surface
target_z = face_front_z - 0.01  # mouth should be slightly behind face surface
center_mask = np.abs(verts[:,0] - head_center_x) < 0.15  # wider band
protrude_mask = mouth_zone & center_mask & (verts[:,2] > target_z)
print(f"Target max Z: {target_z:.3f}")
print(f"Protruding vertices: {protrude_mask.sum()}")

if protrude_mask.sum() > 0:
    indices = np.where(protrude_mask)[0]
    print(f"Before: Z range {verts[protrude_mask,2].min():.3f} to {verts[protrude_mask,2].max():.3f}")

    for idx in indices:
        excess = verts[idx, 2] - target_z
        if excess > 0:
            # Full correction: push back to target
            verts[idx, 2] = target_z + excess * 0.05  # Keep just 5% of excess for smoothness

    print(f"After:  Z range {verts[protrude_mask,2].min():.3f} to {verts[protrude_mask,2].max():.3f}")

    # Also smooth the transition zone: vertices just above the mouth zone
    transition_y_low = mouth_y_high
    transition_y_high = mouth_y_high + 0.03
    trans_mask = (y_vals > transition_y_low) & (y_vals < transition_y_high) & center_mask & (verts[:,2] > target_z)
    if trans_mask.sum() > 0:
        for idx in np.where(trans_mask)[0]:
            excess = verts[idx, 2] - target_z
            # Gradual transition: less correction further from mouth
            t = (verts[idx, 1] - transition_y_low) / (transition_y_high - transition_y_low)
            keep_ratio = 0.05 + t * 0.95  # From 5% (near mouth) to 100% (far)
            verts[idx, 2] = target_z + excess * keep_ratio
        print(f"Smoothed {trans_mask.sum()} transition vertices")

    mesh.vertices = verts
    print("\nExporting to sora-kart-fixed.glb...")
    scene.export("models/sora-kart-fixed.glb")
    print("Done!")
else:
    print("No protruding vertices found")
