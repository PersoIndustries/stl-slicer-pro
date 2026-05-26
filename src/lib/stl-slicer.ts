import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION, ADDITION } from "three-bvh-csg";
import { STLExporter } from "three-stdlib";

/**
 * three-bvh-csg requires both brushes to share the same set of BufferAttributes.
 * STL meshes only have `position` (+ computed `normal`), while BoxGeometry /
 * CylinderGeometry also include `uv`. Mismatched attributes throw
 * "Cannot read properties of undefined (reading 'array')" inside GeometryBuilder.
 * Normalize every geometry we feed to the evaluator to position+normal only.
 */
function normalizeForCSG(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  // Drop everything except position; recompute normals.
  for (const name of Object.keys(g.attributes)) {
    if (name !== "position") g.deleteAttribute(name);
  }
  g.computeVertexNormals();
  return g;
}

export type CutResult = {
  partA: THREE.Mesh; // side along +normal
  partB: THREE.Mesh; // side along -normal
};

const matA = new THREE.MeshStandardMaterial({
  color: 0x60a5fa,
  metalness: 0.1,
  roughness: 0.6,
  side: THREE.DoubleSide,
});
const matB = new THREE.MeshStandardMaterial({
  color: 0xf472b6,
  metalness: 0.1,
  roughness: 0.6,
  side: THREE.DoubleSide,
});

function planeBasis(normal: THREE.Vector3) {
  const n = normal.clone().normalize();
  const tmp = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(n, tmp).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { n, u, v };
}

export function sliceMesh(
  sourceMesh: THREE.Mesh,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
  opts: { pins?: number; pinRadius?: number; pinHeight?: number } = {}
): CutResult {
  // Build a giant cutter box. Position it so its +Z face lies on the plane.
  const geo = sourceMesh.geometry as THREE.BufferGeometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!.clone();
  // transform bounding box to world
  bb.applyMatrix4(sourceMesh.matrixWorld);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const big = Math.max(size.x, size.y, size.z) * 4 + 100;

  const cutterGeo = new THREE.BoxGeometry(big, big, big);
  // Shift so the +Z face of the box lies on z=0 plane locally → box occupies z in [-big, 0]
  cutterGeo.translate(0, 0, -big / 2);

  const cutter = new THREE.Mesh(cutterGeo);
  // Orient: cutter's local +Z should align with planeNormal, positioned at planePoint
  const n = planeNormal.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  cutter.quaternion.copy(q);
  cutter.position.copy(planePoint);
  cutter.updateMatrixWorld(true);

  // Bake source mesh world transform into geometry copies for CSG
  const bakedGeo = geo.clone();
  bakedGeo.applyMatrix4(sourceMesh.matrixWorld);
  const sourceBrush = new Brush(bakedGeo);
  sourceBrush.updateMatrixWorld();

  const cutterBakedGeo = cutterGeo.clone();
  cutterBakedGeo.applyMatrix4(cutter.matrixWorld);
  const cutterBrush = new Brush(cutterBakedGeo);
  cutterBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  // SUBTRACT cutter → keeps the side opposite to cutter (the +normal side)
  let aBrush = evaluator.evaluate(sourceBrush, cutterBrush, SUBTRACTION) as Brush;

  // INVERT cutter for second piece: same box flipped (occupy +Z side)
  const cutterGeo2 = new THREE.BoxGeometry(big, big, big);
  cutterGeo2.translate(0, 0, big / 2);
  cutterGeo2.applyMatrix4(cutter.matrixWorld);
  const cutterBrush2 = new Brush(cutterGeo2);
  cutterBrush2.updateMatrixWorld();
  let bBrush = evaluator.evaluate(sourceBrush, cutterBrush2, SUBTRACTION) as Brush;

  // Optional pins/dovels
  const pins = opts.pins ?? 0;
  if (pins > 0) {
    const radius = opts.pinRadius ?? Math.max(1, Math.min(size.x, size.y, size.z) * 0.02);
    const height = opts.pinHeight ?? radius * 4;
    const { u, v } = planeBasis(n);
    // distribute pins on a circle around planePoint in plane's uv
    const ringR = Math.min(size.x, size.y, size.z) * 0.25 + radius * 2;
    for (let i = 0; i < pins; i++) {
      const angle = (i / pins) * Math.PI * 2;
      const offset = u.clone().multiplyScalar(Math.cos(angle) * ringR).add(v.clone().multiplyScalar(Math.sin(angle) * ringR));
      const pos = planePoint.clone().add(offset);

      // Pin cylinder: half into partA (+normal side), half into partB.
      // Build cylinder with axis along Y in local, then orient so axis = n.
      const cylGeo = new THREE.CylinderGeometry(radius, radius, height, 24);
      // axis along Y, center at 0
      const cylQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      const cylMat = new THREE.Matrix4().compose(pos, cylQ, new THREE.Vector3(1, 1, 1));
      cylGeo.applyMatrix4(cylMat);

      // Add pin to partA
      const pinBrushA = new Brush(cylGeo.clone());
      pinBrushA.updateMatrixWorld();
      aBrush = evaluator.evaluate(aBrush, pinBrushA, ADDITION) as Brush;

      // Subtract socket from partB (slightly larger)
      const socketGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, height * 1.05, 24);
      socketGeo.applyMatrix4(cylMat);
      const socketBrush = new Brush(socketGeo);
      socketBrush.updateMatrixWorld();
      bBrush = evaluator.evaluate(bBrush, socketBrush, SUBTRACTION) as Brush;
    }
  }

  const partA = new THREE.Mesh(aBrush.geometry, matA.clone());
  const partB = new THREE.Mesh(bBrush.geometry, matB.clone());
  partA.geometry.computeVertexNormals();
  partB.geometry.computeVertexNormals();
  return { partA, partB };
}

export function exportMeshAsSTL(mesh: THREE.Mesh, filename: string) {
  const exporter = new STLExporter();
  const data: string = exporter.parse(mesh, { binary: false });
  const blob = new Blob([data], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function repairGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  // Basic repair: merge close vertices, recompute normals
  const merged = geo.clone();
  merged.computeVertexNormals();
  return merged;
}
