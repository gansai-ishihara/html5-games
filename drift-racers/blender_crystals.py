"""
Blender Python script to create realistic crystal formations for Drift Racers.
Creates 3 crystal models + 3 flower models, exports as GLB.

Run with: blender --background --python blender_crystals.py
"""
import bpy
import bmesh
import math
import random
import os
from mathutils import Vector, Matrix

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__)) + "/models"

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for c in bpy.data.collections:
        if c.name != 'Collection':
            bpy.data.collections.remove(c)
    for m in bpy.data.materials:
        bpy.data.materials.remove(m)
    for mesh in bpy.data.meshes:
        bpy.data.meshes.remove(mesh)

def create_crystal_material(name, base_color, emission_color, alpha=0.85, roughness=0.1, metallic=0.0):
    """Create PBR crystal material with emission and transparency."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (600, 0)

    # Mix between glass-like BSDF and emission
    mix = nodes.new('ShaderNodeMixShader')
    mix.location = (400, 0)
    mix.inputs[0].default_value = 0.7  # 70% glass, 30% emission

    # Principled BSDF for the crystal body
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 100)
    bsdf.inputs['Base Color'].default_value = (*base_color, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Alpha'].default_value = alpha
    # IOR for crystal-like refraction
    bsdf.inputs['IOR'].default_value = 1.8
    # Subsurface for inner glow effect
    bsdf.inputs['Subsurface Weight'].default_value = 0.15
    bsdf.inputs['Subsurface Color'].default_value = (*emission_color, 1.0)

    # Emission shader for glow
    emit = nodes.new('ShaderNodeEmission')
    emit.location = (0, -100)
    emit.inputs['Color'].default_value = (*emission_color, 1.0)
    emit.inputs['Strength'].default_value = 0.3

    links.new(bsdf.outputs['BSDF'], mix.inputs[1])
    links.new(emit.outputs['Emission'], mix.inputs[2])
    links.new(mix.outputs['Shader'], output.inputs['Surface'])

    return mat

def create_flower_material(name, color, emission_strength=0.5):
    """Create glowing flower material."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.4
    bsdf.inputs['Emission Color'].default_value = (*color, 1.0)
    bsdf.inputs['Emission Strength'].default_value = emission_strength

    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat

def create_single_crystal(height, radius, taper=0.15, segments=6):
    """Create a single crystal prism with beveled edges and slight irregularity."""
    bm = bmesh.new()

    # Create hexagonal prism base
    verts_bottom = []
    verts_top = []
    for i in range(segments):
        angle = (i / segments) * math.pi * 2
        # Add slight irregularity to each vertex
        r_var = radius * (0.9 + random.random() * 0.2)
        rt_var = radius * taper * (0.7 + random.random() * 0.6)

        bx = math.cos(angle) * r_var
        bz = math.sin(angle) * r_var
        verts_bottom.append(bm.verts.new((bx, 0, bz)))

        tx = math.cos(angle) * rt_var
        tz = math.sin(angle) * rt_var
        verts_top.append(bm.verts.new((tx, height, tz)))

    # Create tip vertex (slightly off-center for natural look)
    tip_offset_x = (random.random() - 0.5) * radius * 0.1
    tip_offset_z = (random.random() - 0.5) * radius * 0.1
    tip = bm.verts.new((tip_offset_x, height * 1.08, tip_offset_z))

    bm.verts.ensure_lookup_table()

    # Bottom face
    bm.faces.new(verts_bottom)

    # Side faces
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([verts_bottom[i], verts_bottom[ni], verts_top[ni], verts_top[i]])

    # Top faces (pyramid to tip)
    for i in range(segments):
        ni = (i + 1) % segments
        bm.faces.new([verts_top[i], verts_top[ni], tip])

    mesh = bpy.data.meshes.new('crystal_prism')
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new('crystal_prism', mesh)
    bpy.context.collection.objects.link(obj)

    # Add bevel modifier for smoother edges
    bevel = obj.modifiers.new('Bevel', 'BEVEL')
    bevel.width = radius * 0.04
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(30)

    return obj

def create_crystal_formation(num_crystals=8, base_height=4.0, base_radius=0.5, spread=1.5):
    """Create a cluster of crystals forming a natural-looking formation."""
    crystals = []

    # Main central crystal (tallest)
    main_h = base_height * (0.9 + random.random() * 0.3)
    main_r = base_radius * (0.9 + random.random() * 0.2)
    main = create_single_crystal(main_h, main_r, taper=0.12)
    main.rotation_euler.x = (random.random() - 0.5) * 0.08
    main.rotation_euler.z = (random.random() - 0.5) * 0.08
    crystals.append(main)

    # Surrounding crystals
    for i in range(num_crystals - 1):
        angle = (i / (num_crystals - 1)) * math.pi * 2 + random.random() * 0.5
        dist = spread * (0.5 + random.random() * 0.8)
        h = base_height * (0.3 + random.random() * 0.5)
        r = base_radius * (0.4 + random.random() * 0.5)

        crystal = create_single_crystal(h, r, taper=0.1 + random.random() * 0.15)
        crystal.location.x = math.cos(angle) * dist
        crystal.location.z = math.sin(angle) * dist
        crystal.location.y = random.random() * 0.2  # slight y variation

        # Tilt outward slightly
        tilt_angle = 0.1 + random.random() * 0.2
        crystal.rotation_euler.x = -math.cos(angle) * tilt_angle
        crystal.rotation_euler.z = math.sin(angle) * tilt_angle
        crystal.rotation_euler.y = random.random() * math.pi * 2

        crystals.append(crystal)

    return crystals

def create_flower(petals=6, petal_length=0.3, center_size=0.08):
    """Create a single fantasy flower with glowing petals."""
    bm = bmesh.new()

    # Center sphere
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=center_size)

    mesh = bpy.data.meshes.new('flower_center')
    bm.to_mesh(mesh)
    bm.free()
    center = bpy.data.objects.new('flower_center', mesh)
    bpy.context.collection.objects.link(center)

    # Petals as flattened ellipsoids
    petal_objs = [center]
    for i in range(petals):
        angle = (i / petals) * math.pi * 2
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=8, ring_count=6, radius=petal_length,
            location=(math.cos(angle) * petal_length * 0.5, 0, math.sin(angle) * petal_length * 0.5)
        )
        petal = bpy.context.active_object
        petal.scale = (1.0, 0.15, 0.5)
        petal.rotation_euler.y = -angle
        petal.rotation_euler.x = 0.3  # tilt up slightly
        petal_objs.append(petal)

    # Stem
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.02, depth=0.5,
        location=(0, -0.25, 0)
    )
    stem = bpy.context.active_object
    petal_objs.append(stem)

    return petal_objs

def create_flower_cluster(num_flowers=12, spread=2.0, colors=None):
    """Create a cluster of flowers with varied heights and colors."""
    all_objs = []
    for i in range(num_flowers):
        angle = random.random() * math.pi * 2
        dist = random.random() * spread
        x = math.cos(angle) * dist
        z = math.sin(angle) * dist
        scale = 0.5 + random.random() * 1.0

        flower_parts = create_flower(
            petals=5 + random.randint(0, 3),
            petal_length=0.25 + random.random() * 0.15
        )

        for part in flower_parts:
            part.location.x += x
            part.location.z += z
            part.scale *= scale
            all_objs.append(part)

    return all_objs

def apply_modifiers_and_join(objects):
    """Apply all modifiers and join objects into one."""
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        if obj and obj.name in bpy.data.objects:
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj

    # Apply modifiers
    for obj in objects:
        if obj and obj.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = obj
            for mod in obj.modifiers:
                try:
                    bpy.ops.object.modifier_apply(modifier=mod.name)
                except:
                    pass

    # Join
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        if obj and obj.name in bpy.data.objects:
            obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()

    return bpy.context.active_object

def export_glb(filepath):
    """Export selected objects as GLB."""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT',
        export_colors=True,
        export_normals=True
    )
    print(f"Exported: {filepath}")

# === MAIN ===
random.seed(42)

# --- 1. Large Crystal Formation ---
print("Creating crystal-formation-a.glb...")
clear_scene()
crystals = create_crystal_formation(num_crystals=10, base_height=5.0, base_radius=0.6, spread=2.0)
mat_blue = create_crystal_material('crystal_blue', (0.3, 0.6, 0.9), (0.2, 0.4, 0.8), alpha=0.8, roughness=0.08)
for c in crystals:
    c.data.materials.append(mat_blue)
joined = apply_modifiers_and_join(crystals)
joined.select_set(True)
export_glb(os.path.join(OUTPUT_DIR, 'crystal-formation-a.glb'))

# --- 2. Medium Crystal Cluster ---
print("Creating crystal-cluster-b.glb...")
clear_scene()
crystals = create_crystal_formation(num_crystals=6, base_height=2.5, base_radius=0.35, spread=1.0)
mat_purple = create_crystal_material('crystal_purple', (0.5, 0.2, 0.7), (0.4, 0.15, 0.6), alpha=0.8, roughness=0.1)
for c in crystals:
    c.data.materials.append(mat_purple)
joined = apply_modifiers_and_join(crystals)
joined.select_set(True)
export_glb(os.path.join(OUTPUT_DIR, 'crystal-cluster-b.glb'))

# --- 3. Small Crystal Shard ---
print("Creating crystal-shard-c.glb...")
clear_scene()
crystals = create_crystal_formation(num_crystals=3, base_height=1.2, base_radius=0.2, spread=0.4)
mat_teal = create_crystal_material('crystal_teal', (0.2, 0.7, 0.6), (0.15, 0.5, 0.45), alpha=0.85, roughness=0.12)
for c in crystals:
    c.data.materials.append(mat_teal)
joined = apply_modifiers_and_join(crystals)
joined.select_set(True)
export_glb(os.path.join(OUTPUT_DIR, 'crystal-shard-c.glb'))

# --- 4. Pink Flower Cluster ---
print("Creating flower-pink.glb...")
clear_scene()
flowers = create_flower_cluster(num_flowers=10, spread=1.5)
mat_pink = create_flower_material('flower_pink', (0.9, 0.3, 0.5), emission_strength=0.4)
mat_stem = create_flower_material('stem_green', (0.2, 0.5, 0.15), emission_strength=0.1)
for f in flowers:
    if f and f.name in bpy.data.objects:
        if 'stem' in f.name.lower() or 'cylinder' in f.name.lower():
            f.data.materials.clear()
            f.data.materials.append(mat_stem)
        else:
            f.data.materials.clear()
            f.data.materials.append(mat_pink)
joined = apply_modifiers_and_join(flowers)
if joined:
    joined.select_set(True)
    export_glb(os.path.join(OUTPUT_DIR, 'flower-pink.glb'))

# --- 5. Blue Flower Cluster ---
print("Creating flower-blue.glb...")
clear_scene()
random.seed(43)
flowers = create_flower_cluster(num_flowers=10, spread=1.5)
mat_blue_fl = create_flower_material('flower_blue', (0.3, 0.5, 0.9), emission_strength=0.4)
for f in flowers:
    if f and f.name in bpy.data.objects:
        if 'stem' in f.name.lower() or 'cylinder' in f.name.lower():
            f.data.materials.clear()
            f.data.materials.append(mat_stem)
        else:
            f.data.materials.clear()
            f.data.materials.append(mat_blue_fl)
joined = apply_modifiers_and_join(flowers)
if joined:
    joined.select_set(True)
    export_glb(os.path.join(OUTPUT_DIR, 'flower-blue.glb'))

# --- 6. Purple Flower Cluster ---
print("Creating flower-purple.glb...")
clear_scene()
random.seed(44)
flowers = create_flower_cluster(num_flowers=10, spread=1.5)
mat_purp_fl = create_flower_material('flower_purple', (0.6, 0.2, 0.8), emission_strength=0.4)
for f in flowers:
    if f and f.name in bpy.data.objects:
        if 'stem' in f.name.lower() or 'cylinder' in f.name.lower():
            f.data.materials.clear()
            f.data.materials.append(mat_stem)
        else:
            f.data.materials.clear()
            f.data.materials.append(mat_purp_fl)
joined = apply_modifiers_and_join(flowers)
if joined:
    joined.select_set(True)
    export_glb(os.path.join(OUTPUT_DIR, 'flower-purple.glb'))

print("All models created successfully!")
