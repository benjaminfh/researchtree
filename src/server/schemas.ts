// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { z } from 'zod';
import { CHAT_LIMITS } from '@/src/shared/chatLimits';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  provider: z.enum(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']).optional()
});

export const chatRequestSchema = z
  .object({
    message: z.string().min(1).max(CHAT_LIMITS.messageMaxChars).optional(),
    question: z.string().min(1).max(CHAT_LIMITS.questionMaxChars).optional(),
    highlight: z.string().min(1).max(CHAT_LIMITS.highlightMaxChars).optional(),
    intent: z.string().max(CHAT_LIMITS.intentMaxChars).optional(),
    llmProvider: z.enum(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']).optional(),
    ref: z.string().min(1).max(120).optional(),
    thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
    webSearch: z.boolean().optional(),
    leaseSessionId: z.string().min(1).optional(),
    clientRequestId: z.string().min(1).optional()
  })
  .refine((value) => Boolean(value.message?.trim() || value.question?.trim()), {
    message: 'Message or question is required.'
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  fromRef: z.string().max(120).optional(),
  fromNodeId: z.string().min(1).optional(),
  provider: z.enum(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']).optional(),
  model: z.string().max(200).optional(),
  switch: z.boolean().optional()
});

export const branchQuestionSchema = z.object({
  name: z.string().min(1).max(120),
  fromRef: z.string().max(120).optional(),
  fromNodeId: z.string().trim().min(1),
  provider: z.enum(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']).optional(),
  model: z.string().max(200).optional(),
  question: z.string().min(1).max(CHAT_LIMITS.questionMaxChars),
  highlight: z.string().trim().min(1).max(CHAT_LIMITS.highlightMaxChars),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
  switch: z.boolean().optional(),
  leaseSessionId: z.string().min(1).optional(),
  clientRequestId: z.string().min(1).optional()
});

export const switchBranchSchema = z.object({
  name: z.string().min(1).max(120)
});

export const renameBranchSchema = z.object({
  name: z.string().min(1).max(120),
  leaseSessionId: z.string().min(1).optional()
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type BranchQuestionInput = z.infer<typeof branchQuestionSchema>;
export type SwitchBranchInput = z.infer<typeof switchBranchSchema>;
export type RenameBranchInput = z.infer<typeof renameBranchSchema>;

export const mergeRequestSchema = z.object({
  sourceBranch: z.string().min(1).max(120),
  mergeSummary: z.string().min(1).max(4000),
  targetBranch: z.string().min(1).max(120).optional(),
  sourceAssistantNodeId: z.string().min(1).optional(),
  leaseSessionId: z.string().min(1).optional()
});

export const pinCanvasDiffSchema = z.object({
  mergeNodeId: z.string().min(1),
  targetBranch: z.string().min(1).max(120).optional(),
  leaseSessionId: z.string().min(1).optional()
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(6000),
  branchName: z.string().min(1).max(120).optional(),
  fromRef: z.string().min(1).max(120).optional(),
  label: z.string().max(120).optional(),
  llmProvider: z.enum(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']).optional(),
  llmModel: z.string().max(200).optional(),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
  nodeId: z.string().min(1),
  replaceNode: z.boolean().optional(),
  leaseSessionId: z.string().min(1).optional(),
  clientRequestId: z.string().min(1).optional()
});

export const updateArtefactSchema = z.object({
  content: z.string().min(1).max(200000),
  leaseSessionId: z.string().min(1).optional()
});

export type MergeRequestInput = z.infer<typeof mergeRequestSchema>;
export type PinCanvasDiffInput = z.infer<typeof pinCanvasDiffSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type UpdateArtefactInput = z.infer<typeof updateArtefactSchema>;
