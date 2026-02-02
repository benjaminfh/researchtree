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
          className="inline-flex items-center rounded-full border border-slate-300 bg-white/90 p-2 text-xs font-semibold text-slate-700 opacity-100 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-100"
        >
          <BlueprintIcon
            icon={copied ? 'tick' : 'duplicate'}
            className={copied ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-slate-600'}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setIsWrapped((prev) => !prev);
          }}
          aria-label={isWrapped ? 'Disable line wrap' : 'Enable line wrap'}
          aria-pressed={isWrapped}
          className="inline-flex items-center rounded-full border border-slate-300 bg-white/90 p-2 text-xs font-semibold text-slate-700 opacity-100 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-slate-100"
        >
          <BlueprintIcon
            icon="align-justify"
            className={isWrapped ? 'h-4 w-4 text-slate-800' : 'h-4 w-4 text-slate-600'}
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

export const MarkdownWithCopy = ({ content, className }: MarkdownWithCopyProps) => {
  const components = useMemo<Components>(
    () => ({
      code: (props) => <InlineCode {...props} />,
      pre: (props) => <PreBlock {...props} />
    }),
    []
  );

  return (
    <ReactMarkdown className={className} components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
};
