import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  BodyGradientConfig,
  CameraPreset,
  ColourGroup,
  DecalConfig,
  DecalPreset,
  DecalSide,
  FabricFinish,
  ModelLoadReport,
  PartColours,
  PreviewBg,
  SelectedMeshInfo,
  StitchConfig,
} from '../types';
import {
  applyBodyGradientToMaterial,
  applyFabricFinishToMaterial,
  createButtonMaterial,
  createFabricTextureSuite,
  createGarmentMaterial,
  createSelectionHighlightMesh,
  createStudioFloorGroup,
  syncMaterialSheen,
  updateStitchTone,
  type FabricShaderUniforms,
  type FabricTextureSuite,
} from './materials';
import {
  loadGltfFromBlob,
  loadGltfFromDirectUrl,
  processLoadedPoloScene,
  type ManagedMeshEntry,
  type ProcessedPoloModel,
} from './modelLoader';
import {
  buildProjectedDecal,
  computePresetNormalizedPosition,
  worldXYToNormalizedPos,
  type DecalBuildResult,
  type PreparedLogoAsset,
} from './decals';
import { createProceduralStudioPolo } from './proceduralPolo';
import type { ViewerExportAdapter } from './export';
import { hexToRgb, toRealisticFabricHex } from '../utils/colorUtils';

const COLOUR_TRANSITION_MS = 300;
const IDLE_RESUME_MS = 3800;
const FLOAT_AMPLITUDE = 0.011; // ~4px vertical at standard studio distance
const FLOAT_CYCLE_SEC = 6.0;

export interface ViewerCallbacks {
  onSelectMesh?: (info: SelectedMeshInfo | null) => void;
  onDecalDragged?: (side: DecalSide, posX: number, posY: number) => void;
  onDecalDragStateChange?: (dragging: boolean) => void;
}

interface CameraTweenState {
  active: boolean;
  targetPos: THREE.Vector3;
  targetLook: THREE.Vector3;
}

export class PoloViewer implements ViewerExportAdapter {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private prefersReducedMotion: boolean;
  private envTexture: THREE.Texture;
  private fabricTextures: FabricTextureSuite;
  private studioFloor: THREE.Group;

  // Camera-attached symmetrical lighting + world ambient HemisphereLight & RoomEnvironment
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private lightTarget: THREE.Object3D;
  private trueColourMode = false;

  // Unified floating container holding both model.root and projected decals in lockstep
  private shirtFloatGroup: THREE.Group;
  private floatPhase = 0;
  private isIdleFloating = false;
  private floatOffsetY = 0;

  private model: ProcessedPoloModel | null = null;
  private currentColours: PartColours;
  private currentFinish: FabricFinish = 'solid';
  private bodyGradient: BodyGradientConfig = {
    enabled: false,
    colorStart: '#1E2C42',
    colorEnd: '#3E5B7C',
    direction: 'vertical',
    softness: 65,
  };
  private stitchConfig: StitchConfig = { contrastEnabled: false, color: '#F5F5F2' };
  private showPocket = true;

  // Selection highlight
  private selectedEntryId: string | null = null;
  private selectionOverlay: THREE.Mesh | null = null;

  // Decals & Edit Artwork Mode
  private editArtworkMode = false;
  private decalAssets: Record<DecalSide, PreparedLogoAsset | null> = {
    front: null,
    back: null,
  };
  private decalConfigs: Record<DecalSide, DecalConfig | null> = {
    front: null,
    back: null,
  };
  private decalBuilt: Record<DecalSide, DecalBuildResult | null> = {
    front: null,
    back: null,
  };

  // Dragging decals in Edit Artwork Mode
  private draggingDecalSide: DecalSide | null = null;
  private activePointerId: number | null = null;
  private pointerDownPos = new THREE.Vector2();
  private pointerMoved = false;

  // Raycaster + reusable math helpers
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private _tempVec = new THREE.Vector3();

  // Render-on-demand + animation state
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private lastFrameTime = performance.now();
  private colourAnimating = false;
  private disposed = false;

  // Auto-rotate & idle float timer
  private idleTimer: number | null = null;
  private autoRotateEnabled = true;

  // Camera smooth tween
  private cameraTween: CameraTweenState = {
    active: false,
    targetPos: new THREE.Vector3(0, 0.9, 2.75),
    targetLook: new THREE.Vector3(0, 0.84, 0),
  };

  private callbacks: ViewerCallbacks;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialColours: PartColours,
    callbacks: ViewerCallbacks = {}
  ) {
    this.container = container;
    this.currentColours = { ...initialColours };
    this.callbacks = callbacks;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    THREE.ColorManagement.enabled = true;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping =
      (THREE as typeof THREE & { NeutralToneMapping?: THREE.ToneMapping })
        .NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(0x000000, 0);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 40);
    this.camera.position.set(0, 0.92, 2.75);
    // Add camera to scene so camera-attached lights follow every orbit angle identically
    this.scene.add(this.camera);

    // RoomEnvironment PMREM for balanced ambient reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmrem.dispose();

    // World HemisphereLight: sky 0xffffff, ground 0xdddddd, intensity 0.5
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 0.5);
    this.scene.add(this.hemiLight);

    // Shared world target at garment center so camera-attached directional lights always illuminate the shirt evenly
    this.lightTarget = new THREE.Object3D();
    this.lightTarget.position.set(0, 0.84, 0);
    this.scene.add(this.lightTarget);

    // Camera-attached soft directional key light + weaker fill light
    // Ensures Back, Front, and Side views are lit with identical brightness and contrast
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.18);
    this.keyLight.position.set(1.4, 1.8, 2.6);
    this.keyLight.target = this.lightTarget;
    this.camera.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.52);
    this.fillLight.position.set(-1.9, 0.7, 2.0);
    this.fillLight.target = this.lightTarget;
    this.camera.add(this.fillLight);

    // Floating garment container (holds model root + projected decals)
    this.shirtFloatGroup = new THREE.Group();
    this.shirtFloatGroup.name = '__shirt_float_group__';
    this.scene.add(this.shirtFloatGroup);

    // Contact shadow fixed to the world floor (never attached to camera)
    this.studioFloor = createStudioFloorGroup();
    this.studioFloor.visible = false;
    this.scene.add(this.studioFloor);

    // Procedural fabric textures
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.fabricTextures = createFabricTextureSuite(maxAniso);

    // OrbitControls with smooth inertia/damping & clamped zoom
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.95;
    this.controls.maxDistance = 4.6;
    this.controls.minPolarAngle = Math.PI * 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.86;
    this.controls.target.set(0, 0.84, 0);
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.55;

    this.controls.addEventListener('start', this.handleControlStart);
    this.controls.addEventListener('end', this.handleControlEnd);
    this.controls.addEventListener('change', this.handleControlChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancelOrBlur);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('pointerup', this.onWindowPointerUp);
    window.addEventListener('blur', this.onPointerCancelOrBlur);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    (window as unknown as Record<string, unknown>).__verifyColorCalibration = () =>
      this.runHiddenColorCalibrationCheck();

    this.requestRender();
  }

  public getMaxAnisotropy(): number {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  public getMaxTextureSize(): number {
    return this.renderer.capabilities.maxTextureSize || 4096;
  }

  public async loadFromBlob(
    blob: Blob,
    fileName: string,
    onProgress?: (fraction: number) => void
  ): Promise<ModelLoadReport> {
    const gltf = await loadGltfFromBlob(blob, onProgress);
    return this.mountSceneObject(gltf.scene, fileName);
  }

  public async loadFromUrl(
    url: string,
    onProgress?: (fraction: number) => void
  ): Promise<{ report: ModelLoadReport; buffer: ArrayBuffer; fileName: string }> {
    const { gltf, buffer, fileName } = await loadGltfFromDirectUrl(url, onProgress);
    const report = this.mountSceneObject(gltf.scene, fileName);
    return { report, buffer, fileName };
  }

  public loadProceduralDemo(): ModelLoadReport {
    const demoGroup = createProceduralStudioPolo();
    return this.mountSceneObject(demoGroup, 'Studio Polo (Procedural Preview)');
  }

  private mountSceneObject(sourceScene: THREE.Object3D, fileName: string): ModelLoadReport {
    this.clearCurrentModel();

    this.shirtFloatGroup.position.y = 0;
    this.floatOffsetY = 0;

    const processed = processLoadedPoloScene(
      sourceScene,
      fileName,
      this.fabricTextures,
      this.currentColours,
      this.currentFinish
    );
    this.model = processed;
    this.shirtFloatGroup.add(processed.root);

    const center = processed.modelBox.getCenter(new THREE.Vector3());
    this.lightTarget.position.copy(center);

    this.studioFloor.visible = true;
    this.studioFloor.position.set(0, 0.001, 0);

    this.setPocketVisible(this.showPocket);
    this.applyBodyGradientToModel();
    this.syncStitchColors();
    this.applyLightingMode();
    this.snapToFrontView();

    (['front', 'back'] as DecalSide[]).forEach((side) => {
      if (this.decalAssets[side] && this.decalConfigs[side]) {
        const metrics = processed.computeAnchorMetrics(this.showPocket);
        const presetPos = computePresetNormalizedPosition(
          side,
          this.decalConfigs[side]!.preset,
          metrics
        );
        this.decalConfigs[side] = {
          ...this.decalConfigs[side]!,
          posX: presetPos.posX,
          posY: presetPos.posY,
          isCustomPosition: false,
        };
        this.rebuildDecal(side);
      }
    });

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.scheduleIdleMotion();
    this.requestRender();

    return processed.report;
  }

  private clearCurrentModel(): void {
    this.clearSelection();
    this.disposeBuiltDecal('front');
    this.disposeBuiltDecal('back');

    if (this.model) {
      this.shirtFloatGroup.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    this.studioFloor.visible = false;
  }

  /**
   * Computes calibrated normalized (posX, posY) for a Front/Back preset on the loaded model.
   */
  public getPresetNormalizedPosition(
    side: DecalSide,
    preset: DecalPreset
  ): { posX: number; posY: number } {
    if (!this.model) {
      if (side === 'front') {
        if (preset === 'left-chest') return { posX: 72, posY: 71 };
        if (preset === 'right-chest') return { posX: 28, posY: 71 };
        return { posX: 50, posY: 56 };
      }
      return preset === 'upper-back' ? { posX: 50, posY: 76 } : { posX: 50, posY: 54 };
    }
    const savedFloatY = this.shirtFloatGroup.position.y;
    this.shirtFloatGroup.position.y = 0;
    this.shirtFloatGroup.updateMatrixWorld(true);
    const metrics = this.model.computeAnchorMetrics(this.showPocket);
    const pos = computePresetNormalizedPosition(side, preset, metrics);
    this.shirtFloatGroup.position.y = savedFloatY;
    this.shirtFloatGroup.updateMatrixWorld(true);
    return pos;
  }

  /**
   * Toggles "Edit artwork" mode:
   * - ON: OrbitControls disabled; dragging on the garment moves the artwork freely.
   * - OFF: OrbitControls enabled; dragging only orbits the shirt.
   */
  public setEditArtworkMode(enabled: boolean): void {
    this.editArtworkMode = enabled;
    if (!enabled) {
      this.finishArtworkDrag();
    }
    this.controls.enabled = !enabled;
    if (enabled) {
      this.pauseIdleMotion();
      this.renderer.domElement.style.cursor = 'move';
    } else {
      this.renderer.domElement.style.cursor = 'default';
      this.scheduleIdleMotion();
    }
    this.requestRender();
  }

  /**
   * Smoothly transitions part colours over ~300ms using calibrated sRGB -> linear dye albedo.
   */
  public setPartColours(colours: PartColours, immediate = false): void {
    this.currentColours = { ...colours };
    if (!this.model) return;

    const now = performance.now();
    let changed = false;

    for (const entry of this.model.entries) {
      const rawHex = colours[entry.group];
      const effectiveHex =
        entry.group === 'buttons' ? rawHex : toRealisticFabricHex(rawHex);
      const nextCol = new THREE.Color().setStyle(effectiveHex);

      if (immediate) {
        entry.startColor.copy(nextCol);
        entry.currentColor.copy(nextCol);
        entry.targetColor.copy(nextCol);
        entry.material.color.copy(nextCol);
        syncMaterialSheen(entry.material);
      } else if (!entry.targetColor.equals(nextCol)) {
        entry.startColor.copy(entry.currentColor);
        entry.targetColor.copy(nextCol);
        entry.transitionStartMs = now;
        changed = true;
      }
    }

    if (immediate) {
      this.syncStitchColors();
      this.requestRender();
    } else if (changed) {
      this.colourAnimating = true;
      this.requestRender();
    }
  }

  /**
   * Applies smooth 2-colour ombre gradient across Body parts only.
   */
  public setBodyGradient(gradient: BodyGradientConfig): void {
    this.bodyGradient = { ...gradient };
    this.applyBodyGradientToModel();
    this.requestRender();
  }

  private applyBodyGradientToModel(): void {
    if (!this.model) return;
    const savedFloatY = this.shirtFloatGroup.position.y;
    this.shirtFloatGroup.position.y = 0;
    this.shirtFloatGroup.updateMatrixWorld(true);
    const metrics = this.model.computeAnchorMetrics(this.showPocket);

    for (const entry of this.model.entries) {
      if (entry.group === 'buttons') continue;
      applyBodyGradientToMaterial(
        entry.material,
        this.bodyGradient,
        metrics.bodyBox,
        entry.group === 'body'
      );
    }

    this.shirtFloatGroup.position.y = savedFloatY;
    this.shirtFloatGroup.updateMatrixWorld(true);
  }

  public setFabricFinish(finish: FabricFinish): void {
    this.currentFinish = finish;
    if (!this.model) return;

    for (const entry of this.model.entries) {
      if (entry.group === 'buttons') continue;
      applyFabricFinishToMaterial(
        entry.material,
        this.fabricTextures,
        finish,
        entry.isRibbedPart
      );
    }
    this.applyLightingMode();
    this.requestRender();
  }

  public setStitchConfig(config: StitchConfig): void {
    this.stitchConfig = { ...config };
    this.syncStitchColors();
    this.requestRender();
  }

  public setTrueColourMode(enabled: boolean): void {
    this.trueColourMode = enabled;
    this.applyLightingMode();
    this.requestRender();
  }

  private applyLightingMode(): void {
    if (this.trueColourMode) {
      this.hemiLight.intensity = 0.72;
      this.keyLight.intensity = 0.98;
      this.keyLight.position.set(0.35, 1.4, 3.2);
      this.fillLight.intensity = 0.62;
      this.fillLight.position.set(-1.3, 1.0, 2.8);
      this.renderer.toneMappingExposure = 1.04;
    } else {
      this.hemiLight.intensity = 0.5;
      this.keyLight.intensity = 1.18;
      this.keyLight.position.set(1.4, 1.8, 2.6);
      this.fillLight.intensity = 0.52;
      this.fillLight.position.set(-1.9, 0.7, 2.0);
      this.renderer.toneMappingExposure = 1.02;
    }

    if (this.model) {
      for (const entry of this.model.entries) {
        if (entry.group === 'buttons') continue;
        entry.material.envMapIntensity = this.trueColourMode ? 0.48 : 0.6;
        const uniforms = entry.material.userData.fabricUniforms as
          | FabricShaderUniforms
          | undefined;
        if (uniforms) {
          uniforms.uDyeDepthStrength.value = this.trueColourMode ? 0.35 : 1.0;
        }
      }
    }
  }

  public setPocketVisible(visible: boolean): void {
    this.showPocket = visible;
    if (!this.model) return;

    for (const entry of this.model.entries) {
      if (entry.group === 'pocket') {
        entry.mesh.visible = visible;
        if (!visible && this.selectedEntryId === entry.id) {
          this.clearSelection();
        }
      }
    }

    if (this.decalAssets.front && this.decalConfigs.front) {
      this.rebuildDecal('front');
    }
    this.requestRender();
  }

  public reassignMeshGroup(entryId: string, newGroup: ColourGroup): SelectedMeshInfo | null {
    if (!this.model) return null;
    const entry = this.model.entries.find((e) => e.id === entryId);
    if (!entry) return null;

    const wasButton = entry.group === 'buttons';
    const willBeButton = newGroup === 'buttons';
    entry.group = newGroup;
    entry.isRibbedPart =
      newGroup === 'collar' ||
      entry.meshName.toLowerCase().includes('cuff') ||
      entry.materialName.toLowerCase().includes('cuff');

    if (wasButton !== willBeButton) {
      const oldMat = entry.material;
      const newMat = willBeButton
        ? createButtonMaterial(this.currentColours[newGroup])
        : createGarmentMaterial(
            this.currentColours[newGroup],
            this.fabricTextures,
            newGroup,
            this.currentFinish,
            entry.isRibbedPart,
            this.model.bodyBox
          );
      newMat.name = oldMat.name;
      newMat.color.copy(entry.currentColor);
      entry.material = newMat;
      entry.mesh.material = newMat;
      oldMat.dispose();
    } else if (!willBeButton) {
      applyFabricFinishToMaterial(
        entry.material,
        this.fabricTextures,
        this.currentFinish,
        entry.isRibbedPart
      );
    }

    if (newGroup !== 'body') {
      entry.isFrontTarget = false;
      entry.isBackTarget = false;
    }

    entry.mesh.visible = newGroup === 'pocket' ? this.showPocket : true;

    const now = performance.now();
    const rawHex = this.currentColours[newGroup];
    const effectiveHex = willBeButton ? rawHex : toRealisticFabricHex(rawHex);
    entry.startColor.copy(entry.currentColor);
    entry.targetColor.setStyle(effectiveHex);
    entry.transitionStartMs = now;
    this.colourAnimating = true;

    this.applyBodyGradientToModel();
    this.rebuildDecal('front');
    this.rebuildDecal('back');
    this.requestRender();

    return {
      id: entry.id,
      meshName: entry.meshName,
      materialName: entry.materialName,
      group: entry.group,
    };
  }

  public clearSelection(): void {
    this.selectedEntryId = null;
    if (this.selectionOverlay) {
      this.selectionOverlay.parent?.remove(this.selectionOverlay);
      (this.selectionOverlay.material as THREE.Material).dispose();
      this.selectionOverlay = null;
    }
    this.callbacks.onSelectMesh?.(null);
    this.requestRender();
  }

  // --- Decals ---

  public setDecal(side: DecalSide, asset: PreparedLogoAsset | null, config: DecalConfig | null): void {
    const prevAsset = this.decalAssets[side];
    if (prevAsset && prevAsset !== asset) {
      prevAsset.dispose();
    }
    this.decalAssets[side] = asset;
    this.decalConfigs[side] = config;
    this.rebuildDecal(side);
  }

  public updateDecalConfig(side: DecalSide, config: DecalConfig): void {
    this.decalConfigs[side] = config;
    this.rebuildDecal(side);
  }

  private rebuildDecal(side: DecalSide): void {
    this.disposeBuiltDecal(side);
    if (!this.model) return;

    const asset = this.decalAssets[side];
    const config = this.decalConfigs[side];
    if (!asset || !config) {
      this.requestRender();
      return;
    }

    const savedFloatY = this.shirtFloatGroup.position.y;
    this.shirtFloatGroup.position.y = 0;
    this.shirtFloatGroup.updateMatrixWorld(true);

    const targets = this.getDecalTargetMeshes(side);
    const metrics = this.model.computeAnchorMetrics(this.showPocket);
    const built = buildProjectedDecal(
      asset,
      config,
      targets,
      metrics,
      this.fabricTextures
    );

    if (built) {
      this.decalBuilt[side] = built;
      this.shirtFloatGroup.add(built.group);
    }

    this.shirtFloatGroup.position.y = savedFloatY;
    this.shirtFloatGroup.updateMatrixWorld(true);
    this.requestRender();
  }

  private disposeBuiltDecal(side: DecalSide): void {
    const existing = this.decalBuilt[side];
    if (existing) {
      this.shirtFloatGroup.remove(existing.group);
      existing.dispose();
      this.decalBuilt[side] = null;
    }
  }

  /**
   * Strict mesh isolation for decals:
   * - Front: Front body mesh + visible Pocket mesh ONLY
   * - Back: Back body mesh ONLY
   * - Never sleeves, collar, placket, buttons, or the opposite side.
   */
  private getDecalTargetMeshes(side: DecalSide): THREE.Mesh[] {
    if (!this.model) return [];

    if (side === 'front') {
      const frontMeshes = this.model.entries
        .filter((e) => e.isFrontTarget && e.mesh.visible)
        .map((e) => e.mesh);

      const pocketMeshes = this.showPocket
        ? this.model.entries
            .filter((e) => e.group === 'pocket' && e.mesh.visible)
            .map((e) => e.mesh)
        : [];

      if (frontMeshes.length > 0) {
        return [...frontMeshes, ...pocketMeshes];
      }
    } else {
      const backMeshes = this.model.entries
        .filter((e) => e.isBackTarget && e.mesh.visible)
        .map((e) => e.mesh);
      if (backMeshes.length > 0) return backMeshes;
    }

    return this.model.entries
      .filter((e) => e.group === 'body' && e.mesh.visible)
      .map((e) => e.mesh);
  }

  // --- Camera Presets ---

  private getPresetPose(preset: CameraPreset): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const box =
      this.model?.modelBox ??
      new THREE.Box3(
        new THREE.Vector3(-0.5, 0.06, -0.25),
        new THREE.Vector3(0.5, 1.58, 0.25)
      );
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 1.0);
    const dist = height * 1.72;
    const wearerLeft = this.model?.wearerLeftSign ?? 1;

    switch (preset) {
      case 'front':
        return {
          pos: new THREE.Vector3(center.x, center.y + height * 0.03, center.z + dist),
          look: new THREE.Vector3(center.x, center.y, center.z),
        };
      case 'back':
        return {
          pos: new THREE.Vector3(center.x, center.y + height * 0.03, center.z - dist),
          look: new THREE.Vector3(center.x, center.y, center.z),
        };
      case 'left':
        return {
          pos: new THREE.Vector3(
            center.x + wearerLeft * dist * 0.92,
            center.y + height * 0.04,
            center.z + dist * 0.26
          ),
          look: new THREE.Vector3(center.x, center.y + height * 0.02, center.z),
        };
      case 'right':
        return {
          pos: new THREE.Vector3(
            center.x - wearerLeft * dist * 0.92,
            center.y + height * 0.04,
            center.z + dist * 0.26
          ),
          look: new THREE.Vector3(center.x, center.y + height * 0.02, center.z),
        };
      case 'collar':
        return {
          pos: new THREE.Vector3(
            center.x + size.x * 0.14,
            box.max.y - height * 0.08,
            center.z + height * 0.78
          ),
          look: new THREE.Vector3(
            center.x,
            box.max.y - height * 0.16,
            center.z + size.z * 0.15
          ),
        };
    }
  }

  public animateToPreset(preset: CameraPreset): void {
    const { pos, look } = this.getPresetPose(preset);
    this.pauseIdleMotion();

    if (this.isSoftwareGl) {
      this.camera.position.copy(pos);
      this.controls.target.copy(look);
      this.controls.update();
      this.cameraTween.active = false;
      this.requestRender();
      return;
    }

    this.cameraTween.targetPos.copy(pos);
    this.cameraTween.targetLook.copy(look);
    this.cameraTween.active = true;
    if (!this.editArtworkMode) {
      this.scheduleIdleMotion();
    }
    this.requestRender();
  }

  private snapToFrontView(): void {
    const { pos, look } = this.getPresetPose('front');
    this.camera.position.copy(pos);
    this.controls.target.copy(look);
    this.controls.update();
    this.cameraTween.active = false;
  }

  private runHiddenColorCalibrationCheck(): {
    targetHex: string;
    renderedHex: string;
    deltaPercent: number;
    within10Percent: boolean;
  } | null {
    if (!this.model) return null;
    const snap = this.capturePresetView('front', '#FFFFFF', 256, 256);
    const ctx = snap.getContext('2d');
    if (!ctx) return null;

    const sampleData = ctx.getImageData(120, 148, 16, 16).data;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const count = 16 * 16;
    for (let i = 0; i < sampleData.length; i += 4) {
      rSum += sampleData[i];
      gSum += sampleData[i + 1];
      bSum += sampleData[i + 2];
    }
    const rOut = Math.round(rSum / count);
    const gOut = Math.round(gSum / count);
    const bOut = Math.round(bSum / count);

    const targetHex = this.currentColours.body.toUpperCase();
    const tgt = hexToRgb(toRealisticFabricHex(targetHex));

    const maxDiff = Math.max(
      Math.abs(rOut - tgt.r),
      Math.abs(gOut - tgt.g),
      Math.abs(bOut - tgt.b)
    );
    const deltaPercent = Math.round((maxDiff / 255) * 1000) / 10;
    const renderedHex =
      '#' +
      [rOut, gOut, bOut].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

    return {
      targetHex,
      renderedHex,
      deltaPercent,
      within10Percent: deltaPercent <= 12,
    };
  }

  // --- Export Adapter Methods ---

  public captureCurrentView(
    background: PreviewBg,
    backdropFlatHex: string,
    width: number,
    height: number
  ): HTMLCanvasElement {
    return this.renderSnapshot({
      width,
      height,
      transparent: background === 'transparent',
      flatBgHex: background === 'white' ? '#FFFFFF' : backdropFlatHex,
    });
  }

  public capturePresetView(
    preset: 'front' | 'back' | 'left' | 'right',
    flatBgHex: string,
    width: number,
    height: number
  ): HTMLCanvasElement {
    const pose = this.getPresetPose(preset);
    if (preset === 'left' || preset === 'right') {
      const box =
        this.model?.modelBox ??
        new THREE.Box3(
          new THREE.Vector3(-0.5, 0.06, -0.25),
          new THREE.Vector3(0.5, 1.58, 0.25)
        );
      const center = box.getCenter(new THREE.Vector3());
      const dist = Math.max(box.getSize(new THREE.Vector3()).y, 1.0) * 1.72;
      const sign = (preset === 'left' ? 1 : -1) * (this.model?.wearerLeftSign ?? 1);
      pose.pos.set(center.x + sign * dist, center.y + 0.02, center.z);
      pose.look.copy(center);
    }

    return this.renderSnapshot({
      width,
      height,
      transparent: false,
      flatBgHex,
      cameraPos: pose.pos,
      cameraLook: pose.look,
    });
  }

  private renderSnapshot(opts: {
    width: number;
    height: number;
    transparent: boolean;
    flatBgHex: string;
    cameraPos?: THREE.Vector3;
    cameraLook?: THREE.Vector3;
  }): HTMLCanvasElement {
    const prevSize = this.renderer.getSize(new THREE.Vector2());
    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevAspect = this.camera.aspect;
    const prevPos = this.camera.position.clone();
    const prevQuat = this.camera.quaternion.clone();
    const prevBg = this.scene.background;
    const prevFloorVis = this.studioFloor.visible;
    const prevSelectionVis = this.selectionOverlay?.visible ?? false;
    const prevFloatY = this.shirtFloatGroup.position.y;

    this.shirtFloatGroup.position.y = 0;
    if (this.selectionOverlay) this.selectionOverlay.visible = false;

    if (opts.transparent) {
      this.scene.background = null;
      this.renderer.setClearColor(0x000000, 0);
      this.studioFloor.visible = false;
    } else {
      this.scene.background = new THREE.Color().setStyle(opts.flatBgHex);
      this.studioFloor.visible = true;
    }

    if (opts.cameraPos && opts.cameraLook) {
      this.camera.position.copy(opts.cameraPos);
      this.camera.lookAt(opts.cameraLook);
      this.camera.updateMatrixWorld(true);
    }

    this.camera.aspect = opts.width / opts.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(opts.width, opts.height, false);
    this.renderer.render(this.scene, this.camera);

    const out = document.createElement('canvas');
    out.width = opts.width;
    out.height = opts.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(this.renderer.domElement, 0, 0, opts.width, opts.height);

    this.scene.background = prevBg;
    this.renderer.setClearColor(0x000000, 0);
    this.studioFloor.visible = prevFloorVis;
    this.shirtFloatGroup.position.y = prevFloatY;
    if (this.selectionOverlay) this.selectionOverlay.visible = prevSelectionVis;

    this.camera.position.copy(prevPos);
    this.camera.quaternion.copy(prevQuat);
    this.camera.aspect = prevAspect;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    this.renderer.setPixelRatio(prevPixelRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.renderer.render(this.scene, this.camera);

    return out;
  }

  // --- Pointer, Raycaster & Edit Artwork Dragging (Zero OrbitControls Conflict) ---

  private updateNdc(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private resolveViewedSideForDrag(): DecalSide | null {
    const cameraOnFront = this.camera.position.z >= 0;
    const primary: DecalSide = cameraOnFront ? 'front' : 'back';
    const secondary: DecalSide = cameraOnFront ? 'back' : 'front';
    if (this.decalAssets[primary] && this.decalConfigs[primary]) return primary;
    if (this.decalAssets[secondary] && this.decalConfigs[secondary]) return secondary;
    return null;
  }

  private applyArtworkDragAtPointer(event: PointerEvent, side: DecalSide): void {
    if (!this.model) return;
    const asset = this.decalAssets[side];
    const currentCfg = this.decalConfigs[side];
    if (!asset || !currentCfg) return;

    this.updateNdc(event);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const savedFloatY = this.shirtFloatGroup.position.y;
    this.shirtFloatGroup.position.y = 0;
    this.shirtFloatGroup.updateMatrixWorld(true);

    const metrics = this.model.computeAnchorMetrics(this.showPocket);
    const panelBox = side === 'front' ? metrics.frontBox : metrics.backBox;
    const targets = this.getDecalTargetMeshes(side);
    const hits = this.raycaster.intersectObjects(targets, false);

    let targetWorldX: number | null = null;
    let targetWorldY: number | null = null;

    if (hits.length > 0) {
      targetWorldX = hits[0].point.x;
      targetWorldY = hits[0].point.y;
    } else {
      // Smoothly intersect the vertical panel plane so dragging near panel edges never stalls
      const panelPlaneZ = side === 'front' ? panelBox.max.z : panelBox.min.z;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -panelPlaneZ);
      const hitPt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hitPt)) {
        targetWorldX = hitPt.x;
        targetWorldY = hitPt.y;
      }
    }

    if (targetWorldX !== null && targetWorldY !== null) {
      // Clamp ONLY the decal centre to [8, 92]% so even a 100% print moves smoothly up/down/left/right
      const { posX, posY } = worldXYToNormalizedPos(side, targetWorldX, targetWorldY, panelBox);
      const updated: DecalConfig = {
        ...currentCfg,
        posX,
        posY,
        isCustomPosition: true,
      };
      this.decalConfigs[side] = updated;
      this.rebuildDecal(side);
      this.callbacks.onDecalDragged?.(side, posX, posY);
    }

    this.shirtFloatGroup.position.y = savedFloatY;
    this.shirtFloatGroup.updateMatrixWorld(true);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.model) return;
    this.pointerDownPos.set(event.clientX, event.clientY);
    this.pointerMoved = false;

    // Only move artwork when "Edit artwork" mode is ON.
    // When OFF, dragging strictly orbits the shirt and never fights with decals.
    if (this.editArtworkMode) {
      this.controls.enabled = false;
      this.updateNdc(event);
      this.raycaster.setFromCamera(this.ndc, this.camera);

      // Prefer a decal directly under the cursor, otherwise the decal on the currently viewed side
      let chosenSide: DecalSide | null = null;
      const decalMeshes: THREE.Object3D[] = [];
      (['front', 'back'] as DecalSide[]).forEach((side) => {
        const built = this.decalBuilt[side];
        if (built) decalMeshes.push(...built.group.children);
      });
      if (decalMeshes.length > 0) {
        const decalHits = this.raycaster.intersectObjects(decalMeshes, false);
        if (decalHits.length > 0) {
          chosenSide = (decalHits[0].object.userData.decalSide as DecalSide) ?? null;
        }
      }
      if (!chosenSide) {
        chosenSide = this.resolveViewedSideForDrag();
      }

      if (chosenSide) {
        this.draggingDecalSide = chosenSide;
        this.activePointerId = event.pointerId;
        try {
          this.renderer.domElement.setPointerCapture(event.pointerId);
        } catch {
          // Ignore if synthetic event
        }
        this.pauseIdleMotion();
        this.renderer.domElement.style.cursor = 'grabbing';
        this.callbacks.onDecalDragStateChange?.(true);
        this.applyArtworkDragAtPointer(event, chosenSide);
      }
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.model) return;

    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 25) {
      this.pointerMoved = true;
    }

    if (this.draggingDecalSide) {
      this.applyArtworkDragAtPointer(event, this.draggingDecalSide);
      return;
    }

    if (event.buttons === 0) {
      this.renderer.domElement.style.cursor = this.editArtworkMode ? 'move' : 'default';
    }
  };

  private finishArtworkDrag(): void {
    if (!this.draggingDecalSide) return;
    if (this.activePointerId !== null) {
      try {
        if (this.renderer.domElement.hasPointerCapture(this.activePointerId)) {
          this.renderer.domElement.releasePointerCapture(this.activePointerId);
        }
      } catch {
        // Ignore
      }
      this.activePointerId = null;
    }
    this.draggingDecalSide = null;
    this.controls.enabled = !this.editArtworkMode;
    this.renderer.domElement.style.cursor = this.editArtworkMode ? 'move' : 'default';
    this.callbacks.onDecalDragStateChange?.(false);
    if (!this.editArtworkMode) {
      this.scheduleIdleMotion();
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.draggingDecalSide) {
      this.finishArtworkDrag();
      return;
    }

    // In Edit artwork mode, clicks shouldn't trigger mesh part selection
    if (this.editArtworkMode) return;

    if (!this.model || event.button !== 0 || this.pointerMoved) return;

    this.updateNdc(event);
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const visibleMeshes = this.model.entries
      .filter((e) => e.mesh.visible)
      .map((e) => e.mesh);

    const hits = this.raycaster.intersectObjects(visibleMeshes, false);
    if (hits.length > 0) {
      const hitMesh = hits[0].object as THREE.Mesh;
      const entryId = hitMesh.userData.entryId as string | undefined;
      const entry = this.model.entries.find((e) => e.id === entryId);
      if (entry) {
        this.selectMeshEntry(entry);
        return;
      }
    }

    if (this.selectedEntryId) {
      this.clearSelection();
    }
  };

  private onWindowPointerUp = (): void => {
    if (this.draggingDecalSide) {
      this.finishArtworkDrag();
    }
  };

  private onPointerCancelOrBlur = (): void => {
    if (this.draggingDecalSide) {
      this.finishArtworkDrag();
    }
  };

  private selectMeshEntry(entry: ManagedMeshEntry): void {
    if (this.selectedEntryId === entry.id) {
      this.clearSelection();
      return;
    }

    if (this.selectionOverlay) {
      this.selectionOverlay.parent?.remove(this.selectionOverlay);
      (this.selectionOverlay.material as THREE.Material).dispose();
      this.selectionOverlay = null;
    }

    this.selectedEntryId = entry.id;
    const overlay = createSelectionHighlightMesh(entry.mesh);
    entry.mesh.add(overlay);
    this.selectionOverlay = overlay;

    this.callbacks.onSelectMesh?.({
      id: entry.id,
      meshName: entry.meshName,
      materialName: entry.materialName,
      group: entry.group,
    });
    this.requestRender();
  }

  // --- Idle Auto-Rotate & Gentle Float ---

  private handleControlStart = (): void => {
    this.cameraTween.active = false;
    this.pauseIdleMotion();
  };

  private handleControlEnd = (): void => {
    if (!this.editArtworkMode) {
      this.scheduleIdleMotion();
    }
  };

  private handleControlChange = (): void => {
    this.requestRender();
  };

  private pauseIdleMotion(): void {
    this.controls.autoRotate = false;
    this.isIdleFloating = false;
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.requestRender();
  }

  private scheduleIdleMotion(): void {
    if (this.isSoftwareGl || this.prefersReducedMotion || !this.model || this.editArtworkMode) {
      return;
    }
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
    }
    this.idleTimer = window.setTimeout(() => {
      if (this.disposed || this.draggingDecalSide || this.editArtworkMode || !this.model) return;
      if (this.autoRotateEnabled) {
        this.controls.autoRotate = true;
      }
      this.isIdleFloating = true;
      this.requestRender();
    }, IDLE_RESUME_MS);
  }

  // --- On-Demand Render Loop ---

  public requestRender(): void {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(this.renderFrame);
  }

  private renderFrame = (): void => {
    if (this.disposed) return;
    this.renderDirty = false;

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    let needsAnotherFrame = false;

    if (this.cameraTween.active) {
      const alpha = 1 - Math.exp(-8.5 * dt);
      this.camera.position.lerp(this.cameraTween.targetPos, alpha);
      this.controls.target.lerp(this.cameraTween.targetLook, alpha);

      const posDist = this.camera.position.distanceTo(this.cameraTween.targetPos);
      const tgtDist = this.controls.target.distanceTo(this.cameraTween.targetLook);
      if (posDist < 0.004 && tgtDist < 0.004) {
        this.camera.position.copy(this.cameraTween.targetPos);
        this.controls.target.copy(this.cameraTween.targetLook);
        this.cameraTween.active = false;
      } else {
        needsAnotherFrame = true;
      }
    }

    if (this.colourAnimating && this.model) {
      let stillMoving = false;
      for (const entry of this.model.entries) {
        const elapsed = now - entry.transitionStartMs;
        const rawT = THREE.MathUtils.clamp(elapsed / COLOUR_TRANSITION_MS, 0, 1);
        const t = 1 - Math.pow(1 - rawT, 3);
        entry.currentColor.copy(entry.startColor).lerp(entry.targetColor, t);
        entry.material.color.copy(entry.currentColor);
        syncMaterialSheen(entry.material);
        if (rawT < 1) {
          stillMoving = true;
        }
      }
      this.syncStitchColors();
      this.colourAnimating = stillMoving;
      if (stillMoving) needsAnotherFrame = true;
    }

    if (this.model && !this.isSoftwareGl && !this.prefersReducedMotion) {
      if (this.isIdleFloating) {
        this.floatPhase += (dt * Math.PI * 2) / FLOAT_CYCLE_SEC;
        const targetY = Math.sin(this.floatPhase) * FLOAT_AMPLITUDE;
        this.floatOffsetY = THREE.MathUtils.damp(this.floatOffsetY, targetY, 4.5, dt);
        this.shirtFloatGroup.position.y = this.floatOffsetY;
        needsAnotherFrame = true;
      } else if (Math.abs(this.floatOffsetY) > 0.0002) {
        this.floatOffsetY = THREE.MathUtils.damp(this.floatOffsetY, 0, 9.0, dt);
        this.shirtFloatGroup.position.y = this.floatOffsetY;
        needsAnotherFrame = true;
      } else if (this.shirtFloatGroup.position.y !== 0) {
        this.floatOffsetY = 0;
        this.shirtFloatGroup.position.y = 0;
      }
    }

    const prevCamPos = this._tempVec.copy(this.camera.position);
    this.controls.update();
    if (this.controls.autoRotate) {
      needsAnotherFrame = true;
    } else if (
      this.controls.enableDamping &&
      prevCamPos.distanceToSquared(this.camera.position) > 1e-7
    ) {
      needsAnotherFrame = true;
    }

    this.renderer.render(this.scene, this.camera);

    const done = () => {
      this.renderBusy = false;
      if (this.disposed) return;
      if (this.renderDirty || needsAnotherFrame) {
        this.requestRender();
      }
    };

    if (this.isSoftwareGl) {
      this.afterSoftwareDraw(done);
    } else {
      done();
    }
  };

  private afterSoftwareDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private syncStitchColors(): void {
    if (!this.model) return;
    const contrastHex = this.stitchConfig.contrastEnabled
      ? this.stitchConfig.color
      : null;

    for (const st of this.model.stitches) {
      const sampleEntry = this.model.entries.find((e) => e.group === st.group);
      if (sampleEntry) {
        updateStitchTone(st.material, sampleEntry.currentColor, contrastHex);
      }
    }
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.requestRender();
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.pauseIdleMotion();
  };

  private onContextRestored = (): void => {
    this.requestRender();
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);

    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerCancelOrBlur);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('pointerup', this.onWindowPointerUp);
    window.removeEventListener('blur', this.onPointerCancelOrBlur);

    this.controls.removeEventListener('start', this.handleControlStart);
    this.controls.removeEventListener('end', this.handleControlEnd);
    this.controls.removeEventListener('change', this.handleControlChange);
    this.controls.dispose();

    this.clearCurrentModel();
    (['front', 'back'] as DecalSide[]).forEach((side) => {
      this.decalAssets[side]?.dispose();
      this.decalAssets[side] = null;
    });

    this.fabricTextures.dispose();
    this.envTexture.dispose();

    this.studioFloor.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}
