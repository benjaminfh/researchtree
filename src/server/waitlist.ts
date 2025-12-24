import { createSupabaseAdminClient } from '@/src/server/supabase/admin';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isWaitlistEnforced(): boolean {
  const raw = process.env.RT_WAITLIST_ENFORCE?.trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

export async function isEmailWhitelisted(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!isWaitlistEnforced()) return true;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from('email_allowlist').select('email').eq('email', normalized).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data);
}

export async function checkEmailAllowedForAuth(email: string): Promise<{ allowed: boolean; error: string | null }> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { allowed: false, error: 'Email is required.' };
  }

  if (!isWaitlistEnforced()) {
    return { allowed: true, error: null };
  }

  const allowed = await isEmailWhitelisted(normalized);
  if (!allowed) {
    return {
      allowed: false,
      error: 'Access is invite-only. Request access to be whitelisted before signing up or signing in.'
    };
  }

  return { allowed: true, error: null };
}

export async function requestWaitlistAccess(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from('waitlist_requests')
    .select('email, status, request_count')
    .eq('email', normalized)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    const { error } = await supabase.from('waitlist_requests').insert({
      email: normalized,
      status: 'pending',
      request_count: 1,
      last_requested_at: new Date().toISOString()
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('waitlist_requests')
    .update({
      last_requested_at: new Date().toISOString(),
      request_count: (existing.request_count ?? 1) + 1
    })
    .eq('email', normalized);
  if (error) throw new Error(error.message);
}

export async function listWaitlistRequests(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('waitlist_requests')
    .select('email, status, created_at, last_requested_at, request_count, approved_at, approved_by')
    .eq('status', status)
    .order('last_requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAllowlistedEmails() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from('email_allowlist').select('email, created_at, created_by').order('email');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function approveEmail(email: string, approvedBy: string | null) {
  const normalized = normalizeEmail(email);
  const supabase = createSupabaseAdminClient();

  const { error: insertError } = await supabase.from('email_allowlist').upsert(
    {
      email: normalized,
      created_by: approvedBy ? normalizeEmail(approvedBy) : null
    },
    { onConflict: 'email' }
  );
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from('waitlist_requests')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: approvedBy ? normalizeEmail(approvedBy) : null
    })
    .eq('email', normalized);
  if (updateError) throw new Error(updateError.message);
}

export async function removeAllowlistEmail(email: string) {
  const normalized = normalizeEmail(email);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('email_allowlist').delete().eq('email', normalized);
  if (error) throw new Error(error.message);
}

export async function redeemAccessCode(email: string, code: string, approvedBy: string | null = null): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim().toLowerCase();
  if (!normalizedCode) {
    throw new Error('Access code is required.');
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('rt_redeem_access_code_v1', {
    p_code: normalizedCode,
    p_email: normalizedEmail,
    p_approved_by: approvedBy ? normalizeEmail(approvedBy) : null
  });
  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data);
}
