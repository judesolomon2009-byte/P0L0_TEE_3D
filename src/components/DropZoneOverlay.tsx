import React, { useRef, useState } from 'react';
import { Upload, ArrowRight, X } from 'lucide-react';

interface DropZoneOverlayProps {
  isLoading: boolean;
  progress: number;
  error: string | null;
  canCancel: boolean;
  onSelectFile: (file: File) => void;
  onLoadUrl: (url: string) => void;
  onLoadProceduralDemo: () => void;
  onCancel: () => void;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({
  isLoading,
  progress,
  error,
  canCancel,
  onSelectFile,
  onLoadUrl,
  onLoadProceduralDemo,
  onCancel,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onSelectFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
      e.target.value = '';
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoading) return;
    onLoadUrl(urlInput.trim());
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#F4F3F0] px-6">
      <div className="w-full max-w-[440px]">
        {canCancel && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 text-[12px] text-[#686662] transition-colors hover:text-[#161616] disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5 stroke-[1.5]" />
              <span>Cancel</span>
            </button>
          </div>
        )}

        {/* Main GLB Drop Zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isLoading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isLoading) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`group relative flex cursor-pointer flex-col items-center justify-center border border-dashed px-8 py-14 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1E4738] ${
            isDragOver
              ? 'border-[#1E4738] bg-[#EDF3F0]'
              : 'border-[#CFCBC2] bg-[#FAF9F7] hover:border-[#161616]'
          } ${isLoading ? 'pointer-events-none opacity-80' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={handleFileChange}
            className="hidden"
          />

          <Upload className="mb-4 h-5 w-5 stroke-[1.4] text-[#686662] transition-colors group-hover:text-[#161616]" />

          <p className="text-[14px] font-medium tracking-[-0.01em] text-[#161616]">
            Drop your polo .glb here or click to choose
          </p>
          <p className="mt-1.5 text-[12px] text-[#686662]">
            Saved locally in your browser for future sessions
          </p>

          {/* Thin progress line (no spinner) */}
          {isLoading && (
            <div className="absolute right-0 bottom-0 left-0 h-[2px] overflow-hidden bg-[#E3E1DC]">
              <div
                className="h-full bg-[#1E4738] transition-all duration-150 ease-out"
                style={{ width: `${Math.max(8, Math.round(progress * 100))}%` }}
              />
            </div>
          )}
        </div>

        {/* Direct URL Input */}
        <form onSubmit={handleUrlSubmit} className="mt-6">
          <label
            htmlFor="model-url-input"
            className="block text-[11px] font-medium text-[#686662]"
          >
            Or paste a model link
          </label>
          <div className="mt-2 flex items-center border border-[#DDDAD4] bg-[#FAF9F7] focus-within:border-[#1E4738]">
            <input
              id="model-url-input"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/polo.glb"
              disabled={isLoading}
              className="w-full bg-transparent px-3 py-2.5 text-[12px] text-[#161616] placeholder:text-[#9C9992] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !urlInput.trim()}
              aria-label="Load model from link"
              className="flex h-9 w-9 shrink-0 items-center justify-center border-l border-[#DDDAD4] text-[#161616] transition-colors hover:bg-[#161616] hover:text-white disabled:cursor-not-allowed disabled:text-[#A8A59E] disabled:hover:bg-transparent"
            >
              <ArrowRight className="h-3.5 w-3.5 stroke-[1.6]" />
            </button>
          </div>
        </form>

        {/* Inline Error */}
        {error && (
          <p className="mt-3 text-[12px] leading-relaxed text-[#9E2A2B]" role="alert">
            {error}
          </p>
        )}

        {/* Discreet procedural demo preview option */}
        <div className="mt-7 flex items-center justify-between border-t border-[#E3E1DC] pt-4 text-[12px] text-[#686662]">
          <span>No .glb on hand?</span>
          <button
            type="button"
            disabled={isLoading}
            onClick={onLoadProceduralDemo}
            className="font-medium text-[#161616] underline decoration-[#CFCBC2] underline-offset-4 transition-colors hover:text-[#1E4738] hover:decoration-[#1E4738] disabled:opacity-40"
          >
            Preview with studio polo
          </button>
        </div>
      </div>
    </div>
  );
};
