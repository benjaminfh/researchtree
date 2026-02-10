// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { copyTextToClipboard } from './clipboard';
import { BlueprintIcon } from '../ui/BlueprintIcon';

type MarkdownWithCopyProps = {
  content: string;
  className?: string;
};

type PreProps = {
  children?: React.ReactNode;
};

type CodeProps = {
  className?: string;
  children?: React.ReactNode;
};

type TableProps = React.ComponentPropsWithoutRef<'table'>;

const InlineCode = ({ className, children }: CodeProps) => {
  const mergedClassName = [
    'rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.85em] font-semibold text-slate-700',
    'before:content-none after:content-none',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return <code className={mergedClassName}>{children}</code>;
};

const CodeBlock = ({ className, children }: CodeProps) => {
  const [copied, setCopied] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);

  const text = String(children ?? '').replace(/\n$/, '');

  const handleCopy = async () => {
    await copyTextToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group relative mt-4">
      <pre
        className={[
          'rounded-xl border border-slate-200 bg-slate-100/80 p-4 text-sm leading-6 text-slate-900 shadow-sm',
          isWrapped ? 'overflow-x-hidden' : 'overflow-x-auto',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <code
          className={[
            className,
            isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </code>
      </pre>
      <div className="absolute right-3 top-3 inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          aria-label={copied ? 'Code copied' : 'Copy code block'}
          className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold opacity-100 shadow-sm transition hover:bg-primary/10 focus:outline-none"
        >
          <BlueprintIcon
            icon={copied ? 'tick' : 'duplicate'}
            className={copied ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-slate-600'}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setIsWrapped((prev) => !prev);
          }}
          aria-label={isWrapped ? 'Disable line wrap' : 'Enable line wrap'}
          aria-pressed={isWrapped}
          className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 opacity-100 shadow-sm transition hover:bg-primary/10 hover:text-primary focus:outline-none"
        >
          <BlueprintIcon
            icon="wrap-lines"
            className={isWrapped ? 'h-3.5 w-3.5 text-slate-800' : 'h-3.5 w-3.5 text-slate-600'}
          />
        </button>
      </div>
    </div>
  );
};

const PreBlock = ({ children }: PreProps) => {
  const codeElement = React.Children.toArray(children).find((child) =>
    React.isValidElement(child)
  ) as React.ReactElement<CodeProps> | undefined;
  const className = codeElement?.props?.className;
  const codeChildren = codeElement?.props?.children ?? children;

  return <CodeBlock className={className}>{codeChildren}</CodeBlock>;
};

const MarkdownTable = ({ className, children, ...props }: TableProps) => {
  return (
    <div className="my-4 max-w-full overflow-x-auto">
      <table {...props} className={['w-max min-w-full', className].filter(Boolean).join(' ')}>
        {children}
      </table>
    </div>
  );
};

const MarkdownWithCopyBase = ({ content, className }: MarkdownWithCopyProps) => {
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG_CHAT_ROW_RENDERS === '1' && typeof window !== 'undefined') {
    const debugWindow = window as Window & { __markdownWithCopyRenderCounts?: Record<string, number> };
    const renderCounts = (debugWindow.__markdownWithCopyRenderCounts ??= {});
    const key = content.slice(0, 80);
    renderCounts[key] = (renderCounts[key] ?? 0) + 1;
  }

  const components = useMemo<Components>(
    () => ({
      code: (props) => <InlineCode {...props} />,
      pre: (props) => <PreBlock {...props} />,
      table: (props) => <MarkdownTable {...props} />
    }),
    []
  );

  return (
    <ReactMarkdown className={className} components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
};

export const MarkdownWithCopy = React.memo(MarkdownWithCopyBase, (prev, next) =>
  prev.content === next.content && prev.className === next.className
);
