"""
Drift Racers - Crystal Kingdom Course Generator (Enhanced)
Generates a stunning Crystal Kingdom racing course inspired by the concept art.
Run headless: blender --background --python blender_generate_course.py

Coordinate conversion: Game (Y-up RHS) -> Blender (Z-up RHS)
  Blender X = Game X, Blender Y = -Game Z, Blender Z = Game Y
glTF export with Y-up conversion restores correct game coordinates.
"""

import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix

# ============================================================
# CONSTANTS (must match config.js / track.js)
# ============================================================
TRACK_POINTS = 100
TRACK_WIDTH = 28
TERRAIN_SIZE = 1600
TERRAIN_SEG = 120
ROAD_SUBDIV = 8
ROAD_SMOOTH_MULT = 10

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "models", "course.glb")

# Seed for deterministic placement
random.seed(42)

# ============================================================
# COORDINATE HELPERS
# ============================================================
def g2b(gx, gy, gz):
    return Vector((gx, -gz, gy))

def g2b_tuple(gx, gy, gz):
    return (gx, -gz, gy)

# ============================================================
# TRACK MATH (exact copy of JS generateTrack)
# ============================================================
def generate_track_nodes():
    nodes = []
    for i in range(TRACK_POINTS):
        t = (i / TRACK_POINTS) * math.pi * 2
        r = 280 + 80 * math.sin(t * 2) + 50 * math.cos(t * 3) + 30 * math.sin(t * 5 + 1)
        y = 4 + 2 * math.sin(t * 3) + 1 * math.cos(t * 2 + 0.5)
        x = r * math.cos(t)
        z = r * math.sin(t)
        nodes.append((x, y, z))
    return nodes

def interp_track(nodes, count):
    n = len(nodes)
    result = []
    for i in range(count):
        t = i / count
        idx = t * n
        i0 = int(idx)
        frac = idx - i0
        p0 = nodes[(i0 - 1) % n]
        p1 = nodes[i0 % n]
        p2 = nodes[(i0 + 1) % n]
        p3 = nodes[(i0 + 2) % n]
        t2 = frac * frac
        t3 = t2 * frac
        x = 0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*frac + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3)
        y = 0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*frac + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
        z = 0.5 * ((2*p1[2]) + (-p0[2]+p2[2])*frac + (2*p0[2]-5*p1[2]+4*p2[2]-p3[2])*t2 + (-p0[2]+3*p1[2]-3*p2[2]+p3[2])*t3)
        result.append((x, y, z))
    return result

# ============================================================
# TERRAIN NOISE
# ============================================================
def terrain_noise(x, z):
    n = 0
    n += math.sin(x * 0.008 + 1.3) * math.cos(z * 0.006 + 0.7) * 12
    n += math.sin(x * 0.015 + 2.1) * math.cos(z * 0.012 - 0.3) * 6
    n += math.sin(x * 0.03 + 0.5) * math.cos(z * 0.025 + 1.5) * 3
    n += math.sin(x * 0.06) * math.cos(z * 0.05 + 2.0) * 1.5
    return n

def dist_to_track(x, z, nodes, step=2):
    min_d = float('inf')
    nearest_y = 0
    for i in range(0, len(nodes), step):
        dx = nodes[i][0] - x
        dz = nodes[i][2] - z
        d = math.sqrt(dx*dx + dz*dz)
        if d < min_d:
            min_d = d
            nearest_y = nodes[i][1]
    return min_d, nearest_y

def get_terrain_height(wx, wz, nodes):
    base = terrain_noise(wx, wz)
    td, track_y = dist_to_track(wx, wz, nodes)
    clearance = TRACK_WIDTH * 0.7
    transition = 30
    if td < clearance:
        return -4
    elif td < clearance + transition:
        t = (td - clearance) / transition
        t = t * t * (3 - 2 * t)
        return -4 + t * (base + 4)
    else:
        return base

# ============================================================
# MATERIAL CREATION (Crystal Kingdom palette)
# ============================================================
def make_material(name, base_color, roughness=0.5, metallic=0.0,
                  emission_color=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if not bsdf:
        bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_color and emission_strength > 0:
        bsdf.inputs["Emission Color"].default_value = (*emission_color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
        bsdf.inputs["Alpha"].default_value = alpha
    return mat

# Crystal Kingdom color palette
def crystal_blue_mat(name="CrystalBlue", strength=4.0):
    return make_material(name, (0.6, 0.85, 1.0), roughness=0.1, metallic=0.2,
                        emission_color=(0.3, 0.6, 1.0), emission_strength=strength, alpha=0.7)

def crystal_purple_mat(name="CrystalPurple", strength=3.0):
    return make_material(name, (0.7, 0.5, 1.0), roughness=0.1, metallic=0.2,
                        emission_color=(0.5, 0.3, 0.9), emission_strength=strength, alpha=0.7)

def crystal_white_mat(name="CrystalWhite", strength=5.0):
    return make_material(name, (0.9, 0.95, 1.0), roughness=0.05, metallic=0.3,
                        emission_color=(0.8, 0.9, 1.0), emission_strength=strength, alpha=0.6)

def crystal_pink_mat(name="CrystalPink", strength=3.0):
    return make_material(name, (1.0, 0.6, 0.8), roughness=0.1, metallic=0.2,
                        emission_color=(1.0, 0.4, 0.7), emission_strength=strength, alpha=0.7)

def glow_flower_mat(name="GlowFlower", color=(1.0, 0.5, 0.8), strength=3.0):
    return make_material(name, color, roughness=0.3,
                        emission_color=color, emission_strength=strength)

# ============================================================
# TEXTURE CREATION
# ============================================================
def create_road_texture(width=1024, height=1024):
    img = bpy.data.images.new("road_texture", width=width, height=height, alpha=True)
    pixels = [0.0] * (width * height * 4)
    for py in range(height):
        for px in range(width):
            idx = (py * width + px) * 4
            # Dark asphalt with blue-ish tint (Crystal Kingdom theme)
            base = 0.08 + 0.015 * math.sin(px * 0.1) * math.cos(py * 0.15)
            grain = ((px * 13 + py * 7) % 97) / 97.0 * 0.02 - 0.01
            r = base + grain
            g = base + grain + 0.005
            b = base + 0.025 + grain  # slight blue tint
            u = px / width
            # Left edge glow (bright blue)
            if u < 0.04:
                blend = 1.0 - u / 0.04
                blend = blend * blend
                r = r * (1-blend) + 0.1 * blend
                g = g * (1-blend) + 0.5 * blend
                b = b * (1-blend) + 1.0 * blend
            # Right edge glow (purple)
            if u > 0.96:
                blend = (u - 0.96) / 0.04
                blend = blend * blend
                r = r * (1-blend) + 0.6 * blend
                g = g * (1-blend) + 0.3 * blend
                b = b * (1-blend) + 1.0 * blend
            # Subtle center line (cyan dashed)
            if 0.49 < u < 0.51:
                v = py / height
                dash = (v * 30) % 1.0
                if dash < 0.5:
                    line_blend = 0.4
                    r = r * (1-line_blend) + 0.3 * line_blend
                    g = g * (1-line_blend) + 0.9 * line_blend
                    b = b * (1-line_blend) + 1.0 * line_blend
            pixels[idx] = max(0, min(1, r))
            pixels[idx+1] = max(0, min(1, g))
            pixels[idx+2] = max(0, min(1, b))
            pixels[idx+3] = 1.0
    img.pixels = pixels
    img.pack()
    return img

def create_mystical_ground_texture(width=512, height=512):
    img = bpy.data.images.new("mystical_ground", width=width, height=height, alpha=True)
    pixels = [0.0] * (width * height * 4)
    for py in range(height):
        for px in range(width):
            idx = (py * width + px) * 4
            # Dark purple-blue mystical ground
            base_r = 0.06 + 0.02 * math.sin(px * 0.04 + py * 0.03)
            base_g = 0.08 + 0.03 * math.cos(px * 0.05 + py * 0.04)
            base_b = 0.14 + 0.04 * math.sin(px * 0.03 - py * 0.02)
            # Bioluminescent spots
            spot = ((px * 53 + py * 89) % 997)
            if spot < 4:
                base_r = 0.2; base_g = 0.6; base_b = 0.9  # blue glow
            elif spot < 7:
                base_r = 0.5; base_g = 0.2; base_b = 0.7  # purple glow
            elif spot < 9:
                base_r = 0.8; base_g = 0.4; base_b = 0.6  # pink glow
            pixels[idx] = max(0, min(1, base_r))
            pixels[idx+1] = max(0, min(1, base_g))
            pixels[idx+2] = max(0, min(1, base_b))
            pixels[idx+3] = 1.0
    img.pixels = pixels
    img.pack()
    return img

def create_checker_texture(width=256, height=256):
    img = bpy.data.images.new("checker_texture", width=width, height=height, alpha=True)
    pixels = [0.0] * (width * height * 4)
    cs = width // 8
    for py in range(height):
        for px in range(width):
            idx = (py * width + px) * 4
            cx = px // cs
            cy = py // cs
            if (cx + cy) % 2 == 0:
                pixels[idx] = 0.05; pixels[idx+1] = 0.05; pixels[idx+2] = 0.15
            else:
                pixels[idx] = 0.9; pixels[idx+1] = 0.95; pixels[idx+2] = 1.0
            pixels[idx+3] = 1.0
    img.pixels = pixels
    img.pack()
    return img

# ============================================================
# CRYSTAL BUILDERS
# ============================================================
def make_crystal_prism(bm, base_pos, height, radius, sides=6, taper=0.3):
    """Create a hexagonal crystal prism in bmesh at given position"""
    verts_bottom = []
    verts_top = []
    bx, by, bz = base_pos

    for i in range(sides):
        angle = (i / sides) * math.pi * 2
        px = bx + math.cos(angle) * radius
        py = by + math.sin(angle) * radius
        verts_bottom.append(bm.verts.new((px, py, bz)))
        # Top with taper
        top_r = radius * taper
        px_t = bx + math.cos(angle) * top_r
        py_t = by + math.sin(angle) * top_r
        verts_top.append(bm.verts.new((px_t, py_t, bz + height)))

    # Tip vertex
    tip = bm.verts.new((bx, by, bz + height * 1.15))

    # Bottom face
    bm.faces.new(list(reversed(verts_bottom)))

    # Side faces
    for i in range(sides):
        ni = (i + 1) % sides
        bm.faces.new([verts_bottom[i], verts_bottom[ni], verts_top[ni], verts_top[i]])

    # Top cone faces
    for i in range(sides):
        ni = (i + 1) % sides
        bm.faces.new([verts_top[i], verts_top[ni], tip])

    return tip

def build_crystal_cluster(gx, gy, gz, cluster_name, num_crystals=5,
                          base_height=12, base_radius=1.5, mat=None):
    """Build a cluster of crystal prisms at game coordinates"""
    bm = bmesh.new()

    for c in range(num_crystals):
        # Randomize each crystal in the cluster
        angle = (c / num_crystals) * math.pi * 2 + random.uniform(-0.3, 0.3)
        dist = random.uniform(0, base_radius * 1.5) if c > 0 else 0
        h = base_height * random.uniform(0.4, 1.0) if c > 0 else base_height
        r = base_radius * random.uniform(0.3, 0.7) if c > 0 else base_radius

        cx = math.cos(angle) * dist
        cy = math.sin(angle) * dist

        # Slight tilt for natural look
        tilt_x = random.uniform(-0.15, 0.15)
        tilt_y = random.uniform(-0.15, 0.15)

        pos = g2b_tuple(gx + cx, gy, gz + cy)
        make_crystal_prism(bm, pos, h, r, sides=6, taper=random.uniform(0.15, 0.35))

    mesh = bpy.data.meshes.new(cluster_name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(cluster_name, mesh)
    bpy.context.collection.objects.link(obj)

    for poly in obj.data.polygons:
        poly.use_smooth = True

    if mat:
        obj.data.materials.append(mat)

    return obj

def build_floating_crystal(gx, gy, gz, name, height=3.0, radius=0.8, mat=None):
    """Build a single floating crystal at game coordinates"""
    bm = bmesh.new()
    pos = g2b_tuple(gx, gy, gz)
    make_crystal_prism(bm, pos, height, radius, sides=6, taper=0.2)
    # Also add inverted crystal below for diamond shape
    make_crystal_prism(bm, (pos[0], pos[1], pos[2]), -height * 0.4, radius * 0.6, sides=6, taper=0.15)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    for poly in obj.data.polygons:
        poly.use_smooth = True

    if mat:
        obj.data.materials.append(mat)

    return obj

# ============================================================
# CRYSTAL PALACE BUILDER
# ============================================================
def build_crystal_palace(gx, gy, gz):
    """Build a grand crystal palace structure"""
    palace_objects = []

    # Main tower (central)
    mat_main = make_material("PalaceMain", (0.7, 0.8, 1.0), roughness=0.1, metallic=0.4,
                            emission_color=(0.5, 0.7, 1.0), emission_strength=2.0, alpha=0.8)
    mat_spire = make_material("PalaceSpire", (0.8, 0.9, 1.0), roughness=0.05, metallic=0.5,
                             emission_color=(0.7, 0.85, 1.0), emission_strength=4.0, alpha=0.7)
    mat_wall = make_material("PalaceWall", (0.5, 0.6, 0.9), roughness=0.2, metallic=0.3,
                            emission_color=(0.3, 0.5, 0.8), emission_strength=1.0)

    # Central main tower
    bpy.ops.mesh.primitive_cylinder_add(radius=12, depth=50, vertices=8,
        location=g2b_tuple(gx, gy + 25, gz))
    tower = bpy.context.active_object
    tower.name = "PalaceTower"
    tower.data.materials.append(mat_main)
    for poly in tower.data.polygons: poly.use_smooth = True
    palace_objects.append(tower)

    # Central spire
    bpy.ops.mesh.primitive_cone_add(radius1=8, radius2=0.5, depth=30, vertices=8,
        location=g2b_tuple(gx, gy + 65, gz))
    spire = bpy.context.active_object
    spire.name = "PalaceSpire"
    spire.data.materials.append(mat_spire)
    for poly in spire.data.polygons: poly.use_smooth = True
    palace_objects.append(spire)

    # Side towers (4)
    for i in range(4):
        angle = (i / 4) * math.pi * 2 + math.pi / 4
        tx = gx + math.cos(angle) * 25
        tz = gz + math.sin(angle) * 25
        th = 35 + random.uniform(-5, 5)

        bpy.ops.mesh.primitive_cylinder_add(radius=6, depth=th, vertices=8,
            location=g2b_tuple(tx, gy + th/2, tz))
        st = bpy.context.active_object
        st.name = f"PalaceSideTower_{i}"
        st.data.materials.append(mat_wall)
        for poly in st.data.polygons: poly.use_smooth = True
        palace_objects.append(st)

        # Side spires
        bpy.ops.mesh.primitive_cone_add(radius1=5, radius2=0.3, depth=18, vertices=8,
            location=g2b_tuple(tx, gy + th + 9, tz))
        ss = bpy.context.active_object
        ss.name = f"PalaceSideSpire_{i}"
        ss.data.materials.append(mat_spire)
        for poly in ss.data.polygons: poly.use_smooth = True
        palace_objects.append(ss)

    # Connecting walls between side towers
    for i in range(4):
        ni = (i + 1) % 4
        angle_i = (i / 4) * math.pi * 2 + math.pi / 4
        angle_n = (ni / 4) * math.pi * 2 + math.pi / 4
        mx = gx + (math.cos(angle_i) + math.cos(angle_n)) * 12.5
        mz = gz + (math.sin(angle_i) + math.sin(angle_n)) * 12.5
        wall_ang = math.atan2(math.sin(angle_n) - math.sin(angle_i),
                             math.cos(angle_n) - math.cos(angle_i))

        bpy.ops.mesh.primitive_cube_add(size=1,
            location=g2b_tuple(mx, gy + 12, mz))
        wall = bpy.context.active_object
        wall.name = f"PalaceWall_{i}"
        wall.scale = (20, 2, 24)
        wall.rotation_euler.z = wall_ang
        wall.data.materials.append(mat_wall)
        palace_objects.append(wall)

    # Crystal orb on top
    bpy.ops.mesh.primitive_uv_sphere_add(radius=4, segments=16, ring_count=12,
        location=g2b_tuple(gx, gy + 82, gz))
    orb = bpy.context.active_object
    orb.name = "PalaceOrb"
    orb_mat = make_material("PalaceOrb", (0.9, 0.95, 1.0), roughness=0.0, metallic=0.5,
                           emission_color=(0.8, 0.9, 1.0), emission_strength=8.0, alpha=0.5)
    orb.data.materials.append(orb_mat)
    for poly in orb.data.polygons: poly.use_smooth = True
    palace_objects.append(orb)

    return palace_objects

# ============================================================
# LAMPPOST BUILDER
# ============================================================
def build_lamppost(gx, gy, gz, name, color=(0.3, 0.6, 1.0)):
    """Build a crystal lamppost"""
    mat_pole = make_material(f"LampPole_{name}", (0.5, 0.55, 0.7), roughness=0.3, metallic=0.6)
    mat_light = make_material(f"LampLight_{name}", color, roughness=0.1,
                             emission_color=color, emission_strength=6.0, alpha=0.7)

    # Pole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=8, vertices=8,
        location=g2b_tuple(gx, gy + 4, gz))
    pole = bpy.context.active_object
    pole.name = f"LampPole_{name}"
    pole.data.materials.append(mat_pole)

    # Crystal light on top
    bm = bmesh.new()
    pos = g2b_tuple(gx, gy + 8.5, gz)
    make_crystal_prism(bm, pos, 2.5, 0.6, sides=6, taper=0.2)
    mesh = bpy.data.meshes.new(f"LampCrystal_{name}")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    light_obj = bpy.data.objects.new(f"LampCrystal_{name}", mesh)
    bpy.context.collection.objects.link(light_obj)
    light_obj.data.materials.append(mat_light)
    for poly in light_obj.data.polygons: poly.use_smooth = True

    return [pole, light_obj]

# ============================================================
# CRYSTAL ARCHWAY BUILDER
# ============================================================
def build_crystal_archway(gx, gy, gz, angle, name):
    """Build a crystal archway over the track"""
    mat_arch = make_material(f"ArchMat_{name}", (0.6, 0.7, 1.0), roughness=0.15, metallic=0.3,
                            emission_color=(0.4, 0.6, 1.0), emission_strength=2.0, alpha=0.8)
    mat_gem = make_material(f"ArchGem_{name}", (0.9, 0.7, 1.0), roughness=0.05,
                           emission_color=(0.8, 0.6, 1.0), emission_strength=6.0, alpha=0.6)

    perpx = -math.sin(angle)
    perpz = math.cos(angle)
    arch_w = TRACK_WIDTH + 6
    arch_h = 14

    # Left pillar - crystal cluster
    lx = gx + perpx * (arch_w / 2)
    lz = gz + perpz * (arch_w / 2)
    build_crystal_cluster(lx, gy, lz, f"ArchPillarL_{name}", num_crystals=3,
                         base_height=arch_h, base_radius=1.5, mat=mat_arch)

    # Right pillar
    rx = gx - perpx * (arch_w / 2)
    rz = gz - perpz * (arch_w / 2)
    build_crystal_cluster(rx, gy, rz, f"ArchPillarR_{name}", num_crystals=3,
                         base_height=arch_h, base_radius=1.5, mat=mat_arch)

    # Top arch beam (curved-ish with multiple segments)
    segments = 8
    for s in range(segments):
        t = s / (segments - 1)
        # Parabolic arch
        arch_y_offset = arch_h + 3 * math.sin(t * math.pi)
        ax = gx + perpx * (arch_w/2 * (1 - 2*t))
        az = gz + perpz * (arch_w/2 * (1 - 2*t))

        bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=arch_w / segments * 1.3,
            vertices=6, location=g2b_tuple(ax, gy + arch_y_offset, az))
        seg_obj = bpy.context.active_object
        seg_obj.name = f"ArchSeg_{name}_{s}"
        seg_obj.rotation_euler.z = angle + math.pi / 2
        seg_obj.data.materials.append(mat_arch)
        for poly in seg_obj.data.polygons: poly.use_smooth = True

    # Gem at apex
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.5, segments=12, ring_count=8,
        location=g2b_tuple(gx, gy + arch_h + 4, gz))
    gem = bpy.context.active_object
    gem.name = f"ArchGem_{name}"
    gem.data.materials.append(mat_gem)
    for poly in gem.data.polygons: poly.use_smooth = True

# ============================================================
# GLOWING VEGETATION
# ============================================================
def build_glow_tree(gx, gy, gz, name, trunk_h=8, canopy_r=4):
    """Build a bioluminescent tree"""
    mat_trunk = make_material(f"Trunk_{name}", (0.2, 0.15, 0.3), roughness=0.7,
                             emission_color=(0.1, 0.05, 0.2), emission_strength=0.3)
    mat_canopy = make_material(f"Canopy_{name}",
        (random.uniform(0.3, 0.8), random.uniform(0.2, 0.6), random.uniform(0.5, 1.0)),
        roughness=0.4,
        emission_color=(random.uniform(0.2, 0.7), random.uniform(0.3, 0.8), random.uniform(0.5, 1.0)),
        emission_strength=2.5)

    # Trunk
    bpy.ops.mesh.primitive_cylinder_add(radius=0.6, depth=trunk_h, vertices=8,
        location=g2b_tuple(gx, gy + trunk_h/2, gz))
    trunk = bpy.context.active_object
    trunk.name = f"Trunk_{name}"
    trunk.data.materials.append(mat_trunk)

    # Canopy (glowing sphere)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=canopy_r, segments=12, ring_count=8,
        location=g2b_tuple(gx, gy + trunk_h + canopy_r * 0.5, gz))
    canopy = bpy.context.active_object
    canopy.name = f"Canopy_{name}"
    # Slightly irregular shape
    canopy.scale = (1.0, 1.0, random.uniform(0.7, 1.0))
    canopy.data.materials.append(mat_canopy)
    for poly in canopy.data.polygons: poly.use_smooth = True

def build_glow_flower_patch(gx, gy, gz, name, count=8, radius=5):
    """Build a patch of glowing flowers"""
    colors = [
        (1.0, 0.4, 0.7),  # pink
        (0.5, 0.3, 1.0),  # purple
        (0.3, 0.7, 1.0),  # blue
        (1.0, 0.8, 0.4),  # golden
    ]

    bm = bmesh.new()
    for f in range(count):
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(0, radius)
        fx = gx + math.cos(angle) * dist
        fz = gz + math.sin(angle) * dist
        fh = random.uniform(0.5, 2.0)

        # Flower stem + bloom as simple cone
        pos = g2b_tuple(fx, gy + fh/2, fz)
        # Stem
        for sv in range(2):
            stem_angle = sv * math.pi
            bm.verts.new((pos[0] + math.cos(stem_angle)*0.05, pos[1] + math.sin(stem_angle)*0.05, pos[2] - fh/2))
            bm.verts.new((pos[0] + math.cos(stem_angle)*0.05, pos[1] + math.sin(stem_angle)*0.05, pos[2] + fh/2))

    mesh = bpy.data.meshes.new(f"FlowerPatch_{name}")
    bm.to_mesh(mesh)
    bm.free()

    # Add flower blooms as small spheres
    for f in range(count):
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(0, radius)
        fx = gx + math.cos(angle) * dist
        fz = gz + math.sin(angle) * dist
        fh = random.uniform(1.0, 2.5)
        bloom_r = random.uniform(0.3, 0.8)

        bpy.ops.mesh.primitive_uv_sphere_add(radius=bloom_r, segments=8, ring_count=6,
            location=g2b_tuple(fx, gy + fh, fz))
        bloom = bpy.context.active_object
        bloom.name = f"Bloom_{name}_{f}"
        color = random.choice(colors)
        bloom_mat = glow_flower_mat(f"BloomMat_{name}_{f}", color, strength=4.0)
        bloom.data.materials.append(bloom_mat)
        for poly in bloom.data.polygons: poly.use_smooth = True

# ============================================================
# WATER SURFACE
# ============================================================
def build_water_surface(gx, gy, gz, radius_x=120, radius_z=80, name="CrystalLake"):
    """Build a reflective water surface plane"""
    mat_water = make_material(name + "_mat", (0.05, 0.15, 0.35), roughness=0.05, metallic=0.8,
                             emission_color=(0.1, 0.2, 0.4), emission_strength=0.5, alpha=0.6)

    # Circular-ish water plane using circle mesh
    bpy.ops.mesh.primitive_circle_add(radius=1, vertices=32, fill_type='NGON',
        location=g2b_tuple(gx, gy - 2, gz))
    water = bpy.context.active_object
    water.name = name
    water.scale = (radius_x, radius_z, 1)
    water.data.materials.append(mat_water)

    return water

# ============================================================
# ROAD & TRACK BUILDERS (enhanced)
# ============================================================
def build_road_mesh(hi_res_nodes):
    n = len(hi_res_nodes)
    half_w = TRACK_WIDTH / 2
    verts = []
    faces = []
    subs = ROAD_SUBDIV
    pts_per_cross = subs * 2 + 1

    for i in range(n):
        gx, gy, gz = hi_res_nodes[i]
        next_i = (i + 1) % n
        prev_i = (i - 1) % n
        tx = hi_res_nodes[next_i][0] - hi_res_nodes[prev_i][0]
        tz = hi_res_nodes[next_i][2] - hi_res_nodes[prev_i][2]
        tlen = math.sqrt(tx*tx + tz*tz)
        if tlen < 0.001: tx, tz = 1, 0
        else: tx /= tlen; tz /= tlen
        perpx = -tz
        perpz = tx
        for j in range(pts_per_cross):
            u = j / (pts_per_cross - 1)
            offset = (u - 0.5) * 2 * half_w
            px = gx + perpx * offset
            pz = gz + perpz * offset
            bx, by, bz = g2b_tuple(px, gy, pz)
            verts.append((bx, by, bz))

    for i in range(n):
        next_i = (i + 1) % n
        for j in range(pts_per_cross - 1):
            v0 = i * pts_per_cross + j
            v1 = i * pts_per_cross + j + 1
            v2 = next_i * pts_per_cross + j + 1
            v3 = next_i * pts_per_cross + j
            faces.append((v0, v1, v2, v3))

    mesh = bpy.data.meshes.new("road_surface")
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for fi, face in enumerate(mesh.polygons):
        i_seg = fi // (pts_per_cross - 1)
        j_sub = fi % (pts_per_cross - 1)
        u_left = j_sub / (pts_per_cross - 1)
        u_right = (j_sub + 1) / (pts_per_cross - 1)
        v0 = (i_seg / n) * n * 0.4
        v1 = ((i_seg + 1) / n) * n * 0.4
        for li, loop_idx in enumerate(face.loop_indices):
            if li == 0: uv_layer[loop_idx].uv = (u_left, v0)
            elif li == 1: uv_layer[loop_idx].uv = (u_right, v0)
            elif li == 2: uv_layer[loop_idx].uv = (u_right, v1)
            else: uv_layer[loop_idx].uv = (u_left, v1)

    mesh.update()
    obj = bpy.data.objects.new("RoadSurface", mesh)
    bpy.context.collection.objects.link(obj)
    for poly in obj.data.polygons: poly.use_smooth = True

    road_img = create_road_texture()
    mat = make_material("RoadMaterial", (0.08, 0.08, 0.14), roughness=0.6, metallic=0.1)
    nodes_m = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes_m.get("Principled BSDF")
    tex_node = nodes_m.new("ShaderNodeTexImage")
    tex_node.image = road_img
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.append(mat)
    return obj

def build_glow_edges(hi_res_nodes):
    """Build bright neon edge strips - Crystal Kingdom signature look"""
    n = len(hi_res_nodes)
    half_w = TRACK_WIDTH / 2

    edges_config = [
        ("neon_left", 1, (0.2, 0.5, 1.0), 6.0, half_w + 0.5),
        ("neon_right", -1, (0.6, 0.3, 1.0), 6.0, half_w + 0.5),
        # Inner glow strips
        ("glow_inner_left", 1, (0.1, 0.8, 1.0), 3.0, half_w - 1.0),
        ("glow_inner_right", -1, (0.8, 0.4, 1.0), 3.0, half_w - 1.0),
    ]

    for name, side_sign, color, em_str, dist in edges_config:
        verts = []
        faces = []
        edge_w = 0.5 if "neon" in name else 0.25

        for i in range(n):
            gx, gy, gz = hi_res_nodes[i]
            next_i = (i + 1) % n
            prev_i = (i - 1) % n
            tx = hi_res_nodes[next_i][0] - hi_res_nodes[prev_i][0]
            tz = hi_res_nodes[next_i][2] - hi_res_nodes[prev_i][2]
            tlen = math.sqrt(tx*tx + tz*tz)
            if tlen < 0.001: tx, tz = 1, 0
            else: tx /= tlen; tz /= tlen
            perpx = -tz * side_sign
            perpz = tx * side_sign

            ex = gx + perpx * dist
            ez = gz + perpz * dist

            verts.append(g2b_tuple(ex - perpx * edge_w, gy + 0.08, ez - perpz * edge_w))
            verts.append(g2b_tuple(ex + perpx * edge_w, gy + 0.08, ez + perpz * edge_w))

        for i in range(n):
            ni = (i + 1) % n
            v0 = i * 2
            v1 = i * 2 + 1
            v2 = ni * 2 + 1
            v3 = ni * 2
            faces.append((v0, v3, v2, v1))

        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        mat = make_material(f"EdgeMat_{name}", color, roughness=0.15,
                           emission_color=color, emission_strength=em_str)
        obj.data.materials.append(mat)

def build_road_walls(hi_res_nodes):
    """Build crystal walls along road edges"""
    n = len(hi_res_nodes)
    half_w = TRACK_WIDTH / 2 + 1.5
    wall_h = 1.8

    mat_left = make_material("WallLeft", (0.15, 0.2, 0.4), roughness=0.4, metallic=0.3,
                            emission_color=(0.1, 0.3, 0.6), emission_strength=0.5)
    mat_right = make_material("WallRight", (0.25, 0.15, 0.4), roughness=0.4, metallic=0.3,
                             emission_color=(0.3, 0.1, 0.5), emission_strength=0.5)

    for side_name, side_sign, mat in [("wall_left", 1, mat_left), ("wall_right", -1, mat_right)]:
        verts = []
        faces = []
        for i in range(n):
            gx, gy, gz = hi_res_nodes[i]
            next_i = (i + 1) % n
            prev_i = (i - 1) % n
            tx = hi_res_nodes[next_i][0] - hi_res_nodes[prev_i][0]
            tz = hi_res_nodes[next_i][2] - hi_res_nodes[prev_i][2]
            tlen = math.sqrt(tx*tx + tz*tz)
            if tlen < 0.001: tx, tz = 1, 0
            else: tx /= tlen; tz /= tlen
            perpx = -tz * side_sign
            perpz = tx * side_sign
            ex = gx + perpx * half_w
            ez = gz + perpz * half_w
            verts.append(g2b_tuple(ex, gy - 0.5, ez))
            verts.append(g2b_tuple(ex, gy + wall_h, ez))

        for i in range(n):
            ni = (i + 1) % n
            v0 = i * 2; v1 = i * 2 + 1; v2 = ni * 2 + 1; v3 = ni * 2
            if side_sign > 0: faces.append((v0, v3, v2, v1))
            else: faces.append((v0, v1, v2, v3))

        mesh = bpy.data.meshes.new(side_name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(side_name, mesh)
        bpy.context.collection.objects.link(obj)
        for poly in obj.data.polygons: poly.use_smooth = True
        obj.data.materials.append(mat)

def build_road_underside(hi_res_nodes):
    n = len(hi_res_nodes)
    half_w = TRACK_WIDTH / 2 + 1.5
    depth = 3.0
    verts = []
    faces = []
    for i in range(n):
        gx, gy, gz = hi_res_nodes[i]
        next_i = (i + 1) % n
        prev_i = (i - 1) % n
        tx = hi_res_nodes[next_i][0] - hi_res_nodes[prev_i][0]
        tz = hi_res_nodes[next_i][2] - hi_res_nodes[prev_i][2]
        tlen = math.sqrt(tx*tx + tz*tz)
        if tlen < 0.001: tx, tz = 1, 0
        else: tx /= tlen; tz /= tlen
        perpx = -tz; perpz = tx
        verts.append(g2b_tuple(gx + perpx * half_w, gy - depth, gz + perpz * half_w))
        verts.append(g2b_tuple(gx - perpx * half_w, gy - depth, gz - perpz * half_w))
    for i in range(n):
        ni = (i + 1) % n
        faces.append((i*2, i*2+1, ni*2+1, ni*2))
    mesh = bpy.data.meshes.new("road_underside")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("RoadUnderside", mesh)
    bpy.context.collection.objects.link(obj)
    mat = make_material("UndersideMat", (0.05, 0.03, 0.12), roughness=0.8,
                       emission_color=(0.05, 0.1, 0.2), emission_strength=0.3)
    obj.data.materials.append(mat)

def build_start_finish(nodes_100):
    start = nodes_100[0]
    gx, gy, gz = start
    next_n = nodes_100[1]
    ang = math.atan2(next_n[2] - gz, next_n[0] - gx)
    perpx = -math.sin(ang)
    perpz = math.cos(ang)

    checker_img = create_checker_texture()
    line_w = TRACK_WIDTH + 2
    line_d = 8
    bm = bmesh.new()
    hw = line_w / 2; hd = line_d / 2
    corners_game = [
        (gx + perpx*hw + math.cos(ang)*hd, gy + 0.08, gz + perpz*hw + math.sin(ang)*hd),
        (gx - perpx*hw + math.cos(ang)*hd, gy + 0.08, gz - perpz*hw + math.sin(ang)*hd),
        (gx - perpx*hw - math.cos(ang)*hd, gy + 0.08, gz - perpz*hw - math.sin(ang)*hd),
        (gx + perpx*hw - math.cos(ang)*hd, gy + 0.08, gz + perpz*hw - math.sin(ang)*hd),
    ]
    bverts = [bm.verts.new(g2b_tuple(*c)) for c in corners_game]
    bm.faces.new(bverts)
    mesh = bpy.data.meshes.new("start_line")
    bm.to_mesh(mesh); bm.free()
    mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    uvs = [(0,0),(10,0),(10,3),(0,3)]
    for fi, face in enumerate(mesh.polygons):
        for li, loop_idx in enumerate(face.loop_indices):
            uv_layer[loop_idx].uv = uvs[li]
    mesh.update()
    obj = bpy.data.objects.new("StartLine", mesh)
    bpy.context.collection.objects.link(obj)
    mat = make_material("CheckerMat", (0.5, 0.5, 0.6), roughness=0.4)
    nds = mat.node_tree.nodes; lnks = mat.node_tree.links
    bsdf = nds.get("Principled BSDF")
    tex = nds.new("ShaderNodeTexImage"); tex.image = checker_img
    lnks.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.append(mat)

    # Crystal arch at start
    build_crystal_archway(gx, gy, gz, ang, "StartArch")

def build_terrain(nodes_100):
    seg = TERRAIN_SEG; size = TERRAIN_SIZE
    seg_size = size / seg; half = size / 2
    verts = []; faces = []; colors = []

    for iz in range(seg + 1):
        for ix in range(seg + 1):
            wx = -half + ix * seg_size
            wz = -half + iz * seg_size
            wy = get_terrain_height(wx, wz, nodes_100)
            verts.append(g2b_tuple(wx, wy, wz))
            # Mystical dark purple-blue terrain
            h_factor = max(0, min(1, (wy + 4) / 20))
            r = 0.05 + h_factor * 0.08
            g = 0.07 + h_factor * 0.05
            b = 0.12 + h_factor * 0.15
            colors.append((r, g, b, 1.0))

    for iz in range(seg):
        for ix in range(seg):
            a = iz * (seg + 1) + ix
            b_v = a + 1; c = a + (seg + 1); d = c + 1
            faces.append((a, c, d, b_v))

    mesh = bpy.data.meshes.new("terrain")
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    for fi, face in enumerate(mesh.polygons):
        iz = fi // seg; ix = fi % seg
        uvs = [(ix/seg, iz/seg), (ix/seg, (iz+1)/seg), ((ix+1)/seg, (iz+1)/seg), ((ix+1)/seg, iz/seg)]
        for li, loop_idx in enumerate(face.loop_indices):
            uv_layer[loop_idx].uv = (uvs[li][0]*40, uvs[li][1]*40)

    vcol = mesh.color_attributes.new(name="Col", type='FLOAT_COLOR', domain='POINT')
    for i, c in enumerate(colors):
        vcol.data[i].color = c

    mesh.update()
    obj = bpy.data.objects.new("Terrain", mesh)
    bpy.context.collection.objects.link(obj)
    for poly in obj.data.polygons: poly.use_smooth = True

    ground_img = create_mystical_ground_texture()
    mat = make_material("TerrainMat", (0.05, 0.07, 0.12), roughness=0.8,
                       emission_color=(0.02, 0.04, 0.08), emission_strength=0.2)
    nds = mat.node_tree.nodes; lnks = mat.node_tree.links
    bsdf = nds.get("Principled BSDF")
    tex = nds.new("ShaderNodeTexImage"); tex.image = ground_img
    vcol_node = nds.new("ShaderNodeVertexColor"); vcol_node.layer_name = "Col"
    mix = nds.new("ShaderNodeMixRGB"); mix.blend_type = 'MULTIPLY'; mix.inputs["Fac"].default_value = 0.7
    lnks.new(tex.outputs["Color"], mix.inputs["Color1"])
    lnks.new(vcol_node.outputs["Color"], mix.inputs["Color2"])
    lnks.new(mix.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.append(mat)
    return obj

def build_bridge_pillars(nodes_100):
    mat = make_material("PillarMat", (0.4, 0.5, 0.7), roughness=0.3, metallic=0.4,
                       emission_color=(0.2, 0.3, 0.6), emission_strength=0.8)
    for i in range(0, len(nodes_100), 8):
        if i < 6 or i > len(nodes_100) - 6: continue
        gx, gy, gz = nodes_100[i]
        terrain_h = get_terrain_height(gx, gz, nodes_100)
        height_above = gy - terrain_h
        if height_above > 5:
            pillar_h = height_above + 1
            # Crystal pillar instead of plain cylinder
            build_crystal_cluster(gx, terrain_h, gz, f"BridgePillar_{i}",
                                num_crystals=3, base_height=pillar_h,
                                base_radius=2.0, mat=mat)

def build_tunnel_crystal(nodes_100, start_idx, end_idx, name_prefix):
    """Build crystal tunnel - archways with crystal formations"""
    for i in range(start_idx, end_idx + 1, 2):
        idx = i % TRACK_POINTS
        gx, gy, gz = nodes_100[idx]
        ang = math.atan2(
            nodes_100[(idx+1) % TRACK_POINTS][2] - gz,
            nodes_100[(idx+1) % TRACK_POINTS][0] - gx
        )
        build_crystal_archway(gx, gy, gz, ang, f"{name_prefix}_{i}")

def build_ramp(nodes_100, track_idx, ramp_name):
    gx, gy, gz = nodes_100[track_idx]
    ang = math.atan2(
        nodes_100[(track_idx+1) % TRACK_POINTS][2] - gz,
        nodes_100[(track_idx+1) % TRACK_POINTS][0] - gx
    )
    w = TRACK_WIDTH * 0.6; h = 2.5; d = 8
    bm = bmesh.new()
    hw = w/2; hd = d/2
    v0 = bm.verts.new((-hw, -hd, 0)); v1 = bm.verts.new((hw, -hd, 0))
    v2 = bm.verts.new((hw, hd, 0)); v3 = bm.verts.new((-hw, hd, 0))
    v4 = bm.verts.new((-hw, -hd, 0)); v5 = bm.verts.new((hw, -hd, 0))
    v6 = bm.verts.new((hw, hd, h)); v7 = bm.verts.new((-hw, hd, h))
    bm.faces.new([v4, v5, v6, v7])
    bm.faces.new([v0, v3, v2, v1])
    bm.faces.new([v1, v2, v6, v5])
    bm.faces.new([v0, v4, v7, v3])
    bm.faces.new([v0, v1, v5, v4])
    bm.faces.new([v3, v7, v6, v2])
    mesh = bpy.data.meshes.new(ramp_name)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    obj = bpy.data.objects.new(ramp_name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = g2b_tuple(gx, gy, gz)
    obj.rotation_euler.z = ang
    mat = make_material(f"RampMat_{ramp_name}", (0.3, 0.5, 0.9), roughness=0.2, metallic=0.4,
                       emission_color=(0.2, 0.4, 0.8), emission_strength=2.0)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True

# ============================================================
# DECORATION PLACEMENT (5 zones from track.js)
# ============================================================
def place_decorations(nodes_100):
    """Place Crystal Kingdom decorations in 5 thematic zones"""
    print("  Placing Crystal Forest (nodes 5-25)...")
    place_crystal_forest(nodes_100, 5, 25)

    print("  Placing Castle District (nodes 25-45)...")
    place_castle_district(nodes_100, 25, 45)

    print("  Placing Crystal Lake (nodes 45-65)...")
    place_crystal_lake(nodes_100, 45, 65)

    print("  Placing Mountain Pass (nodes 65-85)...")
    place_mountain_pass(nodes_100, 65, 85)

    print("  Placing Royal Garden (nodes 85-100+0-5)...")
    place_royal_garden(nodes_100, 85, 100)

def get_side_pos(nodes, idx, offset, side=1):
    """Get a position to the side of the track"""
    gx, gy, gz = nodes[idx % TRACK_POINTS]
    ni = (idx + 1) % TRACK_POINTS
    ang = math.atan2(nodes[ni][2] - gz, nodes[ni][0] - gx)
    perpx = -math.sin(ang) * side
    perpz = math.cos(ang) * side
    return gx + perpx * offset, gy, gz + perpz * offset

def place_crystal_forest(nodes, start, end):
    """Zone 1: Dense magical crystal forest"""
    mat_blue = crystal_blue_mat("ForestCrystalBlue", 5.0)
    mat_white = crystal_white_mat("ForestCrystalWhite", 4.0)

    for i in range(start, end):
        # Roadside crystals (both sides)
        for side in [-1, 1]:
            if random.random() < 0.6:
                offset = TRACK_WIDTH * 0.6 + random.uniform(5, 25)
                x, y, z = get_side_pos(nodes, i, offset, side)
                h = random.uniform(8, 22)
                r = random.uniform(1.0, 2.5)
                mat = mat_blue if random.random() < 0.6 else mat_white
                build_crystal_cluster(x, y, z, f"ForestCrystal_{i}_{side}",
                    num_crystals=random.randint(3, 7), base_height=h, base_radius=r, mat=mat)

            # Glowing trees
            if random.random() < 0.4:
                offset = TRACK_WIDTH * 0.6 + random.uniform(8, 35)
                x, y, z = get_side_pos(nodes, i, offset, side)
                build_glow_tree(x, y, z, f"ForestTree_{i}_{side}",
                              trunk_h=random.uniform(5, 10), canopy_r=random.uniform(2.5, 5))

        # Occasional lamppost
        if i % 3 == 0:
            for side in [-1, 1]:
                x, y, z = get_side_pos(nodes, i, TRACK_WIDTH * 0.55, side)
                build_lamppost(x, y, z, f"ForestLamp_{i}_{side}",
                             color=(0.2, 0.6, 1.0))

def place_castle_district(nodes, start, end):
    """Zone 2: Crystal palace and grand structures"""
    # Place the palace off to the side of the track center
    mid = (start + end) // 2
    palace_offset = 80
    px, py, pz = get_side_pos(nodes, mid, palace_offset, 1)
    build_crystal_palace(px, py, pz)

    # Crystal archways along the road
    for i in range(start, end, 4):
        gx, gy, gz = nodes[i % TRACK_POINTS]
        ni = (i + 1) % TRACK_POINTS
        ang = math.atan2(nodes[ni][2] - gz, nodes[ni][0] - gx)

        if i % 8 == 0:
            build_crystal_archway(gx, gy, gz, ang, f"CastleArch_{i}")

        # Lampposts
        for side in [-1, 1]:
            x, y, z = get_side_pos(nodes, i, TRACK_WIDTH * 0.55, side)
            build_lamppost(x, y, z, f"CastleLamp_{i}_{side}",
                         color=(1.0, 0.8, 0.4))

        # Flower patches
        if i % 3 == 0:
            for side in [-1, 1]:
                offset = TRACK_WIDTH * 0.6 + random.uniform(3, 10)
                x, y, z = get_side_pos(nodes, i, offset, side)
                build_glow_flower_patch(x, y, z, f"CastleFlowers_{i}_{side}",
                                       count=random.randint(5, 12), radius=random.uniform(3, 6))

    # Side crystal formations
    for i in range(start, end, 2):
        for side in [-1, 1]:
            if random.random() < 0.3:
                offset = TRACK_WIDTH * 0.6 + random.uniform(15, 40)
                x, y, z = get_side_pos(nodes, i, offset, side)
                mat = crystal_purple_mat(f"CastleCrystal_{i}_{side}", 3.0)
                build_crystal_cluster(x, y, z, f"CastleCrystal_{i}_{side}",
                    num_crystals=random.randint(2, 4), base_height=random.uniform(6, 15),
                    base_radius=random.uniform(1.0, 2.0), mat=mat)

def place_crystal_lake(nodes, start, end):
    """Zone 3: Crystal lake with floating crystals and reflections"""
    # Water surface
    mid = (start + end) // 2
    lake_x, lake_y, lake_z = get_side_pos(nodes, mid, 60, 1)
    build_water_surface(lake_x, lake_y, lake_z, radius_x=100, radius_z=70, name="CrystalLake")

    # Large crystal formations around lake
    mat_blue = crystal_blue_mat("LakeCrystalBlue", 6.0)
    mat_white = crystal_white_mat("LakeCrystalWhite", 5.0)

    for i in range(start, end, 2):
        for side in [-1, 1]:
            if random.random() < 0.5:
                offset = TRACK_WIDTH * 0.6 + random.uniform(10, 50)
                x, y, z = get_side_pos(nodes, i, offset, side)
                mat = mat_blue if random.random() < 0.5 else mat_white
                build_crystal_cluster(x, y, z, f"LakeCrystal_{i}_{side}",
                    num_crystals=random.randint(3, 8), base_height=random.uniform(10, 30),
                    base_radius=random.uniform(1.5, 3.5), mat=mat)

    # Floating crystals above the lake
    mat_float = crystal_white_mat("FloatingCrystal", 8.0)
    for i in range(12):
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(20, 80)
        fx = lake_x + math.cos(angle) * dist
        fz = lake_z + math.sin(angle) * dist
        fy = lake_y + random.uniform(15, 40)
        build_floating_crystal(fx, fy, fz, f"FloatingCrystal_{i}",
                              height=random.uniform(2, 5), radius=random.uniform(0.5, 1.5),
                              mat=mat_float)

    # Lampposts
    for i in range(start, end, 3):
        for side in [-1, 1]:
            x, y, z = get_side_pos(nodes, i, TRACK_WIDTH * 0.55, side)
            build_lamppost(x, y, z, f"LakeLamp_{i}_{side}",
                         color=(0.3, 0.8, 1.0))

def place_mountain_pass(nodes, start, end):
    """Zone 4: Mountain pass with crystal formations"""
    mat_purple = crystal_purple_mat("MountainCrystal", 4.0)
    mat_pink = crystal_pink_mat("MountainPink", 3.0)

    for i in range(start, end):
        for side in [-1, 1]:
            # Large crystal formations (like mountains)
            if random.random() < 0.4:
                offset = TRACK_WIDTH * 0.6 + random.uniform(20, 60)
                x, y, z = get_side_pos(nodes, i, offset, side)
                mat = mat_purple if random.random() < 0.6 else mat_pink
                build_crystal_cluster(x, y, z, f"MountainCrystal_{i}_{side}",
                    num_crystals=random.randint(4, 9), base_height=random.uniform(15, 40),
                    base_radius=random.uniform(2, 5), mat=mat)

            # Smaller roadside crystals
            if random.random() < 0.3:
                offset = TRACK_WIDTH * 0.6 + random.uniform(3, 12)
                x, y, z = get_side_pos(nodes, i, offset, side)
                mat_s = crystal_blue_mat(f"MtSmall_{i}_{side}", 3.0)
                build_crystal_cluster(x, y, z, f"MtSmallCrystal_{i}_{side}",
                    num_crystals=random.randint(1, 3), base_height=random.uniform(3, 8),
                    base_radius=random.uniform(0.5, 1.2), mat=mat_s)

        if i % 4 == 0:
            for side in [-1, 1]:
                x, y, z = get_side_pos(nodes, i, TRACK_WIDTH * 0.55, side)
                build_lamppost(x, y, z, f"MtLamp_{i}_{side}",
                             color=(0.6, 0.3, 1.0))

def place_royal_garden(nodes, start, end_wrap):
    """Zone 5: Royal garden with flowers and ornamental crystals"""
    indices = list(range(start, TRACK_POINTS)) + list(range(0, 5))

    for i in indices:
        for side in [-1, 1]:
            # Flower patches
            if random.random() < 0.5:
                offset = TRACK_WIDTH * 0.6 + random.uniform(3, 15)
                x, y, z = get_side_pos(nodes, i, offset, side)
                build_glow_flower_patch(x, y, z, f"GardenFlowers_{i}_{side}",
                                       count=random.randint(8, 15), radius=random.uniform(3, 8))

            # Ornamental crystals
            if random.random() < 0.3:
                offset = TRACK_WIDTH * 0.6 + random.uniform(5, 20)
                x, y, z = get_side_pos(nodes, i, offset, side)
                mat = crystal_pink_mat(f"GardenCrystal_{i}_{side}", 4.0)
                build_crystal_cluster(x, y, z, f"GardenCrystal_{i}_{side}",
                    num_crystals=random.randint(2, 5), base_height=random.uniform(5, 12),
                    base_radius=random.uniform(0.8, 1.8), mat=mat)

            # Glowing trees
            if random.random() < 0.3:
                offset = TRACK_WIDTH * 0.6 + random.uniform(10, 30)
                x, y, z = get_side_pos(nodes, i, offset, side)
                build_glow_tree(x, y, z, f"GardenTree_{i}_{side}",
                              trunk_h=random.uniform(4, 8), canopy_r=random.uniform(2, 4))

        # Lampposts with golden glow
        if i % 2 == 0:
            for side in [-1, 1]:
                x, y, z = get_side_pos(nodes, i, TRACK_WIDTH * 0.55, side)
                build_lamppost(x, y, z, f"GardenLamp_{i}_{side}",
                             color=(1.0, 0.85, 0.4))

    # Crystal archways in garden
    for i in [87, 93, 99]:
        gx, gy, gz = nodes[i % TRACK_POINTS]
        ni = (i + 1) % TRACK_POINTS
        ang = math.atan2(nodes[ni][2] - gz, nodes[ni][0] - gx)
        build_crystal_archway(gx, gy, gz, ang, f"GardenArch_{i}")

# ============================================================
# MAIN EXECUTION
# ============================================================
def main():
    print("=" * 60)
    print("Drift Racers - Crystal Kingdom Course Generator (Enhanced)")
    print("=" * 60)

    # Clear scene
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes: bpy.data.meshes.remove(block)
    for block in bpy.data.materials: bpy.data.materials.remove(block)
    for block in bpy.data.images: bpy.data.images.remove(block)

    # Generate track
    print("[1/10] Generating track nodes...")
    nodes_100 = generate_track_nodes()

    print("[2/10] Interpolating to high resolution...")
    hi_res = interp_track(nodes_100, TRACK_POINTS * ROAD_SMOOTH_MULT)
    print(f"        {len(hi_res)} road segments")

    print("[3/10] Building mystical terrain...")
    build_terrain(nodes_100)

    print("[4/10] Building road surface...")
    build_road_mesh(hi_res)

    print("[5/10] Building neon edges & walls...")
    build_glow_edges(hi_res)
    build_road_walls(hi_res)
    build_road_underside(hi_res)

    print("[6/10] Building start/finish arch...")
    build_start_finish(nodes_100)

    print("[7/10] Building crystal bridge pillars...")
    build_bridge_pillars(nodes_100)

    print("[8/10] Building crystal tunnels & ramps...")
    build_tunnel_crystal(nodes_100, 25, 30, "crystalTunnel_A")
    build_tunnel_crystal(nodes_100, 70, 75, "crystalTunnel_B")
    build_ramp(nodes_100, 48, "ramp_A")
    build_ramp(nodes_100, 92, "ramp_B")

    print("[9/10] Placing Crystal Kingdom decorations...")
    place_decorations(nodes_100)

    # Export
    print("[10/10] Exporting GLB...")
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')

    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )

    file_size = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    obj_count = len(bpy.data.objects)
    mat_count = len(bpy.data.materials)
    print(f"\nExported to: {OUTPUT_PATH}")
    print(f"Objects: {obj_count}, Materials: {mat_count}")
    print(f"File size: {file_size:.1f} MB")
    print("Done! Crystal Kingdom awaits!")

if __name__ == "__main__":
    main()
