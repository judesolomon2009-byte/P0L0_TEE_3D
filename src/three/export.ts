import type {
  BackdropThemeId,
  BodyGradientConfig,
  ColourGroup,
  PartColours,
  PreviewBg,
  QuoteState,
  SheetBg,
  StitchConfig,
} from '../types';
import { COLOUR_GROUP_LABELS, getBackdropTheme } from '../data/palette';
import { getNearestColourName } from '../utils/colorUtils';

export interface PreviewExportOptions {
  background: PreviewBg;
  backdropTheme: BackdropThemeId;
  clientName: string;
  wordmark: string;
}

export interface FourViewExportOptions {
  wordmark: string;
  clientName: string;
  partColours: PartColours;
  bodyGradient?: BodyGradientConfig;
  showPocket: boolean;
  hasPocketMesh: boolean;
  hasPlacketMesh: boolean;
  stitchConfig: StitchConfig;
  sheetBg: SheetBg;
  backdropTheme: BackdropThemeId;
  quote: QuoteState;
}

export interface ViewerExportAdapter {
  captureCurrentView: (
    background: PreviewBg,
    backdropFlatHex: string,
    width: number,
    height: number
  ) => HTMLCanvasElement;
  capturePresetView: (
    preset: 'front' | 'back' | 'left' | 'right',
    flatBgHex: string,
    width: number,
    height: number
  ) => HTMLCanvasElement;
}

function triggerPngDownload(canvas: HTMLCanvasElement, fileName: string): void {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function sanitizeSlug(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'uniform'
  );
}

export function downloadCurrentPreview(
  adapter: ViewerExportAdapter,
  options: PreviewExportOptions
): void {
  const theme = getBackdropTheme(options.backdropTheme);
  const captured = adapter.captureCurrentView(
    options.background,
    theme.flatExportHex,
    1800,
    1800
  );
  const slug = sanitizeSlug(options.clientName || options.wordmark || 'polo');
  const bgTag =
    options.background === 'backdrop' ? theme.id : options.background;
  triggerPngDownload(captured, `${slug}-polo-preview-${bgTag}.png`);
}

export function downloadFourViewSheet(
  adapter: ViewerExportAdapter,
  options: FourViewExportOptions
): void {
  const sheetW = 2400;
  const sheetH = 1800;

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d')!;

  const theme = getBackdropTheme(options.backdropTheme);
  const frameBgHex =
    options.sheetBg === 'white' ? '#FFFFFF' : theme.flatExportHex;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const marginX = 96;
  const headerH = 146;

  // Header Wordmark + subtle gold dot
  const brandTitle = (options.wordmark || 'HALVORA').toUpperCase();
  ctx.fillStyle = '#161616';
  ctx.font = '600 32px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(brandTitle, marginX, 74);
  const brandW = ctx.measureText(brandTitle).width;
  ctx.fillStyle = '#C9A24B';
  ctx.beginPath();
  ctx.arc(marginX + brandW + 10, 81, 4.5, 0, Math.PI * 2);
  ctx.fill();

  const formattedDate = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  ctx.textAlign = 'right';
  if (options.clientName.trim()) {
    ctx.fillStyle = '#161616';
    ctx.font = '500 26px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(options.clientName.trim(), sheetW - marginX, 60);
    ctx.fillStyle = '#6E6C67';
    ctx.font = '400 20px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Uniform Specification  ·  ${formattedDate}`, sheetW - marginX, 96);
  } else {
    ctx.fillStyle = '#6E6C67';
    ctx.font = '400 22px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`Uniform Specification  ·  ${formattedDate}`, sheetW - marginX, 74);
  }

  ctx.strokeStyle = '#E5E3DE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, headerH);
  ctx.lineTo(sheetW - marginX, headerH);
  ctx.stroke();

  // 4-View Studio Grid
  const views: Array<{ key: 'front' | 'back' | 'left' | 'right'; label: string }> = [
    { key: 'front', label: 'Front' },
    { key: 'back', label: 'Back' },
    { key: 'left', label: 'Left Sleeve' },
    { key: 'right', label: 'Right Sleeve' },
  ];

  const gridTop = headerH + 52;
  const gap = 32;
  const usableW = sheetW - marginX * 2;
  const cellW = Math.floor((usableW - gap * 3) / 4);
  const cellH = 1020;

  views.forEach((v, idx) => {
    const x = marginX + idx * (cellW + gap);
    const y = gridTop;

    ctx.fillStyle = frameBgHex;
    ctx.fillRect(x, y, cellW, cellH);

    const viewCanvas = adapter.capturePresetView(v.key, frameBgHex, cellW * 2, cellH * 2);
    ctx.drawImage(viewCanvas, x, y, cellW, cellH);

    ctx.strokeStyle = '#E5E3DE';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, cellW - 1.5, cellH - 1.5);

    ctx.fillStyle = '#5F5D59';
    ctx.font = '500 21px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(v.label, x + 2, y + cellH + 18);
  });

  // Footer Section: Colours + Quote
  const footerTop = gridTop + cellH + 74;
  ctx.strokeStyle = '#E5E3DE';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(marginX, footerTop);
  ctx.lineTo(sheetW - marginX, footerTop);
  ctx.stroke();

  const specY = footerTop + 42;

  ctx.fillStyle = '#6E6C67';
  ctx.font = '500 18px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('COLOUR SPECIFICATION', marginX, specY);

  interface SpecChip {
    label: string;
    name: string;
    subtitle: string;
    hex: string;
    gradientEnd?: string;
  }

  const specItems: SpecChip[] = [];
  const activeGroups: ColourGroup[] = ['body', 'sleeves', 'collar'];
  if (options.hasPlacketMesh) activeGroups.push('placket');
  activeGroups.push('buttons');
  if (options.showPocket && options.hasPocketMesh) activeGroups.push('pocket');

  const grad = options.bodyGradient;
  activeGroups.forEach((g) => {
    if (g === 'body' && grad?.enabled) {
      const startHex = grad.colorStart.toUpperCase();
      const endHex = grad.colorEnd.toUpperCase();
      const dirLabel =
        grad.direction.charAt(0).toUpperCase() + grad.direction.slice(1);
      specItems.push({
        label: `Body (${dirLabel})`,
        name: 'Ombre Gradient',
        subtitle: `${startHex} → ${endHex}`,
        hex: startHex,
        gradientEnd: endHex,
      });
    } else {
      const hex = options.partColours[g].toUpperCase();
      specItems.push({
        label: COLOUR_GROUP_LABELS[g],
        name: getNearestColourName(hex),
        subtitle: hex,
        hex,
      });
    }
  });

  if (options.stitchConfig.contrastEnabled) {
    const hex = options.stitchConfig.color.toUpperCase();
    specItems.push({
      label: 'Stitching',
      name: getNearestColourName(hex),
      subtitle: hex,
      hex,
    });
  }

  const qty = parseInt(options.quote.quantity, 10);
  const rate = parseFloat(options.quote.pricePerPiece);
  const hasQuote = Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate > 0;

  const swatchesAreaW = hasQuote ? usableW * 0.68 : usableW;
  const colsPerRow = Math.min(specItems.length, hasQuote ? 4 : 6);
  const colStep = swatchesAreaW / colsPerRow;
  const rowBaseY = specY + 42;

  specItems.forEach((item, i) => {
    const colIdx = i % colsPerRow;
    const rowIdx = Math.floor(i / colsPerRow);
    const sx = marginX + colIdx * colStep;
    const sy = rowBaseY + rowIdx * 96;

    ctx.beginPath();
    ctx.arc(sx + 18, sy + 24, 18, 0, Math.PI * 2);
    if (item.gradientEnd) {
      const chipGrad = ctx.createLinearGradient(sx, sy + 6, sx + 36, sy + 42);
      chipGrad.addColorStop(0, item.hex);
      chipGrad.addColorStop(1, item.gradientEnd);
      ctx.fillStyle = chipGrad;
    } else {
      ctx.fillStyle = item.hex;
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(22, 22, 22, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#6E6C67';
    ctx.font = '500 17px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(item.label, sx + 48, sy);

    ctx.fillStyle = '#161616';
    ctx.font = '600 20px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(item.name, sx + 48, sy + 22);

    ctx.fillStyle = '#6E6C67';
    ctx.font = '400 16px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(item.subtitle, sx + 48, sy + 48);
  });

  if (hasQuote) {
    const total = qty * rate;
    const formatINR = (val: number) =>
      `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(val)}`;

    const quoteX = marginX + swatchesAreaW + 44;
    ctx.strokeStyle = '#E5E3DE';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(quoteX - 22, specY);
    ctx.lineTo(quoteX - 22, specY + 150);
    ctx.stroke();

    ctx.fillStyle = '#6E6C67';
    ctx.font = '500 18px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ESTIMATED QUOTE', quoteX, specY);

    ctx.fillStyle = '#161616';
    ctx.font = '400 21px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(
      `${new Intl.NumberFormat('en-IN').format(qty)} pcs  ×  ${formatINR(rate)} / pc`,
      quoteX,
      specY + 42
    );

    ctx.fillStyle = '#161616';
    ctx.font = '600 34px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(formatINR(total), quoteX, specY + 80);

    ctx.fillStyle = '#8C8982';
    ctx.font = '400 16px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Excl. taxes & shipping', quoteX, specY + 126);
  }

  ctx.fillStyle = '#9B9891';
  ctx.font = '400 16px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `${brandTitle}  ·  Polo Uniform Specification`,
    marginX,
    sheetH - 36
  );

  const slug = sanitizeSlug(options.clientName || options.wordmark || 'polo');
  triggerPngDownload(canvas, `${slug}-4view-spec-sheet.png`);
}
