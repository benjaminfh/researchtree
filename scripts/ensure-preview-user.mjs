import { createClient } from '@supabase/supabase-js'

const vercelEnv = process.env.VERCEL_ENV // "production" | "preview" | "development"
if (vercelEnv !== 'preview') {
  console.log(`[ensure-preview-user] Skip (VERCEL_ENV=${vercelEnv})`)
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  console.error('[ensure-preview-user] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  process.exit(1)
}
if (!serviceKey) {
  console.error('[ensure-preview-user] Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const email = process.env.PREVIEW_TEST_EMAIL
const password = process.env.PREVIEW_TEST_PASSWORD
if (!email || !password) {
  console.error('[ensure-preview-user] Missing PREVIEW_TEST_EMAIL and/or PREVIEW_TEST_PASSWORD')
  process.exit(1)
}

const openaiSecretId = process.env.OPENAI_API_KEY || null
const geminiSecretId = process.env.GEMINI_API_KEY || null
const anthropicSecretId = process.env.ANTHROPIC_API_KEY || null

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(targetEmail) {
  const perPage = 200
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const user = data?.users?.find(
      u => (u.email || '').toLowerCase() === targetEmail.toLowerCase()
    )
    if (user) return user
    if (!data?.users?.length) return null
  }
  return null
}

;(async () => {
  console.log('[ensure-preview-user] Ensuring preview test user exists...')

  let user = await findUserByEmail(email)

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) throw error
    user = data.user
    console.log(`[ensure-preview-user] Created user ${user.id}`)
  } else {
    console.log(`[ensure-preview-user] User already exists: ${user.id}`)

    // Optional: keep preview login consistent across redeploys
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    })
    if (error) throw error
    console.log('[ensure-preview-user] Updated existing user (password/confirmed)')
  }

  // REQUIRED: user_llm_keys upsert
  // Assumes `user_id` is unique/PK (so onConflict: 'user_id' works).
  // Leave secret ids as null if not provided.
  const now = new Date().toISOString()
  const { error: llmError } = await supabase
    .from('user_llm_keys')
    .upsert(
      {
        user_id: user.id,
        openai_secret_id: openaiSecretId,
        gemini_secret_id: geminiSecretId,
        anthropic_secret_id: anthropicSecretId,
        // If your DB has defaults/triggers for timestamps, you can remove these:
        updated_at: now,
        created_at: now,
      },
      { onConflict: 'user_id' }
    )

  if (llmError) {
    console.error('[ensure-preview-user] user_llm_keys upsert failed:', llmError)
    process.exit(1)
  } else {
    console.log('[ensure-preview-user] Ensured user_llm_keys row')
  }

  console.log('[ensure-preview-user] Done.')
})().catch((err) => {
  console.error('[ensure-preview-user] Failed:', err?.message || err)
  process.exit(1)
})