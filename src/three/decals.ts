import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { DecalConfig, DecalPreset, DecalSide, PrintStyle } from '../types';
import type { FabricTextureSuite } from './materials';
import { extractDominantColorsFromCanvas } from '../utils/colorUtils';

const MAX_EMBROIDERY_NORMAL_DIM = 512;
export const DECAL_POS_MIN = 8;
export const DECAL_POS_MAX = 92;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

export interface PreparedLogoAsset {
  fileName: string;
  aspectRatio: number;
  width: number;
  height: number;
  dominantColors: string[];
  flatTexture: THREE.CanvasTexture;
  embroideryNormalMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface GarmentAnchorMetrics {
  modelBox: THREE.Box3;
  frontBox: THREE.Box3;
  backBox: THREE.Box3;
  bodyBox: THREE.Box3;
  pocketBox: THREE.Box3 | null;
  placketBox: THREE.Box3 | null;
  /** Mid-plane Z separating Front (> splitZ) and Back (< splitZ) halves */
  splitZ: number;
  /** Front-to-back thickness of the garment in normalized world units */
  shirtThickness: number;
  /** Button Y positions sorted top-to-bottom (1st, 2nd, 3rd...) */
  buttonYs: number[];
  /** +1 when wearer's left (pocket side) sits on +X, -1 when on -X */
  wearerLeftSign: number;
}

/**
 * Validates and decodes an uploaded PNG/SVG/JPG artwork, scales up to 4096px
 * (clamped by GPU maxTextureSize) so large prints stay crisp,
 * extracts 6 dominant logo colours, and builds a raised satin-stitch embroidery normal map.
 */
export async function prepareLogoAsset(
  file: File,
  maxAnisotropy: number,
  maxTextureSize = 4096
): Promise<PreparedLogoAsset> {
  const lower = file.name.toLowerCase();
  const hasValidExt =
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.webp');

  if (!ALLOWED_MIME_TYPES.has(file.type) && !hasValidExt) {
    throw new Error('Unsupported artwork format. Please upload a PNG, SVG, or JPG file.');
  }

  if (file.size > 40 * 1024 * 1024) {
    throw new Error('Image file is larger than 40 MB. Please use a smaller file.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const natW = img.naturalWidth || img.width || 1024;
    const natH = img.naturalHeight || img.height || 1024;

    if (natW <= 0 || natH <= 0) {
      throw new Error('Could not read image dimensions.');
    }

    const maxDim = Math.min(4096, Math.max(2048, maxTextureSize));
    const isSvg = file.type === 'image/svg+xml' || lower.endsWith('.svg');
    const targetLongEdge = isSvg
      ? Math.min(maxDim, Math.max(2048, Math.max(natW, natH)))
      : Math.min(maxDim, Math.max(natW, natH));
    const scale = targetLongEdge / Math.max(natW, natH);

    const width = Math.max(1, Math.round(natW * scale));
    const height = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const dominantColors = extractDominantColorsFromCanvas(canvas, 6);
    applySubtleFabricBlend(ctx, width, height);

    const flatTexture = new THREE.CanvasTexture(canvas);
    flatTexture.colorSpace = THREE.SRGBColorSpace;
    flatTexture.anisotropy = Math.min(maxAnisotropy, 16);
    flatTexture.generateMipmaps = true;
    flatTexture.needsUpdate = true;

    const embroideryNormalMap = buildEmbroideryNormalMap(canvas, maxAnisotropy);

    return {
      fileName: file.name,
      aspectRatio: width / height,
      width,
      height,
      dominantColors,
      flatTexture,
      embroideryNormalMap,
      dispose: () => {
        flatTexture.dispose();
        embroideryNormalMap.dispose();
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode artwork image.'));
    img.src = src;
  });
}

function applySubtleFabricBlend(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let y = 0; y < height; y++) {
    const rowPhase = (y & 1) * 1.57;
    const cosY = Math.cos(y * 0.65);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] < 8) continue;
      const weave = 0.975 + Math.sin(x * 0.65 + rowPhase) * cosY * 0.025;
      data[idx] = Math.min(255, Math.round(data[idx] * weave));
      data[idx + 1] = Math.min(255, Math.round(data[idx + 1] * weave));
      data[idx + 2] = Math.min(255, Math.round(data[idx + 2] * weave));
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function buildEmbroideryNormalMap(
  sourceCanvas: HTMLCanvasElement,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const ratio = Math.min(
    1,
    MAX_EMBROIDERY_NORMAL_DIM / Math.max(sourceCanvas.width, sourceCanvas.height)
  );
  const w = Math.max(32, Math.round(sourceCanvas.width * ratio));
  const h = Math.max(32, Math.round(sourceCanvas.height * ratio));

  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wCtx = work.getContext('2d')!;
  wCtx.drawImage(sourceCanvas, 0, 0, w, h);

  const src = wCtx.getImageData(0, 0, w, h).data;
  const heightMap = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const px = idx * 4;
      const alpha = src[px + 3] / 255;
      if (alpha < 0.05) {
        heightMap[idx] = 0;
        continue;
      }
      const lum = (0.299 * src[px] + 0.587 * src[px + 1] + 0.114 * src[px + 2]) / 255;
      const stitchWave =
        Math.sin((x * 0.78 + y * 0.62) * 2.15) * 0.16 +
        Math.sin((x * 0.22 - y * 0.96) * 0.75) * 0.05;
      heightMap[idx] = THREE.MathUtils.clamp(
        alpha * (0.68 + lum * 0.14 + stitchWave),
        0,
        1
      );
    }
  }

  const blurred = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      blurred[idx] =
        (heightMap[idx] * 4 +
          heightMap[idx - 1] +
          heightMap[idx + 1] +
          heightMap[idx - w] +
          heightMap[idx + w]) /
        8;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const strength = 4.2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(w - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(h - 1, y + 1);

      const dx = blurred[y * w + xp] - blurred[y * w + xm];
      const dy = blurred[yp * w + x] - blurred[ym * w + x];

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const px = (y * w + x) * 4;
      outImg.data[px] = Math.round((nx * 0.5 + 0.5) * 255);
      outImg.data[px + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outImg.data[px + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outImg.data[px + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);

  const tex = new THREE.CanvasTexture(outCanvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(maxAnisotropy, 8);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Clamps ONLY the decal centre coordinates to [8, 92]% of panel width/height.
 * Never clamps by the logo's full width/height so even a 100% print can move freely.
 */
export function clampNormalizedCentre(posX: number, posY: number): { posX: number; posY: number } {
  return {
    posX: Math.round(THREE.MathUtils.clamp(posX, DECAL_POS_MIN, DECAL_POS_MAX) * 10) / 10,
    posY: Math.round(THREE.MathUtils.clamp(posY, DECAL_POS_MIN, DECAL_POS_MAX) * 10) / 10,
  };
}

/**
 * Converts normalized viewer-space (posX, posY) in [8..92] to world (x, y) on the Front or Back panel.
 * On Back (-Z), viewer left-to-right runs from +X to -X so sliders and arrow keys always feel natural.
 */
export function normalizedPosToWorldXY(
  side: DecalSide,
  posX: number,
  posY: number,
  panelBox: THREE.Box3
): { x: number; y: number } {
  const { posX: cx, posY: cy } = clampNormalizedCentre(posX, posY);
  const tx = cx / 100;
  const ty = cy / 100;

  const x =
    side === 'front'
      ? THREE.MathUtils.lerp(panelBox.min.x, panelBox.max.x, tx)
      : THREE.MathUtils.lerp(panelBox.max.x, panelBox.min.x, tx);
  const y = THREE.MathUtils.lerp(panelBox.min.y, panelBox.max.y, ty);

  return { x, y };
}

/**
 * Converts a world (x, y) point on the Front or Back panel to clamped normalized centre (posX, posY) in [8..92].
 */
export function worldXYToNormalizedPos(
  side: DecalSide,
  worldX: number,
  worldY: number,
  panelBox: THREE.Box3
): { posX: number; posY: number } {
  const spanX = Math.max(0.0001, panelBox.max.x - panelBox.min.x);
  const spanY = Math.max(0.0001, panelBox.max.y - panelBox.min.y);

  const tx =
    side === 'front'
      ? (worldX - panelBox.min.x) / spanX
      : (panelBox.max.x - worldX) / spanX;
  const ty = (worldY - panelBox.min.y) / spanY;

  return clampNormalizedCentre(tx * 100, ty * 100);
}

/**
 * Computes calibrated normalized centre (posX, posY) for any Front or Back preset.
 * - Left chest: centred on visible pocket, or 22% of front width from centre at 2nd button level.
 * - Right chest: mirror of Left chest across centre line at the same height.
 * - Centre chest: on centre line, level with 3rd button below the placket.
 */
export function computePresetNormalizedPosition(
  side: DecalSide,
  preset: DecalPreset,
  metrics: GarmentAnchorMetrics
): { posX: number; posY: number } {
  const panelBox = side === 'front' ? metrics.frontBox : metrics.backBox;
  const panelSize = panelBox.getSize(new THREE.Vector3());
  const panelCenter = panelBox.getCenter(new THREE.Vector3());

  let rawX = panelCenter.x;
  let rawY = panelCenter.y;

  if (side === 'front') {
    const fallbackBtn2Y = panelBox.min.y + panelSize.y * 0.71;
    const fallbackBtn3Y = panelBox.min.y + panelSize.y * 0.58;

    const btn2Y =
      metrics.buttonYs.length >= 2
        ? metrics.buttonYs[1]
        : metrics.buttonYs.length === 1
        ? metrics.buttonYs[0] - panelSize.y * 0.06
        : fallbackBtn2Y;

    const btn3Y =
      metrics.buttonYs.length >= 3
        ? metrics.buttonYs[2]
        : metrics.placketBox
        ? metrics.placketBox.min.y - panelSize.y * 0.05
        : fallbackBtn3Y;

    const pocketCenter = metrics.pocketBox
      ? metrics.pocketBox.getCenter(new THREE.Vector3())
      : null;

    const defaultChestOffset = panelSize.x * 0.22;
    const leftChestX = pocketCenter
      ? pocketCenter.x
      : panelCenter.x + metrics.wearerLeftSign * defaultChestOffset;
    const leftChestY = pocketCenter ? pocketCenter.y : btn2Y;

    if (preset === 'left-chest') {
      rawX = leftChestX;
      rawY = leftChestY;
    } else if (preset === 'right-chest') {
      const mirrorOffset = Math.abs(leftChestX - panelCenter.x);
      rawX = panelCenter.x - metrics.wearerLeftSign * mirrorOffset;
      rawY = leftChestY;
    } else {
      rawX = panelCenter.x;
      rawY = metrics.placketBox
        ? Math.min(btn3Y, metrics.placketBox.min.y - panelSize.y * 0.06)
        : btn3Y;
    }
  } else {
    if (preset === 'upper-back') {
      rawX = panelCenter.x;
      rawY = panelBox.min.y + panelSize.y * 0.76;
    } else {
      rawX = panelCenter.x;
      rawY = panelBox.min.y + panelSize.y * 0.54;
    }
  }

  return worldXYToNormalizedPos(side, rawX, rawY, panelBox);
}

/**
 * Computes smooth barycentric-interpolated outward world normal at a raycast hit.
 */
export function getSmoothWorldNormal(
  hit: THREE.Intersection,
  expectedZSign: 1 | -1
): THREE.Vector3 {
  const fallback = new THREE.Vector3(0, 0, expectedZSign);
  const mesh = hit.object as THREE.Mesh;
  const face = hit.face;
  if (!face || !mesh.geometry) return fallback;

  const posAttr = mesh.geometry.getAttribute('position');
  const normAttr = mesh.geometry.getAttribute('normal');
  const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const worldNormal = new THREE.Vector3();

  if (posAttr && normAttr) {
    const a = new THREE.Vector3().fromBufferAttribute(posAttr, face.a).applyMatrix4(mesh.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(posAttr, face.b).applyMatrix4(mesh.matrixWorld);
    const c = new THREE.Vector3().fromBufferAttribute(posAttr, face.c).applyMatrix4(mesh.matrixWorld);

    const bary = new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.point, a, b, c, bary);

    const na = new THREE.Vector3().fromBufferAttribute(normAttr, face.a);
    const nb = new THREE.Vector3().fromBufferAttribute(normAttr, face.b);
    const nc = new THREE.Vector3().fromBufferAttribute(normAttr, face.c);

    worldNormal
      .set(0, 0, 0)
      .addScaledVector(na, bary.x)
      .addScaledVector(nb, bary.y)
      .addScaledVector(nc, bary.z)
      .applyMatrix3(normalMat)
      .normalize();
  } else {
    worldNormal.copy(face.normal).applyMatrix3(normalMat).normalize();
  }

  if (worldNormal.lengthSq() < 0.001) return fallback;
  if (worldNormal.z * expectedZSign < 0) {
    worldNormal.negate();
  }
  return worldNormal;
}

/**
 * Computes decal width, height, and shallow projector depth (~12% of shirt thickness,
 * bounded strictly below half-thickness so projection can NEVER reach the opposite side).
 */
export function computeDecalWorldDimensions(
  side: DecalSide,
  sizePercent: number,
  aspectRatio: number,
  metrics: GarmentAnchorMetrics
): { width: number; height: number; depth: number; panelBox: THREE.Box3 } {
  const panelBox = side === 'front' ? metrics.frontBox : metrics.backBox;
  const panelSize = panelBox.getSize(new THREE.Vector3());
  const clampedPct = THREE.MathUtils.clamp(sizePercent, 5, 100) / 100;

  const effectivePanelWidth = panelSize.x * 0.96;
  const width = effectivePanelWidth * clampedPct;
  const safeAspect = Math.max(0.2, Math.min(5, aspectRatio));
  let height = width / safeAspect;

  const maxHeight = side === 'back' ? panelSize.y * 0.94 : panelSize.y * 0.88;
  if (height > maxHeight) {
    height = maxHeight;
  }

  // Shallow projector box depth (~12% of shirt thickness; gently expanded for wide curved wraps
  // while remaining strictly < 34% of shirt thickness so it can never cross the centre plane)
  const thickness = Math.max(0.18, metrics.shirtThickness);
  const baseDepth = thickness * 0.12;
  const panelDepthSpan = Math.max(0.02, panelBox.max.z - panelBox.min.z);
  const wideFactor = THREE.MathUtils.clamp((clampedPct - 0.35) / 0.65, 0, 1);
  const curvatureDepth = Math.min(thickness * 0.34, panelDepthSpan * (0.45 + wideFactor * 0.5));
  const depth = Math.max(0.055, THREE.MathUtils.lerp(baseDepth, Math.max(baseDepth, curvatureDepth), wideFactor));

  return { width, height, depth, panelBox };
}

/**
 * Raycasts inward from front (+Z) or back (-Z) onto the exact panel surface point
 * to obtain the surface anchor position and smooth outward normal.
 */
export function projectPointOntoGarmentSurface(
  side: DecalSide,
  x: number,
  y: number,
  targetMeshes: THREE.Mesh[],
  metrics: GarmentAnchorMetrics
): { position: THREE.Vector3; normal: THREE.Vector3 } | null {
  if (targetMeshes.length === 0) return null;

  const panelBox = side === 'front' ? metrics.frontBox : metrics.backBox;
  const panelCenter = panelBox.getCenter(new THREE.Vector3());
  const modelSize = metrics.modelBox.getSize(new THREE.Vector3());
  const zSign: 1 | -1 = side === 'front' ? 1 : -1;

  const rayOrigin = new THREE.Vector3(
    x,
    y,
    panelCenter.z + zSign * (modelSize.z * 2.5 + 1.2)
  );
  const rayDir = new THREE.Vector3(0, 0, -zSign);
  const raycaster = new THREE.Raycaster(rayOrigin, rayDir);

  const visibleTargets = targetMeshes.filter((m) => m.visible);
  const hits = raycaster.intersectObjects(visibleTargets, false);

  // Pick the first hit that lies on the correct half of the shirt
  for (const hit of hits) {
    const onCorrectHalf =
      side === 'front' ? hit.point.z >= metrics.splitZ : hit.point.z <= metrics.splitZ;
    if (onCorrectHalf) {
      return {
        position: hit.point.clone(),
        normal: getSmoothWorldNormal(hit, zSign),
      };
    }
  }

  // Fallback to outer panel face if ray missed a small seam/neck gap
  const fallbackZ = side === 'front' ? panelBox.max.z : panelBox.min.z;
  return {
    position: new THREE.Vector3(x, y, fallbackZ),
    normal: new THREE.Vector3(0, 0, zSign),
  };
}

/**
 * Filters a generated DecalGeometry triangle-by-triangle so ONLY triangles satisfying BOTH:
 *  a) faceNormal · projectorDir > 0.3 (strictly facing toward the projector), AND
 *  b) triangle centroid lies strictly on the correct half of the shirt
 *     (world z > splitZ for front; world z < splitZ for back)
 * are kept. Guarantees zero bleed-through and zero mirroring from the opposite side.
 */
function filterDecalGeometry(
  sourceGeo: THREE.BufferGeometry,
  projectorOutwardDir: THREE.Vector3,
  side: DecalSide,
  splitZ: number
): THREE.BufferGeometry | null {
  const posAttr = sourceGeo.getAttribute('position');
  const normAttr = sourceGeo.getAttribute('normal');
  const uvAttr = sourceGeo.getAttribute('uv');
  if (!posAttr || posAttr.count < 3) return null;

  const indexAttr = sourceGeo.getIndex();
  const triCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();

  const outPositions: number[] = [];
  const outNormals: number[] = [];
  const outUvs: number[] = [];

  // Backup buffer solely in case a user's single-sided GLB panel has completely inverted winding
  const flippedPositions: number[] = [];
  const flippedNormals: number[] = [];
  const flippedUvs: number[] = [];

  const getIdx = (k: number) => (indexAttr ? indexAttr.getX(k) : k);

  for (let t = 0; t < triCount; t++) {
    const i0 = getIdx(t * 3);
    const i1 = getIdx(t * 3 + 1);
    const i2 = getIdx(t * 3 + 2);

    p0.fromBufferAttribute(posAttr, i0);
    p1.fromBufferAttribute(posAttr, i1);
    p2.fromBufferAttribute(posAttr, i2);

    // Condition (b): Triangle centroid MUST lie on the correct half of the shirt
    const centroidZ = (p0.z + p1.z + p2.z) / 3;
    const onCorrectHalf = side === 'front' ? centroidZ > splitZ : centroidZ < splitZ;
    if (!onCorrectHalf) continue;

    // Geometric face normal from triangle winding
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    faceNormal.crossVectors(e1, e2);
    const lenSq = faceNormal.lengthSq();
    if (lenSq < 1e-12) continue;
    faceNormal.divideScalar(Math.sqrt(lenSq));

    // Condition (a): face-normal · projector-direction > 0.3
    const dot = faceNormal.dot(projectorOutwardDir);

    if (dot > 0.3) {
      outPositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);

      if (normAttr) {
        n0.fromBufferAttribute(normAttr, i0);
        n1.fromBufferAttribute(normAttr, i1);
        n2.fromBufferAttribute(normAttr, i2);
        outNormals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
      } else {
        outNormals.push(
          faceNormal.x, faceNormal.y, faceNormal.z,
          faceNormal.x, faceNormal.y, faceNormal.z,
          faceNormal.x, faceNormal.y, faceNormal.z
        );
      }

      if (uvAttr) {
        outUvs.push(
          uvAttr.getX(i0), uvAttr.getY(i0),
          uvAttr.getX(i1), uvAttr.getY(i1),
          uvAttr.getX(i2), uvAttr.getY(i2)
        );
      }
    } else if (dot < -0.3) {
      // Collect opposite-wound triangles only as fallback if the entire panel mesh was exported inside-out
      flippedPositions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
      if (normAttr) {
        n0.fromBufferAttribute(normAttr, i0).negate();
        n1.fromBufferAttribute(normAttr, i1).negate();
        n2.fromBufferAttribute(normAttr, i2).negate();
        flippedNormals.push(n0.x, n0.y, n0.z, n2.x, n2.y, n2.z, n1.x, n1.y, n1.z);
      } else {
        flippedNormals.push(
          -faceNormal.x, -faceNormal.y, -faceNormal.z,
          -faceNormal.x, -faceNormal.y, -faceNormal.z,
          -faceNormal.x, -faceNormal.y, -faceNormal.z
        );
      }
      if (uvAttr) {
        flippedUvs.push(
          uvAttr.getX(i0), uvAttr.getY(i0),
          uvAttr.getX(i2), uvAttr.getY(i2),
          uvAttr.getX(i1), uvAttr.getY(i1)
        );
      }
    }
  }

  const usePositions = outPositions.length > 0 ? outPositions : flippedPositions;
  const useNormals = outPositions.length > 0 ? outNormals : flippedNormals;
  const useUvs = outPositions.length > 0 ? outUvs : flippedUvs;

  if (usePositions.length === 0) return null;

  const filtered = new THREE.BufferGeometry();
  filtered.setAttribute('position', new THREE.Float32BufferAttribute(usePositions, 3));
  filtered.setAttribute('normal', new THREE.Float32BufferAttribute(useNormals, 3));
  if (useUvs.length > 0) {
    filtered.setAttribute('uv', new THREE.Float32BufferAttribute(useUvs, 2));
  }
  return filtered;
}

export interface DecalBuildResult {
  group: THREE.Group;
  anchorPosition: THREE.Vector3;
  anchorNormal: THREE.Vector3;
  dispose: () => void;
}

/**
 * Projects a strictly isolated, non-mirrored DecalGeometry onto eligible meshes:
 * - Front: Front + visible Pocket meshes ONLY
 * - Back: Back mesh ONLY
 * Clips naturally at panel edges & sleeve seams; never bleeds to the opposite side.
 */
export function buildProjectedDecal(
  asset: PreparedLogoAsset,
  config: DecalConfig,
  targetMeshes: THREE.Mesh[],
  metrics: GarmentAnchorMetrics,
  textures: FabricTextureSuite
): DecalBuildResult | null {
  const visibleTargets = targetMeshes.filter((m) => m.visible);
  if (visibleTargets.length === 0) return null;

  const { width, height, depth, panelBox } = computeDecalWorldDimensions(
    config.side,
    config.sizePercent,
    asset.aspectRatio,
    metrics
  );

  // Use either custom (posX, posY) or calibrated preset (posX, posY); clamp ONLY the centre to [8..92]%
  const normPos = config.isCustomPosition
    ? clampNormalizedCentre(config.posX, config.posY)
    : computePresetNormalizedPosition(config.side, config.preset, metrics);

  const worldXY = normalizedPosToWorldXY(config.side, normPos.posX, normPos.posY, panelBox);
  const projected = projectPointOntoGarmentSurface(
    config.side,
    worldXY.x,
    worldXY.y,
    visibleTargets,
    metrics
  );
  if (!projected) return null;

  const anchorPosition = projected.position;
  // Blend surface normal gently with canonical outward axis for wide prints so shoulders/edges stay crisp
  const zSign: 1 | -1 = config.side === 'front' ? 1 : -1;
  const canonicalDir = new THREE.Vector3(0, 0, zSign);
  const sizeBlend = THREE.MathUtils.clamp((config.sizePercent - 45) / 55, 0, 0.55);
  const anchorNormal = projected.normal
    .clone()
    .lerp(canonicalDir, sizeBlend)
    .normalize();

  // Outward-facing orientation aligned to anchorNormal with world +Y up.
  // Object3D.lookAt points local +Z along anchorNormal, giving un-mirrored UVs on both Front & Back.
  const dummy = new THREE.Object3D();
  dummy.position.copy(anchorPosition);
  dummy.up.set(0, 1, 0);
  dummy.lookAt(anchorPosition.clone().add(anchorNormal));
  dummy.rotateZ(THREE.MathUtils.degToRad(-config.rotationDeg));
  const orientation = new THREE.Euler().setFromQuaternion(dummy.quaternion, 'XYZ');

  const decalSize = new THREE.Vector3(width, height, depth);
  const decalMat = createDecalMaterial(asset, config.printStyle, textures);

  const decalGroup = new THREE.Group();
  decalGroup.name = `__decal_${config.side}__`;

  const geometries: THREE.BufferGeometry[] = [];

  for (const mesh of visibleTargets) {
    mesh.updateWorldMatrix(true, false);
    try {
      const rawGeo = new DecalGeometry(mesh, anchorPosition, orientation, decalSize);
      const filteredGeo = filterDecalGeometry(rawGeo, anchorNormal, config.side, metrics.splitZ);
      rawGeo.dispose();

      if (!filteredGeo) continue;

      geometries.push(filteredGeo);
      const decalMesh = new THREE.Mesh(filteredGeo, decalMat);
      decalMesh.renderOrder = 12;
      decalMesh.userData.isDecal = true;
      decalMesh.userData.decalSide = config.side;
      decalGroup.add(decalMesh);
    } catch {
      // Skip incompatible geometries safely
    }
  }

  return {
    group: decalGroup,
    anchorPosition,
    anchorNormal,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      decalMat.dispose();
    },
  };
}

function createDecalMaterial(
  asset: PreparedLogoAsset,
  printStyle: PrintStyle,
  textures: FabricTextureSuite
): THREE.Material {
  if (printStyle === 'embroidery') {
    return new THREE.MeshPhysicalMaterial({
      map: asset.flatTexture,
      normalMap: asset.embroideryNormalMap,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.48,
      metalness: 0.0,
      sheen: 0.55,
      sheenRoughness: 0.42,
      sheenColor: new THREE.Color(0xffffff),
      envMapIntensity: 0.55,
      transparent: true,
      alphaTest: 0.02,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
  }

  return new THREE.MeshStandardMaterial({
    map: asset.flatTexture,
    normalMap: textures.solidNormalMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.48,
    transparent: true,
    alphaTest: 0.02,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}
