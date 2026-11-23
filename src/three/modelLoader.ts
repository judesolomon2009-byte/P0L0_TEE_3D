import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  ColourGroup,
  FabricFinish,
  MeshMappingRecord,
  ModelLoadReport,
  PartColours,
} from '../types';
import {
  bakeVertexConcaveAO,
  buildHemAndCuffStitches,
  createGarmentMaterial,
  updateStitchTone,
  type FabricTextureSuite,
  type StitchEntry,
} from './materials';
import type { GarmentAnchorMetrics } from './decals';
import { toRealisticFabricHex } from '../utils/colorUtils';

export interface ManagedMeshEntry {
  id: string;
  mesh: THREE.Mesh;
  meshName: string;
  materialName: string;
  group: ColourGroup;
  isRibbedPart: boolean;
  material: THREE.MeshPhysicalMaterial;
  currentColor: THREE.Color;
  targetColor: THREE.Color;
  startColor: THREE.Color;
  transitionStartMs: number;
  isFrontTarget: boolean;
  isBackTarget: boolean;
  center: [number, number, number];
  size: [number, number, number];
  reason: string;
}

export interface ProcessedPoloModel {
  root: THREE.Group;
  entries: ManagedMeshEntry[];
  stitches: StitchEntry[];
  modelBox: THREE.Box3;
  bodyBox: THREE.Box3;
  wearerLeftSign: number;
  report: ModelLoadReport;
  computeAnchorMetrics: (showPocket: boolean) => GarmentAnchorMetrics;
  dispose: () => void;
}

const TARGET_MODEL_HEIGHT = 1.52;
const FLOOR_CLEARANCE = 0.06;

export async function loadGltfFromBlob(
  blob: Blob,
  onProgress?: (fraction: number) => void
): Promise<GLTF> {
  const objectUrl = URL.createObjectURL(blob);
  const loader = new GLTFLoader();

  try {
    return await new Promise<GLTF>((resolve, reject) => {
      loader.load(
        objectUrl,
        (gltf) => {
          onProgress?.(1);
          resolve(gltf);
        },
        (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            onProgress?.(Math.min(0.95, evt.loaded / evt.total));
          } else {
            onProgress?.(0.5);
          }
        },
        (err) => {
          reject(
            err instanceof Error
              ? err
              : new Error('Unable to parse GLB file. Ensure it is a valid binary .glb model.')
          );
        }
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadGltfFromDirectUrl(
  rawUrl: string,
  onProgress?: (fraction: number) => void
): Promise<{ gltf: GLTF; buffer: ArrayBuffer; fileName: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid direct URL ending in .glb');
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('Only HTTP/HTTPS model links are supported.');
  }

  onProgress?.(0.08);
  const response = await fetch(parsedUrl.toString());
  if (!response.ok) {
    throw new Error(
      `Could not fetch model (HTTP ${response.status}). Check link permissions or CORS.`
    );
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  let buffer: ArrayBuffer;

  if (response.body && contentLength > 0) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.(0.08 + Math.min(0.74, (received / contentLength) * 0.74));
      }
    }

    const combined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    buffer = combined.buffer;
  } else {
    onProgress?.(0.45);
    buffer = await response.arrayBuffer();
  }

  onProgress?.(0.84);
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const gltf = await loadGltfFromBlob(blob, (f) => onProgress?.(0.84 + f * 0.16));

  const pathPart = parsedUrl.pathname.split('/').filter(Boolean).pop() || 'remote-polo.glb';
  const fileName = decodeURIComponent(pathPart);

  return { gltf, buffer, fileName };
}

interface RawMeshMeta {
  mesh: THREE.Mesh;
  meshName: string;
  materialName: string;
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

/**
 * Auto-detects whether the shirt's Front faces +Z or -Z (or ±X) from Front/Back/Pocket/Button positions,
 * and rotates sourceScene around Y so Front ALWAYS faces +Z and Back ALWAYS faces -Z.
 */
function normalizeFrontOrientation(sourceScene: THREE.Object3D): void {
  sourceScene.updateMatrixWorld(true);
  const frontCenters: THREE.Vector3[] = [];
  const backCenters: THREE.Vector3[] = [];
  const frontCueCenters: THREE.Vector3[] = [];

  sourceScene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const matNorm = normalizeToken(origMat?.name || '');
    const meshNorm = normalizeToken(obj.name || '');
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());

    if (matNorm === 'front' || (matNorm.includes('front') && !matNorm.includes('placket'))) {
      frontCenters.push(c);
    } else if (matNorm === 'back' || matNorm.includes('back')) {
      backCenters.push(c);
    } else if (
      matNorm.includes('pocket') ||
      matNorm.includes('button') ||
      meshNorm.includes('pocket') ||
      meshNorm.includes('button')
    ) {
      frontCueCenters.push(c);
    }
  });

  const avg = (pts: THREE.Vector3[]) => {
    const out = new THREE.Vector3();
    pts.forEach((p) => out.add(p));
    return out.divideScalar(pts.length);
  };

  let forwardDir: THREE.Vector3 | null = null;
  if (frontCenters.length > 0 && backCenters.length > 0) {
    forwardDir = avg(frontCenters).sub(avg(backCenters));
  } else if (frontCueCenters.length > 0) {
    const totalCenter = new THREE.Box3().setFromObject(sourceScene).getCenter(new THREE.Vector3());
    forwardDir = avg(frontCueCenters).sub(totalCenter);
  }

  if (!forwardDir) return;
  forwardDir.y = 0;
  if (forwardDir.lengthSq() < 1e-6) return;

  // Snap to nearest 90° so Front points cleanly toward +Z
  if (Math.abs(forwardDir.x) > Math.abs(forwardDir.z)) {
    sourceScene.rotation.y += forwardDir.x > 0 ? -Math.PI / 2 : Math.PI / 2;
  } else if (forwardDir.z < 0) {
    sourceScene.rotation.y += Math.PI;
  }
  sourceScene.updateMatrixWorld(true);
}

export function processLoadedPoloScene(
  sourceScene: THREE.Object3D,
  fileName: string,
  textures: FabricTextureSuite,
  initialColours: PartColours,
  initialFinish: FabricFinish
): ProcessedPoloModel {
  const root = new THREE.Group();
  root.name = 'PoloModelRoot';
  root.add(sourceScene);

  // Auto-detect Front vs Back axis and orient Front strictly toward +Z
  normalizeFrontOrientation(sourceScene);

  root.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(sourceScene);
  const rawSize = rawBox.getSize(new THREE.Vector3());

  const maxSpan = Math.max(rawSize.y, rawSize.x * 0.85, rawSize.z, 0.0001);
  const scaleFactor = TARGET_MODEL_HEIGHT / maxSpan;

  sourceScene.scale.multiplyScalar(scaleFactor);
  sourceScene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(sourceScene);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

  sourceScene.position.x -= scaledCenter.x;
  sourceScene.position.z -= scaledCenter.z;
  sourceScene.position.y -= scaledBox.min.y - FLOOR_CLEARANCE;
  root.updateMatrixWorld(true);

  const modelBox = new THREE.Box3().setFromObject(root);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());

  const rawMeshes: RawMeshMeta[] = [];
  let meshCounter = 0;

  sourceScene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    meshCounter += 1;

    if (!obj.geometry.getAttribute('normal')) {
      obj.geometry.computeVertexNormals();
    }
    ensureUsableUVs(obj.geometry);

    const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const materialName = (origMat?.name || '').trim() || `Unnamed_Mat_${meshCounter}`;
    const meshName = (obj.name || '').trim() || `Mesh_${meshCounter}`;

    obj.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    rawMeshes.push({ mesh: obj, meshName, materialName, box, center, size });
  });

  let recognizedCount = 0;
  const classifications = rawMeshes.map((meta) => {
    const result = classifyMesh(meta, modelCenter, modelSize);
    if (result.recognized) recognizedCount += 1;
    return { meta, ...result };
  });

  const fallbackSingleGroup = rawMeshes.length > 0 && recognizedCount === 0;
  if (fallbackSingleGroup) {
    classifications.forEach((c) => {
      c.group = 'body';
      c.reason = 'Fallback single-group mapping (click any part to reassign)';
    });
  }

  // Compute Body-only bounding box for smooth Body Ombre Gradient mapping
  const bodyBox = new THREE.Box3();
  classifications.forEach((c) => {
    if (c.group === 'body') {
      bodyBox.union(c.meta.box);
    }
  });
  if (bodyBox.isEmpty()) {
    bodyBox.copy(modelBox);
  }

  // Detect wearer-left X sign from pocket position (if present), else +1 (+X = wearer's left)
  let wearerLeftSign = 1;
  const pocketItem = classifications.find((c) => c.group === 'pocket');
  if (pocketItem && Math.abs(pocketItem.meta.center.x - modelCenter.x) > 0.02) {
    wearerLeftSign = pocketItem.meta.center.x >= modelCenter.x ? 1 : -1;
  }

  const entries: ManagedMeshEntry[] = [];
  const mappingRecords: MeshMappingRecord[] = [];
  const consoleRows: Array<Record<string, string | number>> = [];

  classifications.forEach((item, idx) => {
    const { meta, group, reason } = item;
    const id = `mesh-${idx}-${meta.mesh.uuid.slice(0, 6)}`;

    bakeVertexConcaveAO(meta.mesh.geometry, meta.mesh, modelBox, group);

    const origMats = Array.isArray(meta.mesh.material)
      ? meta.mesh.material
      : meta.mesh.material
      ? [meta.mesh.material]
      : [];

    const isCuff =
      normalizeToken(meta.meshName).includes('cuff') ||
      normalizeToken(meta.materialName).includes('cuff');
    const isRibbedPart = group === 'collar' || isCuff;

    const rawHex = initialColours[group];
    const clonedMat = createGarmentMaterial(
      rawHex,
      textures,
      group,
      initialFinish,
      isRibbedPart,
      bodyBox
    );
    clonedMat.name = `${meta.materialName}__cloned_${idx}`;

    // Explicitly enforce non-metallic matte fabric baseline on every fabric mesh (including Placket)
    if (group !== 'buttons') {
      clonedMat.metalness = 0.0;
      clonedMat.metalnessMap = null;
      clonedMat.roughnessMap = null;
      clonedMat.roughness = 0.85;
      clonedMat.envMapIntensity = 0.6;
    } else {
      clonedMat.metalness = 0.0;
      clonedMat.metalnessMap = null;
      clonedMat.roughnessMap = null;
      clonedMat.roughness = 0.35;
    }

    meta.mesh.material = clonedMat;
    origMats.forEach((m) => m.dispose());

    meta.mesh.castShadow = true;
    meta.mesh.receiveShadow = true;
    meta.mesh.renderOrder = 0;
    meta.mesh.userData.entryId = id;
    meta.mesh.userData.originalMaterialName = meta.materialName;

    const { isFrontTarget, isBackTarget } = determineDecalEligibility(
      meta,
      group,
      modelCenter,
      fallbackSingleGroup
    );

    const centerTuple: [number, number, number] = [
      round3(meta.center.x),
      round3(meta.center.y),
      round3(meta.center.z),
    ];
    const sizeTuple: [number, number, number] = [
      round3(meta.size.x),
      round3(meta.size.y),
      round3(meta.size.z),
    ];

    const effectiveHex = group === 'buttons' ? rawHex : toRealisticFabricHex(rawHex);
    const col = new THREE.Color().setStyle(effectiveHex);

    entries.push({
      id,
      mesh: meta.mesh,
      meshName: meta.meshName,
      materialName: meta.materialName,
      group,
      isRibbedPart,
      material: clonedMat,
      currentColor: col.clone(),
      targetColor: col.clone(),
      startColor: col.clone(),
      transitionStartMs: 0,
      isFrontTarget,
      isBackTarget,
      center: centerTuple,
      size: sizeTuple,
      reason,
    });

    mappingRecords.push({
      id,
      meshName: meta.meshName,
      materialName: meta.materialName,
      group,
      center: centerTuple,
      size: sizeTuple,
      reason,
    });

    consoleRows.push({
      '#': idx + 1,
      Mesh: meta.meshName,
      Material: meta.materialName,
      Group: group,
      Ribbed: isRibbedPart ? 'Yes' : 'No',
      Center: `(${centerTuple.join(', ')})`,
      DecalTarget: isFrontTarget
        ? 'Front'
        : isBackTarget
        ? 'Back'
        : group === 'pocket'
        ? 'Front+Pocket'
        : '—',
      Notes: reason,
    });
  });

  console.groupCollapsed(
    `[Halvora Polo Loader] Loaded "${fileName}" (${entries.length} meshes)`
  );
  console.table(consoleRows);
  console.groupEnd();

  const stitches = buildHemAndCuffStitches(
    entries.map((e) => ({ mesh: e.mesh, group: e.group })),
    modelBox
  );
  stitches.forEach((st) => {
    const c = new THREE.Color().setStyle(toRealisticFabricHex(initialColours[st.group]));
    updateStitchTone(st.material, c);
  });

  const hasPocket = entries.some((e) => e.group === 'pocket');
  const hasPlacket = entries.some((e) => e.group === 'placket');
  const warningMessage = fallbackSingleGroup
    ? 'Unrecognised mesh names — mapped the whole shirt to Body. Click any part on the shirt to assign it manually.'
    : undefined;

  const report: ModelLoadReport = {
    fileName,
    meshCount: entries.length,
    mappings: mappingRecords,
    hasPocket,
    hasPlacket,
    fallbackSingleGroup,
    warningMessage,
  };

  const computeAnchorMetrics = (showPocket: boolean): GarmentAnchorMetrics => {
    root.updateMatrixWorld(true);
    const liveModelBox = new THREE.Box3().setFromObject(root);

    const buildGroupBox = (list: ManagedMeshEntry[]): THREE.Box3 | null => {
      if (list.length === 0) return null;
      const b = new THREE.Box3();
      list.forEach((e) => {
        e.mesh.updateWorldMatrix(true, false);
        b.expandByObject(e.mesh);
      });
      return b.isEmpty() ? null : b;
    };

    const frontEntries = entries.filter((e) => e.isFrontTarget);
    const backEntries = entries.filter((e) => e.isBackTarget);
    const bodyEntries = entries.filter((e) => e.group === 'body');

    const liveBodyBox = buildGroupBox(bodyEntries) ?? liveModelBox.clone();
    const frontBox = buildGroupBox(frontEntries) ?? liveBodyBox.clone();
    const backBox = buildGroupBox(backEntries) ?? liveBodyBox.clone();

    const pocketEntries = showPocket
      ? entries.filter((e) => e.group === 'pocket' && e.mesh.visible)
      : [];
    const pocketBox = buildGroupBox(pocketEntries);

    const placketEntries = entries.filter((e) => e.group === 'placket');
    const placketBox = buildGroupBox(placketEntries);

    // Mid-plane Z separating Front half (> splitZ) and Back half (< splitZ)
    const frontCenterZ = frontBox.getCenter(new THREE.Vector3()).z;
    const backCenterZ = backBox.getCenter(new THREE.Vector3()).z;
    const splitZ =
      frontEntries.length > 0 && backEntries.length > 0 && Math.abs(frontCenterZ - backCenterZ) > 0.02
        ? (frontCenterZ + backCenterZ) * 0.5
        : liveBodyBox.getCenter(new THREE.Vector3()).z;

    const shirtThickness = Math.max(
      0.16,
      frontBox.max.z - backBox.min.z,
      liveBodyBox.max.z - liveBodyBox.min.z
    );

    const buttonYs: number[] = [];
    entries
      .filter((e) => e.group === 'buttons')
      .forEach((e) => {
        e.mesh.updateWorldMatrix(true, false);
        const b = new THREE.Box3().setFromObject(e.mesh);
        if (!b.isEmpty()) {
          buttonYs.push(b.getCenter(new THREE.Vector3()).y);
        }
      });
    buttonYs.sort((a, b) => b - a);

    return {
      modelBox: liveModelBox,
      frontBox,
      backBox,
      bodyBox: liveBodyBox,
      pocketBox,
      placketBox,
      splitZ,
      shirtThickness,
      buttonYs,
      wearerLeftSign,
    };
  };

  const dispose = () => {
    stitches.forEach((st) => {
      st.line.geometry.dispose();
      st.material.dispose();
      st.line.parent?.remove(st.line);
    });
    entries.forEach((e) => {
      e.mesh.geometry.dispose();
      e.material.dispose();
    });
  };

  return {
    root,
    entries,
    stitches,
    modelBox,
    bodyBox,
    wearerLeftSign,
    report,
    computeAnchorMetrics,
    dispose,
  };
}

function classifyMesh(
  meta: RawMeshMeta,
  modelCenter: THREE.Vector3,
  modelSize: THREE.Vector3
): { group: ColourGroup; recognized: boolean; reason: string } {
  const matNorm = normalizeToken(meta.materialName);
  const meshNorm = normalizeToken(meta.meshName);
  const combined = `${matNorm} ${meshNorm}`;

  if (matNorm === 'button' || matNorm.includes('button') || meshNorm.includes('button')) {
    return { group: 'buttons', recognized: true, reason: 'Matched Button material/mesh' };
  }

  if (matNorm === 'pocket' || matNorm.includes('pocket') || meshNorm.includes('pocket')) {
    return { group: 'pocket', recognized: true, reason: 'Matched Pocket material/mesh' };
  }

  if (matNorm === 'collar' || matNorm.includes('collar') || meshNorm.includes('collar')) {
    return { group: 'collar', recognized: true, reason: 'Matched Collar material/mesh' };
  }

  if (
    matNorm === 'upper_left' ||
    matNorm === 'upper_right' ||
    matNorm.includes('upper_left') ||
    matNorm.includes('upper_right') ||
    combined.includes('sleeve')
  ) {
    const lateralOffset = Math.abs(meta.center.x - modelCenter.x);
    const isLateral = lateralOffset > modelSize.x * 0.2;
    const sideLabel = meta.center.x >= modelCenter.x ? '+X side' : '-X side';
    return {
      group: 'sleeves',
      recognized: true,
      reason: isLateral
        ? `Sleeve verified by bounding-box (${sideLabel})`
        : 'Matched Upper_Left/Right (click to reassign if needed)',
    };
  }

  // PT_FABRIC and Material115145: treat as Body unless clearly the front placket -> matte FABRIC placket
  if (
    matNorm === 'pt_fabric' ||
    matNorm.includes('pt_fabric') ||
    matNorm === 'material115145' ||
    matNorm.includes('115145') ||
    combined.includes('placket')
  ) {
    const isCenteredX = Math.abs(meta.center.x - modelCenter.x) < modelSize.x * 0.14;
    const isNarrow = meta.size.x < modelSize.x * 0.22;
    const isUpperFront =
      meta.center.y > modelCenter.y + modelSize.y * 0.05 &&
      meta.center.z > modelCenter.z + modelSize.z * 0.05;
    const isVerticalStrip = meta.size.y > meta.size.x * 1.15;

    if ((isCenteredX && isNarrow && isUpperFront && isVerticalStrip) || combined.includes('placket')) {
      return {
        group: 'placket',
        recognized: true,
        reason: `${meta.materialName} detected as front placket (matte cotton fabric)`,
      };
    }

    return {
      group: 'body',
      recognized: true,
      reason: `${meta.materialName} mapped to Body (non-placket bounds)`,
    };
  }

  if (
    matNorm === 'front' ||
    matNorm === 'back' ||
    matNorm === 'lower_left' ||
    matNorm === 'lower_right' ||
    matNorm.includes('lower_left') ||
    matNorm.includes('lower_right') ||
    matNorm.includes('front') ||
    matNorm.includes('back') ||
    combined.includes('body') ||
    combined.includes('torso')
  ) {
    return { group: 'body', recognized: true, reason: `Matched Body panel (${meta.materialName})` };
  }

  return {
    group: 'body',
    recognized: false,
    reason: 'Unrecognised material name — defaulted to Body',
  };
}

function determineDecalEligibility(
  meta: RawMeshMeta,
  group: ColourGroup,
  modelCenter: THREE.Vector3,
  fallbackSingleGroup: boolean
): { isFrontTarget: boolean; isBackTarget: boolean } {
  if (group !== 'body') {
    return { isFrontTarget: false, isBackTarget: false };
  }

  const matNorm = normalizeToken(meta.materialName);
  const meshNorm = normalizeToken(meta.meshName);

  if (
    matNorm.includes('upper_left') ||
    matNorm.includes('upper_right') ||
    matNorm.includes('lower_left') ||
    matNorm.includes('lower_right') ||
    meshNorm.includes('sleeve') ||
    meshNorm.includes('collar')
  ) {
    return { isFrontTarget: false, isBackTarget: false };
  }

  if (matNorm === 'front' || (matNorm.includes('front') && !matNorm.includes('placket'))) {
    return { isFrontTarget: true, isBackTarget: false };
  }
  if (matNorm === 'back' || matNorm.includes('back')) {
    return { isFrontTarget: false, isBackTarget: true };
  }

  if (fallbackSingleGroup) {
    return { isFrontTarget: true, isBackTarget: true };
  }

  if (meshNorm.includes('front') && meta.center.z >= modelCenter.z) {
    return { isFrontTarget: true, isBackTarget: false };
  }
  if (meshNorm.includes('back') && meta.center.z <= modelCenter.z) {
    return { isFrontTarget: false, isBackTarget: true };
  }

  return { isFrontTarget: false, isBackTarget: false };
}

function ensureUsableUVs(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute('uv')) return;
  const pos = geometry.getAttribute('position');
  if (!pos) return;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.001);

  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uvs[i * 2] = (x + z * 0.5 - box.min.x) / span;
    uvs[i * 2 + 1] = (y - box.min.y) / span;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function normalizeToken(val: string): string {
  return val.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
