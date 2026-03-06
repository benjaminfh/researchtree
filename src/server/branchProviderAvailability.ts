// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { BranchConfig } from '@/src/server/branchConfig';
import { ApiError } from '@/src/server/http';
import { resolveLLMProvider } from '@/src/server/llm';

export function assertBranchProviderAvailable(ref: string, config?: BranchConfig | null): BranchConfig {
  if (!config) {
    throw new ApiError(
      400,
      'BRANCH_PROVIDER_MISSING',
      `Branch ${ref} is missing provider configuration. Re-open the workspace or recreate the branch.`,
      {
        ref,
        action: 'create_new_branch'
      }
    );
  }

  try {
    const provider = resolveLLMProvider(config.provider);
    return { provider, model: config.model };
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      const enabledProviders = Array.isArray(error.details?.enabledProviders)
        ? (error.details?.enabledProviders as string[])
        : [];
      throw new ApiError(
        400,
        'BRANCH_PROVIDER_DISABLED',
        `Branch ${ref} uses provider "${config.provider}", which is no longer available. Create a new branch with an enabled provider.`,
        {
          ref,
          provider: config.provider,
          enabledProviders,
          action: 'create_new_branch'
        }
      );
    }
    throw error;
  }
}

