import { useTranslation } from 'react-i18next';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import type { Template } from '@/api';
import { templateCandidateIds, sameTemplateAspect, type LibraryConfig } from '@/lib/taskConfig';
export type TemplateSelection = Pick<LibraryConfig, 'templateId' | 'templateMode' | 'templateIds' | 'avoidRepeat'>;

export function TaskTemplatePicker({ config, templates, onChange }: { config: TemplateSelection; templates: Template[]; onChange: (updates: Partial<TemplateSelection>) => void }) {
  const { t } = useTranslation();
  const ids = templateCandidateIds(config);
  const random = config.templateMode === 'random';
  const anchor = templates.find(template => template.id === ids[0]);
  const missing = ids.filter(id => !templates.some(template => template.id === id));
  return <div className="task-template-picker">
    <div className="segmented" role="group" aria-label={t('taskWizard.templateMode')}>
      <button type="button" aria-pressed={!random} onClick={() => onChange({ templateMode: 'fixed' })}>{t('taskWizard.fixedTemplate')}</button>
      <button type="button" aria-pressed={random} onClick={() => onChange({ templateMode: 'random', templateIds: config.templateIds?.length ? config.templateIds : config.templateId ? [config.templateId] : [], avoidRepeat: config.avoidRepeat !== false })}>{t('taskWizard.randomTemplates')}</button>
    </div>
    {!random ? <label className="studio-field">{t('taskWizard.coverTemplate')}<select className="studio-input" value={config.templateId} onChange={event => onChange({ templateId: event.target.value })}>
      <option value="">{t('taskWizard.selectTemplate')}</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label> : <>
      <p className="studio-muted">{t('taskWizard.poolHint')}</p>
      <div className="task-template-pool" role="group" aria-label={t('taskWizard.candidateTemplates')}>
        {templates.filter(template => !anchor || sameTemplateAspect(template, anchor) || ids.includes(template.id)).map(template => <label key={template.id} className={`task-template-option ${ids.includes(template.id) ? 'selected' : ''}`}>
          <AuthenticatedImage src={`/templates/${template.id}/thumbnail`} refreshKey={template.updatedAt} alt={template.name} fallback={<div className="task-template-no-image">{template.width} × {template.height}</div>} />
          <span><input type="checkbox" checked={ids.includes(template.id)} disabled={ids.length >= 50 && !ids.includes(template.id)} onChange={event => onChange({ templateIds: event.target.checked ? [...ids, template.id] : ids.filter(id => id !== template.id) })} />{template.name}</span>
        </label>)}
      </div>
      <p className="studio-muted">{t('taskWizard.poolCount', { count: ids.length })}</p>
      {missing.map(id => <p key={id} className="studio-error">{t('taskWizard.missingCandidate', { id })} <button type="button" className="studio-secondary" onClick={() => onChange({ templateIds: ids.filter(item => item !== id) })}>{t('common.delete')}</button></p>)}
      <label className="task-enable-schedule"><input type="checkbox" checked={config.avoidRepeat !== false} onChange={event => onChange({ avoidRepeat: event.target.checked })} />{t('taskWizard.avoidRepeat')}</label>
    </>}
  </div>;
}
