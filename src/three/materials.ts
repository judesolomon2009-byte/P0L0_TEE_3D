import * as THREE from 'three';
import type { BodyGradientConfig, ColourGroup, FabricFinish } from '../types';
import { toRealisticFabricHex } from '../utils/colorUtils';

export interface FabricTextureSuite {
  solidNormalMap: THREE.CanvasTexture;
  piqueColorMap: THREE.CanvasTexture;
  piqueNormalMap: THREE.CanvasTexture;
  piqueRoughnessMap: THREE.CanvasTexture;
  heatherMaskMap: THREE.CanvasTexture;
  ribbedNormalMap: THREE.CanvasTexture;
  dispose: () => void;
}

export interface FabricShaderUniforms {
  uHeatherStrength: { value: number };
  uHeatherMap: { value: THREE.Texture };
  uDyeDepthStrength: { value: number };
  uGradEnabled: { value: number };
  uGradColorStart: { value: THREE.Color };
  uGradColorEnd: { value: THREE.Color };
  /** 0 = vertical, 1 = diagonal, 2 = horizontal */
  uGradDirection: { value: number };
  uGradSoftness: { value: number };
  uGradBoundsMin: { value: THREE.Vector3 };
  uGradBoundsMax: { value: THREE.Vector3 };
}

export function createFabricTextureSuite(maxAnisotropy: number): FabricTextureSuite {
  const size = 512;

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const cells = 64;
  const cellPx = size / cells;
  const piqueHeight = new Float32Array(size * size);
  const solidHeight = new Float32Array(size * size);
  const heatherMask = new Float32Array(size * size);

  const rowSlub = new Float32Array(size);
  const colSlub = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    rowSlub[i] = (rand() - 0.5) * 0.24;
    colSlub[i] = (rand() - 0.5) * 0.16;
  }

  for (let y = 0; y < size; y++) {
    const gy = y / cellPx;
    const row = Math.floor(gy);
    const stagger = (row & 1) * 0.5;
    for (let x = 0; x < size; x++) {
      const gx = x / cellPx;
      const fx = (((gx + stagger) % 1) + 1) % 1 - 0.5;
      const fy = ((gy % 1) + 1) % 1 - 0.5;

      const diamondDist = Math.abs(fx) * 1.48 + Math.abs(fy) * 1.38;
      const pit = Math.max(0, 1 - diamondDist * 1.65);
      const ridge = Math.sin(gx * Math.PI * 2) * Math.cos(gy * Math.PI * 2) * 0.14;
      const fineThread =
        Math.sin((x + y) * 1.15) * 0.05 + Math.cos((x - y) * 1.15) * 0.04;

      const idx = y * size + x;
      piqueHeight[idx] = THREE.MathUtils.clamp(
        0.58 - pit * 0.44 + ridge + fineThread + (rand() - 0.5) * 0.06,
        0,
        1
      );

      const microWarp = Math.sin(x * 0.85) * 0.12 + Math.cos(y * 1.25) * 0.1;
      solidHeight[idx] = THREE.MathUtils.clamp(
        0.5 + microWarp + (rand() - 0.5) * 0.08,
        0,
        1
      );

      const yarnWave =
        Math.sin(x * 0.16 + Math.sin(y * 0.35) * 2.2) * 0.18 +
        Math.cos(x * 0.42 - y * 0.11) * 0.12;
      const fleck = (rand() - 0.5) * 0.44;
      heatherMask[idx] = THREE.MathUtils.clamp(
        0.5 + yarnWave + rowSlub[y] + colSlub[x] + fleck,
        0,
        1
      );
    }
  }

  const heatherSmoothed = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm1 = (x - 1 + size) % size;
      const xp1 = (x + 1) % size;
      const xp2 = (x + 2) % size;
      const rowOff = y * size;
      heatherSmoothed[rowOff + x] =
        heatherMask[rowOff + xm1] * 0.22 +
        heatherMask[rowOff + x] * 0.36 +
        heatherMask[rowOff + xp1] * 0.26 +
        heatherMask[rowOff + xp2] * 0.16;
    }
  }

  const heightToNormalCanvas = (field: Float32Array, dim: number, strength: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(dim, dim);

    const sample = (x: number, y: number) =>
      field[(((y % dim) + dim) % dim) * dim + (((x % dim) + dim) % dim)];

    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const dx =
          sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
        const dy =
          sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));

        let nx = -dx * strength;
        let ny = -dy * strength;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len;
        ny /= len;
        nz /= len;

        const px = (y * dim + x) * 4;
        img.data[px] = Math.round((nx * 0.5 + 0.5) * 255);
        img.data[px + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        img.data[px + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        img.data[px + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  const piqueColorCanvas = document.createElement('canvas');
  piqueColorCanvas.width = size;
  piqueColorCanvas.height = size;
  const piqueColorCtx = piqueColorCanvas.getContext('2d')!;
  const piqueColorImg = piqueColorCtx.createImageData(size, size);

  const piqueRoughCanvas = document.createElement('canvas');
  piqueRoughCanvas.width = size;
  piqueRoughCanvas.height = size;
  const piqueRoughCtx = piqueRoughCanvas.getContext('2d')!;
  const piqueRoughImg = piqueRoughCtx.createImageData(size, size);

  const heatherCanvas = document.createElement('canvas');
  heatherCanvas.width = size;
  heatherCanvas.height = size;
  const heatherCtx = heatherCanvas.getContext('2d')!;
  const heatherImg = heatherCtx.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    const px = i * 4;
    const h = piqueHeight[i];

    const pShade = Math.round(THREE.MathUtils.clamp(0.92 + (h - 0.5) * 0.14, 0.84, 1.0) * 255);
    piqueColorImg.data[px] = pShade;
    piqueColorImg.data[px + 1] = pShade;
    piqueColorImg.data[px + 2] = pShade;
    piqueColorImg.data[px + 3] = 255;

    const rVal = Math.round(THREE.MathUtils.clamp(0.83 + (1 - h) * 0.08, 0.8, 0.94) * 255);
    piqueRoughImg.data[px] = rVal;
    piqueRoughImg.data[px + 1] = rVal;
    piqueRoughImg.data[px + 2] = rVal;
    piqueRoughImg.data[px + 3] = 255;

    const hm = Math.round(THREE.MathUtils.clamp(heatherSmoothed[i], 0, 1) * 255);
    heatherImg.data[px] = hm;
    heatherImg.data[px + 1] = hm;
    heatherImg.data[px + 2] = hm;
    heatherImg.data[px + 3] = 255;
  }

  piqueColorCtx.putImageData(piqueColorImg, 0, 0);
  piqueRoughCtx.putImageData(piqueRoughImg, 0, 0);
  heatherCtx.putImageData(heatherImg, 0, 0);

  const ribDim = 256;
  const ribHeight = new Float32Array(ribDim * ribDim);
  const ribCols = 32;
  for (let y = 0; y < ribDim; y++) {
    for (let x = 0; x < ribDim; x++) {
      const ribWave = Math.sin((x / ribDim) * Math.PI * 2 * ribCols);
      const knitLoop = Math.cos((y / ribDim) * Math.PI * 2 * 48 + ribWave * 0.6) * 0.14;
      ribHeight[y * ribDim + x] = THREE.MathUtils.clamp(
        0.5 + ribWave * 0.34 + knitLoop,
        0,
        1
      );
    }
  }

  const solidNormalCanvas = heightToNormalCanvas(solidHeight, size, 1.35);
  const piqueNormalCanvas = heightToNormalCanvas(piqueHeight, size, 2.75);
  const ribbedNormalCanvas = heightToNormalCanvas(ribHeight, ribDim, 2.35);

  const makeTex = (
    canvas: HTMLCanvasElement,
    isColor: boolean,
    repeatX: number,
    repeatY = repeatX
  ): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(maxAnisotropy, 8);
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const solidNormalMap = makeTex(solidNormalCanvas, false, 12);
  const piqueColorMap = makeTex(piqueColorCanvas, true, 10);
  const piqueNormalMap = makeTex(piqueNormalCanvas, false, 10);
  const piqueRoughnessMap = makeTex(piqueRoughCanvas, false, 10);
  const heatherMaskMap = makeTex(heatherCanvas, false, 7);
  const ribbedNormalMap = makeTex(ribbedNormalCanvas, false, 6, 4);

  return {
    solidNormalMap,
    piqueColorMap,
    piqueNormalMap,
    piqueRoughnessMap,
    heatherMaskMap,
    ribbedNormalMap,
    dispose: () => {
      solidNormalMap.dispose();
      piqueColorMap.dispose();
      piqueNormalMap.dispose();
      piqueRoughnessMap.dispose();
      heatherMaskMap.dispose();
      ribbedNormalMap.dispose();
    },
  };
}

/**
 * Symmetrical vertex concave AO so Front and Back receive identical soft fold depth.
 */
export function bakeVertexConcaveAO(
  geometry: THREE.BufferGeometry,
  mesh: THREE.Mesh,
  modelBox: THREE.Box3,
  group: ColourGroup
): void {
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  if (!pos || !norm) return;

  mesh.updateWorldMatrix(true, false);
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

  const vWorld = new THREE.Vector3();
  const nWorld = new THREE.Vector3();
  const radial = new THREE.Vector3();

  const aoArray = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    vWorld.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    nWorld.fromBufferAttribute(norm, i).applyMatrix3(normalMat).normalize();

    radial.set(vWorld.x - modelCenter.x, 0, vWorld.z - modelCenter.z);
    if (radial.lengthSq() > 1e-5) radial.normalize();

    // Use absolute radial alignment so double-sided front/back panels shade identically
    const outwardDot = Math.abs(nWorld.dot(radial));
    const foldOcclusion = THREE.MathUtils.clamp((outwardDot + 0.35) / 1.15, 0, 1);

    const verticalBias = THREE.MathUtils.clamp(
      0.88 + ((vWorld.y - modelBox.min.y) / Math.max(0.001, modelSize.y)) * 0.12,
      0.86,
      1.0
    );

    const downFactor = nWorld.y < -0.2 ? 1 + nWorld.y * 0.12 : 1.0;

    let ao = THREE.MathUtils.clamp(
      (0.86 + foldOcclusion * 0.14) * verticalBias * downFactor,
      0.78,
      1.0
    );

    if (group === 'buttons') ao = 1.0;

    aoArray[i] = ao;
  }

  geometry.setAttribute('aDyeAo', new THREE.BufferAttribute(aoArray, 1));
}

/**
 * Creates a strictly non-metallic matte cotton fabric material (including Placket)
 * or a glossy non-metallic resin Button material.
 * Includes onBeforeCompile support for Body Ombre Gradient, Heather fleck, and dyed fold depth.
 */
export function createGarmentMaterial(
  colorHex: string,
  textures: FabricTextureSuite,
  group: ColourGroup,
  finish: FabricFinish,
  isRibbedPart: boolean,
  bodyBounds?: THREE.Box3
): THREE.MeshPhysicalMaterial {
  if (group === 'buttons') {
    return createButtonMaterial(colorHex);
  }

  const calibratedHex = toRealisticFabricHex(colorHex);
  const baseColor = new THREE.Color().setStyle(calibratedHex);
  const sheenColor = computeCottonSheenColor(baseColor);

  const boundsMin = bodyBounds
    ? bodyBounds.min.clone()
    : new THREE.Vector3(-0.4, 0.06, -0.25);
  const boundsMax = bodyBounds
    ? bodyBounds.max.clone()
    : new THREE.Vector3(0.4, 1.58, 0.25);

  const uniforms: FabricShaderUniforms = {
    uHeatherStrength: { value: finish === 'heather' ? 1.0 : 0.0 },
    uHeatherMap: { value: textures.heatherMaskMap },
    uDyeDepthStrength: { value: 1.0 },
    uGradEnabled: { value: 0.0 },
    uGradColorStart: { value: baseColor.clone() },
    uGradColorEnd: { value: baseColor.clone() },
    uGradDirection: { value: 0 },
    uGradSoftness: { value: 0.65 },
    uGradBoundsMin: { value: boundsMin },
    uGradBoundsMax: { value: boundsMax },
  };

  // Enforce strict non-metallic fabric properties (eliminates shiny silver placket/body)
  const mat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness: 0.85,
    roughnessMap: null,
    metalness: 0.0,
    metalnessMap: null,
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    specularIntensity: 0.12,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });

  mat.userData.fabricUniforms = uniforms;
  mat.userData.isRibbedPart = isRibbedPart;
  mat.userData.group = group;

  applyFabricFinishToMaterial(mat, textures, finish, isRibbedPart);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHeatherStrength = uniforms.uHeatherStrength;
    shader.uniforms.uHeatherMap = uniforms.uHeatherMap;
    shader.uniforms.uDyeDepthStrength = uniforms.uDyeDepthStrength;
    shader.uniforms.uGradEnabled = uniforms.uGradEnabled;
    shader.uniforms.uGradColorStart = uniforms.uGradColorStart;
    shader.uniforms.uGradColorEnd = uniforms.uGradColorEnd;
    shader.uniforms.uGradDirection = uniforms.uGradDirection;
    shader.uniforms.uGradSoftness = uniforms.uGradSoftness;
    shader.uniforms.uGradBoundsMin = uniforms.uGradBoundsMin;
    shader.uniforms.uGradBoundsMax = uniforms.uGradBoundsMax;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aDyeAo;
        varying float vDyeAo;
        varying vec2 vHeatherUv;
        varying vec3 vGradWorldPos;`
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vDyeAo = aDyeAo > 0.01 ? aDyeAo : 1.0;
        vHeatherUv = uv * 7.0;
        vec4 gwp = modelMatrix * vec4(position, 1.0);
        vGradWorldPos = gwp.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uHeatherStrength;
        uniform sampler2D uHeatherMap;
        uniform float uDyeDepthStrength;
        uniform float uGradEnabled;
        uniform vec3 uGradColorStart;
        uniform vec3 uGradColorEnd;
        uniform float uGradDirection;
        uniform float uGradSoftness;
        uniform vec3 uGradBoundsMin;
        uniform vec3 uGradBoundsMax;
        varying float vDyeAo;
        varying vec2 vHeatherUv;
        varying vec3 vGradWorldPos;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 0. Smooth Body Ombre Gradient by normalized world position
        if (uGradEnabled > 0.5) {
          vec3 span = max(uGradBoundsMax - uGradBoundsMin, vec3(0.001));
          vec3 normPos = clamp((vGradWorldPos - uGradBoundsMin) / span, 0.0, 1.0);
          float rawCoord = 1.0 - normPos.y; // Vertical: top (0) -> bottom (1)
          if (uGradDirection > 1.5) {
            rawCoord = normPos.x; // Horizontal: left -> right
          } else if (uGradDirection > 0.5) {
            rawCoord = clamp((normPos.x + (1.0 - normPos.y)) * 0.5, 0.0, 1.0); // Diagonal
          }
          float halfBand = mix(0.04, 0.5, clamp(uGradSoftness, 0.05, 1.0));
          float gMix = smoothstep(0.5 - halfBand, 0.5 + halfBand, rawCoord);
          vec3 gradCol = mix(uGradColorStart, uGradColorEnd, gMix);
          // Preserve texture luminance modulation if Pique map is active
          diffuseColor.rgb = gradCol * (diffuseColor.rgb / max(diffuse, vec3(0.001)));
        }
        // 1. Hue-faithful two-tone Heather marl fleck
        if (uHeatherStrength > 0.01) {
          float hMask = texture2D(uHeatherMap, vHeatherUv).r;
          vec3 darkFleck = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(1.16)) * 0.84;
          float maxCh = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          vec3 lightTint = mix(diffuseColor.rgb, vec3(min(1.0, maxCh * 1.16 + 0.14)), 0.30);
          vec3 heathered = mix(darkFleck, lightTint, hMask);
          diffuseColor.rgb = mix(diffuseColor.rgb, heathered, uHeatherStrength);
        }
        // 2. Colour-aware dyed fold AO
        float aoVal = mix(1.0, clamp(vDyeAo, 0.76, 1.0), uDyeDepthStrength);
        float foldDepth = 1.0 - aoVal;
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0008)), vec3(1.0 + foldDepth * 0.48)) * mix(0.88, 1.0, aoVal);`
      );
  };

  mat.customProgramCacheKey = () => 'halvora-cotton-dye-v3';

  return mat;
}

export function applyBodyGradientToMaterial(
  mat: THREE.MeshPhysicalMaterial,
  gradient: BodyGradientConfig,
  bodyBounds: THREE.Box3,
  isBodyGroup: boolean
): void {
  const uniforms = mat.userData.fabricUniforms as FabricShaderUniforms | undefined;
  if (!uniforms) return;

  if (!isBodyGroup || !gradient.enabled) {
    uniforms.uGradEnabled.value = 0.0;
    return;
  }

  uniforms.uGradEnabled.value = 1.0;
  uniforms.uGradColorStart.value.setStyle(toRealisticFabricHex(gradient.colorStart));
  uniforms.uGradColorEnd.value.setStyle(toRealisticFabricHex(gradient.colorEnd));
  uniforms.uGradDirection.value =
    gradient.direction === 'vertical'
      ? 0
      : gradient.direction === 'diagonal'
      ? 1
      : 2;
  uniforms.uGradSoftness.value = THREE.MathUtils.clamp(gradient.softness / 100, 0.08, 1.0);
  uniforms.uGradBoundsMin.value.copy(bodyBounds.min);
  uniforms.uGradBoundsMax.value.copy(bodyBounds.max);
}

export function applyFabricFinishToMaterial(
  mat: THREE.MeshPhysicalMaterial,
  textures: FabricTextureSuite,
  finish: FabricFinish,
  isRibbedPart: boolean
): void {
  const uniforms = mat.userData.fabricUniforms as FabricShaderUniforms | undefined;
  if (uniforms) {
    uniforms.uHeatherStrength.value = finish === 'heather' ? 1.0 : 0.0;
  }

  // Always enforce zero metalness & null metalnessMap/roughnessMap baseline
  mat.metalness = 0.0;
  mat.metalnessMap = null;
  mat.roughnessMap = null;
  mat.roughness = 0.85;
  mat.envMapIntensity = 0.6;

  if (isRibbedPart) {
    mat.normalMap = textures.ribbedNormalMap;
    mat.normalScale.set(0.42, 0.42);
    mat.map = null;
  } else if (finish === 'pique') {
    mat.map = textures.piqueColorMap;
    mat.normalMap = textures.piqueNormalMap;
    mat.normalScale.set(0.46, 0.46);
    mat.roughness = 0.86;
  } else if (finish === 'heather') {
    mat.map = null;
    mat.normalMap = textures.solidNormalMap;
    mat.normalScale.set(0.22, 0.22);
  } else {
    // Solid (default)
    mat.map = null;
    mat.normalMap = textures.solidNormalMap;
    mat.normalScale.set(0.14, 0.14);
  }

  mat.needsUpdate = true;
}

/**
 * Glossy non-metallic resin/plastic button material (roughness 0.35, metalness 0).
 */
export function createButtonMaterial(colorHex: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setStyle(colorHex),
    roughness: 0.35,
    roughnessMap: null,
    metalness: 0.0,
    metalnessMap: null,
    clearcoat: 0.48,
    clearcoatRoughness: 0.25,
    sheen: 0.0,
    envMapIntensity: 0.65,
    side: THREE.DoubleSide,
  });
}

export function computeCottonSheenColor(baseLinear: THREE.Color): THREE.Color {
  return baseLinear.clone().lerp(new THREE.Color(0xffffff), 0.42);
}

export function syncMaterialSheen(mat: THREE.MeshPhysicalMaterial): void {
  if (mat.sheen > 0) {
    mat.sheenColor.copy(mat.color).lerp(new THREE.Color(0xffffff), 0.42);
  }
}

/**
 * Fixed world-floor soft elliptical contact shadow + faint reflection fade.
 */
export function createStudioFloorGroup(): THREE.Group {
  const floorGroup = new THREE.Group();
  floorGroup.name = '__studio_floor__';

  const size = 512;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = size;
  shadowCanvas.height = size;
  const ctx = shadowCanvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.22, 0.68);
  const gradOuter = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.4);
  gradOuter.addColorStop(0, 'rgba(18, 18, 18, 0.26)');
  gradOuter.addColorStop(0.38, 'rgba(18, 18, 18, 0.13)');
  gradOuter.addColorStop(0.72, 'rgba(18, 18, 18, 0.035)');
  gradOuter.addColorStop(1, 'rgba(18, 18, 18, 0)');
  ctx.fillStyle = gradOuter;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
  ctx.fill();

  const gradCore = ctx.createRadialGradient(0, 0, 2, 0, 0, size * 0.19);
  gradCore.addColorStop(0, 'rgba(14, 14, 14, 0.22)');
  gradCore.addColorStop(0.55, 'rgba(14, 14, 14, 0.07)');
  gradCore.addColorStop(1, 'rgba(14, 14, 14, 0)');
  ctx.fillStyle = gradCore;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.85, 1.5),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.003;
  shadowMesh.renderOrder = -2;
  floorGroup.add(shadowMesh);

  const reflCanvas = document.createElement('canvas');
  reflCanvas.width = 256;
  reflCanvas.height = 256;
  const rCtx = reflCanvas.getContext('2d')!;
  const rGrad = rCtx.createRadialGradient(128, 128, 10, 128, 128, 120);
  rGrad.addColorStop(0, 'rgba(255, 255, 255, 0.11)');
  rGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.03)');
  rGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  rCtx.fillStyle = rGrad;
  rCtx.fillRect(0, 0, 256, 256);

  const reflTex = new THREE.CanvasTexture(reflCanvas);
  reflTex.colorSpace = THREE.SRGBColorSpace;
  const reflMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.85),
    new THREE.MeshBasicMaterial({
      map: reflTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    })
  );
  reflMesh.rotation.x = -Math.PI / 2;
  reflMesh.position.y = 0.001;
  reflMesh.renderOrder = -3;
  floorGroup.add(reflMesh);

  return floorGroup;
}

export function createSelectionHighlightMesh(sourceMesh: THREE.Mesh): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#C9A24B') },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float rim = pow(1.0 - clamp(ndotv, 0.0, 1.0), 2.4);
        float alpha = clamp(rim * 0.9 + 0.07, 0.0, 0.92);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  });

  const overlay = new THREE.Mesh(sourceMesh.geometry, mat);
  overlay.name = '__selection_outline__';
  overlay.renderOrder = 25;
  overlay.raycast = () => {};
  return overlay;
}

export interface StitchEntry {
  line: THREE.LineSegments;
  group: ColourGroup;
  material: THREE.LineDashedMaterial;
}

export function buildHemAndCuffStitches(
  meshes: Array<{ mesh: THREE.Mesh; group: ColourGroup }>,
  modelBox: THREE.Box3
): StitchEntry[] {
  const results: StitchEntry[] = [];
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const hemYLimit = modelBox.min.y + modelSize.y * 0.09;
  const sleeveOuterXMin = modelSize.x * 0.24;

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const wA = new THREE.Vector3();
  const wB = new THREE.Vector3();

  for (const { mesh, group } of meshes) {
    if (group !== 'body' && group !== 'sleeves') continue;
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    if (!pos || pos.count < 3 || pos.count > 85000) continue;

    mesh.updateWorldMatrix(true, false);
    const normalAttr = geo.getAttribute('normal');
    const index = geo.getIndex();

    const quantize = (idx: number): string => {
      const x = Math.round(pos.getX(idx) * 2000);
      const y = Math.round(pos.getY(idx) * 2000);
      const z = Math.round(pos.getZ(idx) * 2000);
      return `${x},${y},${z}`;
    };

    const edgeCount = new Map<string, { count: number; i0: number; i1: number }>();

    const addTri = (a: number, b: number, c: number) => {
      const pairs: Array<[number, number]> = [
        [a, b],
        [b, c],
        [c, a],
      ];
      for (const [i0, i1] of pairs) {
        const k0 = quantize(i0);
        const k1 = quantize(i1);
        if (k0 === k1) continue;
        const key = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
        const existing = edgeCount.get(key);
        if (existing) existing.count += 1;
        else edgeCount.set(key, { count: 1, i0, i1 });
      }
    };

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        addTri(i, i + 1, i + 2);
      }
    }

    const linePositions: number[] = [];
    const invWorld = mesh.matrixWorld.clone().invert();
    const normalMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const stitchRows = [0.012, 0.019];

    for (const edge of edgeCount.values()) {
      if (edge.count !== 1) continue;

      vA.fromBufferAttribute(pos, edge.i0);
      vB.fromBufferAttribute(pos, edge.i1);
      wA.copy(vA).applyMatrix4(mesh.matrixWorld);
      wB.copy(vB).applyMatrix4(mesh.matrixWorld);

      const midY = (wA.y + wB.y) * 0.5;
      const midX = (wA.x + wB.x) * 0.5;

      let qualify = false;
      const inwardShift = new THREE.Vector3();

      if (group === 'body') {
        if (midY <= hemYLimit) {
          qualify = true;
          inwardShift.set(0, 1, 0);
        }
      } else if (group === 'sleeves') {
        const distX = Math.abs(midX - modelCenter.x);
        if (distX >= sleeveOuterXMin && midY < modelCenter.y + modelSize.y * 0.25) {
          qualify = true;
          inwardShift.set(midX > modelCenter.x ? -0.85 : 0.85, 0.52, 0).normalize();
        }
      }

      if (!qualify) continue;

      if (normalAttr) {
        nA.fromBufferAttribute(normalAttr, edge.i0).applyMatrix3(normalMat).normalize();
        nB.fromBufferAttribute(normalAttr, edge.i1).applyMatrix3(normalMat).normalize();
      } else {
        nA.set(0, 0, 1);
        nB.set(0, 0, 1);
      }

      for (const offset of stitchRows) {
        const pA = wA
          .clone()
          .addScaledVector(inwardShift, offset)
          .addScaledVector(nA, 0.0022)
          .applyMatrix4(invWorld);
        const pB = wB
          .clone()
          .addScaledVector(inwardShift, offset)
          .addScaledVector(nB, 0.0022)
          .applyMatrix4(invWorld);
        linePositions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
      }
    }

    if (linePositions.length === 0) continue;

    const stitchGeo = new THREE.BufferGeometry();
    stitchGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

    const stitchMat = new THREE.LineDashedMaterial({
      color: 0x222222,
      dashSize: 0.009,
      gapSize: 0.006,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });

    const line = new THREE.LineSegments(stitchGeo, stitchMat);
    line.computeLineDistances();
    line.name = `__stitch_${mesh.name}__`;
    line.renderOrder = 3;
    line.raycast = () => {};
    mesh.add(line);

    results.push({ line, group, material: stitchMat });
  }

  return results;
}

export function updateStitchTone(
  material: THREE.LineDashedMaterial,
  fabricColor: THREE.Color,
  contrastHex?: string | null
): void {
  if (contrastHex) {
    material.color.setStyle(contrastHex);
    material.opacity = 0.85;
    return;
  }

  const hsl = { h: 0, s: 0, l: 0 };
  fabricColor.getHSL(hsl);
  const stitchColor = new THREE.Color();
  if (hsl.l < 0.25) {
    stitchColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.72), Math.min(1, hsl.l + 0.16));
  } else {
    stitchColor.setHSL(hsl.h, Math.min(1, hsl.s * 0.85), Math.max(0, hsl.l - 0.18));
  }
  material.color.copy(stitchColor);
  material.opacity = 0.5;
}
