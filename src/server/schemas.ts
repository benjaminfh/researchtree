import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional()
});

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(6000),
  intent: z.string().max(280).optional(),
  llmProvider: z.enum(['openai', 'gemini', 'mock']).optional(),
  ref: z.string().min(1).max(120).optional()
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const createBranchSchema = z.object({
  name: z.string().min(1).max(120),
  fromRef: z.string().max(120).optional()
});

export const switchBranchSchema = z.object({
  name: z.string().min(1).max(120)
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type SwitchBranchInput = z.infer<typeof switchBranchSchema>;

export const mergeRequestSchema = z.object({
  sourceBranch: z.string().min(1).max(120),
  mergeSummary: z.string().min(1).max(4000),
  applyArtefact: z.boolean().optional(),
  targetBranch: z.string().min(1).max(120).optional()
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(6000),
  branchName: z.string().min(1).max(120).optional(),
  fromRef: z.string().min(1).max(120).optional(),
  label: z.string().max(120).optional(),
  nodeId: z.string().min(1),
  replaceNode: z.boolean().optional()
});

export const updateArtefactSchema = z.object({
  content: z.string().min(1).max(200000)
});

export type MergeRequestInput = z.infer<typeof mergeRequestSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type UpdateArtefactInput = z.infer<typeof updateArtefactSchema>;
