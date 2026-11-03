'use client';

import { useState } from 'react';
import d from './docs.module.css';

type Tab = { label: string; code: string };

// Code sample with language tabs and a copy button. A single tab renders as a titled block.
export default function CodeTabs({ tabs, title }: { tabs: Tab[]; title?: string }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[Math.min(i, tabs.length - 1)];
  const copy = () => {
    navigator.clipboard?.writeText(tab.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };
  return (
    <div className={d.code}>
      <div className={d.codeBar}>
        {tabs.length > 1 ? (
          <div className={d.tabs} role="tablist">
            {tabs.map((t, k) => (
              <button key={t.label} type="button" role="tab" aria-selected={k === i} className={k === i ? d.tabOn : d.tab} onClick={() => setI(k)}>{t.label}</button>
            ))}
          </div>
        ) : <span className={d.codeTitle}>{title ?? tab.label}</span>}
        <button type="button" className={d.copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className={d.pre}><code>{tab.code}</code></pre>
    </div>
  );
}