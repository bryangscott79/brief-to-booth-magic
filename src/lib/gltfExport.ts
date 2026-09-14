/**
 * gltfExport — the same booth geometry as a minimal, valid glTF 2.0 document
 * with an embedded (base64 data-URI) buffer, so the Model step produces
 * something openable with ZERO infrastructure: no Blender, no hosted service,
 * no network.
 *
 * It builds from the SAME decomposition the Blender script uses
 * (boothSolids.buildBoothModelPlan), so the .gltf and the .blend are the
 * same model. Everything is a flat-shaded extruded prism — dimensions and
 * placement are what matter here, not curvature (circles are 32-gons).
 *
 * ── Axis conversion ──────────────────────────────────────────────────────
 * Booth space is Z-up (x = width, y = front→back depth, z = height).
 * glTF is Y-up, right-handed, −Z forward. We apply Blender's own export
 * mapping: (x, y, z) → (x, z, −y). That is a +1-determinant rotation, so
 * triangle winding (and therefore face normals) survives untouched.
 *
 * ── Units ────────────────────────────────────────────────────────────────
 * glTF's canonical unit is the metre, which is exactly what the plan emits.
 * No scaling is applied anywhere in this file.
 */

import type { BoothGeometry } from "./geometryModel";
import {
  buildBoothModelPlan,
  hexToLinearRgb,
  signedArea2,
  type BoothSolid,
  type Vec2,
} from "./boothSolids";

// ─── glTF document types (only the subset we emit) ────────────────────────

export interface GltfDocument {
  asset: { version: "2.0"; generator: string; copyright?: string };
  scene: number;
  scenes: Array<{ name?: string; nodes: number[] }>;
  nodes: Array<{ name: string; mesh?: number; children?: number[] }>;
  meshes: Array<{
    name: string;
    primitives: Array<{
      attributes: { POSITION: number; NORMAL: number };
      indices: number;
      material: number;
      mode: 4;
    }>;
  }>;
  materials: Array<{
    name: string;
    doubleSided: boolean;
    pbrMetallicRoughness: {
      baseColorFactor: [number, number, number, number];
      metallicFactor: number;
      roughnessFactor: number;
    };
  }>;
  accessors: Array<{
    bufferView: number;
    componentType: number;
    count: number;
    type: "VEC3" | "SCALAR";
    min?: number[];
    max?: number[];
  }>;
  bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number; target?: number }>;
  buffers: Array<{ byteLength: number; uri: string }>;
}

export interface GltfExportOptions {
  projectName?: string;
  configLabel?: string;
}

const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT = 5125;
const TARGET_ARRAY_BUFFER = 34962;
const TARGET_ELEMENT_ARRAY_BUFFER = 34963;

// ─── Polygon triangulation ────────────────────────────────────────────────

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clipping triangulation of a simple polygon, returning index triples
 * into `points` wound counter-clockwise. Handles the concave cases we
 * actually produce (L-shaped zones); falls back to a fan if a degenerate
 * polygon ever slips through, which is better than emitting no cap at all.
 */
export function triangulate(points: Vec2[]): number[] {
  const n = points.length;
  if (n < 3) return [];
  const remaining = points.map((_, i) => i);
  if (signedArea2(points) < 0) remaining.reverse();

  const triangles: number[] = [];
  let guard = n * n + 16;

  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const i0 = remaining[(i + remaining.length - 1) % remaining.length];
      const i1 = remaining[i];
      const i2 = remaining[(i + 1) % remaining.length];
      const a = points[i0];
      const b = points[i1];
      const c = points[i2];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 1e-12) continue; // reflex or collinear — not an ear
      let blocked = false;
      for (const j of remaining) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTriangle(points[j], a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      triangles.push(i0, i1, i2);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }

  if (remaining.length === 3) {
    triangles.push(remaining[0], remaining[1], remaining[2]);
  } else if (remaining.length > 3) {
    for (let i = 1; i < remaining.length - 1; i++) {
      triangles.push(remaining[0], remaining[i], remaining[i + 1]);
    }
  }
  return triangles;
}

// ─── Mesh building ────────────────────────────────────────────────────────

interface MeshBuffers {
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Booth Z-up (x, y, z) → glTF Y-up (x, z, −y). */
function toGltf(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/**
 * Flat-shaded prism: bottom cap (normal down), top cap (normal up) and one
 * quad per footprint edge (normal outward). Vertices are duplicated per
 * face so the silhouette stays crisp.
 */
export function prismMesh(solid: BoothSolid): MeshBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const pts = solid.points;
  const caps = triangulate(pts);

  const push = (
    p: [number, number, number],
    nrm: [number, number, number],
  ): number => {
    positions.push(p[0], p[1], p[2]);
    normals.push(nrm[0], nrm[1], nrm[2]);
    return positions.length / 3 - 1;
  };

  // Top cap — CCW in booth XY becomes CCW seen from +Y in glTF.
  const upNormal = toGltf(0, 0, 1);
  for (let t = 0; t < caps.length; t += 3) {
    const a = push(toGltf(pts[caps[t]].x, pts[caps[t]].y, solid.z1), upNormal);
    const b = push(toGltf(pts[caps[t + 1]].x, pts[caps[t + 1]].y, solid.z1), upNormal);
    const c = push(toGltf(pts[caps[t + 2]].x, pts[caps[t + 2]].y, solid.z1), upNormal);
    indices.push(a, b, c);
  }

  // Bottom cap — reversed winding so its normal points down.
  const downNormal = toGltf(0, 0, -1);
  for (let t = 0; t < caps.length; t += 3) {
    const a = push(toGltf(pts[caps[t + 2]].x, pts[caps[t + 2]].y, solid.z0), downNormal);
    const b = push(toGltf(pts[caps[t + 1]].x, pts[caps[t + 1]].y, solid.z0), downNormal);
    const c = push(toGltf(pts[caps[t]].x, pts[caps[t]].y, solid.z0), downNormal);
    indices.push(a, b, c);
  }

  // Sides.
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    // Outward normal of a CCW polygon edge is the RIGHT-hand normal.
    const nrm = toGltf(dy / len, -dx / len, 0);
    const a = push(toGltf(p0.x, p0.y, solid.z0), nrm);
    const b = push(toGltf(p1.x, p1.y, solid.z0), nrm);
    const c = push(toGltf(p1.x, p1.y, solid.z1), nrm);
    const d = push(toGltf(p0.x, p0.y, solid.z1), nrm);
    indices.push(a, b, c, a, c, d);
  }

  return { positions, normals, indices };
}

// ─── base64 (environment-independent — no btoa / Buffer dependency) ───────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

// ─── Document assembly ────────────────────────────────────────────────────

export function buildGltfDocument(
  geometry: BoothGeometry,
  options: GltfExportOptions = {},
): GltfDocument {
  const plan = buildBoothModelPlan(geometry);

  const materialIndex = new Map<string, number>();
  const materials: GltfDocument["materials"] = plan.materials.map((m, i) => {
    materialIndex.set(m.name, i);
    const [r, g, b] = hexToLinearRgb(m.colorHex);
    return {
      name: m.name,
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1] as [number, number, number, number],
        metallicFactor: 0,
        roughnessFactor: 0.7,
      },
    };
  });

  const accessors: GltfDocument["accessors"] = [];
  const bufferViews: GltfDocument["bufferViews"] = [];
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;

  const pushView = (bytes: Uint8Array, target: number): number => {
    chunks.push(bytes);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: bytes.byteLength,
      target,
    });
    byteOffset += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const meshes: GltfDocument["meshes"] = [];
  const nodes: GltfDocument["nodes"] = [];

  // Collection nodes first, so the outliner mirrors the Blender scene.
  const collectionNode = new Map<string, number>();
  for (const path of plan.collections) {
    const key = path.join("/");
    nodes.push({ name: path[path.length - 1], children: [] });
    const index = nodes.length - 1;
    collectionNode.set(key, index);
    if (path.length > 1) {
      const parent = nodes[collectionNode.get(path.slice(0, -1).join("/"))!];
      parent.children!.push(index);
    }
  }

  for (const solid of plan.solids) {
    const mesh = prismMesh(solid);
    if (mesh.indices.length === 0) continue;

    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], positions[i + c]);
        max[c] = Math.max(max[c], positions[i + c]);
      }
    }

    const posView = pushView(new Uint8Array(positions.buffer), TARGET_ARRAY_BUFFER);
    accessors.push({
      bufferView: posView,
      componentType: COMPONENT_FLOAT,
      count: positions.length / 3,
      type: "VEC3",
      min,
      max,
    });
    const posAccessor = accessors.length - 1;

    const nrmView = pushView(new Uint8Array(normals.buffer), TARGET_ARRAY_BUFFER);
    accessors.push({
      bufferView: nrmView,
      componentType: COMPONENT_FLOAT,
      count: normals.length / 3,
      type: "VEC3",
    });
    const nrmAccessor = accessors.length - 1;

    const idxView = pushView(new Uint8Array(indices.buffer), TARGET_ELEMENT_ARRAY_BUFFER);
    accessors.push({
      bufferView: idxView,
      componentType: COMPONENT_UINT,
      count: indices.length,
      type: "SCALAR",
    });
    const idxAccessor = accessors.length - 1;

    meshes.push({
      name: solid.name,
      primitives: [
        {
          attributes: { POSITION: posAccessor, NORMAL: nrmAccessor },
          indices: idxAccessor,
          material: materialIndex.get(solid.material) ?? 0,
          mode: 4,
        },
      ],
    });

    nodes.push({ name: solid.name, mesh: meshes.length - 1 });
    const nodeIndex = nodes.length - 1;
    const parentIndex = collectionNode.get(solid.collection.join("/"));
    if (parentIndex !== undefined) nodes[parentIndex].children!.push(nodeIndex);
  }

  // Drop empty children arrays — valid glTF forbids zero-length arrays.
  for (const node of nodes) {
    if (node.children && node.children.length === 0) delete node.children;
  }

  const buffer = new Uint8Array(byteOffset);
  let cursor = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const rootNodes = plan.collections
    .filter((p) => p.length === 1)
    .map((p) => collectionNode.get(p.join("/"))!)
    .filter((i) => i !== undefined);

  const label = [options.projectName, options.configLabel].filter(Boolean).join(" · ");

  return {
    asset: {
      version: "2.0",
      generator: `CANOPY booth model exporter${label ? ` — ${label}` : ""}`,
    },
    scene: 0,
    scenes: [{ name: "Booth", nodes: rootNodes.length > 0 ? rootNodes : [0] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: byteOffset,
        uri: `data:application/octet-stream;base64,${bytesToBase64(buffer)}`,
      },
    ],
  };
}

/** The .gltf file contents, ready to download. */
export function buildGltfFile(geometry: BoothGeometry, options: GltfExportOptions = {}): string {
  return JSON.stringify(buildGltfDocument(geometry, options), null, 2);
}

/** Suggested filename for a downloaded .gltf. */
export function gltfFilename(options: GltfExportOptions = {}): string {
  const slug = (options.projectName ?? "booth")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const cfg = options.configLabel
    ? `-${options.configLabel.toLowerCase().replace(/[^a-z0-9]+/g, "")}`
    : "";
  return `${slug || "booth"}${cfg}.gltf`;
}
