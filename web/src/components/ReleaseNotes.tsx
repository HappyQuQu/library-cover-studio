import { Fragment, type ReactNode } from 'react';

// Render the release-note subset without executing remote HTML or loading remote images.
function inline(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function ReleaseNotes({ notes }: { notes: string }) {
  const blocks: ReactNode[] = [];
  const lines = notes.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={i}>{inline(line.replace(/^#{1,6}\s+/, ''))}</h3>);
    } else if (/^[-*+]\s/.test(line)) {
      const start = i, items: ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(/^[-*+]\s+/, ''))}</li>);
        i++;
      }
      i--;
      blocks.push(<ul key={start}>{items}</ul>);
    } else {
      blocks.push(<p key={i}>{inline(line)}</p>);
    }
  }
  return <div className="release-notes">{blocks.length ? blocks : <p>此版本暂无详细更新说明。</p>}</div>;
}
