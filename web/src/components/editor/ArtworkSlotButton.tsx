import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ArtworkSlotButtonProps {
  number: number;
  src: string | null;
  landscape: boolean;
  action: 'add' | 'bind';
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** A numbered movie slot, with a real thumbnail when one is available. */
export function ArtworkSlotButton({ number, src, landscape, action, active = false, disabled, onClick }: ArtworkSlotButtonProps) {
  const { t } = useTranslation();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasPreview = !!src && failedSrc !== src;
  const label = t('designer.artworkSlotNumber', { number });

  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={t(action === 'add' ? 'designer.addArtworkSlot' : 'designer.bindArtworkSlot', { number })}
      aria-pressed={action === 'bind' ? active : undefined}
      title={t(action === 'add' ? 'designer.addArtworkSlot' : 'designer.bindArtworkSlot', { number })}
      className={cn('group relative overflow-hidden rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-primary) disabled:opacity-50 disabled:cursor-not-allowed',
        landscape ? 'aspect-video' : 'aspect-[2/3]',
        active ? 'border-(--primary) ring-1 ring-(--primary)' : 'border-(--border-color) hover:border-(--primary)',
        !hasPreview && 'bg-(--bg-secondary) hover:bg-(--bg-tertiary)')}
    >
      {hasPreview ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailedSrc(src)} />
        : <div className="absolute inset-0 flex items-center justify-center pb-3 text-xl font-semibold tabular-nums text-(--text-tertiary)" aria-hidden="true">{String(number).padStart(2, '0')}</div>}
      <span className={cn('absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] font-medium',
        hasPreview ? 'bg-linear-to-t from-black/85 to-black/45 text-white' : 'text-(--text-secondary)')}>
        <span>{label}</span>
        {active ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : action === 'add' && <Plus className="h-3 w-3 shrink-0" aria-hidden="true" />}
      </span>
    </button>
  );
}
