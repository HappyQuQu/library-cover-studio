import { useTranslation } from 'react-i18next';
import { ExternalLink, Github, Heart, Layers, Palette, Store, Zap } from 'lucide-react';
import { AUTHOR_URL, PROJECT_URL } from '@/api/system';
import { VersionStatus } from '@/components/VersionStatus';
import { useThemeStore } from '@/stores/themeStore';

export function AboutPage() {
  const { t } = useTranslation();
  const resolvedMode = useThemeStore(state => state.resolvedMode);
  return (
    <div className="system-page">
      <div className="system-page-heading"><h1>{t('about.title')}</h1><p>{t('about.description')}</p></div>
      <section className="card about-intro">
        <img src={resolvedMode === 'light' ? '/logo-l.png' : '/logo-d.png'} alt="CoverStudio" className="w-16 h-16 object-contain" />
        <div><h2>Library Cover Studio</h2><p>{t('about.intro')}</p></div>
      </section>
      <div className="about-features">
        {[{ icon: Palette, title: t('about.design'), text: t('about.designHint') },
          { icon: Layers, title: t('about.share'), text: t('about.shareHint') },
          { icon: Zap, title: t('about.automate'), text: t('about.automateHint') }].map(({ icon: Icon, title, text }) => (
          <div className="card about-feature" key={title}><Icon className="w-5 h-5 text-(--primary)" /><h3>{title}</h3><p>{text}</p></div>
        ))}
      </div>
      <VersionStatus showHistoryLink />
      <section className="card about-project">
        <div><h2><Github className="w-5 h-5" />{t('about.openSource')}</h2><p>{t('about.maintainer')}</p></div>
        <div className="about-links">
          <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer"><Github className="w-5 h-5" /><span><strong>HappyQuQu</strong><small>{t('about.authorGithub')}</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer"><Layers className="w-5 h-5" /><span><strong>{t('about.source')}</strong><small>library-cover-studio</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href="https://github.com/HappyQuQu/library-cover-store" target="_blank" rel="noopener noreferrer"><Store className="w-5 h-5" /><span><strong>{t('about.storeSource')}</strong><small>library-cover-store</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href={`${PROJECT_URL}/issues`} target="_blank" rel="noopener noreferrer"><Heart className="w-5 h-5" /><span><strong>{t('about.feedback')}</strong><small>{t('about.feedbackHint')}</small></span><ExternalLink className="w-4 h-4" /></a>
        </div>
      </section>
    </div>
  );
}
