import { createClient } from '@supabase/supabase-js'

const vercelEnv = process.env.VERCEL_ENV // "production" | "preview" | "development"
if (vercelEnv !== 'preview') {
  console.log(`[ensure-preview-user] Skip (VERCEL_ENV=${vercelEnv})`)
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url) {
  console.error('[ensure-preview-user] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
  process.exit(1)
}
if (!serviceKey) {
  console.error('[ensure-preview-user] Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!anonKey) {
  console.error('[ensure-preview-user] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const email = process.env.PREVIEW_TEST_EMAIL
const password = process.env.PREVIEW_TEST_PASSWORD
if (!email || !password) {
  console.error('[ensure-preview-user] Missing PREVIEW_TEST_EMAIL and/or PREVIEW_TEST_PASSWORD')
  process.exit(1)
}

const openaiApiKey = process.env.OPENAI_API_KEY || null
const geminiApiKey = process.env.GEMINI_API_KEY || null
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || null

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserByEmail(targetEmail) {
  const perPage = 200
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
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
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
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
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    })
    if (error) throw error
    console.log('[ensure-preview-user] Updated existing user (password/confirmed)')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError

  async function setUserKey(provider, secret) {
    if (!secret) {
      console.log(`[ensure-preview-user] Skip ${provider} token (missing env)`)
      return
    }
    const { error } = await supabase.rpc('rt_set_user_llm_key_v1', {
      p_provider: provider,
      p_secret: secret,
    })
    if (error) throw error
    console.log(`[ensure-preview-user] Stored ${provider} token`)
  }

  await setUserKey('openai', openaiApiKey)
  await setUserKey('gemini', geminiApiKey)
  await setUserKey('anthropic', anthropicApiKey)

  console.log('[ensure-preview-user] Done.')
})().catch((err) => {
  console.error('[ensure-preview-user] Failed:', err?.message || err)
  process.exit(1)
})
