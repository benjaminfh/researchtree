// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { assertLocalPgModeConfig, isLocalPgMode } from '@/src/server/pgMode';
import { isPreviewDeployment } from '@/src/server/deploymentEnv';

export interface ProjectForAuthz {
  id: string;
  name?: string | null;
  description?: string | null;
}

export async function requireProjectAccess(project: ProjectForAuthz): Promise<void> {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
    return;
  }
  if (isPreviewDeployment()) {
    return;
  }
  await requireUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('projects').select('id').eq('id', project.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw forbidden('Not authorized');
  }
}

export async function requireProjectOwner(project: ProjectForAuthz): Promise<void> {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
    return;
  }
  if (isPreviewDeployment()) {
    return;
  }
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('projects').select('owner_user_id').eq('id', project.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.owner_user_id !== user.id) {
    throw forbidden('Not authorized');
  }
}

export async function requireProjectEditor(project: ProjectForAuthz): Promise<void> {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
    return;
  }
  if (isPreviewDeployment()) {
    return;
  }
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const { data: projectRow, error: projectError } = await supabase
    .from('projects')
    .select('owner_user_id')
    .eq('id', project.id)
    .maybeSingle();
  if (projectError) {
    throw new Error(projectError.message);
  }
  if (projectRow?.owner_user_id === user.id) {
    return;
  }
  const { data: memberRow, error: memberError } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', project.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberError) {
    throw new Error(memberError.message);
  }
  if (!memberRow || (memberRow.role !== 'editor' && memberRow.role !== 'owner')) {
    throw forbidden('Not authorized');
  }
}
