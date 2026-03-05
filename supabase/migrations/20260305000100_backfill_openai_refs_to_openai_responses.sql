-- Backfill legacy OpenAI ref provider values to explicit Responses provider.
-- This is required after removing implicit openai -> openai_responses routing.

update public.refs
set provider = 'openai_responses'
where provider = 'openai';
