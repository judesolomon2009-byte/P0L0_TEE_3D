import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pipette, Sparkles, X } from 'lucide-react';
import type { BodyGradientConfig, GradientDirection } from '../types';
import {
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  isLightHex,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  type HSV,
} from '../utils/colorUtils';

interface CanvaColourPickerProps {
  value: string;
  logoColors: string[];
  bodyGradient: BodyGradientConfig;
  onChangeSolid: (hex: string) => void;
  onCommitSolid?: (hex: string) => void;
  onChangeBodyGradient: (next: BodyGradientConfig) => void;
  onClose?: () => void;
}

type PickerTab = 'solid' | 'gradient';
type GradientStopKey = 'start' | 'end';

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): { open: () => Promise<EyeDropperResult> };
}

export const CanvaColourPicker: React.FC<CanvaColourPickerProps> = ({
  value,
  logoColors,
  bodyGradient,
  onChangeSolid,
  onCommitSolid,
  onChangeBodyGradient,
  onClose,
}) => {
  const [tab, setTab] = useState<PickerTab>(bodyGradient.enabled ? 'gradient' : 'solid');
  const [activeStop, setActiveStop] = useState<GradientStopKey>('start');
  const [showMore, setShowMore] = useState(false);

  const activeHexTarget =
    tab === 'gradient'
      ? activeStop === 'start'
        ? bodyGradient.colorStart
        : bodyGradient.colorEnd
      : value;

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);

  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(activeHexTarget)));
  const [hexDraft, setHexDraft] = useState(activeHexTarget.toUpperCase());
  const [hexInvalid, setHexInvalid] = useState(false);

  const supportsEyeDropper =
    typeof window !== 'undefined' && 'EyeDropper' in window;

  // Sync internal HSV & HEX draft whenever target hex or active tab/stop changes externally
  useEffect(() => {
    const norm = normalizeHex(activeHexTarget);
    if (!norm) return;
    setHexDraft(norm);
    setHexInvalid(false);
    const nextRgb = hexToRgb(norm);
    const currentRgb = hsvToRgb(hsv);
    if (
      Math.abs(nextRgb.r - currentRgb.r) > 2 ||
      Math.abs(nextRgb.g - currentRgb.g) > 2 ||
      Math.abs(nextRgb.b - currentRgb.b) > 2
    ) {
      const nextHsv = rgbToHsv(nextRgb);
      setHsv((prev) => ({
        h: nextHsv.s === 0 ? prev.h : nextHsv.h,
        s: nextHsv.s,
        v: nextHsv.v,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHexTarget, tab, activeStop]);

  // Draw SV saturation-brightness square whenever Hue changes
  useEffect(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const pureHueRgb = hsvToRgb({ h: hsv.h, s: 100, v: 100 });
    ctx.fillStyle = rgbToHex(pureHueRgb);
    ctx.fillRect(0, 0, w, h);

    const satGrad = ctx.createLinearGradient(0, 0, w, 0);
    satGrad.addColorStop(0, 'rgba(255,255,255,1)');
    satGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = satGrad;
    ctx.fillRect(0, 0, w, h);

    const valGrad = ctx.createLinearGradient(0, 0, 0, h);
    valGrad.addColorStop(0, 'rgba(0,0,0,0)');
    valGrad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = valGrad;
    ctx.fillRect(0, 0, w, h);
  }, [hsv.h, tab]);

  // Draw full-spectrum Hue bar
  useEffect(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#FF0000');
    grad.addColorStop(1 / 6, '#FFFF00');
    grad.addColorStop(2 / 6, '#00FF00');
    grad.addColorStop(3 / 6, '#00FFFF');
    grad.addColorStop(4 / 6, '#0000FF');
    grad.addColorStop(5 / 6, '#FF00FF');
    grad.addColorStop(1, '#FF0000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, [tab]);

  const applyHexToActiveTarget = useCallback(
    (hex: string, commit: boolean) => {
      const norm = hex.toUpperCase();
      if (tab === 'gradient') {
        const nextGrad: BodyGradientConfig = {
          ...bodyGradient,
          enabled: true,
          colorStart: activeStop === 'start' ? norm : bodyGradient.colorStart,
          colorEnd: activeStop === 'end' ? norm : bodyGradient.colorEnd,
        };
        onChangeBodyGradient(nextGrad);
      } else {
        onChangeSolid(norm);
        if (commit) onCommitSolid?.(norm);
      }
    },
    [tab, activeStop, bodyGradient, onChangeBodyGradient, onChangeSolid, onCommitSolid]
  );

  const emitHsv = useCallback(
    (next: HSV, commit = false) => {
      setHsv(next);
      const hex = rgbToHex(hsvToRgb(next));
      setHexDraft(hex);
      setHexInvalid(false);
      applyHexToActiveTarget(hex, commit);
    },
    [applyHexToActiveTarget]
  );

  // SV square pointer events (continues dragging smoothly outside square via setPointerCapture)
  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number, commit = false) => {
      const canvas = svCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const s = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const v = Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100));
      emitHsv({ h: hsv.h, s: Math.round(s), v: Math.round(v) }, commit);
    },
    [emitHsv, hsv.h]
  );

  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSvFromPointer(e.clientX, e.clientY, false);
  };

  const handleSvPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateSvFromPointer(e.clientX, e.clientY, false);
  };

  const handleSvPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      updateSvFromPointer(e.clientX, e.clientY, true);
    }
  };

  // Hue slider pointer events
  const updateHueFromPointer = useCallback(
    (clientX: number, commit = false) => {
      const canvas = hueCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const h = Math.max(
        0,
        Math.min(359, Math.round(((clientX - rect.left) / rect.width) * 360))
      );
      emitHsv({ h, s: hsv.s, v: hsv.v }, commit);
    },
    [emitHsv, hsv.s, hsv.v]
  );

  const handleHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateHueFromPointer(e.clientX, false);
  };

  const handleHuePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateHueFromPointer(e.clientX, false);
  };

  const handleHuePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      updateHueFromPointer(e.clientX, true);
    }
  };

  const rgb = hsvToRgb(hsv);
  const hsl = rgbToHsl(rgb);
  const currentHex = rgbToHex(rgb);

  const handleHexInput = (raw: string) => {
    const trimmed = raw.trim().toUpperCase();
    setHexDraft(trimmed);
    const norm = normalizeHex(trimmed);
    if (norm) {
      setHexInvalid(false);
      setHsv(rgbToHsv(hexToRgb(norm)));
      applyHexToActiveTarget(norm, true);
    } else {
      setHexInvalid(trimmed.replace(/^#/, '').length >= 3);
    }
  };

  const handleRgbField = (channel: 'r' | 'g' | 'b', raw: string) => {
    const num = Math.max(0, Math.min(255, parseInt(raw || '0', 10) || 0));
    const nextRgb = { ...rgb, [channel]: num };
    const hex = rgbToHex(nextRgb);
    setHsv(rgbToHsv(nextRgb));
    setHexDraft(hex);
    applyHexToActiveTarget(hex, true);
  };

  const handleHslField = (channel: 'h' | 's' | 'l', raw: string) => {
    const maxVal = channel === 'h' ? 360 : 100;
    const num = Math.max(0, Math.min(maxVal, parseInt(raw || '0', 10) || 0));
    const nextHsl = { ...hsl, [channel]: num };
    const nextRgb = hslToRgb(nextHsl);
    const hex = rgbToHex(nextRgb);
    setHsv(rgbToHsv(nextRgb));
    setHexDraft(hex);
    applyHexToActiveTarget(hex, true);
  };

  const handleEyeDropper = async () => {
    if (!supportsEyeDropper) return;
    try {
      const EyeDropperCtor = (
        window as unknown as { EyeDropper: EyeDropperConstructor }
      ).EyeDropper;
      const dropper = new EyeDropperCtor();
      const result = await dropper.open();
      const norm = normalizeHex(result.sRGBHex);
      if (norm) {
        setHsv(rgbToHsv(hexToRgb(norm)));
        setHexDraft(norm);
        applyHexToActiveTarget(norm, true);
      }
    } catch {
      // User cancelled eyedropper
    }
  };

  const gradientCssAngle =
    bodyGradient.direction === 'horizontal'
      ? '90deg'
      : bodyGradient.direction === 'diagonal'
      ? '135deg'
      : '180deg';

  const handleSelectTab = (nextTab: PickerTab) => {
    setTab(nextTab);
    if (nextTab === 'gradient' && !bodyGradient.enabled) {
      onChangeBodyGradient({ ...bodyGradient, enabled: true });
    }
  };

  return (
    <div className="space-y-3 rounded-[10px] border border-[#DDDAD4] bg-white p-3.5 shadow-[0_6px_22px_rgba(22,22,22,0.06)]">
      {/* Canva-Style Top Tabs: Solid colour | Gradient */}
      <div className="flex items-center justify-between border-b border-[#EAE7E1]">
        <div className="flex items-center gap-5">
          {(
            [
              { id: 'solid', label: 'Solid colour' },
              { id: 'gradient', label: 'Gradient' },
            ] as Array<{ id: PickerTab; label: string }>
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`relative pb-2 text-[12px] whitespace-nowrap transition-colors ${
                  active
                    ? 'font-medium text-[#161616]'
                    : 'text-[#686662] hover:text-[#161616]'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute right-0 bottom-0 left-0 h-[2px] rounded-full bg-[#C9A24B]" />
                )}
              </button>
            );
          })}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close colour picker"
            className="mb-1.5 rounded-md p-1 text-[#7A7771] transition-colors hover:bg-[#F4F2EC] hover:text-[#161616]"
          >
            <X className="h-3.5 w-3.5 stroke-[1.6]" />
          </button>
        )}
      </div>

      {/* Gradient Controls Header (Stop chips + Preview Bar) */}
      {tab === 'gradient' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#686662]">Body ombre stops</span>
            <button
              type="button"
              onClick={() => {
                onChangeBodyGradient({ ...bodyGradient, enabled: false });
                setTab('solid');
              }}
              className="text-[11px] text-[#7A7771] underline decoration-[#D6D3CC] underline-offset-2 transition-colors hover:text-[#9E2A2B]"
            >
              Remove gradient
            </button>
          </div>

          <div
            className="h-4 w-full rounded-[10px] border border-[#E3E1DC]"
            style={{
              background: `linear-gradient(${gradientCssAngle}, ${bodyGradient.colorStart}, ${bodyGradient.colorEnd})`,
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'start', label: 'Colour 1', hex: bodyGradient.colorStart },
                { key: 'end', label: 'Colour 2', hex: bodyGradient.colorEnd },
              ] as const
            ).map((stop) => {
              const selected = activeStop === stop.key;
              return (
                <button
                  key={stop.key}
                  type="button"
                  onClick={() => setActiveStop(stop.key)}
                  className={`flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-all ${
                    selected
                      ? 'border-[#C9A24B] bg-[#FAF8F4] ring-1 ring-[#C9A24B]/40'
                      : 'border-[#E3E1DC] bg-white hover:border-[#B8B4AA]'
                  }`}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{
                      backgroundColor: stop.hex,
                      boxShadow: isLightHex(stop.hex)
                        ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
                        : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                    }}
                  />
                  <div className="min-w-0">
                    <span className="block text-[10px] text-[#686662]">{stop.label}</span>
                    <span className="block truncate text-[11px] font-medium tabular-nums text-[#161616]">
                      {stop.hex.toUpperCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Large Saturation / Brightness Square */}
      <div
        role="slider"
        aria-label="Colour saturation and brightness"
        aria-valuetext={currentHex}
        tabIndex={0}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        onPointerUp={handleSvPointerUp}
        className="relative h-[156px] w-full cursor-crosshair overflow-hidden rounded-[10px] border border-[#E3E1DC] touch-none select-none"
      >
        <canvas
          ref={svCanvasRef}
          width={280}
          height={156}
          className="block h-full w-full"
        />
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.45),0_0_0_1px_rgba(22,22,22,0.35)]"
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Full-Width Rainbow Hue Slider with Round Handle */}
      <div
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={hsv.h}
        tabIndex={0}
        onPointerDown={handleHuePointerDown}
        onPointerMove={handleHuePointerMove}
        onPointerUp={handleHuePointerUp}
        className="relative h-3.5 w-full cursor-ew-resize rounded-full border border-[#E3E1DC] touch-none select-none"
      >
        <canvas
          ref={hueCanvasRef}
          width={280}
          height={14}
          className="block h-full w-full rounded-full"
        />
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(22,22,22,0.28)]"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 })),
          }}
        />
      </div>

      {/* Rounded HEX Input: Colour Chip on Left + EyeDropper on Right */}
      <div
        className={`flex items-center rounded-[10px] border bg-[#FAF8F4] px-2.5 py-1.5 transition-colors ${
          hexInvalid
            ? 'border-[#9E2A2B]'
            : 'border-[#DDDAD4] focus-within:border-[#1F4D3A]'
        }`}
      >
        <span
          className="mr-2.5 h-4 w-4 shrink-0 rounded-full"
          style={{
            backgroundColor: currentHex,
            boxShadow: isLightHex(currentHex)
              ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
              : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
          }}
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => handleHexInput(e.target.value)}
          onBlur={() => {
            setHexDraft(currentHex);
            setHexInvalid(false);
          }}
          aria-label="Hex colour code"
          placeholder="#1E2C42"
          className="w-full bg-transparent text-[12px] font-medium tabular-nums text-[#161616] focus:outline-none"
        />
        {supportsEyeDropper && (
          <button
            type="button"
            onClick={handleEyeDropper}
            title="Pick colour from screen"
            aria-label="Pick colour from screen"
            className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#5B5955] transition-colors hover:bg-white hover:text-[#161616]"
          >
            <Pipette className="h-3.5 w-3.5 stroke-[1.6]" />
          </button>
        )}
      </div>

      {/* Gradient Direction & Softness Controls */}
      {tab === 'gradient' && (
        <div className="space-y-3 border-t border-[#ECEAE4] pt-2.5">
          <div>
            <span className="mb-1.5 block text-[11px] text-[#686662]">Direction</span>
            <div className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F4F3F0]">
              {(
                [
                  { id: 'vertical', label: 'Vertical' },
                  { id: 'diagonal', label: 'Diagonal' },
                  { id: 'horizontal', label: 'Horizontal' },
                ] as Array<{ id: GradientDirection; label: string }>
              ).map((dir) => {
                const active = bodyGradient.direction === dir.id;
                return (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() =>
                      onChangeBodyGradient({
                        ...bodyGradient,
                        enabled: true,
                        direction: dir.id,
                      })
                    }
                    className={`border-r border-[#E3E1DC] py-1.5 text-[11px] whitespace-nowrap transition-colors last:border-r-0 ${
                      active
                        ? 'bg-white font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:bg-white/60 hover:text-[#161616]'
                    }`}
                  >
                    {dir.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-[#686662]">Softness</span>
              <span className="tabular-nums text-[#161616]">{bodyGradient.softness}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={bodyGradient.softness}
              onChange={(e) =>
                onChangeBodyGradient({
                  ...bodyGradient,
                  enabled: true,
                  softness: parseInt(e.target.value, 10),
                })
              }
              className="studio-slider"
            />
          </div>

          <p className="text-[10px] text-[#7A7771]">
            Applies smooth ombre transition across Body panels only.
          </p>
        </div>
      )}

      {/* "More" Link Revealing Synced RGB & HSL Fields + From Logo Colours */}
      <div className="border-t border-[#ECEAE4] pt-2">
        <button
          type="button"
          onClick={() => setShowMore((prev) => !prev)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5F5D59] transition-colors hover:text-[#1F4D3A]"
        >
          <span>More</span>
          {showMore ? (
            <ChevronUp className="h-3 w-3 stroke-[1.7]" />
          ) : (
            <ChevronDown className="h-3 w-3 stroke-[1.7]" />
          )}
        </button>

        {showMore && (
          <div className="mt-2.5 space-y-2.5">
            {/* RGB Fields */}
            <div>
              <span className="mb-1 block text-[10px] font-medium text-[#7A7771]">RGB</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['r', 'g', 'b'] as const).map((ch) => (
                  <label
                    key={ch}
                    className="flex items-center rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] px-2 py-1 focus-within:border-[#1F4D3A]"
                  >
                    <span className="mr-1 text-[10px] uppercase text-[#7A7771]">{ch}</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={rgb[ch]}
                      onChange={(e) => handleRgbField(ch, e.target.value)}
                      className="w-full bg-transparent text-right text-[11px] tabular-nums text-[#161616] focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* HSL Fields */}
            <div>
              <span className="mb-1 block text-[10px] font-medium text-[#7A7771]">HSL</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { ch: 'h', label: 'H', max: 360 },
                    { ch: 's', label: 'S', max: 100 },
                    { ch: 'l', label: 'L', max: 100 },
                  ] as const
                ).map((item) => (
                  <label
                    key={item.ch}
                    className="flex items-center rounded-[10px] border border-[#DDDAD4] bg-[#FAF8F4] px-2 py-1 focus-within:border-[#1F4D3A]"
                  >
                    <span className="mr-1 text-[10px] text-[#7A7771]">{item.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={item.max}
                      value={hsl[item.ch]}
                      onChange={(e) => handleHslField(item.ch, e.target.value)}
                      className="w-full bg-transparent text-right text-[11px] tabular-nums text-[#161616] focus:outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* From Uploaded Logo Colours */}
            <div className="border-t border-[#F0EDE7] pt-2">
              <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-[#686662]">
                <Sparkles className="h-3 w-3 stroke-[1.6] text-[#C9A24B]" />
                <span>From logo</span>
              </div>
              {logoColors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {logoColors.map((hex) => {
                    const selected = hex.toUpperCase() === currentHex;
                    return (
                      <button
                        key={hex}
                        type="button"
                        title={`Use logo colour ${hex}`}
                        onClick={() => applyHexToActiveTarget(hex, true)}
                        className={`h-6 w-6 rounded-full transition-all duration-150 ${
                          selected
                            ? 'scale-105 ring-2 ring-[#C9A24B] ring-offset-1'
                            : 'hover:-translate-y-0.5 hover:scale-105'
                        }`}
                        style={{
                          backgroundColor: hex,
                          boxShadow: isLightHex(hex)
                            ? 'inset 0 0 0 1px rgba(22,22,22,0.22)'
                            : 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-[#8E8B84]">
                  Upload a logo in Artwork to pull its brand colours automatically.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
