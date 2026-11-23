import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Move,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  BackdropThemeId,
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
  QuoteState,
  SelectedMeshInfo,
  SheetBg,
  StitchConfig,
} from './types';
import {
  COLOUR_GROUPS,
  COLOUR_GROUP_LABELS,
  DEFAULT_PART_COLOURS,
  getBackdropTheme,
} from './data/palette';
import { computeContrastShade, isLightHex } from './utils/colorUtils';
import { PoloViewer } from './three/viewer';
import { clampNormalizedCentre, prepareLogoAsset } from './three/decals';
import { downloadCurrentPreview, downloadFourViewSheet } from './three/export';
import {
  loadBrandColours,
  loadModelFromIndexedDB,
  loadRecentColours,
  loadWordmark,
  saveBrandColours,
  saveModelToIndexedDB,
  saveRecentColours,
  saveWordmark,
} from './utils/storage';
import { DropZoneOverlay } from './components/DropZoneOverlay';
import { ColourPanel } from './components/ColourPanel';
import { ArtworkPanel } from './components/ArtworkPanel';
import { PitchPanel } from './components/PitchPanel';
import { SelectedPartBar } from './components/SelectedPartBar';
import { StudioBackdrop } from './components/StudioBackdrop';

type PanelTab = 'colour' | 'artwork' | 'pitch';

const CAMERA_PRESETS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left sleeve' },
  { id: 'right', label: 'Right sleeve' },
  { id: 'collar', label: 'Collar' },
];

const DEFAULT_BODY_GRADIENT: BodyGradientConfig = {
  enabled: false,
  colorStart: '#1E2C42',
  colorEnd: '#3E5B7C',
  direction: 'vertical',
  softness: 65,
};

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PoloViewer | null>(null);

  // Brand & Pitch metadata
  const [wordmark, setWordmark] = useState<string>(() => loadWordmark());
  const [editingWordmark, setEditingWordmark] = useState(false);
  const [clientName, setClientName] = useState('');

  // Model loading state
  const [modelReport, setModelReport] = useState<ModelLoadReport | null>(null);
  const [showDropZone, setShowDropZone] = useState(true);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mappingNotice, setMappingNotice] = useState<string | null>(null);

  // Colour, Gradient & Fabric state
  const [activeTab, setActiveTab] = useState<PanelTab>('colour');
  const [activeGroup, setActiveGroup] = useState<ColourGroup>('body');
  const [partColours, setPartColours] = useState<PartColours>({ ...DEFAULT_PART_COLOURS });
  const [bodyGradient, setBodyGradient] = useState<BodyGradientConfig>({
    ...DEFAULT_BODY_GRADIENT,
  });
  const [matchAll, setMatchAll] = useState(false);
  const [showPocket, setShowPocket] = useState(true);
  const [fabricFinish, setFabricFinish] = useState<FabricFinish>('solid');
  const [stitchConfig, setStitchConfig] = useState<StitchConfig>({
    contrastEnabled: false,
    color: '#F5F5F2',
  });
  const [contrastFlip, setContrastFlip] = useState(false);

  // Saved brand colours, recent colours, and logo-extracted dominant colours
  const [brandColours, setBrandColours] = useState<string[]>(() => loadBrandColours());
  const [recentColours, setRecentColours] = useState<string[]>(() => loadRecentColours());
  const [frontLogoColors, setFrontLogoColors] = useState<string[]>([]);
  const [backLogoColors, setBackLogoColors] = useState<string[]>([]);

  // Studio backdrop & preview accuracy
  const [backdropTheme, setBackdropTheme] = useState<BackdropThemeId>('studio');
  const [trueColourMode, setTrueColourMode] = useState(false);
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });

  // Camera & Mesh selection
  const [activePreset, setActivePreset] = useState<CameraPreset>('front');
  const [selectedMesh, setSelectedMesh] = useState<SelectedMeshInfo | null>(null);

  // Artwork / Decals & Edit Artwork Mode
  const [frontDecal, setFrontDecal] = useState<DecalConfig | null>(null);
  const [backDecal, setBackDecal] = useState<DecalConfig | null>(null);
  const [activeArtworkSide, setActiveArtworkSide] = useState<DecalSide>('front');
  const [editArtworkMode, setEditArtworkMode] = useState(false);
  const [artworkError, setArtworkError] = useState<string | null>(null);

  // Pitch / Export state
  const [quote, setQuote] = useState<QuoteState>({ quantity: '', pricePerPiece: '' });
  const [previewBg, setPreviewBg] = useState<PreviewBg>('backdrop');
  const [sheetBg, setSheetBg] = useState<SheetBg>('backdrop');
  const [isExporting, setIsExporting] = useState(false);

  // Layout state
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const logoColors = useMemo(() => {
    const merged: string[] = [];
    for (const hex of [...frontLogoColors, ...backLogoColors]) {
      if (!merged.includes(hex) && merged.length < 6) {
        merged.push(hex);
      }
    }
    return merged;
  }, [frontLogoColors, backLogoColors]);

  const hasAnyArtwork = Boolean(frontDecal || backDecal);
  const activeThemeConfig = getBackdropTheme(trueColourMode ? 'studio' : backdropTheme);
  const isDarkStage = !showDropZone && activeThemeConfig.isDark;

  // Live colour-story chips under viewer
  const colourStoryParts = useMemo(() => {
    return COLOUR_GROUPS.filter((g) => {
      if (g === 'placket' && !modelReport?.hasPlacket) return false;
      if (g === 'pocket' && (!modelReport?.hasPocket || !showPocket)) return false;
      return true;
    });
  }, [modelReport?.hasPlacket, modelReport?.hasPocket, showPocket]);

  // Initialize Three.js PoloViewer once and check IndexedDB cache
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const viewer = new PoloViewer(container, DEFAULT_PART_COLOURS, {
      onSelectMesh: (info) => {
        setSelectedMesh(info);
        if (info) {
          setActiveGroup(info.group);
        }
      },
      onDecalDragged: (side, posX, posY) => {
        setActiveArtworkSide(side);
        if (side === 'front') {
          setFrontDecal((prev) =>
            prev ? { ...prev, posX, posY, isCustomPosition: true } : prev
          );
        } else {
          setBackDecal((prev) =>
            prev ? { ...prev, posX, posY, isCustomPosition: true } : prev
          );
        }
      },
    });
    viewerRef.current = viewer;

    let cancelled = false;

    (async () => {
      const cached = await loadModelFromIndexedDB();
      if (cancelled || !cached) return;

      setIsLoadingModel(true);
      setLoadProgress(0.2);
      try {
        const blob = new Blob([cached.buffer], { type: 'model/gltf-binary' });
        const report = await viewer.loadFromBlob(blob, cached.fileName, (f) => {
          if (!cancelled) setLoadProgress(f);
        });
        if (!cancelled) {
          setModelReport(report);
          setShowDropZone(false);
          setMappingNotice(report.warningMessage ?? null);
        }
      } catch (err) {
        console.warn('[App] Cached IndexedDB model could not be loaded:', err);
        if (!cancelled) {
          setShowDropZone(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModel(false);
          setLoadProgress(0);
        }
      }
    })();

    return () => {
      cancelled = true;
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // --- Edit Artwork Mode & Nudging ---

  const handleToggleEditArtworkMode = useCallback((next: boolean) => {
    setEditArtworkMode(next);
    viewerRef.current?.setEditArtworkMode(next);
    if (next) {
      viewerRef.current?.clearSelection();
    }
  }, []);

  const handleNudgeDecal = useCallback((side: DecalSide, dx: number, dy: number) => {
    const setter = side === 'front' ? setFrontDecal : setBackDecal;
    setter((prev) => {
      if (!prev) return prev;
      const clamped = clampNormalizedCentre(prev.posX + dx, prev.posY + dy);
      const updated: DecalConfig = {
        ...prev,
        posX: clamped.posX,
        posY: clamped.posY,
        isCustomPosition: true,
      };
      viewerRef.current?.updateDecalConfig(side, updated);
      return updated;
    });
  }, []);

  // Keyboard shortcuts: Escape closes modals/selection/edit mode; Arrow keys nudge active artwork (Shift = 5%)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDropZone && modelReport && !isLoadingModel) {
          setShowDropZone(false);
          setLoadError(null);
        } else if (editArtworkMode) {
          handleToggleEditArtworkMode(false);
        } else if (selectedMesh) {
          viewerRef.current?.clearSelection();
        }
        return;
      }

      // Arrow keys nudge active artwork when artwork exists & user is not typing in a field
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if (
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight'
      ) {
        return;
      }

      // Only nudge when Artwork tab is open or Edit artwork mode is active
      if (activeTab !== 'artwork' && !editArtworkMode) return;

      const sideToNudge: DecalSide | null =
        activeArtworkSide === 'front' && frontDecal
          ? 'front'
          : activeArtworkSide === 'back' && backDecal
          ? 'back'
          : frontDecal
          ? 'front'
          : backDecal
          ? 'back'
          : null;

      if (!sideToNudge) return;

      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') handleNudgeDecal(sideToNudge, -step, 0);
      if (e.key === 'ArrowRight') handleNudgeDecal(sideToNudge, step, 0);
      if (e.key === 'ArrowUp') handleNudgeDecal(sideToNudge, 0, step);
      if (e.key === 'ArrowDown') handleNudgeDecal(sideToNudge, 0, -step);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeArtworkSide,
    activeTab,
    backDecal,
    editArtworkMode,
    frontDecal,
    handleNudgeDecal,
    handleToggleEditArtworkMode,
    isLoadingModel,
    modelReport,
    selectedMesh,
    showDropZone,
  ]);

  // --- Model Loading Handlers ---

  const handleSelectModelFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.glb') && !lower.endsWith('.gltf')) {
      setLoadError('Unsupported file type. Please choose a .glb or .gltf model file.');
      return;
    }

    const viewer = viewerRef.current;
    if (!viewer) return;

    setLoadError(null);
    setIsLoadingModel(true);
    setLoadProgress(0.12);

    try {
      const buffer = await file.arrayBuffer();
      const blob = new Blob([buffer], { type: 'model/gltf-binary' });
      const report = await viewer.loadFromBlob(blob, file.name, (f) => setLoadProgress(f));

      await saveModelToIndexedDB(buffer, file.name);

      setModelReport(report);
      setShowDropZone(false);
      setActivePreset('front');
      setSelectedMesh(null);
      setMappingNotice(report.warningMessage ?? null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load 3D model. Please check the file.'
      );
    } finally {
      setIsLoadingModel(false);
      setLoadProgress(0);
    }
  }, []);

  const handleLoadModelUrl = useCallback(async (url: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setLoadError(null);
    setIsLoadingModel(true);
    setLoadProgress(0.08);

    try {
      const { report, buffer, fileName } = await viewer.loadFromUrl(url, (f) =>
        setLoadProgress(f)
      );
      await saveModelToIndexedDB(buffer, fileName, url);

      setModelReport(report);
      setShowDropZone(false);
      setActivePreset('front');
      setSelectedMesh(null);
      setMappingNotice(report.warningMessage ?? null);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Failed to load model from URL. Verify CORS headers and direct .glb link.'
      );
    } finally {
      setIsLoadingModel(false);
      setLoadProgress(0);
    }
  }, []);

  const handleLoadProceduralDemo = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setLoadError(null);
    const report = viewer.loadProceduralDemo();
    setModelReport(report);
    setShowDropZone(false);
    setActivePreset('front');
    setSelectedMesh(null);
    setMappingNotice(null);
  }, []);

  // --- Colour, Body Gradient, Fabric Finish, Stitching & Backdrop Handlers ---

  const pushRecentColour = useCallback((hex: string) => {
    const norm = hex.toUpperCase();
    setRecentColours((prev) => {
      const next = [norm, ...prev.filter((c) => c !== norm)].slice(0, 12);
      saveRecentColours(next);
      return next;
    });
  }, []);

  const applyColours = useCallback((next: PartColours) => {
    setPartColours(next);
    viewerRef.current?.setPartColours(next, false);
  }, []);

  const handleChangeBodyGradient = useCallback((next: BodyGradientConfig) => {
    setBodyGradient(next);
    viewerRef.current?.setBodyGradient(next);
  }, []);

  const handleSelectColour = useCallback(
    (hex: string, recordRecent = true) => {
      const normalized = hex.toUpperCase();
      if (recordRecent) {
        pushRecentColour(normalized);
      }
      // Choosing a solid colour for Body (or Match All) cleanly disables Body ombre gradient
      if (matchAll || activeGroup === 'body') {
        setBodyGradient((prev) => {
          if (!prev.enabled) return prev;
          const off = { ...prev, enabled: false };
          viewerRef.current?.setBodyGradient(off);
          return off;
        });
      }

      if (matchAll) {
        applyColours({
          body: normalized,
          sleeves: normalized,
          collar: normalized,
          placket: normalized,
          buttons: normalized,
          pocket: normalized,
        });
      } else {
        applyColours({
          ...partColours,
          [activeGroup]: normalized,
        });
      }
    },
    [activeGroup, applyColours, matchAll, partColours, pushRecentColour]
  );

  const handleToggleMatchAll = useCallback(
    (next: boolean) => {
      setMatchAll(next);
      if (next) {
        const base = partColours[activeGroup];
        applyColours({
          body: base,
          sleeves: base,
          collar: base,
          placket: base,
          buttons: base,
          pocket: base,
        });
      }
    },
    [activeGroup, applyColours, partColours]
  );

  const handleAddContrastPart = useCallback(() => {
    setMatchAll(false);
    const contrastHex = computeContrastShade(partColours.body, contrastFlip);
    setContrastFlip((prev) => !prev);
    pushRecentColour(contrastHex);
    applyColours({
      ...partColours,
      collar: contrastHex,
      placket: contrastHex,
    });
    setActiveGroup('collar');
  }, [applyColours, contrastFlip, partColours, pushRecentColour]);

  const handleAddBrandColour = useCallback((hex: string) => {
    const norm = hex.toUpperCase();
    setBrandColours((prev) => {
      if (prev.includes(norm) || prev.length >= 12) return prev;
      const next = [...prev, norm];
      saveBrandColours(next);
      return next;
    });
  }, []);

  const handleRemoveBrandColour = useCallback((hex: string) => {
    const norm = hex.toUpperCase();
    setBrandColours((prev) => {
      const next = prev.filter((c) => c !== norm);
      saveBrandColours(next);
      return next;
    });
  }, []);

  const handleChangeFabricFinish = useCallback((finish: FabricFinish) => {
    setFabricFinish(finish);
    viewerRef.current?.setFabricFinish(finish);
  }, []);

  const handleChangeStitchConfig = useCallback((patch: Partial<StitchConfig>) => {
    setStitchConfig((prev) => {
      const next = { ...prev, ...patch };
      viewerRef.current?.setStitchConfig(next);
      return next;
    });
  }, []);

  const handleToggleTrueColourMode = useCallback((next: boolean) => {
    setTrueColourMode(next);
    viewerRef.current?.setTrueColourMode(next);
  }, []);

  const handleTogglePocket = useCallback((next: boolean) => {
    setShowPocket(next);
    viewerRef.current?.setPocketVisible(next);
    // Re-sync front preset coordinates if front decal is currently using a preset
    setFrontDecal((prev) => {
      if (!prev || prev.isCustomPosition) return prev;
      const presetPos = viewerRef.current?.getPresetNormalizedPosition('front', prev.preset);
      if (!presetPos) return prev;
      return { ...prev, posX: presetPos.posX, posY: presetPos.posY };
    });
  }, []);

  const handleReassignMesh = useCallback((entryId: string, newGroup: ColourGroup) => {
    const updated = viewerRef.current?.reassignMeshGroup(entryId, newGroup) ?? null;
    if (updated) {
      setSelectedMesh(updated);
      setActiveGroup(newGroup);
      setModelReport((prev) => {
        if (!prev) return prev;
        const nextMappings = prev.mappings.map((m) =>
          m.id === entryId ? { ...m, group: newGroup } : m
        );
        return {
          ...prev,
          mappings: nextMappings,
          hasPocket: nextMappings.some((m) => m.group === 'pocket'),
          hasPlacket: nextMappings.some((m) => m.group === 'placket'),
        };
      });
    }
  }, []);

  // --- Artwork / Decal Handlers ---

  const handleUploadLogo = useCallback(async (side: DecalSide, file: File) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    setArtworkError(null);
    try {
      const asset = await prepareLogoAsset(
        file,
        viewer.getMaxAnisotropy(),
        viewer.getMaxTextureSize()
      );
      const preset: DecalPreset = side === 'front' ? 'left-chest' : 'upper-back';
      const presetPos = viewer.getPresetNormalizedPosition(side, preset);

      const defaultConfig: DecalConfig = {
        side,
        fileName: asset.fileName,
        preset,
        sizePercent: side === 'front' ? 22 : 40,
        posX: presetPos.posX,
        posY: presetPos.posY,
        isCustomPosition: false,
        rotationDeg: 0,
        printStyle: 'flat',
      };

      viewer.setDecal(side, asset, defaultConfig);
      setActiveArtworkSide(side);
      if (side === 'front') {
        setFrontDecal(defaultConfig);
        setFrontLogoColors(asset.dominantColors);
        setActivePreset('front');
        viewer.animateToPreset('front');
      } else {
        setBackDecal(defaultConfig);
        setBackLogoColors(asset.dominantColors);
        setActivePreset('back');
        viewer.animateToPreset('back');
      }
    } catch (err) {
      setArtworkError(
        err instanceof Error ? err.message : 'Unable to process artwork image.'
      );
    }
  }, []);

  const handleUpdateDecal = useCallback(
    (side: DecalSide, patch: Partial<DecalConfig>, resetToPreset?: DecalPreset) => {
      setActiveArtworkSide(side);
      const setter = side === 'front' ? setFrontDecal : setBackDecal;
      setter((prev) => {
        if (!prev) return prev;
        let nextPosX = patch.posX ?? prev.posX;
        let nextPosY = patch.posY ?? prev.posY;
        let nextCustom = patch.isCustomPosition ?? prev.isCustomPosition;

        if (resetToPreset) {
          const presetPos = viewerRef.current?.getPresetNormalizedPosition(side, resetToPreset);
          if (presetPos) {
            nextPosX = presetPos.posX;
            nextPosY = presetPos.posY;
          }
          nextCustom = false;
        }

        const updated: DecalConfig = {
          ...prev,
          ...patch,
          posX: nextPosX,
          posY: nextPosY,
          isCustomPosition: nextCustom,
        };
        viewerRef.current?.updateDecalConfig(side, updated);
        return updated;
      });
      if (resetToPreset) {
        const targetView: CameraPreset = side === 'front' ? 'front' : 'back';
        setActivePreset(targetView);
        viewerRef.current?.animateToPreset(targetView);
      }
    },
    []
  );

  const handleRemoveDecal = useCallback(
    (side: DecalSide) => {
      viewerRef.current?.setDecal(side, null, null);
      if (side === 'front') {
        setFrontDecal(null);
        setFrontLogoColors([]);
        if (!backDecal && editArtworkMode) handleToggleEditArtworkMode(false);
      } else {
        setBackDecal(null);
        setBackLogoColors([]);
        if (!frontDecal && editArtworkMode) handleToggleEditArtworkMode(false);
      }
      setArtworkError(null);
    },
    [backDecal, editArtworkMode, frontDecal, handleToggleEditArtworkMode]
  );

  // --- Camera, Export & Reset Handlers ---

  const handleSelectPreset = useCallback((preset: CameraPreset) => {
    setActivePreset(preset);
    viewerRef.current?.animateToPreset(preset);
  }, []);

  const handleDownloadPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelReport) return;
    setIsExporting(true);
    requestAnimationFrame(() => {
      try {
        downloadCurrentPreview(viewer, {
          background: previewBg,
          backdropTheme: trueColourMode ? 'studio' : backdropTheme,
          clientName,
          wordmark,
        });
      } finally {
        setIsExporting(false);
      }
    });
  }, [backdropTheme, clientName, modelReport, previewBg, trueColourMode, wordmark]);

  const handleDownloadFourView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelReport) return;
    setIsExporting(true);
    requestAnimationFrame(() => {
      try {
        downloadFourViewSheet(viewer, {
          wordmark,
          clientName,
          partColours,
          bodyGradient,
          showPocket,
          hasPocketMesh: modelReport.hasPocket,
          hasPlacketMesh: modelReport.hasPlacket,
          stitchConfig,
          sheetBg,
          backdropTheme: trueColourMode ? 'studio' : backdropTheme,
          quote,
        });
      } finally {
        setIsExporting(false);
      }
    });
  }, [
    backdropTheme,
    bodyGradient,
    clientName,
    modelReport,
    partColours,
    quote,
    sheetBg,
    showPocket,
    stitchConfig,
    trueColourMode,
    wordmark,
  ]);

  const handleReset = useCallback(() => {
    setMatchAll(false);
    setActiveGroup('body');
    setShowPocket(true);
    setPartColours({ ...DEFAULT_PART_COLOURS });
    setBodyGradient({ ...DEFAULT_BODY_GRADIENT });
    setFabricFinish('solid');
    setStitchConfig({ contrastEnabled: false, color: '#F5F5F2' });
    setTrueColourMode(false);
    setBackdropTheme('studio');
    setFrontDecal(null);
    setBackDecal(null);
    setFrontLogoColors([]);
    setBackLogoColors([]);
    setEditArtworkMode(false);
    setArtworkError(null);
    setQuote({ quantity: '', pricePerPiece: '' });
    setActivePreset('front');

    const viewer = viewerRef.current;
    if (viewer) {
      viewer.setEditArtworkMode(false);
      viewer.setBodyGradient(DEFAULT_BODY_GRADIENT);
      viewer.setPartColours(DEFAULT_PART_COLOURS, false);
      viewer.setFabricFinish('solid');
      viewer.setStitchConfig({ contrastEnabled: false, color: '#F5F5F2' });
      viewer.setTrueColourMode(false);
      viewer.setPocketVisible(true);
      viewer.setDecal('front', null, null);
      viewer.setDecal('back', null, null);
      viewer.clearSelection();
      viewer.animateToPreset('front');
    }
  }, []);

  const handleWordmarkCommit = (raw: string) => {
    const cleaned = raw.trim() || 'HALVORA';
    setWordmark(cleaned);
    saveWordmark(cleaned);
    setEditingWordmark(false);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setParallaxOffset({ x: nx, y: ny });
  };

  const handleStagePointerLeave = () => {
    setParallaxOffset({ x: 0, y: 0 });
  };

  const renderActiveTabContent = () => {
    if (activeTab === 'colour') {
      return (
        <div key="colour" className="animate-tab-enter">
          <ColourPanel
            activeGroup={activeGroup}
            partColours={partColours}
            bodyGradient={bodyGradient}
            matchAll={matchAll}
            showPocket={showPocket}
            hasPocketMesh={modelReport?.hasPocket ?? true}
            hasPlacketMesh={modelReport?.hasPlacket ?? false}
            fabricFinish={fabricFinish}
            stitchConfig={stitchConfig}
            backdropTheme={backdropTheme}
            trueColourMode={trueColourMode}
            brandColours={brandColours}
            recentColours={recentColours}
            logoColors={logoColors}
            onSelectGroup={setActiveGroup}
            onSelectColour={handleSelectColour}
            onChangeBodyGradient={handleChangeBodyGradient}
            onToggleMatchAll={handleToggleMatchAll}
            onTogglePocket={handleTogglePocket}
            onAddContrastPart={handleAddContrastPart}
            onAddBrandColour={handleAddBrandColour}
            onRemoveBrandColour={handleRemoveBrandColour}
            onChangeFabricFinish={handleChangeFabricFinish}
            onChangeStitchConfig={handleChangeStitchConfig}
            onChangeBackdropTheme={setBackdropTheme}
            onToggleTrueColourMode={handleToggleTrueColourMode}
          />
        </div>
      );
    }
    if (activeTab === 'artwork') {
      return (
        <div key="artwork" className="animate-tab-enter">
          <ArtworkPanel
            frontDecal={frontDecal}
            backDecal={backDecal}
            activeArtworkSide={activeArtworkSide}
            editArtworkMode={editArtworkMode}
            showPocket={showPocket}
            hasPocketMesh={modelReport?.hasPocket ?? true}
            uploadError={artworkError}
            onSelectActiveSide={setActiveArtworkSide}
            onToggleEditArtworkMode={handleToggleEditArtworkMode}
            onTogglePocket={handleTogglePocket}
            onUploadLogo={handleUploadLogo}
            onUpdateDecal={handleUpdateDecal}
            onNudgeDecal={handleNudgeDecal}
            onRemoveDecal={handleRemoveDecal}
          />
        </div>
      );
    }
    return (
      <div key="pitch" className="animate-tab-enter">
        <PitchPanel
          quote={quote}
          previewBg={previewBg}
          sheetBg={sheetBg}
          isExporting={isExporting}
          onQuoteChange={(patch) => setQuote((prev) => ({ ...prev, ...patch }))}
          onPreviewBgChange={setPreviewBg}
          onSheetBgChange={setSheetBg}
          onDownloadPreview={handleDownloadPreview}
          onDownloadFourView={handleDownloadFourView}
          onReset={handleReset}
        />
      </div>
    );
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#F4F3F0] text-[#161616]">
      {/* Thin Top Loading Line */}
      {isLoadingModel && !showDropZone && (
        <div className="pointer-events-none fixed top-0 right-0 left-0 z-50 h-[2px] bg-[#E3E1DC]">
          <div
            className="h-full bg-[#1F4D3A] transition-all duration-150 ease-out"
            style={{ width: `${Math.max(10, Math.round(loadProgress * 100))}%` }}
          />
        </div>
      )}

      {/* Primary 3D Studio Stage (~75% desktop width when panel open) */}
      <main
        onPointerMove={handleStagePointerMove}
        onPointerLeave={handleStagePointerLeave}
        className="relative flex-1 overflow-hidden"
      >
        {/* Adaptive Studio Backdrop, Drifting Subtle Orbs, Film Grain & Full Unclipped Wordmark */}
        <StudioBackdrop
          themeId={backdropTheme}
          bodyHex={bodyGradient.enabled ? bodyGradient.colorStart : partColours.body}
          wordmark={wordmark}
          trueColourMode={trueColourMode}
          parallaxOffset={parallaxOffset}
        />

        {/* Isolated WebGL Canvas Mount Container */}
        <div ref={canvasContainerRef} className="relative z-[1] h-full w-full" />

        {/* Minimal Top Overlay Bar */}
        <header className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-center justify-between gap-4 px-5 py-4 md:px-7 md:py-5">
          {/* Top-Left: Wordmark with Warm Gold Dot + Change Model Link */}
          <div className="pointer-events-auto flex items-center gap-3">
            {editingWordmark ? (
              <input
                type="text"
                autoFocus
                defaultValue={wordmark}
                maxLength={28}
                aria-label="Edit studio wordmark"
                onBlur={(e) => handleWordmarkCommit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleWordmarkCommit(e.currentTarget.value);
                  if (e.key === 'Escape') setEditingWordmark(false);
                }}
                className={`w-36 border-b border-[#C9A24B] bg-transparent pb-0.5 text-[14px] font-semibold tracking-[0.14em] uppercase focus:outline-none ${
                  isDarkStage ? 'text-[#F5F5F2]' : 'text-[#161616]'
                }`}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingWordmark(true)}
                title="Click to edit wordmark"
                className={`text-[14px] font-semibold tracking-[0.14em] uppercase whitespace-nowrap transition-opacity duration-200 hover:opacity-75 ${
                  isDarkStage ? 'text-[#F5F5F2]' : 'text-[#161616]'
                }`}
              >
                {wordmark}
                <span className="text-[#C9A24B]">.</span>
              </button>
            )}

            {modelReport && !showDropZone && (
              <>
                <span
                  className={isDarkStage ? 'text-[#55575C]' : 'text-[#CFCBC2]'}
                  aria-hidden="true"
                >
                  /
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLoadError(null);
                    setShowDropZone(true);
                  }}
                  className={`text-[12px] whitespace-nowrap transition-colors ${
                    isDarkStage
                      ? 'text-[#B4B6BC] hover:text-white'
                      : 'text-[#686662] hover:text-[#161616]'
                  }`}
                >
                  Change model
                </button>
              </>
            )}
          </div>

          {/* Top-Right: Client Name Input + Desktop Panel Collapse Toggle */}
          <div className="pointer-events-auto flex items-center gap-3.5">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              aria-label="Client name"
              maxLength={48}
              className={`w-32 border-b bg-transparent py-1 text-right text-[12px] transition-colors focus:border-[#C9A24B] focus:outline-none sm:w-44 ${
                isDarkStage
                  ? 'border-[#505257] text-[#F5F5F2] placeholder:text-[#8E9198]'
                  : 'border-[#D6D3CC] text-[#161616] placeholder:text-[#8E8B84]'
              }`}
            />

            {modelReport && !showDropZone && (
              <button
                type="button"
                onClick={() => setDesktopPanelOpen((prev) => !prev)}
                aria-label={desktopPanelOpen ? 'Collapse controls panel' : 'Expand controls panel'}
                title={desktopPanelOpen ? 'Collapse panel' : 'Expand panel'}
                className="hidden h-8 w-8 items-center justify-center rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] md:inline-flex"
              >
                {desktopPanelOpen ? (
                  <PanelRightClose className="h-4 w-4 stroke-[1.4]" />
                ) : (
                  <PanelRightOpen className="h-4 w-4 stroke-[1.4]" />
                )}
              </button>
            )}
          </div>
        </header>

        {/* "Edit artwork" Mode Pill Above Viewer (Clean Orbit vs Drag Artwork Isolation) */}
        {modelReport && !showDropZone && hasAnyArtwork && (
          <div className="pointer-events-auto absolute top-14 left-1/2 z-10 -translate-x-1/2 md:top-5">
            <button
              type="button"
              role="switch"
              aria-checked={editArtworkMode}
              onClick={() => handleToggleEditArtworkMode(!editArtworkMode)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ${
                editArtworkMode
                  ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white shadow-[0_4px_14px_rgba(31,77,58,0.22)]'
                  : 'border-[#DDDAD4] bg-[#FAF8F4] text-[#4E4C48] hover:border-[#C9A24B] hover:text-[#161616]'
              }`}
            >
              <Move className="h-3.5 w-3.5 stroke-[1.7]" />
              <span>{editArtworkMode ? 'Edit artwork: ON (drag logo)' : 'Edit artwork'}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  editArtworkMode ? 'bg-[#C9A24B]' : 'bg-[#CFCBC2]'
                }`}
              />
            </button>
          </div>
        )}

        {/* Quiet Mapping Warning Notice */}
        {mappingNotice && !showDropZone && (
          <div className="pointer-events-auto absolute top-24 left-1/2 z-10 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] px-3.5 py-2 text-[11px] text-[#4E4C48]">
            <span>{mappingNotice}</span>
            <button
              type="button"
              onClick={() => setMappingNotice(null)}
              aria-label="Dismiss notice"
              className="shrink-0 text-[#686662] hover:text-[#161616]"
            >
              <X className="h-3.5 w-3.5 stroke-[1.5]" />
            </button>
          </div>
        )}

        {/* Selected Mesh Part Inspector */}
        {selectedMesh && !showDropZone && (
          <div className="pointer-events-none absolute bottom-[154px] left-5 z-10 max-w-[380px] md:bottom-[104px] md:left-7">
            <SelectedPartBar
              selected={selectedMesh}
              onReassign={handleReassignMesh}
              onClose={() => viewerRef.current?.clearSelection()}
            />
          </div>
        )}

        {/* Bottom Viewer Bar: Live Colour Story Strip + Camera Preset Controls */}
        {modelReport && !showDropZone && (
          <div className="pointer-events-none absolute right-0 bottom-[60px] left-0 z-10 flex flex-col items-center gap-2 px-4 md:bottom-5">
            {/* Live Colour Story Strip (Clickable Part Chips) */}
            <div
              aria-label="Current garment colour story"
              className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5"
            >
              {colourStoryParts.map((group) => {
                const isSelected = !matchAll && activeGroup === group && activeTab === 'colour';
                const hex = partColours[group];
                const isGrad = group === 'body' && bodyGradient.enabled;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      if (matchAll) setMatchAll(false);
                      setActiveGroup(group);
                      setActiveTab('colour');
                      setDesktopPanelOpen(true);
                    }}
                    title={`Edit ${COLOUR_GROUP_LABELS[group]} colour`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] whitespace-nowrap transition-all duration-150 ${
                      isSelected
                        ? 'border-[#C9A24B] bg-[#FAF8F4] font-medium text-[#161616]'
                        : 'border-[#E3E1DC] bg-[#FAF8F4]/95 text-[#5F5D59] hover:-translate-y-0.5 hover:border-[#C9A24B] hover:text-[#161616]'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: isGrad
                          ? `linear-gradient(135deg, ${bodyGradient.colorStart}, ${bodyGradient.colorEnd})`
                          : hex,
                        boxShadow: !isGrad && isLightHex(hex)
                          ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                      }}
                    />
                    <span>{COLOUR_GROUP_LABELS[group]}</span>
                  </button>
                );
              })}
            </div>

            {/* Camera View Preset Bar */}
            <nav
              aria-label="Camera views"
              className="pointer-events-auto flex items-center overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#FAF8F4]"
            >
              {CAMERA_PRESETS.map((preset) => {
                const active = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`border-r border-[#E3E1DC] px-3 py-2 text-[11px] whitespace-nowrap transition-colors last:border-r-0 md:px-4 md:text-[12px] ${
                      active
                        ? 'bg-white font-medium text-[#1F4D3A] shadow-[inset_0_-2px_0_0_#C9A24B]'
                        : 'text-[#686662] hover:bg-white/70 hover:text-[#161616]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* Initial / Change-Model Drop-Zone Overlay */}
        {showDropZone && (
          <DropZoneOverlay
            isLoading={isLoadingModel}
            progress={loadProgress}
            error={loadError}
            canCancel={Boolean(modelReport)}
            onSelectFile={handleSelectModelFile}
            onLoadUrl={handleLoadModelUrl}
            onLoadProceduralDemo={handleLoadProceduralDemo}
            onCancel={() => {
              setShowDropZone(false);
              setLoadError(null);
            }}
          />
        )}
      </main>

      {/* Desktop Slim Collapsible Right Control Panel (~25% width, warm #FAF8F4 surface) */}
      {modelReport && !showDropZone && (
        <aside
          aria-label="Uniform configurator controls"
          className={`hidden h-full shrink-0 flex-col border-l border-[#E3E1DC] bg-[#FAF8F4] transition-[width,opacity] duration-200 ease-out md:flex ${
            desktopPanelOpen
              ? 'w-[348px] opacity-100'
              : 'pointer-events-none w-0 overflow-hidden border-l-0 opacity-0'
          }`}
        >
          {/* Slim Underline Tab Bar with Warm Gold Active Accent */}
          <div className="grid shrink-0 grid-cols-3 border-b border-[#E6E3DC]">
            {(
              [
                { id: 'colour', label: 'Colour' },
                { id: 'artwork', label: 'Artwork' },
                { id: 'pitch', label: 'Pitch' },
              ] as Array<{ id: PanelTab; label: string }>
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-3.5 text-[12px] whitespace-nowrap transition-colors ${
                    active
                      ? 'font-medium text-[#161616]'
                      : 'text-[#686662] hover:text-[#161616]'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute right-0 bottom-0 left-0 h-[2px] bg-[#C9A24B]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Scrollable Panel Body */}
          <div className="panel-scroll flex-1 overflow-y-auto px-6 py-5">
            {renderActiveTabContent()}
          </div>

          {/* Slim Quiet Footer Actions */}
          <div className="flex shrink-0 items-center justify-between border-t border-[#E6E3DC] px-6 py-3.5">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-[11px] text-[#686662] transition-colors hover:text-[#161616]"
            >
              <RotateCcw className="h-3 w-3 stroke-[1.5]" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadFourView}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#1F4D3A] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#C9A24B] hover:text-[#161616] disabled:opacity-40"
            >
              <Download className="h-3 w-3 stroke-[1.7]" />
              <span>4-view sheet</span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Collapsible Bottom Sheet (< 768px) */}
      {modelReport && !showDropZone && (
        <section
          aria-label="Uniform controls"
          className="fixed right-0 bottom-0 left-0 z-30 flex flex-col border-t border-[#E3E1DC] bg-[#FAF8F4] md:hidden"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E6E3DC] px-3">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'colour', label: 'Colour' },
                  { id: 'artwork', label: 'Artwork' },
                  { id: 'pitch', label: 'Pitch' },
                ] as Array<{ id: PanelTab; label: string }>
              ).map((tab) => {
                const active = activeTab === tab.id && mobileSheetOpen;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileSheetOpen(true);
                    }}
                    className={`relative min-h-[40px] px-3 text-[12px] whitespace-nowrap transition-colors ${
                      active
                        ? 'font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:text-[#161616]'
                    }`}
                  >
                    {tab.label}
                    {active && (
                      <span className="absolute right-2 bottom-0 left-2 h-[2px] bg-[#C9A24B]" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setMobileSheetOpen((prev) => !prev)}
              aria-label={mobileSheetOpen ? 'Collapse controls' : 'Expand controls'}
              className="flex h-10 w-10 items-center justify-center text-[#161616]"
            >
              {mobileSheetOpen ? (
                <ChevronDown className="h-4 w-4 stroke-[1.5]" />
              ) : (
                <ChevronUp className="h-4 w-4 stroke-[1.5]" />
              )}
            </button>
          </div>

          {mobileSheetOpen && (
            <div className="panel-scroll max-h-[54vh] overflow-y-auto px-5 py-5">
              {renderActiveTabContent()}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
