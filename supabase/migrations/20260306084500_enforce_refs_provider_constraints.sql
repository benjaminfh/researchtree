-- Enforce provider invariants on refs.
-- Keep a defensive backfill for blank/null provider values before constraints.

update public.refs
set provider = 'openai'
where provider is null or btrim(provider) = '';

alter table public.refs
  alter column provider set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'refs_provider_valid'
      and conrelid = 'public.refs'::regclass
  ) then
    alter table public.refs
      add constraint refs_provider_valid
      check (provider in ('openai', 'openai_responses', 'gemini', 'anthropic', 'mock'));
  end if;
end
$$;
