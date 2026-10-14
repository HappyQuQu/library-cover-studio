import { ExternalLink, Github, Heart, Layers, Palette, Store, Zap } from 'lucide-react';
import { AUTHOR_URL, PROJECT_URL } from '@/api/system';
import { VersionStatus } from '@/components/VersionStatus';
import { useThemeStore } from '@/stores/themeStore';

export function AboutPage() {
  const resolvedMode = useThemeStore(state => state.resolvedMode);
  return (
    <div className="system-page">
      <div className="system-page-heading"><h1>关于</h1><p>认识 CoverStudio，与项目一起成长。</p></div>
      <section className="card about-intro">
        <img src={resolvedMode === 'light' ? '/logo-l.png' : '/logo-d.png'} alt="CoverStudio" className="w-16 h-16 object-contain" />
        <div><h2>Library Cover Studio</h2><p>媒体库封面设计与自动化系统，让 Jellyfin / Emby 媒体库更有个性。</p></div>
      </section>
      <div className="about-features">
        {[{ icon: Palette, title: '自由设计', text: '通过可视化设计器，打造属于你的媒体库封面。' },
          { icon: Layers, title: '共享模板', text: '从模板商店发现灵感，导入和分享喜欢的设计。' },
          { icon: Zap, title: '自动化更新', text: '连接媒体服务器，按计划生成并更新媒体库封面。' }].map(({ icon: Icon, title, text }) => (
          <div className="card about-feature" key={title}><Icon className="w-5 h-5 text-(--primary)" /><h3>{title}</h3><p>{text}</p></div>
        ))}
      </div>
      <VersionStatus showHistoryLink />
      <section className="card about-project">
        <div><h2><Github className="w-5 h-5" />开源项目</h2><p>由 HappyQuQu 开发与维护，欢迎交流、反馈问题和贡献模板。</p></div>
        <div className="about-links">
          <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer"><Github className="w-5 h-5" /><span><strong>HappyQuQu</strong><small>我的 GitHub 主页</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer"><Layers className="w-5 h-5" /><span><strong>项目源码</strong><small>library-cover-studio</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href="https://github.com/HappyQuQu/library-cover-store" target="_blank" rel="noopener noreferrer"><Store className="w-5 h-5" /><span><strong>模板商店源码</strong><small>library-cover-store</small></span><ExternalLink className="w-4 h-4" /></a>
          <a href={`${PROJECT_URL}/issues`} target="_blank" rel="noopener noreferrer"><Heart className="w-5 h-5" /><span><strong>反馈与建议</strong><small>帮助 CoverStudio 变得更好</small></span><ExternalLink className="w-4 h-4" /></a>
        </div>
      </section>
    </div>
  );
}
