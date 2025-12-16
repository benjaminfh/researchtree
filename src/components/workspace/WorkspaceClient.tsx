'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { ProjectMetadata, NodeRecord, BranchSummary } from '@git/types';
import type { LLMProvider } from '@/src/server/llm';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import ReactMarkdown from 'react-markdown';
import useSWR from 'swr';
import type { FC } from 'react';

interface WorkspaceClientProps {
  project: ProjectMetadata;
  initialBranches: BranchSummary[];
  defaultProvider: LLMProvider;
  providerOptions: ProviderOption[];
}

interface ProviderOption {
  id: LLMProvider;
  label: string;
  defaultModel: string;
}

const NodeBubble: FC<{ node: NodeRecord; muted?: boolean; onEdit?: (node: NodeRecord) => void }> = ({
  node,
  muted = false,
  onEdit
}) => {
  const isUser = node.type === 'message' && node.role === 'user';
  const bubbleStyle = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    background: muted ? '#f4f6fb' : isUser ? '#f2f4f7' : '#fff',
    border: '1px solid #e7ebf3',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    maxWidth: '80%',
    textAlign: 'left' as const,
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
  };

  return (
    <article style={bubbleStyle}>
      <div style={{ fontSize: '0.75rem', color: '#7a869a', marginBottom: '0.35rem' }}>{new Date(node.timestamp).toLocaleTimeString()}</div>
      {'content' in node && node.content ? <p style={{ margin: 0 }}>{node.content}</p> : null}
      {node.type === 'state' ? <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>Artefact updated</p> : null}
      {node.type === 'merge' ? <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>Merge: {node.mergeSummary}</p> : null}
      {node.type === 'message' && onEdit ? (
        <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type='button'
            onClick={() => onEdit(node)}
            style={{ border: 'none', background: 'transparent', color: '#4b5565', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
          >
            Edit
          </button>
        </div>
      ) : null}
    </article>
  );
};

export function WorkspaceClient({ project, initialBranches, defaultProvider, providerOptions }: WorkspaceClientProps) {
  const [branchName, setBranchName] = useState(project.branchName ?? 'main');
  const [branches, setBranches] = useState(initialBranches);
  const [branchActionError, setBranchActionError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSummary, setMergeSummary] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeRecord | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { nodes, artefact, artefactMeta, isLoading, error, mutateHistory, mutateArtefact } = useProjectData(project.id, {
    ref: branchName
  });
  const draftStorageKey = `researchtree:draft:${project.id}`;
  const [draft, setDraft] = useState('');
  const [streamPreview, setStreamPreview] = useState('');
  const [provider, setProvider] = useState<LLMProvider>(defaultProvider);
  const providerStorageKey = useMemo(
    () => `researchtree:provider:${project.id}:${branchName}`,
    [project.id, branchName]
  );

  const { sendMessage, interrupt, state } = useChatStream({
    projectId: project.id,
    ref: branchName,
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
    const isValid = savedProvider && providerOptions.some((option) => option.id === savedProvider);
    const nextProvider = (isValid ? savedProvider : defaultProvider) as LLMProvider;
    setProvider((prev) => (prev === nextProvider ? prev : nextProvider));
  }, [providerStorageKey, providerOptions, defaultProvider]);

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

  const trunkName = useMemo(() => branches.find((b) => b.isTrunk)?.name ?? 'main', [branches]);
  const shouldFetchTrunk = branchName !== trunkName;
  const historyFetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    return res.json() as Promise<{ nodes: NodeRecord[] }>;
  };
  const { data: trunkHistory } = useSWR<{ nodes: NodeRecord[] }>(
    shouldFetchTrunk ? `/api/projects/${project.id}/history?ref=${encodeURIComponent(trunkName)}` : null,
    historyFetcher
  );
  const trunkNodeCount = useMemo(() => branches.find((b) => b.isTrunk)?.nodeCount ?? 0, [branches]);
  const [sharedCount, setSharedCount] = useState(0);
  useEffect(() => {
    const prefixLength = (a: NodeRecord[], b: NodeRecord[]) => {
      const min = Math.min(a.length, b.length);
      let idx = 0;
      while (idx < min && a[idx]?.id === b[idx]?.id) {
        idx += 1;
      }
      return idx;
    };

    if (branchName === trunkName) {
      setSharedCount(0);
      return;
    }

    // Start with a fast fallback using trunk history (or trunk node count if still loading).
    const trunkPrefix =
      trunkHistory?.nodes && trunkHistory.nodes.length > 0
        ? prefixLength(trunkHistory.nodes, combinedNodes)
        : Math.min(trunkNodeCount, combinedNodes.length);
    setSharedCount(trunkPrefix);

    // Refine by finding the longest shared prefix against any other branch (helps branch-of-branch).
    const aborted = { current: false };
    const compute = async () => {
      const others = branches.filter((b) => b.name !== branchName);
      if (others.length === 0) return;
      const histories = await Promise.all(
        others.map(async (b) => {
          try {
            const res = await fetch(
              `/api/projects/${project.id}/history?ref=${encodeURIComponent(b.name)}&limit=${combinedNodes.length}`
            );
            if (!res.ok) return null;
            const data = (await res.json()) as { nodes: NodeRecord[] };
            return { name: b.name, nodes: data.nodes ?? [] };
          } catch {
            return null;
          }
        })
      );
      const longest = histories.reduce((max, entry) => {
        if (!entry) return max;
        const min = Math.min(entry.nodes.length, combinedNodes.length);
        let idx = 0;
        while (idx < min && entry.nodes[idx]?.id === combinedNodes[idx]?.id) {
          idx += 1;
        }
        return Math.max(max, idx);
      }, trunkPrefix);
      if (!aborted.current) {
        setSharedCount(longest);
      }
    };
    void compute();
    return () => {
      aborted.current = true;
    };
  }, [branchName, trunkName, trunkHistory, trunkNodeCount, combinedNodes, branches, project.id]);
  const [hideShared, setHideShared] = useState(branchName !== trunkName);
  useEffect(() => {
    setHideShared(branchName !== trunkName);
  }, [branchName, trunkName]);
  const sharedNodes = combinedNodes.slice(0, sharedCount);
  const branchNodes = combinedNodes.slice(sharedCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ margin: 0 }}>{project.name}</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#5f6b7c' }}>{project.description ?? 'No description'}</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#5f6b7c' }}>Branch</span>
            <select
              value={branchName}
              onChange={async (event) => {
                const name = event.target.value;
                setIsSwitching(true);
                setBranchActionError(null);
                try {
                  const res = await fetch(`/api/projects/${project.id}/branches`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => null);
                    throw new Error(data?.error?.message ?? 'Failed to switch branch');
                  }
                  const data = (await res.json()) as { branchName: string; branches: BranchSummary[] };
                  setBranchName(data.branchName);
                  setBranches(data.branches);
                  // Ensure branch-specific provider state persists when switching.
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
                  }
                  await Promise.all([mutateHistory(), mutateArtefact()]);
                } catch (err) {
                  setBranchActionError((err as Error).message);
                } finally {
                  setIsSwitching(false);
                }
              }}
              disabled={isSwitching || isCreating}
              style={{ borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.4rem 0.75rem', minWidth: '12rem' }}
            >
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name} {branch.isTrunk ? '(trunk)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#5f6b7c' }}>New branch</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                placeholder="feature/idea"
                style={{ borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.4rem 0.6rem', minWidth: '10rem' }}
                disabled={isCreating || isSwitching}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newBranchName.trim()) return;
                  setIsCreating(true);
                  setBranchActionError(null);
                  try {
                    const res = await fetch(`/api/projects/${project.id}/branches`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name: newBranchName.trim(), fromRef: branchName })
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Failed to create branch');
                    }
                    const data = (await res.json()) as { branchName: string; branches: BranchSummary[] };
                    setBranchName(data.branchName);
                    setBranches(data.branches);
                    setNewBranchName('');
                    // Seed new branch with current provider choice.
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
                    }
                    await Promise.all([mutateHistory(), mutateArtefact()]);
                  } catch (err) {
                    setBranchActionError((err as Error).message);
                  } finally {
                    setIsCreating(false);
                  }
                }}
                disabled={isCreating || isSwitching}
                style={{ padding: '0.4rem 0.8rem' }}
              >
                Create & switch
              </button>
            </div>
          </label>
          {branchName !== trunkName ? (
            <button
              type="button"
              onClick={() => {
                setMergeError(null);
                setMergeSummary('');
                setShowMergeModal(true);
              }}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#fff' }}
              disabled={isMerging}
            >
              Merge into {trunkName}
            </button>
          ) : null}
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
          {branchActionError ? <span style={{ color: '#bd2d2d' }}>{branchActionError}</span> : null}
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
              <>
                {branchName !== trunkName && sharedCount > 0 ? (
                  hideShared ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: '#5f6b7c' }}>
                      <span style={{ flex: 1, height: 1, background: '#e1e7ef' }} />
                      <span>
                        Branch {branchName} (shared {sharedCount} {sharedCount === 1 ? 'message' : 'messages'} from upstream)
                      </span>
                      <span style={{ flex: 1, height: 1, background: '#e1e7ef' }} />
                      <button
                        type="button"
                        onClick={() => setHideShared(false)}
                        style={{ padding: '0.35rem 0.6rem', border: '1px solid #d5dce8', borderRadius: '0.35rem', background: '#fff' }}
                      >
                        Show shared
                      </button>
                    </div>
                  ) : (
                    <>
                      {sharedNodes.map((node) => (
                        <NodeBubble key={node.id} node={node} muted />
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: '#5f6b7c' }}>
                        <span style={{ flex: 1, height: 1, background: '#e1e7ef' }} />
                        <span>
                          Branch {branchName} (shared {sharedCount} {sharedCount === 1 ? 'message' : 'messages'} from upstream)
                        </span>
                        <span style={{ flex: 1, height: 1, background: '#e1e7ef' }} />
                        <button
                          type="button"
                          onClick={() => setHideShared(true)}
                          style={{ padding: '0.35rem 0.6rem', border: '1px solid #d5dce8', borderRadius: '0.35rem', background: '#fff' }}
                        >
                          Hide shared
                        </button>
                      </div>
                    </>
                  )
                ) : null}

                {hideShared && branchNodes.length === 0 && sharedCount > 0 ? (
                  <p style={{ color: '#5f6b7c', fontStyle: 'italic' }}>No new messages on this branch yet.</p>
                ) : null}

                {branchNodes.map((node) => (
                  <NodeBubble
                    key={node.id}
                    node={node}
                    onEdit={
                      node.type === 'message'
                        ? (n) => {
                            setEditingNode(n);
                            setEditDraft(n.content ?? '');
                            setEditError(null);
                            setShowEditModal(true);
                          }
                        : undefined
                    }
                  />
                ))}
              </>
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
                    {/* <span>(⌘⏎)</span> */}
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

      {showMergeModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20
          }}
        >
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', width: 'min(520px, 90vw)', boxShadow: '0 10px 40px rgba(15,23,42,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Merge {branchName} into {trunkName}</h3>
            <p style={{ marginTop: 0, color: '#5f6b7c', fontSize: '0.95rem' }}>
              Provide a concise summary of what to bring back. Artefact changes stay on trunk (apply-artefact is disabled for now).
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#4b5565' }}>Merge summary</span>
              <textarea
                value={mergeSummary}
                onChange={(event) => setMergeSummary(event.target.value)}
                rows={4}
                placeholder="What should come back to trunk?"
                style={{ width: '100%', borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.75rem' }}
                disabled={isMerging}
              />
            </label>
            {mergeError ? <p style={{ color: '#bd2d2d', marginTop: '0.5rem' }}>{mergeError}</p> : null}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  if (isMerging) return;
                  setShowMergeModal(false);
                  setMergeSummary('');
                  setMergeError(null);
                }}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#fff' }}
                disabled={isMerging}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!mergeSummary.trim()) {
                    setMergeError('Merge summary is required.');
                    return;
                  }
                  setIsMerging(true);
                  setMergeError(null);
                  try {
                    const res = await fetch(`/api/projects/${project.id}/merge`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sourceBranch: branchName,
                        targetBranch: trunkName,
                        mergeSummary: mergeSummary.trim(),
                        applyArtefact: false
                      })
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Merge failed');
                    }
                    await Promise.all([mutateHistory(), mutateArtefact()]);
                    setShowMergeModal(false);
                    setMergeSummary('');
                  } catch (err) {
                    setMergeError((err as Error).message);
                  } finally {
                    setIsMerging(false);
                  }
                }}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#0f62fe', color: '#fff' }}
                disabled={isMerging}
              >
                {isMerging ? 'Merging…' : `Merge into ${trunkName}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && editingNode ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20
          }}
        >
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.25rem', width: 'min(520px, 90vw)', boxShadow: '0 10px 40px rgba(15,23,42,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Edit message (new branch)</h3>
            <p style={{ marginTop: 0, color: '#5f6b7c', fontSize: '0.95rem' }}>
              Editing creates a new branch from this message and switches you there.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.9rem', color: '#4b5565' }}>Updated content</span>
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={4}
                style={{ width: '100%', borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.75rem' }}
                disabled={isEditing}
              />
            </label>
            {editError ? <p style={{ color: '#bd2d2d', marginTop: '0.5rem' }}>{editError}</p> : null}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  if (isEditing) return;
                  setShowEditModal(false);
                  setEditDraft('');
                  setEditingNode(null);
                  setEditError(null);
                }}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#fff' }}
                disabled={isEditing}
              >
                Cancel
              </button>
              <button
                type="button"
            onClick={async () => {
              if (!editDraft.trim()) {
                setEditError('Content is required.');
                return;
              }
              setIsEditing(true);
              setEditError(null);
              try {
                const res = await fetch(`/api/projects/${project.id}/edit`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: editDraft.trim(),
                    fromRef: branchName,
                    nodeId: editingNode?.id
                  })
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => null);
                  throw new Error(data?.error?.message ?? 'Edit failed');
                    }
                    const data = (await res.json()) as { branchName: string };
                    setBranchName(data.branchName);
                    // refresh branches list to include the new branch
                    const branchesRes = await fetch(`/api/projects/${project.id}/branches`);
                    if (branchesRes.ok) {
                      const branchesData = (await branchesRes.json()) as { branches: BranchSummary[]; currentBranch: string };
                      setBranches(branchesData.branches);
                    }
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
                    }
                    await Promise.all([mutateHistory(), mutateArtefact()]);
                    setShowEditModal(false);
                    setEditDraft('');
                    setEditingNode(null);
                  } catch (err) {
                    setEditError((err as Error).message);
                  } finally {
                    setIsEditing(false);
                  }
                }}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#0f62fe', color: '#fff' }}
                disabled={isEditing}
              >
                {isEditing ? 'Creating branch…' : 'Save & switch'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
