export type ColourGroup =
  | 'body'
  | 'sleeves'
  | 'collar'
  | 'placket'
  | 'buttons'
  | 'pocket';

export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'collar';

export type DecalSide = 'front' | 'back';

export type FrontDecalPreset = 'left-chest' | 'right-chest' | 'centre-chest';
export type BackDecalPreset = 'upper-back' | 'centre-back';
export type DecalPreset = FrontDecalPreset | BackDecalPreset;

export type PrintStyle = 'flat' | 'embroidery';

export type FabricFinish = 'solid' | 'heather' | 'pique';

export type BackdropThemeId = 'studio' | 'sand' | 'sage' | 'slate' | 'charcoal';

export type GradientDirection = 'vertical' | 'diagonal' | 'horizontal';

export interface BodyGradientConfig {
  enabled: boolean;
  colorStart: string;
  colorEnd: string;
  direction: GradientDirection;
  /** 10 to 100: transition feathering softness */
  softness: number;
}

export interface Swatch {
  name: string;
  hex: string;
  family: string;
}

export interface PaletteCollection {
  id: string;
  label: string;
  swatches: Swatch[];
}

export interface PartColours {
  body: string;
  sleeves: string;
  collar: string;
  placket: string;
  buttons: string;
  pocket: string;
}

export interface StitchConfig {
  contrastEnabled: boolean;
  color: string;
}

export interface MeshMappingRecord {
  id: string;
  meshName: string;
  materialName: string;
  group: ColourGroup;
  center: [number, number, number];
  size: [number, number, number];
  reason: string;
}

export interface ModelLoadReport {
  fileName: string;
  meshCount: number;
  mappings: MeshMappingRecord[];
  hasPocket: boolean;
  hasPlacket: boolean;
  fallbackSingleGroup: boolean;
  warningMessage?: string;
}

export interface SelectedMeshInfo {
  id: string;
  meshName: string;
  materialName: string;
  group: ColourGroup;
}

export interface DecalConfig {
  side: DecalSide;
  fileName: string;
  preset: DecalPreset;
  /** Width percentage of the front/back panel (5 to 100) */
  sizePercent: number;
  /** Horizontal centre position as % of panel width as viewed (8 to 92; 50 = centre) */
  posX: number;
  /** Vertical centre position as % of panel height from bottom to top (8 to 92) */
  posY: number;
  /** True once dragged or nudged away from preset */
  isCustomPosition: boolean;
  rotationDeg: number; // -45 to +45
  printStyle: PrintStyle;
}

export interface QuoteState {
  quantity: string;
  pricePerPiece: string;
}

export type PreviewBg = 'backdrop' | 'white' | 'transparent';
export type SheetBg = 'backdrop' | 'white';
