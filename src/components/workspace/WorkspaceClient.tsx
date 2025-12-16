'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { ProjectMetadata, NodeRecord } from '@git/types';
import type { LLMProvider } from '@/src/server/llm';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import ReactMarkdown from 'react-markdown';

interface WorkspaceClientProps {
  project: ProjectMetadata;
  defaultProvider: LLMProvider;
  providerOptions: ProviderOption[];
}

interface ProviderOption {
  id: LLMProvider;
  label: string;
  defaultModel: string;
}

export function WorkspaceClient({ project, defaultProvider, providerOptions }: WorkspaceClientProps) {
  const branchName = project.branchName ?? 'main';
  const { nodes, artefact, artefactMeta, isLoading, error, mutateHistory, mutateArtefact } = useProjectData(project.id);
  const draftStorageKey = `researchtree:draft:${project.id}`;
  const providerStorageKey = `researchtree:provider:${project.id}`;
  const [draft, setDraft] = useState('');
  const [streamPreview, setStreamPreview] = useState('');
  const [provider, setProvider] = useState<LLMProvider>(defaultProvider);

  const { sendMessage, interrupt, state } = useChatStream({
    projectId: project.id,
    provider,
    onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
    onComplete: async () => {
      setStreamPreview('');
      setDraft('');
      await Promise.all([mutateHistory(), mutateArtefact()]);
    }
  });

  const activeProvider = useMemo(
    () => providerOptions.find((option) => option.id === provider),
    [provider, providerOptions]
  );

  const sendDraft = async () => {
    if (!draft.trim() || state.isStreaming) return;
    await sendMessage(draft);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendDraft();
  };

  const streamingNode: NodeRecord | null =
    streamPreview.length > 0
      ? {
          id: 'streaming',
          type: 'message',
          role: 'assistant',
          content: streamPreview,
          timestamp: Date.now(),
          parent: null,
          interrupted: state.error !== null
        }
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = window.sessionStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setDraft(savedDraft);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draft) {
      window.sessionStorage.removeItem(draftStorageKey);
    } else {
      window.sessionStorage.setItem(draftStorageKey, draft);
    }
  }, [draft, draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedProvider = window.localStorage.getItem(providerStorageKey) as LLMProvider | null;
    if (savedProvider && providerOptions.some((option) => option.id === savedProvider)) {
      setProvider(savedProvider);
    }
  }, [providerStorageKey, providerOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(providerStorageKey, provider);
  }, [provider, providerStorageKey]);

  const handleProviderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setProvider(event.target.value as LLMProvider);
  };

  const combinedNodes = useMemo(() => (streamingNode ? [...nodes, streamingNode] : nodes), [nodes, streamingNode]);
  const lastUpdatedTimestamp = useMemo(() => {
    const historyLatest = combinedNodes[combinedNodes.length - 1]?.timestamp ?? null;
    const artefactUpdated = artefactMeta?.lastUpdatedAt ?? null;
    return historyLatest && artefactUpdated ? Math.max(historyLatest, artefactUpdated) : historyLatest ?? artefactUpdated;
  }, [combinedNodes, artefactMeta]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ margin: 0 }}>{project.name}</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#5f6b7c' }}>{project.description ?? 'No description'}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
          <span
            style={{
              borderRadius: '999px',
              background: '#f2f4f7',
              border: '1px solid #d5dce8',
              padding: '0.25rem 0.75rem',
              fontSize: '0.85rem'
            }}
          >
            Branch · {branchName}
          </span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#5f6b7c' }}>LLM Provider</span>
            <select
              value={provider}
              onChange={handleProviderChange}
              style={{ borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.4rem 0.75rem', minWidth: '12rem' }}
            >
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: '0.85rem', color: '#5f6b7c' }}>Model · {activeProvider?.defaultModel ?? 'mock'}</span>
          {lastUpdatedTimestamp ? (
            <span style={{ fontSize: '0.85rem', color: '#5f6b7c' }}>
              Last update · {new Date(lastUpdatedTimestamp).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <section style={{ border: '1px solid #e1e7ef', borderRadius: '0.75rem', padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: '80vh' }}>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Conversation</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {isLoading ? (
              <p>Loading history…</p>
            ) : error ? (
              <p style={{ color: '#bd2d2d' }}>Failed to load history.</p>
            ) : combinedNodes.length === 0 ? (
              <p>No nodes yet. Start with a system prompt or question.</p>
            ) : (
              combinedNodes.map((node) => {
                const isUser = node.type === 'message' && node.role === 'user';
                const bubbleStyle = {
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  background: isUser ? '#f2f4f7' : '#fff',
                  border: '1px solid #e7ebf3',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  maxWidth: '80%',
                  textAlign: 'left' as const,
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
                };

                return (
                  <article key={node.id} style={bubbleStyle}>
                    <div style={{ fontSize: '0.75rem', color: '#7a869a', marginBottom: '0.35rem' }}>
                      {new Date(node.timestamp).toLocaleTimeString()}
                    </div>
                    {'content' in node && node.content ? <p style={{ margin: 0 }}>{node.content}</p> : null}
                    {node.type === 'state' ? <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>Artefact updated</p> : null}
                    {node.type === 'merge' ? <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>Merge: {node.mergeSummary}</p> : null}
                  </article>
                );
              })
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Send a message to the LLM"
              rows={4}
              style={{ width: '100%', borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.75rem', marginBottom: '0.75rem' }}
              disabled={state.isStreaming}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }
                if (event.metaKey) {
                  event.preventDefault();
                  void sendDraft();
                  return;
                }
                if (event.shiftKey || event.altKey) {
                  return;
                }
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" disabled={state.isStreaming || !draft.trim()} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {state.isStreaming ? (
                  'Sending…'
                ) : (
                  <>
                    <span style={{ fontSize: '0.9rem' }}>↑</span>
                    <span>(⌘⏎)</span>
                  </>
                )}
              </button>
              {state.isStreaming ? (
                <button type="button" onClick={interrupt} style={{ padding: '0.5rem 1rem' }}>
                  Stop
                </button>
              ) : null}
              {state.error ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#bd2d2d' }}>
                  {state.error}
                  <button type="button" onClick={sendDraft} style={{ padding: '0.35rem 0.6rem' }}>
                    Retry
                  </button>
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: '0.85rem', color: '#5f6b7c', margin: '0.5rem 0 0' }}>Press ⌘+Enter to send. Shift+Enter or Option+Enter add a newline.</p>
          </form>
        </section>

        <section style={{ border: '1px solid #e1e7ef', borderRadius: '0.75rem', padding: '1rem', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginTop: 0 }}>Artefact</h2>
          <p style={{ color: '#5f6b7c', fontSize: '0.9rem' }}>Trunk-only, read-only for Phase 2.</p>
          <div
            style={{
              flex: 1,
              background: '#f9fafc',
              borderRadius: '0.5rem',
              padding: '1rem',
              overflowY: 'auto'
            }}
          >
            {artefact ? <ReactMarkdown>{artefact}</ReactMarkdown> : 'No artefact content yet.'}
          </div>
        </section>
      </div>
    </div>
  );
}
