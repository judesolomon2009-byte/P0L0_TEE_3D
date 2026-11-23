import React, { useMemo, useState } from 'react';
import { Check, Copy, Pipette, Plus, X } from 'lucide-react';
import type {
  BackdropThemeId,
  BodyGradientConfig,
  ColourGroup,
  FabricFinish,
  PartColours,
  StitchConfig,
} from '../types';
import {
  BACKDROP_THEMES,
  BUTTON_PRESETS,
  COLOUR_GROUPS,
  COLOUR_GROUP_LABELS,
  PALETTE_COLLECTIONS,
} from '../data/palette';
import { getNearestColourName, isLightHex, normalizeHex } from '../utils/colorUtils';
import { CanvaColourPicker } from './CanvaColourPicker';

interface ColourPanelProps {
  activeGroup: ColourGroup;
  partColours: PartColours;
  bodyGradient: BodyGradientConfig;
  matchAll: boolean;
  showPocket: boolean;
  hasPocketMesh: boolean;
  hasPlacketMesh: boolean;
  fabricFinish: FabricFinish;
  stitchConfig: StitchConfig;
  backdropTheme: BackdropThemeId;
  trueColourMode: boolean;
  brandColours: string[];
  recentColours: string[];
  logoColors: string[];
  onSelectGroup: (group: ColourGroup) => void;
  onSelectColour: (hex: string, recordRecent?: boolean) => void;
  onChangeBodyGradient: (next: BodyGradientConfig) => void;
  onToggleMatchAll: (next: boolean) => void;
  onTogglePocket: (next: boolean) => void;
  onAddContrastPart: () => void;
  onAddBrandColour: (hex: string) => void;
  onRemoveBrandColour: (hex: string) => void;
  onChangeFabricFinish: (finish: FabricFinish) => void;
  onChangeStitchConfig: (patch: Partial<StitchConfig>) => void;
  onChangeBackdropTheme: (theme: BackdropThemeId) => void;
  onToggleTrueColourMode: (next: boolean) => void;
}

interface EyeDropperConstructor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

const STITCH_QUICK_COLOURS = [
  '#F5F5F2',
  '#1B1C1E',
  '#C6922B',
  '#B5262E',
  '#9AC1DC',
  '#D3CEC4',
];

export const ColourPanel: React.FC<ColourPanelProps> = ({
  activeGroup,
  partColours,
  bodyGradient,
  matchAll,
  showPocket,
  hasPocketMesh,
  hasPlacketMesh,
  fabricFinish,
  stitchConfig,
  backdropTheme,
  trueColourMode,
  brandColours,
  recentColours,
  logoColors,
  onSelectGroup,
  onSelectColour,
  onChangeBodyGradient,
  onToggleMatchAll,
  onTogglePocket,
  onAddContrastPart,
  onAddBrandColour,
  onRemoveBrandColour,
  onChangeFabricFinish,
  onChangeStitchConfig,
  onChangeBackdropTheme,
  onToggleTrueColourMode,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState('corporate');
  const [copiedHex, setCopiedHex] = useState(false);

  const supportsEyeDropper =
    typeof window !== 'undefined' && 'EyeDropper' in window;

  const visibleGroups = useMemo(
    () =>
      COLOUR_GROUPS.filter((g) => {
        if (g === 'placket' && !hasPlacketMesh) return false;
        return true;
      }),
    [hasPlacketMesh]
  );

  const activeHex = (matchAll ? partColours.body : partColours[activeGroup]).toUpperCase();
  const nearestName = getNearestColourName(activeHex);

  const documentColours = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const g of visibleGroups) {
      if (g === 'pocket' && !showPocket) continue;
      const hex = partColours[g].toUpperCase();
      if (!seen.has(hex)) {
        seen.add(hex);
        list.push(hex);
      }
    }
    return list;
  }, [partColours, showPocket, visibleGroups]);

  const activeCollection =
    PALETTE_COLLECTIONS.find((c) => c.id === activeCollectionId) ??
    PALETTE_COLLECTIONS[0];

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard.writeText(activeHex);
      setCopiedHex(true);
      window.setTimeout(() => setCopiedHex(false), 1400);
    } catch {
      // Clipboard blocked in sandboxed iframe
    }
  };

  const handleTopEyeDropper = async () => {
    if (!supportsEyeDropper) return;
    try {
      const EyeDropperCtor = (
        window as unknown as { EyeDropper: EyeDropperConstructor }
      ).EyeDropper;
      const dropper = new EyeDropperCtor();
      const result = await dropper.open();
      const norm = normalizeHex(result.sRGBHex);
      if (norm) {
        onSelectColour(norm, true);
      }
    } catch {
      // Cancelled
    }
  };

  const canSaveBrand =
    brandColours.length < 12 && !brandColours.includes(activeHex);

  const showingBodyGradientChip =
    bodyGradient.enabled && (matchAll || activeGroup === 'body');

  return (
    <div className="space-y-5">
      {/* 1. Garment Part Selector */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeading label="Garment part" />
          {matchAll && (
            <span className="text-[11px] font-medium text-[#1F4D3A]">Matched everywhere</span>
          )}
        </div>

        <div
          className={`grid overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB] ${
            visibleGroups.length >= 6 ? 'grid-cols-3' : 'grid-cols-5'
          }`}
        >
          {visibleGroups.map((group) => {
            const isActive = !matchAll && activeGroup === group;
            const isHiddenPocket = group === 'pocket' && !showPocket;
            const dotHex = partColours[group];
            const isBodyGrad = group === 'body' && bodyGradient.enabled;
            return (
              <button
                key={group}
                type="button"
                onClick={() => {
                  if (matchAll) onToggleMatchAll(false);
                  onSelectGroup(group);
                }}
                className={`flex items-center justify-center gap-1.5 border-r border-b border-[#E3E1DC] px-1.5 py-2 text-[11px] transition-colors ${
                  isActive
                    ? 'bg-white font-medium text-[#161616] shadow-[inset_0_-2px_0_0_#C9A24B]'
                    : 'text-[#686662] hover:bg-white/70 hover:text-[#161616]'
                } ${isHiddenPocket ? 'opacity-45' : ''}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: isBodyGrad
                      ? `linear-gradient(135deg, ${bodyGradient.colorStart}, ${bodyGradient.colorEnd})`
                      : dotHex,
                    boxShadow: !isBodyGrad && isLightHex(dotHex)
                      ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                  }}
                />
                <span className="whitespace-nowrap">{COLOUR_GROUP_LABELS[group]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Match All, Pocket Toggle & Contrast Collar Shortcut */}
      <div className="space-y-2.5 border-y border-[#E6E3DC] py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={matchAll}
            onClick={() => onToggleMatchAll(!matchAll)}
            className="flex items-center gap-2 text-left"
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
                matchAll ? 'bg-[#1F4D3A]' : 'bg-[#D6D3CC]'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-150 ${
                  matchAll ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span className="text-[12px] text-[#161616]">Match all</span>
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={showPocket}
            disabled={!hasPocketMesh}
            onClick={() => onTogglePocket(!showPocket)}
            className="flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-[12px] text-[#161616]">Pocket</span>
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

        <button
          type="button"
          onClick={onAddContrastPart}
          className="flex w-full items-center justify-between rounded-[10px] border border-[#DDDAD4] bg-white px-3 py-2 text-[11px] text-[#161616] transition-colors hover:border-[#C9A24B]"
        >
          <span>Add contrast collar &amp; placket</span>
          <span className="text-[10px] text-[#7A7771]">Auto shade</span>
        </button>
      </div>

      {/* 2. Canva-Style Top Row: Rainbow "+" Button, EyeDropper, Current Colour Chip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-[#E3E1DC] bg-white px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {/* Round Rainbow-Ring "+" Button opening Canva Picker */}
            <button
              type="button"
              onClick={() => setPickerOpen((prev) => !prev)}
              aria-expanded={pickerOpen}
              aria-label="Open custom colour & gradient picker"
              title="Custom colour & gradient picker"
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-[2.5px] transition-transform duration-150 hover:scale-105 ${
                pickerOpen ? 'ring-2 ring-[#C9A24B] ring-offset-1' : ''
              }`}
              style={{
                background:
                  'conic-gradient(#FF3B30, #FF9500, #FFCC00, #34C759, #00C7BE, #007AFF, #AF52DE, #FF2D55, #FF3B30)',
              }}
            >
              <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-[#161616]">
                <Plus className="h-3.5 w-3.5 stroke-[2]" />
              </span>
            </button>

            {/* Browser EyeDropper Button (hidden if unsupported) */}
            {supportsEyeDropper && (
              <button
                type="button"
                onClick={handleTopEyeDropper}
                title="Pick colour from screen"
                aria-label="Pick colour from screen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#DDDAD4] bg-[#FAF8F4] text-[#161616] transition-colors hover:border-[#C9A24B] hover:bg-white"
              >
                <Pipette className="h-3.5 w-3.5 stroke-[1.6]" />
              </button>
            )}

            {/* Current Colour Chip with Ring + Click-to-Copy HEX */}
            <button
              type="button"
              onClick={handleCopyHex}
              title="Click to copy HEX code"
              className="group flex min-w-0 items-center gap-2.5 text-left"
            >
              <span
                className="h-7 w-7 shrink-0 rounded-full ring-2 ring-[#C9A24B]/70 ring-offset-1 ring-offset-white"
                style={{
                  background: showingBodyGradientChip
                    ? `linear-gradient(135deg, ${bodyGradient.colorStart}, ${bodyGradient.colorEnd})`
                    : activeHex,
                  boxShadow:
                    !showingBodyGradientChip && isLightHex(activeHex)
                      ? 'inset 0 0 0 1px rgba(22,22,22,0.24)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                }}
              />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-[#161616]">
                  {showingBodyGradientChip ? 'Body Ombre' : nearestName}
                </div>
                <div className="flex items-center gap-1 text-[11px] tabular-nums text-[#686662]">
                  <span>
                    {copiedHex
                      ? 'Copied'
                      : showingBodyGradientChip
                      ? `${bodyGradient.colorStart} → ${bodyGradient.colorEnd}`
                      : activeHex}
                  </span>
                  {!showingBodyGradientChip &&
                    (copiedHex ? (
                      <Check className="h-2.5 w-2.5 text-[#1F4D3A]" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    ))}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Canva-Style Solid + Gradient Popover */}
        {pickerOpen && (
          <CanvaColourPicker
            value={activeHex}
            logoColors={logoColors}
            bodyGradient={bodyGradient}
            onChangeSolid={(hex) => onSelectColour(hex, false)}
            onCommitSolid={(hex) => onSelectColour(hex, true)}
            onChangeBodyGradient={onChangeBodyGradient}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {/* Button Presets when Buttons part is active */}
        {!matchAll && activeGroup === 'buttons' && (
          <div className="pt-0.5">
            <span className="mb-1.5 block text-[11px] text-[#686662]">Button presets</span>
            <div className="flex flex-wrap gap-1.5">
              {BUTTON_PRESETS.map((bp) => {
                const targetHex = bp.hex ?? partColours.body;
                const active = targetHex.toUpperCase() === activeHex;
                return (
                  <button
                    key={bp.id}
                    type="button"
                    onClick={() => onSelectColour(targetHex, true)}
                    className={`inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? 'border-[#C9A24B] bg-white font-medium text-[#1F4D3A]'
                        : 'border-[#DDDAD4] bg-white text-[#686662] hover:border-[#C9A24B] hover:text-[#161616]'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: targetHex,
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                      }}
                    />
                    <span>{bp.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Document Colours */}
      <div>
        <SectionHeading label="Document colours" className="mb-2" />
        <div className="flex flex-wrap items-center gap-2.5">
          {documentColours.map((hex) => (
            <SwatchCircle
              key={hex}
              hex={hex}
              label={getNearestColourName(hex)}
              selected={hex === activeHex && !showingBodyGradientChip}
              onClick={() => onSelectColour(hex, true)}
            />
          ))}
        </div>
      </div>

      {/* 4. Brand Colours (max 12, saved in localStorage) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <SectionHeading label="Brand colours" />
          <span className="text-[10px] tabular-nums text-[#8E8B84]">
            {brandColours.length}/12
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={!canSaveBrand}
            onClick={() => onAddBrandColour(activeHex)}
            title={
              brandColours.includes(activeHex)
                ? 'Already saved in Brand colours'
                : brandColours.length >= 12
                ? 'Maximum 12 brand colours saved'
                : `Save ${activeHex} to Brand colours`
            }
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-dashed border-[#B5B1A8] bg-white text-[#161616] transition-all duration-150 hover:-translate-y-0.5 hover:border-[#C9A24B] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5 stroke-[1.7]" />
          </button>

          {brandColours.length === 0 ? (
            <span className="text-[11px] text-[#8E8B84]">
              Save client shades here for instant reuse
            </span>
          ) : (
            brandColours.map((hex) => (
              <div key={hex} className="group relative">
                <SwatchCircle
                  hex={hex}
                  label={getNearestColourName(hex)}
                  selected={hex === activeHex && !showingBodyGradientChip}
                  onClick={() => onSelectColour(hex, true)}
                />
                <button
                  type="button"
                  onClick={() => onRemoveBrandColour(hex)}
                  aria-label={`Remove brand colour ${hex}`}
                  className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full border border-[#DDDAD4] bg-white text-[#161616] group-hover:flex"
                >
                  <X className="h-2.5 w-2.5 stroke-[1.8]" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 5. Recent Colours (12) */}
      {recentColours.length > 0 && (
        <div>
          <SectionHeading label="Recent" className="mb-2" />
          <div className="flex flex-wrap items-center gap-2.5">
            {recentColours.map((hex) => (
              <SwatchCircle
                key={hex}
                hex={hex}
                label={getNearestColourName(hex)}
                selected={hex === activeHex && !showingBodyGradientChip}
                onClick={() => onSelectColour(hex, false)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 6. Curated Palettes & Classics */}
      <div className="border-t border-[#E6E3DC] pt-4">
        <SectionHeading label="Palettes" className="mb-2" />
        <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5 border-b border-[#E6E3DC] pb-2">
          {PALETTE_COLLECTIONS.map((col) => {
            const active = col.id === activeCollectionId;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => setActiveCollectionId(col.id)}
                className={`text-[11px] whitespace-nowrap transition-colors ${
                  active
                    ? 'font-medium text-[#1F4D3A] underline decoration-[#C9A24B] decoration-2 underline-offset-4'
                    : 'text-[#686662] hover:text-[#161616]'
                }`}
              >
                {col.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {activeCollection.swatches.map((swatch) => (
            <SwatchCircle
              key={`${activeCollection.id}-${swatch.hex}-${swatch.name}`}
              hex={swatch.hex}
              label={swatch.name}
              selected={swatch.hex.toUpperCase() === activeHex && !showingBodyGradientChip}
              onClick={() => onSelectColour(swatch.hex, true)}
            />
          ))}
        </div>
      </div>

      {/* 7. Fabric Finish */}
      <div className="border-t border-[#E6E3DC] pt-4">
        <SectionHeading label="Fabric finish" className="mb-2" />
        <div className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB]">
          {(
            [
              { id: 'solid', label: 'Solid' },
              { id: 'heather', label: 'Heather' },
              { id: 'pique', label: 'Pique' },
            ] as Array<{ id: FabricFinish; label: string }>
          ).map((item) => {
            const active = fabricFinish === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeFabricFinish(item.id)}
                className={`border-r border-[#E3E1DC] py-2 text-[11px] whitespace-nowrap transition-colors last:border-r-0 ${
                  active
                    ? 'bg-white font-medium text-[#1F4D3A]'
                    : 'text-[#686662] hover:bg-white/60 hover:text-[#161616]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 8. Contrast Stitching */}
      <div className="space-y-2.5 border-t border-[#E6E3DC] pt-4">
        <div className="flex items-center justify-between">
          <SectionHeading label="Contrast stitching" />
          <button
            type="button"
            role="switch"
            aria-checked={stitchConfig.contrastEnabled}
            onClick={() =>
              onChangeStitchConfig({ contrastEnabled: !stitchConfig.contrastEnabled })
            }
            className="flex items-center"
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
                stitchConfig.contrastEnabled ? 'bg-[#1F4D3A]' : 'bg-[#D6D3CC]'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-150 ${
                  stitchConfig.contrastEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>

        {stitchConfig.contrastEnabled && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {STITCH_QUICK_COLOURS.map((hex) => (
                <SwatchCircle
                  key={hex}
                  hex={hex}
                  label={`Stitch ${hex}`}
                  selected={stitchConfig.color.toUpperCase() === hex}
                  onClick={() => onChangeStitchConfig({ color: hex })}
                />
              ))}
            </div>
            <input
              type="color"
              aria-label="Custom stitch colour"
              value={stitchConfig.color}
              onChange={(e) =>
                onChangeStitchConfig({ color: e.target.value.toUpperCase() })
              }
              className="h-6 w-7 cursor-pointer rounded-md border border-[#DDDAD4] bg-white p-0.5"
            />
          </div>
        )}
      </div>

      {/* 9. Backdrop Themes (5 circles) + True Colour Mode */}
      <div className="space-y-3 border-t border-[#E6E3DC] pt-4">
        <div className="flex items-center justify-between">
          <SectionHeading label="Backdrop" />
          <div className="flex items-center gap-2.5">
            {BACKDROP_THEMES.map((t) => {
              const active = !trueColourMode && backdropTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  aria-label={`${t.label} backdrop`}
                  aria-pressed={active}
                  onClick={() => {
                    if (trueColourMode) onToggleTrueColourMode(false);
                    onChangeBackdropTheme(t.id);
                  }}
                  className={`h-5 w-5 rounded-full transition-all duration-150 ${
                    active
                      ? 'scale-110 ring-2 ring-[#C9A24B] ring-offset-2 ring-offset-[#FAF8F4]'
                      : 'hover:-translate-y-0.5 hover:scale-110'
                  }`}
                  style={{
                    backgroundColor: t.swatchHex,
                    boxShadow: 'inset 0 0 0 1px rgba(22,22,22,0.2)',
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="block text-[12px] text-[#161616]">True colour</span>
            <span className="block text-[10px] text-[#7A7771]">
              Neutral lighting for dye verification
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trueColourMode}
            onClick={() => onToggleTrueColourMode(!trueColourMode)}
            className="flex items-center"
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
                trueColourMode ? 'bg-[#1F4D3A]' : 'bg-[#D6D3CC]'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-150 ${
                  trueColourMode ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeading: React.FC<{ label: string; className?: string }> = ({
  label,
  className = '',
}) => (
  <div className={`flex items-center gap-1.5 ${className}`}>
    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A24B]" aria-hidden="true" />
    <span className="text-[11px] font-medium text-[#5F5D59]">{label}</span>
  </div>
);

interface SwatchCircleProps {
  hex: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}

const SwatchCircle: React.FC<SwatchCircleProps> = ({
  hex,
  label,
  selected,
  onClick,
}) => {
  const light = isLightHex(hex);
  return (
    <button
      type="button"
      title={`${label} (${hex.toUpperCase()})`}
      aria-label={`Select ${label}`}
      aria-pressed={selected}
      onClick={onClick}
      className={`h-[26px] w-[26px] rounded-full transition-all duration-150 focus-visible:outline-none ${
        selected
          ? 'scale-105 ring-2 ring-[#C9A24B] ring-offset-2 ring-offset-[#FAF8F4]'
          : 'hover:-translate-y-0.5 hover:scale-105'
      }`}
      style={{
        backgroundColor: hex,
        boxShadow: light
          ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
      }}
    />
  );
};
