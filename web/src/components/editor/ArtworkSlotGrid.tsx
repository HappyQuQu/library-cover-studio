import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { bundledArtworkSamples, maxArtworkSlots } from '@/lib/posters';

export function ArtworkSlotGrid({ renderSlot, activeSlot = 0 }: {
  renderSlot: (slot: number) => ReactNode;
  activeSlot?: number;
}) {
  const { t } = useTranslation();
  const firstExtra = bundledArtworkSamples + 1;
  const extraActive = activeSlot > bundledArtworkSamples;

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: bundledArtworkSamples }, (_, index) => renderSlot(index + 1))}
      </div>
      <details key={String(extraActive)} open={extraActive} className="mt-2">
        <summary className="cursor-pointer rounded-lg px-2 py-2 text-xs text-(--text-secondary) hover:bg-(--bg-tertiary) focus-visible:outline-2 focus-visible:outline-(--primary)">
          {t('designer.moreArtworkSlots', { first: firstExtra, last: maxArtworkSlots })}
        </summary>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {Array.from({ length: maxArtworkSlots - bundledArtworkSamples }, (_, index) => renderSlot(firstExtra + index))}
        </div>
      </details>
    </>
  );
}
