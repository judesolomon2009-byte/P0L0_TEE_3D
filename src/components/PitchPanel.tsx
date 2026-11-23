import React from 'react';
import { Download, RotateCcw } from 'lucide-react';
import type { PreviewBg, QuoteState, SheetBg } from '../types';

interface PitchPanelProps {
  quote: QuoteState;
  previewBg: PreviewBg;
  sheetBg: SheetBg;
  isExporting: boolean;
  onQuoteChange: (patch: Partial<QuoteState>) => void;
  onPreviewBgChange: (bg: PreviewBg) => void;
  onSheetBgChange: (bg: SheetBg) => void;
  onDownloadPreview: () => void;
  onDownloadFourView: () => void;
  onReset: () => void;
}

export const PitchPanel: React.FC<PitchPanelProps> = ({
  quote,
  previewBg,
  sheetBg,
  isExporting,
  onQuoteChange,
  onPreviewBgChange,
  onSheetBgChange,
  onDownloadPreview,
  onDownloadFourView,
  onReset,
}) => {
  const qty = parseInt(quote.quantity, 10);
  const rate = parseFloat(quote.pricePerPiece);
  const hasTotal = Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate > 0;
  const total = hasTotal ? qty * rate : 0;

  const formattedTotal = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(total);

  return (
    <div className="space-y-7">
      {/* Quote Estimate */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[#161616]">Quote estimate</span>
          </div>
          <span className="text-[11px] text-[#7A7771]">Optional</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="quote-qty"
              className="mb-1.5 block text-[11px] text-[#686662]"
            >
              Quantity
            </label>
            <input
              id="quote-qty"
              type="number"
              min={1}
              inputMode="numeric"
              value={quote.quantity}
              onChange={(e) => onQuoteChange({ quantity: e.target.value })}
              placeholder="50"
              className="w-full rounded-[10px] border border-[#DDDAD4] bg-white px-3 py-2 text-[12px] tabular-nums text-[#161616] placeholder:text-[#A8A59E] focus:border-[#1F4D3A] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="quote-price"
              className="mb-1.5 block text-[11px] text-[#686662]"
            >
              Price per piece (₹)
            </label>
            <input
              id="quote-price"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={quote.pricePerPiece}
              onChange={(e) => onQuoteChange({ pricePerPiece: e.target.value })}
              placeholder="650"
              className="w-full rounded-[10px] border border-[#DDDAD4] bg-white px-3 py-2 text-[12px] tabular-nums text-[#161616] placeholder:text-[#A8A59E] focus:border-[#1F4D3A] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-[#E6E3DC] pt-3">
          <span className="text-[11px] text-[#686662]">Estimated total</span>
          <span className="text-[15px] font-semibold tabular-nums text-[#161616]">
            {hasTotal ? `₹${formattedTotal}` : '—'}
          </span>
        </div>
        <p className="text-[11px] text-[#7A7771]">
          Appears automatically on the 4-view spec sheet when filled in.
        </p>
      </div>

      {/* Exports */}
      <div className="space-y-5 border-t border-[#E6E3DC] pt-6">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden="true" />
          <span className="text-[12px] font-medium text-[#161616]">Client exports</span>
        </div>

        {/* 4-View Sheet Primary CTA — Filled Deep Emerald with Warm Gold Hover */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#686662]">Sheet backdrop</span>
            <div className="inline-flex overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB]">
              {(['backdrop', 'white'] as SheetBg[]).map((bg) => {
                const active = sheetBg === bg;
                return (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => onSheetBgChange(bg)}
                    className={`border-r border-[#E3E1DC] px-2.5 py-1 text-[11px] capitalize transition-colors last:border-r-0 ${
                      active
                        ? 'bg-white font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:text-[#161616]'
                    }`}
                  >
                    {bg === 'backdrop' ? 'Theme' : 'White'}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={onDownloadFourView}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#1F4D3A] px-4 py-3 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-[#C9A24B] hover:text-[#161616] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 stroke-[1.7]" />
            <span>{isExporting ? 'Rendering views...' : 'Download 4-view sheet'}</span>
          </button>
          <p className="text-[11px] leading-relaxed text-[#686662]">
            Front, back, left and right views on flat backdrop with client name, date, part names and hex codes.
          </p>
        </div>

        {/* Single View Preview PNG */}
        <div className="space-y-2.5 border-t border-[#ECEAE4] pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#686662]">Preview background</span>
            <div className="inline-flex overflow-hidden rounded-[10px] border border-[#E3E1DC] bg-[#F2F0EB]">
              {(['backdrop', 'white', 'transparent'] as PreviewBg[]).map((bg) => {
                const active = previewBg === bg;
                return (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => onPreviewBgChange(bg)}
                    className={`border-r border-[#E3E1DC] px-2.5 py-1 text-[11px] capitalize transition-colors last:border-r-0 ${
                      active
                        ? 'bg-white font-medium text-[#1F4D3A]'
                        : 'text-[#686662] hover:text-[#161616]'
                    }`}
                  >
                    {bg === 'backdrop' ? 'Theme' : bg}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={onDownloadPreview}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#1F4D3A] bg-white px-4 py-2.5 text-[12px] font-medium text-[#1F4D3A] transition-colors duration-200 hover:border-[#C9A24B] hover:bg-[#FAF8F4] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 stroke-[1.6]" />
            <span>Download preview</span>
          </button>
        </div>
      </div>

      {/* Reset */}
      <div className="border-t border-[#E6E3DC] pt-5">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#686662] transition-colors hover:text-[#161616]"
        >
          <RotateCcw className="h-3.5 w-3.5 stroke-[1.5]" />
          <span>Reset colours, artwork &amp; quote</span>
        </button>
      </div>
    </div>
  );
};
