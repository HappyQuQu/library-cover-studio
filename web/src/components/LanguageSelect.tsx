import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languagePreferences } from '@/lib/i18n';
import { normalizeLanguage } from '@/lib/language';

export function LanguageSelect({ showHint = false, compact = false }: { showHint?: boolean; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'storage' | 'error' | null>(null);
  const detailId = id + '-detail';

  const change = async (value: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await languagePreferences.setLanguage(value);
      if (!result.persisted) setNotice('storage');
    } catch {
      setNotice('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-language-control style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label htmlFor={id} className={compact ? 'sr-only' : undefined} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('common.language')}</label>
        <select
          id={id}
          className="input"
          style={{ width: 'auto', minWidth: compact ? 112 : 140, ...(compact ? { fontSize: 12, padding: '6px 10px', height: 32 } : {}) }}
          value={normalizeLanguage(i18n.resolvedLanguage)}
          disabled={busy}
          aria-busy={busy}
          aria-describedby={showHint || notice ? detailId : undefined}
          onChange={event => void change(event.target.value)}
        >
          <option value="zh-CN" lang="zh-CN">简体中文</option>
          <option value="en-US" lang="en-US">English</option>
        </select>
      </div>
      {(showHint || notice) && <p id={detailId} role={notice ? 'status' : undefined} style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
        {notice === 'error' ? t('settings.languageChangeFailed') : notice === 'storage' ? t('settings.languageStorageUnavailable') : t('settings.languageHint')}
      </p>}
    </div>
  );
}
