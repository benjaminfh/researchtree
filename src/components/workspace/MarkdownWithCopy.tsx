// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { CheckIcon, Square2StackIcon } from './HeroIcons';
import { copyTextToClipboard } from './clipboard';

type MarkdownWithCopyProps = {
  content: string;
  className?: string;
};

type CodeProps = {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
};

type PreProps = {
  children?: React.ReactNode;
};

const CodeBlock = ({ inline, className, children }: CodeProps) => {
  const [copied, setCopied] = useState(false);

  if (inline) {
    return <code className={className}>{children}</code>;
  }

  const text = String(children ?? '').replace(/\n$/, '');

  const handleCopy = async () => {
    await copyTextToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group relative mt-4">
      <pre className="overflow-x-auto rounded-xl bg-slate-900/90 p-4 text-sm leading-6 text-slate-50 shadow-sm">
        <code className={className}>{children}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        aria-label={copied ? 'Code copied' : 'Copy code block'}
        className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-slate-700/70 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-100 opacity-100 transition hover:bg-slate-700/90 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-900"
      >
        {copied ? (
          <>
            <CheckIcon className="h-4 w-4 text-emerald-300" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Square2StackIcon className="h-4 w-4 text-slate-200" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
};

export const MarkdownWithCopy = ({ content, className }: MarkdownWithCopyProps) => {
  const components = useMemo<Components>(
    () => ({
      code: (props) => <CodeBlock {...props} />,
      pre: ({ children }: PreProps) => <>{children}</>
    }),
    []
  );

  return (
    <ReactMarkdown className={className} components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
};
