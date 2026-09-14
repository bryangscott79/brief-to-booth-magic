/**
 * blenderScript — deterministic BoothGeometry → Blender Python (.py).
 *
 * This IS the deliverable of the Model step: the user downloads the script
 * and runs it in Blender (UI or headless), and gets the booth they zoned on
 * the Spatial canvas as real, navigable geometry.
 *
 * It is a PURE function: no DOM, no network, no Blender API at runtime — it
 * only writes text, and the same geometry always produces byte-identical
 * output (no timestamps, no random ids), so a rebuild after an unrelated
 * edit is a no-op diff.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 * The model is authored in METRES. Plan lengths are feet on imperial
 * projects and metres on metric ones; heights are ALWAYS feet. Both
 * conversions happen in boothSolids.ts (FT_TO_M = 0.3048) before a single
 * number reaches this file, so every coordinate emitted here is metres.
 *
 * ── Scene structure ──────────────────────────────────────────────────────
 *   CANOPY_Booth/
 *     Shell/      Booth_Floor                        (carpet at the exact footprint)
 *     Zones/
 *       Zone_<Name>/  Zone_<Name>_Pad | _Wall_N | _Upright_N | _Canopy
 *                     | _Ceiling | _Platform | _Tower
 *     Features/   Feature_<Name>                     (multi-part ones nest)
 *       Feature_<Name>/ _Post_N | _Plane | _Leg_N | _Lintel | _Panel | _Seg_NN
 *     Hanging/    Hanging_<Name>                     (rings nest as _Seg_NN)
 *     Rig/        Camera_Hero | Camera_Front | Camera_Plan
 *                 Key_Light | Fill_Light | Rim_Light | Rig_Target
 *
 * Re-running is idempotent: the script deletes the previous CANOPY_Booth
 * collection (and only that) before rebuilding, so a user can iterate on the
 * layout and re-run into the same .blend without stacking duplicates or
 * spawning Material.001 copies. Nothing outside CANOPY_Booth is touched.
 *
 * ── Optional file output ─────────────────────────────────────────────────
 * Setting CANOPY_OUT_DIR before running also saves booth.blend, exports
 * booth.glb, and renders one still per camera. Unset (the normal case), the
 * script only builds the scene.
 */

import type { BoothGeometry } from "./geometryModel";
import {
  buildBoothModelPlan,
  hexToLinearRgb,
  round4,
  type BoothModelPlan,
} from "./boothSolids";

export interface BlenderScriptOptions {
  /** Shown in the script header. */
  projectName?: string;
  /** Booth size / footprint config label, e.g. "20x40". */
  configLabel?: string;
  /** Render stills when CANOPY_OUT_DIR is set. Default true. */
  renderStills?: boolean;
  /** Still resolution. Default 1600 × 1000. */
  resolution?: [number, number];
}

/** Python string literal with the few characters that can break one escaped. */
function py(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

function pyList(values: string[]): string {
  return `[${values.join(", ")}]`;
}

function num(value: number): string {
  const rounded = round4(value);
  return Number.isFinite(rounded) ? rounded.toFixed(4) : "0.0000";
}

function slugForFile(input: string | undefined, fallback: string): string {
  return (
    (input ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback
  );
}

/** Suggested filename for a downloaded script. */
export function blenderScriptFilename(options: BlenderScriptOptions = {}): string {
  const slug = slugForFile(options.projectName, "booth");
  const cfg = options.configLabel
    ? `-${options.configLabel.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
    : "";
  return `${slug}${cfg}-blender.py`;
}

const HELPERS = `
# ── helpers ──────────────────────────────────────────────────────────────────

def clear_previous(root_name):
    """Delete a previous CANOPY build so re-running never stacks duplicates.

    Only the named root collection and its contents are removed — anything
    else in the file (your own lighting, props, camera work) is untouched.
    """
    root = bpy.data.collections.get(root_name)
    if root is None:
        return 0
    doomed, stack = [], [root]
    while stack:
        col = stack.pop()
        doomed.append(col)
        stack.extend(list(col.children))
    removed = 0
    for col in doomed:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    for col in doomed:
        try:
            bpy.data.collections.remove(col)
        except ReferenceError:
            pass
    # Drop the datablocks those objects owned so names stay clean on rebuild.
    for block in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    return removed


def configure_scene():
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    try:
        scene.unit_settings.length_unit = 'METERS'
    except TypeError:
        pass


_COLLECTIONS = {}


def collection(path):
    """Get-or-create a nested collection from a root-relative path list.

    Always creates fresh datablocks rather than adopting same-named ones from
    elsewhere in the file — clear_previous() has already removed ours, so an
    existing "Zones" belongs to the user and must not receive our objects.
    """
    key = "/".join(path)
    if key in _COLLECTIONS:
        return _COLLECTIONS[key]
    parent = bpy.context.scene.collection if len(path) == 1 else collection(path[:-1])
    col = bpy.data.collections.new(path[-1])
    parent.children.link(col)
    _COLLECTIONS[key] = col
    return col


def make_material(name, rgb):
    """Get-or-create by exact name — re-running must not mint Material.001."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        for key, value in (("Roughness", 0.65), ("Metallic", 0.0)):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = value
    mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return mat


def add_prism(name, points, z0, z1, collection_path, material_name):
    """Extrude a closed CCW footprint polygon from z0 to z1 as one mesh object.

    Every piece of booth geometry is a prism: rectangles, L-notches, diamonds
    and circles differ only in their point list, so one primitive covers the
    whole model. The bottom cap is reversed so its normal points down, and the
    side quads wind outward for counter-clockwise input.
    """
    n = len(points)
    if n < 3 or z1 <= z0:
        return None
    verts = [(p[0], p[1], z0) for p in points] + [(p[0], p[1], z1) for p in points]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    mat = bpy.data.materials.get(material_name)
    if mat:
        obj.data.materials.append(mat)
    collection(collection_path).objects.link(obj)
    return obj


def add_target(name, location, collection_path):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.location = location
    collection(collection_path).objects.link(empty)
    return empty


def aim_at(obj, target):
    con = obj.constraints.new(type='TRACK_TO')
    con.target = target
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'


def add_camera(name, location, lens, collection_path, target, ortho=False, ortho_scale=10.0):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new(name, cam_data)
    cam.location = location
    collection(collection_path).objects.link(cam)
    aim_at(cam, target)
    return cam


def add_area_light(name, location, energy, size, collection_path, target):
    light_data = bpy.data.lights.new(name, type='AREA')
    light_data.energy = energy
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    light.location = location
    collection(collection_path).objects.link(light)
    aim_at(light, target)
    return light


def set_render_engine():
    """Prefer EEVEE (fast, headless-safe); fall back across Blender versions."""
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
        try:
            scene.render.engine = engine
            return engine
        except TypeError:
            continue
    return scene.render.engine


def set_world_background(rgb, strength=1.0):
    world = bpy.context.scene.world or bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bg.inputs[1].default_value = strength
`;

function outputBlock(plan: BoothModelPlan, options: BlenderScriptOptions): string {
  const [rw, rh] = options.resolution ?? [1600, 1000];
  const stills = options.renderStills !== false;
  const cameraLines = plan.cameras
    .map(
      (cam, i) =>
        `    (${py(cam.name)}, ${py(
          `still_${String(i + 1).padStart(2, "0")}_${cam.name.replace(/^Camera_/, "").toLowerCase()}`,
        )}, ${py(cam.label)}),`,
    )
    .join("\n");

  return `
# ── optional file output ─────────────────────────────────────────────────────
# Set CANOPY_OUT_DIR before running to also save the .blend, export a .glb and
# render the cameras. With it unset — the normal case when you just opened this
# in Blender — the script writes nothing to disk.
#
#   macOS / Linux:  CANOPY_OUT_DIR=~/booth-out blender -b -P booth.py
#   Windows (cmd):  set CANOPY_OUT_DIR=C:\\booth-out && blender -b -P booth.py

OUT_DIR = os.environ.get("CANOPY_OUT_DIR", "").strip()
RENDER_STILLS = ${stills ? "True" : "False"} and os.environ.get("CANOPY_SKIP_RENDER", "") == ""
CAMERAS = [
${cameraLines}
]

if OUT_DIR:
    os.makedirs(OUT_DIR, exist_ok=True)
    scene = bpy.context.scene
    engine = set_render_engine()
    scene.render.resolution_x = ${rw}
    scene.render.resolution_y = ${rh}
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    try:
        scene.cycles.samples = 48
    except AttributeError:
        pass

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "booth.blend"))
    print("[canopy] saved booth.blend")

    # GLB: one self-contained file, supported by every Blender 3.x / 4.x.
    try:
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(OUT_DIR, "booth.glb"),
            export_format='GLB',
            export_apply=True,
        )
        print("[canopy] exported booth.glb")
    except Exception as exc:  # noqa: BLE001 — never fail the build over an export
        print("[canopy] glb export failed:", exc)

    if RENDER_STILLS:
        for cam_name, still_name, label in CAMERAS:
            cam = bpy.data.objects.get(cam_name)
            if cam is None:
                continue
            scene.camera = cam
            scene.render.filepath = os.path.join(OUT_DIR, still_name + ".png")
            bpy.ops.render.render(write_still=True)
            print("[canopy] rendered", still_name, "(" + label + ")", "with", engine)

print("[canopy] build complete —",
      ${plan.stats.solids}, "objects,",
      ${plan.stats.zones}, "zones,",
      ${plan.stats.features}, "features,",
      ${plan.stats.hangingElements}, "hanging elements")
`;
}

/**
 * Build the complete Blender Python program for a booth. Deterministic:
 * the same geometry always yields the same text.
 */
export function buildBlenderScript(
  geometry: BoothGeometry,
  options: BlenderScriptOptions = {},
): string {
  const plan = buildBoothModelPlan(geometry);
  const root = plan.collections[0]?.[0] ?? "CANOPY_Booth";
  const rigPath = pyList([root, "Rig"].map(py));
  const unitLabel = geometry.measurementSystem === "metric" ? "m" : "ft";
  const filename = blenderScriptFilename(options);

  const header = [
    "# ═══════════════════════════════════════════════════════════════════════════",
    "# CANOPY — Blender build script",
    "# ═══════════════════════════════════════════════════════════════════════════",
    `# Project    : ${options.projectName ?? "Untitled"}`,
    `# Booth size : ${options.configLabel ?? "—"}`,
    `# Footprint  : ${geometry.width} × ${geometry.depth} ${unitLabel}   ·   ceiling ${geometry.ceilingHeightFt} ft`,
    `# Contents   : ${plan.stats.zones} zones · ${plan.stats.features} features · ${plan.stats.hangingElements} hanging elements · ${plan.stats.solids} objects`,
    "#",
    "# HOW TO RUN",
    "#   Blender app : Scripting tab → Open → this file → Run Script (Alt+P).",
    `#   Terminal    : blender -P ${filename}        (opens the UI with the booth built)`,
    `#                 blender -b -P ${filename}     (headless — see the output block)`,
    "#",
    `#   Re-running is safe. The script deletes the previous "${root}" collection`,
    "#   and rebuilds it, so iterating on the spatial layout never stacks duplicate",
    "#   geometry or mints Material.001 copies. Nothing outside that collection is",
    "#   touched, so your own cameras, lighting and props survive a rebuild.",
    "#",
    "# UNITS",
    "#   The model is authored in METRES (1 ft = 0.3048 m). Plan lengths are feet on",
    "#   imperial projects and metres on metric ones; heights are ALWAYS feet. Both",
    "#   conversions are applied before this file is written — every number below is",
    "#   metres, and the scene's unit system is set to metric to match.",
    "#",
    "# AXES",
    "#   Origin = booth front-left corner at floor level. +X runs left→right along",
    "#   the WIDTH, +Y runs front (aisle) → back along the DEPTH, +Z is up. Zones and",
    "#   rectangular features are corner-anchored; hanging elements are centre-anchored",
    "#   and hang below the ceiling by their suspension drop.",
    "#",
    "# Generated from the project's spatial geometry — regenerate rather than editing",
    "# by hand, so the model and the renders stay in agreement.",
    "# ═══════════════════════════════════════════════════════════════════════════",
    "",
    "import bpy",
    "import os",
    "",
    `ROOT_COLLECTION = ${py(root)}`,
    "",
  ].join("\n");

  const scene = [
    "# ── scene ────────────────────────────────────────────────────────────────────",
    "print('[canopy] cleared', clear_previous(ROOT_COLLECTION), 'objects from a previous build')",
    "configure_scene()",
    `set_world_background((${hexToLinearRgb("#F6F8FA").map(num).join(", ")}), 1.0)`,
    "",
    "# ── materials ────────────────────────────────────────────────────────────────",
    ...plan.materials.map((m) => {
      const [r, g, b] = hexToLinearRgb(m.colorHex);
      return `make_material(${py(m.name)}, (${num(r)}, ${num(g)}, ${num(b)}))`;
    }),
    "",
    "# ── collections ──────────────────────────────────────────────────────────────",
    ...plan.collections.map((path) => `collection(${pyList(path.map(py))})`),
    "",
  ].join("\n");

  // Group the object calls by collection so the emitted file reads like the
  // outliner it produces.
  const byCollection = new Map<string, typeof plan.solids>();
  for (const solid of plan.solids) {
    const key = solid.collection.join("/");
    const bucket = byCollection.get(key);
    if (bucket) bucket.push(solid);
    else byCollection.set(key, [solid]);
  }

  const objects: string[] = [
    "# ── objects ──────────────────────────────────────────────────────────────────",
  ];
  for (const [key, group] of byCollection) {
    objects.push(`# ${key}`);
    for (const s of group) {
      const points = s.points.map((p) => `(${num(p.x)}, ${num(p.y)})`).join(", ");
      objects.push(
        `add_prism(${py(s.name)}, [${points}], ${num(s.z0)}, ${num(s.z1)}, ${pyList(
          s.collection.map(py),
        )}, ${py(s.material)})`,
      );
    }
    objects.push("");
  }

  const rig = [
    "# ── camera + three-point light rig ───────────────────────────────────────────",
    `RIG_TARGET = add_target("Rig_Target", (${num(plan.target.x)}, ${num(plan.target.y)}, ${num(
      plan.target.z,
    )}), ${rigPath})`,
    ...plan.cameras.map((cam) =>
      cam.ortho
        ? `add_camera(${py(cam.name)}, (${num(cam.x)}, ${num(cam.y)}, ${num(cam.z)}), ${num(
            cam.lens,
          )}, ${rigPath}, RIG_TARGET, ortho=True, ortho_scale=${num(cam.orthoScale ?? 10)})`
        : `add_camera(${py(cam.name)}, (${num(cam.x)}, ${num(cam.y)}, ${num(cam.z)}), ${num(
            cam.lens,
          )}, ${rigPath}, RIG_TARGET)`,
    ),
    ...plan.lights.map(
      (l) =>
        `add_area_light(${py(l.name)}, (${num(l.x)}, ${num(l.y)}, ${num(l.z)}), ${num(
          l.energy,
        )}, ${num(l.sizeM)}, ${rigPath}, RIG_TARGET)`,
    ),
    `bpy.context.scene.camera = bpy.data.objects.get(${py(plan.cameras[0]?.name ?? "Camera_Hero")})`,
    "",
  ].join("\n");

  return [header, HELPERS, scene, objects.join("\n"), rig, outputBlock(plan, options)].join("\n");
}
