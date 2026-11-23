import React, { useRef } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  BackDecalPreset,
  DecalConfig,
  DecalPreset,
  DecalSide,
  FrontDecalPreset,
  PrintStyle,
} from '../types';
import { DECAL_POS_MAX, DECAL_POS_MIN } from '../three/decals';

interface ArtworkPanelProps {
  frontDecal: DecalConfig | null;
  backDecal: DecalConfig | null;
  activeArtworkSide: DecalSide;
  editArtworkMode: boolean;
  showPocket: boolean;
  hasPocketMesh: boolean;
  uploadError: string | null;
  onSelectActiveSide: (side: DecalSide) => void;
  onToggleEditArtworkMode: (next: boolean) => void;
  onTogglePocket: (next: boolean) => void;
  onUploadLogo: (side: DecalSide, file: File) => void;
  onUpdateDecal: (
    side: DecalSide,
    patch: Partial<DecalConfig>,
    resetToPreset?: DecalPreset
  ) => void;
  onNudgeDecal: (side: DecalSide, dx: number, dy: number) => void;
  onRemoveDecal: (side: DecalSide) => void;
}

const FRONT_PRESETS: Array<{ id: FrontDecalPreset; label: string }> = [
  { id: 'left-chest', label: 'Left chest' },
  { id: 'centre-chest', label: 'Centre chest' },
  { id: 'right-chest', label: 'Right chest' },
];

const BACK_PRESETS: Array<{ id: BackDecalPreset; label: string }> = [
  { id: 'upper-back', label: 'Upper back' },
  { id: 'centre-back', label: 'Centre back' },
];

const ASSUMED_CHEST_WIDTH_CM = 52;

export const ArtworkPanel: React.FC<ArtworkPanelProps> = ({
  frontDecal,
  backDecal,
  activeArtworkSide,
  editArtworkMode,
  showPocket,
  hasPocketMesh,
  uploadError,
  onSelectActiveSide,
  onToggleEditArtworkMode,
  onTogglePocket,
  onUploadLogo,
  onUpdateDecal,
  onNudgeDecal,
  onRemoveDecal,
}) => {
  return (
    <div className="space-y-6">
      {/* Pocket Toggle inside Artwork Panel */}
      <div className="flex items-center justify-between border-b border-[#E6E3DC] pb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[#161616]">Chest pocket</span>
          </div>
          <span className="mt-0.5 block text-[11px] text-[#7A7771]">
            {showPocket && hasPocketMesh
              ? 'Left chest logo wraps smoothly onto pocket'
              : 'Logo projects directly onto front panel'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showPocket}
          disabled={!hasPocketMesh}
          onClick={() => onTogglePocket(!showPocket)}
          className="flex items-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span
            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
              showPocket && hasPocketMesh ? 'bg-[#1F4D3A]' : 'bg-[#D6D3CC]'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-150 ${
                showPocket && hasPocketMesh ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>

      <ArtworkSlot
        side="front"
        title="Front design"
        config={frontDecal}
        isActiveSide={activeArtworkSide === 'front'}
        editArtworkMode={editArtworkMode}
        presets={FRONT_PRESETS}
        onActivate={() => onSelectActiveSide('front')}
        onToggleEditArtworkMode={onToggleEditArtworkMode}
        onUpload={(file) => onUploadLogo('front', file)}
        onUpdate={(patch, resetPreset) => onUpdateDecal('front', patch, resetPreset)}
        onNudge={(dx, dy) => onNudgeDecal('front', dx, dy)}
        onRemove={() => onRemoveDecal('front')}
      />

      <div className="border-t border-[#E6E3DC]" />

      <ArtworkSlot
        side="back"
        title="Back design"
        config={backDecal}
        isActiveSide={activeArtworkSide === 'back'}
        editArtworkMode={editArtworkMode}
        presets={BACK_PRESETS}
        onActivate={() => onSelectActiveSide('back')}
        onToggleEditArtworkMode={onToggleEditArtworkMode}
        onUpload={(file) => onUploadLogo('back', file)}
        onUpdate={(patch, resetPreset) => onUpdateDecal('back', patch, resetPreset)}
        onNudge={(dx, dy) => onNudgeDecal('back', dx, dy)}
        onRemove={() => onRemoveDecal('back')}
      />

      {uploadError && (
        <p className="text-[12px] leading-relaxed text-[#9E2A2B]" role="alert">
          {uploadError}
        </p>
      )}
    </div>
  );
};

interface ArtworkSlotProps {
  side: DecalSide;
  title: string;
  config: DecalConfig | null;
  isActiveSide: boolean;
  editArtworkMode: boolean;
  presets: Array<{ id: DecalPreset; label: string }>;
  onActivate: () => void;
  onToggleEditArtworkMode: (next: boolean) => void;
  onUpload: (file: File) => void;
  onUpdate: (patch: Partial<DecalConfig>, resetPreset?: DecalPreset) => void;
  onNudge: (dx: number, dy: number) => void;
  onRemove: () => void;
}

const ArtworkSlot: React.FC<ArtworkSlotProps> = ({
  side,
  title,
  config,
  isActiveSide,
  editArtworkMode,
  presets,
  onActivate,
  onToggleEditArtworkMode,
  onUpload,
  onUpdate,
  onNudge,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  const sizePct = config ? Math.round(config.sizePercent) : side === 'front' ? 22 : 40;
  const approxCm = ((sizePct / 100) * ASSUMED_CHEST_WIDTH_CM).toFixed(1);
  const posX = config ? Math.round(config.posX) : 50;
  const posY = config ? Math.round(config.posY) : 65;

  const handleExactSizeInput = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    onUpdate({ sizePercent: Math.max(5, Math.min(100, Math.round(parsed))) });
  };

  const handleExactPosInput = (axis: 'posX' | 'posY', raw: string) => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(DECAL_POS_MIN, Math.min(DECAL_POS_MAX, Math.round(parsed)));
    onUpdate({ [axis]: clamped, isCustomPosition: true });
  };

  const handleNudgeClick = (dx: number, dy: number, e: React.MouseEvent) => {
    onActivate();
    const mult = e.shiftKey ? 5 : 1;
    onNudge(dx * mult, dy * mult);
  };

  return (
    <div className="space-y-3.5" onPointerDown={config ? onActivate : undefined}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              config && isActiveSide ? 'bg-[#1F4D3A]' : 'bg-[#C9A24B]'
            }`}
            aria-hidden="true"
          />
          <span className="text-[12px] font-medium text-[#161616]">{title}</span>
        </div>

        {config && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[11px] text-[#686662] transition-colors hover:text-[#9E2A2B]"
          >
            <Trash2 className="h-3 w-3 stroke-[1.5]" />
            <span>Remove</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".png,.svg,.jpg,.jpeg,.webp,image/png,image/svg+xml,image/jpeg"
        onChange={handleFile}
        className="hidden"
      />

      {!config ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[#CFCBC2] bg-white px-4 py-5 text-center transition-colors hover:border-[#C9A24B]"
        >
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#161616]">
            <Upload className="h-3.5 w-3.5 stroke-[1.6] text-[#1F4D3A]" />
            <span>Upload {side} artwork</span>
          </span>
          <span className="text-[11px] text-[#8E8B84]">
            PNG, SVG or JPG · Transparent backgrounds work best
          </span>
        </button>
      ) : (
        <div className="space-y-4">
          {/* Active File Strip */}
          <div className="flex items-center justify-between rounded-[10px] border border-[#E3E1DC] bg-white px-3 py-2">
            <span className="max-w-[190px] truncate text-[12px] text-[#161616]">
              {config.fileName}
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[11px] text-[#686662] underline decoration-[#D6D3CC] underline-offset-2 transition-colors hover:text-[#1F4D3A]"
            >
              Replace
            </button>
          </div>

          {/* Placement Presets */}
          <div>
            <span className="mb-1.5 block text-[11px] text-[#686662]">Placement</span>
            <div
              className={`grid overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB] ${
                presets.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {presets.map((p) => {
                const isActive = !config.isCustomPosition && config.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onUpdate({ preset: p.id, isCustomPosition: false }, p.id)}
                    className={`border-r border-[#E3E1DC] px-2 py-2 text-[11px] whitespace-nowrap transition-colors last:border-r-0 ${
                      isActive
                        ? 'bg-white font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:bg-white/60 hover:text-[#161616]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Size Slider (5% to 100%) + Number Input + Approx cm */}
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="text-[#686662]">Width</span>
              <span className="tabular-nums text-[#686662]">
                <span className="font-medium text-[#161616]">{sizePct}%</span>
                <span aria-hidden="true"> · </span>
                <span>~{approxCm} cm</span>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={sizePct}
                onChange={(e) => onUpdate({ sizePercent: parseInt(e.target.value, 10) })}
                className="studio-slider flex-1"
              />
              <div className="flex w-16 shrink-0 items-center rounded-[10px] border border-[#DDDAD4] bg-white px-2 py-1 focus-within:border-[#1F4D3A]">
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={sizePct}
                  aria-label={`${title} width percentage`}
                  onChange={(e) => handleExactSizeInput(e.target.value)}
                  className="w-full bg-transparent text-right text-[11px] tabular-nums text-[#161616] focus:outline-none"
                />
                <span className="ml-0.5 text-[10px] text-[#7A7771]">%</span>
              </div>
            </div>
          </div>

          {/* Position X & Y Sliders + Number Inputs + 4 Nudge Arrows + Reset Position */}
          <div className="space-y-3 rounded-[10px] border border-[#E6E3DC] bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#161616]">Position</span>
              <button
                type="button"
                onClick={() => onUpdate({ isCustomPosition: false }, config.preset)}
                className="inline-flex items-center gap-1 text-[11px] text-[#686662] transition-colors hover:text-[#1F4D3A]"
              >
                <RotateCcw className="h-3 w-3 stroke-[1.6]" />
                <span>Reset position</span>
              </button>
            </div>

            {/* Position X */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#686662]">Horizontal (X)</span>
                <span className="tabular-nums text-[#7A7771]">{posX}%</span>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={DECAL_POS_MIN}
                  max={DECAL_POS_MAX}
                  step={1}
                  value={posX}
                  onChange={(e) =>
                    onUpdate({
                      posX: parseInt(e.target.value, 10),
                      isCustomPosition: true,
                    })
                  }
                  className="studio-slider flex-1"
                />
                <div className="flex w-14 shrink-0 items-center rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] px-1.5 py-0.5 focus-within:border-[#1F4D3A]">
                  <input
                    type="number"
                    min={DECAL_POS_MIN}
                    max={DECAL_POS_MAX}
                    value={posX}
                    aria-label={`${title} horizontal position percentage`}
                    onChange={(e) => handleExactPosInput('posX', e.target.value)}
                    className="w-full bg-transparent text-right text-[11px] tabular-nums text-[#161616] focus:outline-none"
                  />
                  <span className="ml-0.5 text-[10px] text-[#7A7771]">%</span>
                </div>
              </div>
            </div>

            {/* Position Y */}
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-[#686662]">Vertical (Y)</span>
                <span className="tabular-nums text-[#7A7771]">{posY}%</span>
              </div>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={DECAL_POS_MIN}
                  max={DECAL_POS_MAX}
                  step={1}
                  value={posY}
                  onChange={(e) =>
                    onUpdate({
                      posY: parseInt(e.target.value, 10),
                      isCustomPosition: true,
                    })
                  }
                  className="studio-slider flex-1"
                />
                <div className="flex w-14 shrink-0 items-center rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] px-1.5 py-0.5 focus-within:border-[#1F4D3A]">
                  <input
                    type="number"
                    min={DECAL_POS_MIN}
                    max={DECAL_POS_MAX}
                    value={posY}
                    aria-label={`${title} vertical position percentage`}
                    onChange={(e) => handleExactPosInput('posY', e.target.value)}
                    className="w-full bg-transparent text-right text-[11px] tabular-nums text-[#161616] focus:outline-none"
                  />
                  <span className="ml-0.5 text-[10px] text-[#7A7771]">%</span>
                </div>
              </div>
            </div>

            {/* 4 Small Nudge Arrows (1% click, 5% with Shift) + Edit Drag Shortcut */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1" role="group" aria-label="Nudge position">
                <button
                  type="button"
                  title="Nudge left 1% (Shift: 5%)"
                  aria-label="Nudge left"
                  onClick={(e) => handleNudgeClick(-1, 0, e)}
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] hover:bg-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5 stroke-[1.7]" />
                </button>
                <button
                  type="button"
                  title="Nudge up 1% (Shift: 5%)"
                  aria-label="Nudge up"
                  onClick={(e) => handleNudgeClick(0, 1, e)}
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] hover:bg-white"
                >
                  <ArrowUp className="h-3.5 w-3.5 stroke-[1.7]" />
                </button>
                <button
                  type="button"
                  title="Nudge down 1% (Shift: 5%)"
                  aria-label="Nudge down"
                  onClick={(e) => handleNudgeClick(0, -1, e)}
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] hover:bg-white"
                >
                  <ArrowDown className="h-3.5 w-3.5 stroke-[1.7]" />
                </button>
                <button
                  type="button"
                  title="Nudge right 1% (Shift: 5%)"
                  aria-label="Nudge right"
                  onClick={(e) => handleNudgeClick(1, 0, e)}
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] hover:bg-white"
                >
                  <ArrowRight className="h-3.5 w-3.5 stroke-[1.7]" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onActivate();
                  onToggleEditArtworkMode(!editArtworkMode);
                }}
                className={`rounded-[8px] border px-2 py-1 text-[10px] font-medium whitespace-nowrap transition-colors ${
                  editArtworkMode
                    ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white'
                    : 'border-[#DDDAD4] bg-[#FAF8F4] text-[#5F5D59] hover:border-[#C9A24B] hover:text-[#161616]'
                }`}
              >
                {editArtworkMode ? 'Done dragging' : 'Drag on shirt'}
              </button>
            </div>

            <p className="text-[10px] text-[#8E8B84]">
              Nudge 1% (Shift + click or arrow keys: 5%)
            </p>
          </div>

          {/* Print Style: Flat print / Embroidery */}
          <div>
            <span className="mb-1.5 block text-[11px] text-[#686662]">Finish</span>
            <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB]">
              {(['flat', 'embroidery'] as PrintStyle[]).map((style) => {
                const active = config.printStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onUpdate({ printStyle: style })}
                    className={`border-r border-[#E3E1DC] py-2 text-[11px] whitespace-nowrap transition-colors last:border-r-0 ${
                      active
                        ? 'bg-white font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:bg-white/60 hover:text-[#161616]'
                    }`}
                  >
                    {style === 'flat' ? 'Flat print' : 'Embroidery'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rotation Slider */}
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="text-[#686662]">Rotation</span>
              <button
                type="button"
                onClick={() => onUpdate({ rotationDeg: 0 })}
                title="Click to reset rotation to 0°"
                className="tabular-nums text-[#161616] hover:text-[#1F4D3A]"
              >
                {config.rotationDeg > 0 ? `+${config.rotationDeg}°` : `${config.rotationDeg}°`}
              </button>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={config.rotationDeg}
              onChange={(e) => onUpdate({ rotationDeg: parseInt(e.target.value, 10) })}
              className="studio-slider"
            />
          </div>
        </div>
      )}
    </div>
  );
};
