import React, { useEffect, useState } from 'react';
import type { BackdropThemeId } from '../types';
import { getBackdropTheme } from '../data/palette';
import {
  blendHex,
  computeAdaptiveBackdropTints,
  getPerceivedLuminance,
  shiftHexLightness,
} from '../utils/colorUtils';

interface StudioBackdropProps {
  themeId: BackdropThemeId;
  bodyHex: string;
  wordmark: string;
  trueColourMode: boolean;
  parallaxOffset: { x: number; y: number };
}

// Subtle procedural film grain SVG data URI (no external assets)
const FILM_GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`;

export const StudioBackdrop: React.FC<StudioBackdropProps> = ({
  themeId,
  bodyHex,
  wordmark,
  trueColourMode,
  parallaxOffset,
}) => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) setReducedMotion(mq.matches);
  }, []);

  const theme = getBackdropTheme(trueColourMode ? 'studio' : themeId);

  // Auto-adapt contrast for very light or very dark garments
  let contrastShift = 0;
  if (!trueColourMode) {
    const lum = getPerceivedLuminance(bodyHex);
    if (lum > 0.78) {
      contrastShift = theme.isDark ? 0 : -6;
    } else if (lum < 0.18) {
      contrastShift = theme.isDark ? 7 : 3;
    }
  }

  const baseCenter = shiftHexLightness(theme.centerHex, contrastShift);
  const baseEdge = shiftHexLightness(theme.edgeHex, contrastShift);

  // Low-saturation (15-20%) analogous tint from the active body colour, easing smoothly over 600ms
  const adaptive = computeAdaptiveBackdropTints(bodyHex, theme.isDark);
  const tintedCenter = trueColourMode
    ? '#EFEFED'
    : blendHex(baseCenter, adaptive.glowTint, theme.isDark ? 0.24 : 0.34);
  const tintedEdge = trueColourMode
    ? '#EFEFED'
    : blendHex(baseEdge, adaptive.glowTint, theme.isDark ? 0.16 : 0.2);

  const px = reducedMotion ? 0 : parallaxOffset.x * 14;
  const py = reducedMotion ? 0 : parallaxOffset.y * 8;

  // Compute exact SVG viewBox so the FULL wordmark ALWAYS fits cleanly inside the viewer width with zero clipping
  const cleanWord = ((wordmark || 'HALVORA').trim() || 'HALVORA').toUpperCase();
  const charCount = Math.max(cleanWord.length, 3);
  const letterSpacingPx = 30;
  const glyphAvgWidth = 84;
  const vbWidth = Math.round(charCount * (glyphAvgWidth + letterSpacingPx) + 120);
  const vbHeight = 160;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{
        backgroundColor: tintedEdge,
        transition: 'background-color 600ms ease',
      }}
    >
      {/* Adaptive Radial Studio Glow behind shirt (600ms smooth transition) */}
      <div
        className="absolute inset-0"
        style={{
          background: trueColourMode
            ? '#EFEFED'
            : `radial-gradient(circle at 50% 46%, ${tintedCenter} 0%, ${tintedEdge} 78%)`,
          transition: 'opacity 600ms ease, background 600ms ease',
        }}
      />

      {/* Two large soft-blurred drifting colour orbs (~60s gentle cycle: shirt tint + warm complementary tone) */}
      {!trueColourMode && (
        <>
          <div
            className={reducedMotion ? 'absolute rounded-full' : 'animate-orb-a absolute rounded-full'}
            style={{
              width: '56%',
              height: '56%',
              top: '6%',
              left: '8%',
              background: `radial-gradient(circle, ${adaptive.orbPrimary} 0%, transparent 70%)`,
              filter: 'blur(72px)',
              opacity: theme.isDark ? 0.26 : 0.42,
              transition: 'background 600ms ease, opacity 600ms ease',
            }}
          />
          <div
            className={reducedMotion ? 'absolute rounded-full' : 'animate-orb-b absolute rounded-full'}
            style={{
              width: '52%',
              height: '52%',
              bottom: '4%',
              right: '6%',
              background: `radial-gradient(circle, ${adaptive.orbWarm} 0%, transparent 70%)`,
              filter: 'blur(78px)',
              opacity: theme.isDark ? 0.22 : 0.36,
              transition: 'background 600ms ease, opacity 600ms ease',
            }}
          />
        </>
      )}

      {/* Full-width auto-fitted editorial wordmark (never clipped at any viewport width) with gentle mouse parallax */}
      {!trueColourMode && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6 md:px-12"
          style={{
            transform: `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`,
            transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <svg
            viewBox={`0 0 ${vbWidth} ${vbHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-auto w-[86%] max-w-[920px]"
            style={{
              opacity: theme.isDark ? 0.048 : 0.04,
              transition: 'opacity 600ms ease',
            }}
          >
            <text
              x={vbWidth / 2}
              y={vbHeight / 2 + 6}
              textAnchor="middle"
              dominantBaseline="central"
              fill={theme.isDark ? '#FFFFFF' : '#161616'}
              fontFamily="Inter, -apple-system, BlinkMacSystemFont, sans-serif"
              fontSize="112"
              fontWeight="600"
              letterSpacing={`${letterSpacingPx}px`}
              style={{ transition: 'fill 600ms ease' }}
            >
              {cleanWord}
            </text>
          </svg>
        </div>
      )}

      {/* Subtle Film Grain Overlay (3.5% opacity) */}
      {!trueColourMode && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: FILM_GRAIN_SVG,
            backgroundRepeat: 'repeat',
            backgroundSize: '180px 180px',
            opacity: theme.isDark ? 0.04 : 0.035,
            mixBlendMode: theme.isDark ? 'screen' : 'multiply',
            transition: 'opacity 600ms ease',
          }}
        />
      )}
    </div>
  );
};
