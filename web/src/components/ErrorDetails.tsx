import { useTranslation } from 'react-i18next';
import { getApiErrorDetails } from '@/lib/apiError';

export function ErrorDetails({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const details = getApiErrorDetails(error);
  if (!details) return null;
  return <details style={{ fontSize: 12, marginTop: 8, overflowWrap: 'anywhere' }}>
    <summary>{t('common.diagnosticDetails')}</summary>
    <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{details}</p>
  </details>;
}
