import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional()
});

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(6000),
  intent: z.string().max(280).optional(),
  llmProvider: z.enum(['openai', 'gemini', 'mock']).optional()
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
