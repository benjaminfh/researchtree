'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  const base = 'max-w-[82%] rounded-2xl border border-divider/70 px-4 py-3 shadow-sm transition';
  const palette = muted ? 'bg-[rgba(238,243,255,0.7)] text-slate-700' : isUser ? 'bg-slate-50 text-slate-900' : 'bg-white text-slate-900';
  const align = isUser ? 'ml-auto items-end' : 'mr-auto items-start';

  return (
    <article className={`flex flex-col gap-1 ${align}`}>
      <div className="text-xs text-muted">{new Date(node.timestamp).toLocaleTimeString()}</div>
      <div className={`${base} ${palette}`}>
        {'content' in node && node.content ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{node.content}</p>
        ) : null}
        {node.type === 'state' ? <p className="mt-2 text-sm font-medium text-slate-700">Canvas updated</p> : null}
        {node.type === 'merge' ? <p className="mt-2 text-sm font-medium text-slate-700">Merge: {node.mergeSummary}</p> : null}
        {node.type === 'message' && onEdit ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="text-sm font-medium text-primary hover:text-primary/80 focus:outline-none"
            >
              Edit
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
};

export function WorkspaceClient({ project, initialBranches, defaultProvider, providerOptions }: WorkspaceClientProps) {
  const COLLAPSE_KEY = 'sidequest:rail-collapsed';
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
  const [artefactDraft, setArtefactDraft] = useState('');
  const [isSavingArtefact, setIsSavingArtefact] = useState(false);
  const [artefactError, setArtefactError] = useState<string | null>(null);
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

  useEffect(() => {
    setArtefactDraft(artefact);
  }, [artefact]);

  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored) {
      setRailCollapsed(stored === 'true');
    }
  }, []);

  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      }
      return next;
    });
  };

  const [showHints, setShowHints] = useState(false);

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

    const trunkPrefix =
      trunkHistory?.nodes && trunkHistory.nodes.length > 0
        ? prefixLength(trunkHistory.nodes, combinedNodes)
        : Math.min(trunkNodeCount, combinedNodes.length);
    setSharedCount(trunkPrefix);

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

  const switchBranch = async (name: string) => {
    if (name === branchName) return;
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
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
      }
      await Promise.all([mutateHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsSwitching(false);
    }
  };

  const createBranch = async () => {
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
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
      }
      await Promise.all([mutateHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-800">
      <div className="grid h-full" style={{ gridTemplateColumns: railCollapsed ? '72px 1fr' : '270px 1fr' }}>
        <aside className="relative flex h-full flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur">
          <button
            type="button"
            onClick={toggleRail}
            className="focus-ring absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 shadow-sm hover:bg-primary/10"
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {railCollapsed ? '›' : '‹'}
          </button>
          <div className="flex h-full flex-col gap-6 pt-10">
            {!railCollapsed ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
                    <span>SideQuest</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white/80 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                    Active · {branchName}
                  </div>
                </div>

                <div className="space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between text-sm text-muted">
                    <span>Branches</span>
                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-slate-700">{branches.length}</span>
                  </div>
                  <div className="space-y-1 overflow-y-auto pr-1">
                    {branches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        onClick={() => void switchBranch(branch.name)}
                        disabled={isSwitching || isCreating}
                        className={`w-full rounded-full px-3 py-2 text-left text-sm transition focus:outline-none ${
                          branchName === branch.name
                            ? 'bg-primary/15 text-primary shadow-sm'
                            : 'text-slate-700 hover:bg-white/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{branch.name}</span>
                          {branch.isTrunk ? <span className="text-[11px] font-semibold text-primary">trunk</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                  {branchActionError ? <p className="text-sm text-red-600">{branchActionError}</p> : null}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createBranch();
                  }}
                  className="space-y-3 rounded-2xl border border-divider/80 bg-white/80 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">New branch</span>
                    <span className="text-xs text-muted">{branchName} →</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(event) => setNewBranchName(event.target.value)}
                      placeholder="feature/idea"
                      className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                      disabled={isCreating || isSwitching}
                    />
                    <button
                      type="submit"
                      disabled={isCreating || isSwitching}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreating ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>

              </>
            ) : null}

            {railCollapsed ? (
              <div className="mt-auto flex justify-center pb-2">
                <Link
                  href="/"
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="Back to home"
                >
                  ⌂
                </Link>
              </div>
            ) : (
              <div className="mt-auto space-y-3 pb-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowHints((prev) => !prev)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setShowHints((prev) => !prev);
                    }
                  }}
                  className={`cursor-pointer rounded-2xl bg-white/80 p-4 text-sm shadow-sm transition hover:bg-primary/10 ${showHints ? 'space-y-2' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">Session tips</p>
                    <span className="text-xs text-muted">{showHints ? 'Hide' : 'Show'}</span>
                  </div>
                  {showHints ? (
                    <ul className="list-disc space-y-1 pl-5 text-muted">
                      <li>⌘ + Enter to send, Shift + Enter for a newline.</li>
                      <li>Branch to try edits without losing the trunk.</li>
                      <li>Canvas edits are trunk-only to keep outputs stable.</li>
                    </ul>
                  ) : null}
                </div>

                <div className="flex justify-start">
                  <Link
                    href="/"
                    className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                    aria-label="Back to home"
                  >
                    ⌂
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex h-full min-h-0 flex-col bg-white">
          <div className="px-6 pt-6 md:px-8 lg:px-12">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                <span>SideQuest</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Workspace</span>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
              <span className="text-sm text-muted">{project.description ?? 'No description provided.'}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-sm shadow-sm">
                <span className="font-medium text-slate-700">Provider</span>
                <select
                  value={provider}
                  onChange={handleProviderChange}
                  className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-sm text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                >
                  {providerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-sm text-muted">Model · {activeProvider?.defaultModel ?? 'mock'}</span>
              {lastUpdatedTimestamp ? (
                <span className="text-sm text-muted">
                  Last update · {new Date(lastUpdatedTimestamp).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-48 pt-4 md:px-8 lg:px-12">
            <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <section className="card-surface flex min-h-0 flex-col gap-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Conversation</p>
                    <p className="text-sm text-muted">
                      Branch {branchName} · {combinedNodes.length} message{combinedNodes.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {branchName !== trunkName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMergeError(null);
                        setMergeSummary('');
                        setShowMergeModal(true);
                      }}
                      disabled={isMerging}
                      className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:opacity-60"
                    >
                      Merge into {trunkName}
                    </button>
                  ) : null}
                </div>

                {branchName !== trunkName && sharedCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[rgba(238,243,255,0.7)] px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary/80" />
                      Shared {sharedCount} {sharedCount === 1 ? 'message' : 'messages'} from upstream
                    </div>
                    <button
                      type="button"
                      onClick={() => setHideShared((prev) => !prev)}
                      className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
                    >
                      {hideShared ? 'Show shared' : 'Hide shared'}
                    </button>
                  </div>
                ) : null}

                <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
                  {isLoading ? (
                    <p className="text-sm text-muted">Loading history…</p>
                  ) : error ? (
                    <p className="text-sm text-red-600">Failed to load history.</p>
                  ) : combinedNodes.length === 0 ? (
                    <p className="text-sm text-muted">No nodes yet. Start with a system prompt or question.</p>
                  ) : (
                    <>
                      {!hideShared &&
                        sharedNodes.map((node) => <NodeBubble key={node.id} node={node} muted onEdit={undefined} />)}

                      {branchNodes.map((node) => (
                        <NodeBubble
                          key={node.id}
                          node={node}
                    onEdit={
                      node.type === 'message' && node.role === 'user'
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

                {hideShared && branchNodes.length === 0 && sharedCount > 0 ? (
                  <p className="text-sm italic text-muted">No new messages on this branch yet.</p>
                ) : null}

                {state.error ? (
                  <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {state.error}
                    <button
                      type="button"
                      onClick={() => void sendDraft()}
                      className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="card-surface flex min-h-0 flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Canvas</h2>
                    <p className="text-sm text-muted">
                      Trunk-only. {branchName !== trunkName ? 'Switch to trunk to edit.' : 'Edits create a state node on trunk.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Output</span>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden rounded-xl bg-slate-50/80 p-4">
                  {branchName !== trunkName ? (
                    artefact ? (
                      <div className="prose prose-slate max-w-none text-sm">
                        <ReactMarkdown>{artefact}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No canvas content yet.</p>
                    )
                  ) : (
                    <textarea
                      value={artefactDraft}
                      onChange={(event) => setArtefactDraft(event.target.value)}
                      rows={12}
                      className="h-full min-h-[320px] w-full flex-1 rounded-lg border border-divider/80 bg-white px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                      disabled={isSavingArtefact}
                    />
                  )}
                </div>

                {branchName === trunkName ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        if (isSavingArtefact) return;
                        setIsSavingArtefact(true);
                        setArtefactError(null);
                        try {
                          const res = await fetch(`/api/projects/${project.id}/artefact`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: artefactDraft })
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => null);
                            throw new Error(data?.error?.message ?? 'Failed to save canvas');
                          }
                          await mutateArtefact();
                          await mutateHistory();
                        } catch (err) {
                          setArtefactError((err as Error).message);
                        } finally {
                          setIsSavingArtefact(false);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={isSavingArtefact}
                    >
                      {isSavingArtefact ? 'Saving…' : 'Save canvas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setArtefactDraft(artefact);
                        setArtefactError(null);
                      }}
                      className="inline-flex items-center justify-center rounded-full border border-divider/80 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                      disabled={isSavingArtefact}
                    >
                      Reset
                    </button>
                    {artefactError ? <span className="text-sm text-red-600">{artefactError}</span> : null}
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="pointer-events-none fixed inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <div
              className="pointer-events-auto mx-auto max-w-6xl px-4 md:pr-12"
              style={{ paddingLeft: railCollapsed ? '96px' : '320px' }}
            >
              <div className="flex items-center gap-3 rounded-full border border-divider bg-white px-4 py-3 shadow-composer">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-slate-700 transition hover:bg-primary/10 focus:outline-none"
                  aria-label="Add attachment"
                >
                  +
                </button>
                <div className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                  {branchName === trunkName ? 'Trunk' : branchName}
                </div>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask anything"
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-base leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:outline-none"
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Thinking ▾
                  </button>
                  {state.isStreaming ? (
                    <button
                      type="button"
                      onClick={interrupt}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 focus:outline-none"
                    >
                      ✕
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={state.isStreaming || !draft.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>⌘ + Enter to send · Shift + Enter adds a newline.</span>
                {state.isStreaming ? <span className="animate-pulse text-primary">Streaming…</span> : null}
              </div>
            </div>
          </form>
        </div>
      </div>

      {showMergeModal ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Merge {branchName} into {trunkName}</h3>
            <p className="text-sm text-muted">
              Provide a concise summary of what to bring back. Canvas changes stay on trunk (apply-artefact is disabled for now).
            </p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800">Merge summary</label>
              <textarea
                value={mergeSummary}
                onChange={(event) => setMergeSummary(event.target.value)}
                rows={4}
                placeholder="What should come back to trunk?"
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isMerging}
              />
            </div>
            {mergeError ? <p className="mt-2 text-sm text-red-600">{mergeError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isMerging) return;
                  setShowMergeModal(false);
                  setMergeSummary('');
                  setMergeError(null);
                }}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
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
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isMerging}
              >
                {isMerging ? 'Merging…' : `Merge into ${trunkName}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && editingNode ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit message (new branch)</h3>
            <p className="text-sm text-muted">Editing creates a new branch from this message and switches you there.</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800">Updated content</label>
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isEditing}
              />
            </div>
            {editError ? <p className="mt-2 text-sm text-red-600">{editError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEditing) return;
                  setShowEditModal(false);
                  setEditDraft('');
                  setEditingNode(null);
                  setEditError(null);
                }}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
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
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
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
