-- Backfill legacy refs with missing provider to OpenAI.
-- This preserves explicit non-null provider values as-is.

update public.refs
set provider = 'openai'
where provider is null;
