import React from 'react';
import { X } from 'lucide-react';
import type { ColourGroup, SelectedMeshInfo } from '../types';
import { COLOUR_GROUPS, COLOUR_GROUP_LABELS } from '../data/palette';

interface SelectedPartBarProps {
  selected: SelectedMeshInfo;
  onReassign: (entryId: string, group: ColourGroup) => void;
  onClose: () => void;
}

export const SelectedPartBar: React.FC<SelectedPartBarProps> = ({
  selected,
  onReassign,
  onClose,
}) => {
  return (
    <div className="pointer-events-auto rounded-[10px] border border-[#E3E1DC] bg-[#FAF8F4] px-3.5 py-3 shadow-[0_6px_20px_rgba(22,22,22,0.06)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-[#686662]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C9A24B]" aria-hidden="true" />
          <span className="font-medium text-[#161616]">{selected.meshName}</span>
          <span aria-hidden="true">·</span>
          <span>Material: {selected.materialName}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear part selection"
          className="text-[#686662] transition-colors hover:text-[#161616]"
        >
          <X className="h-3.5 w-3.5 stroke-[1.5]" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-[#7A7771]">Assign to:</span>
        {COLOUR_GROUPS.map((group) => {
          const active = selected.group === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onReassign(selected.id, group)}
              className={`rounded-[8px] border px-2 py-1 text-[11px] whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#1F4D3A] bg-[#1F4D3A] font-medium text-white'
                  : 'border-[#DDDAD4] bg-white text-[#686662] hover:border-[#C9A24B] hover:text-[#161616]'
              }`}
            >
              {COLOUR_GROUP_LABELS[group]}
            </button>
          );
        })}
      </div>
    </div>
  );
};
