-- Private encrypted sync data. Apply this file in the Supabase SQL Editor.
-- No shop/visit fields are stored in plaintext in these tables.

create table if not exists public.user_keyrings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keyring jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_keyrings_shape check (
    keyring ?& array['version', 'salt', 'iterations', 'wrappedKey', 'wrapIv',
                     'recoverySalt', 'recoveryWrappedKey', 'recoveryIv']
  )
);

create table if not exists public.encrypted_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null check (entity in ('shop', 'visit')),
  id text not null,
  revision bigint not null default 1 check (revision > 0),
  ciphertext text,
  iv text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, entity, id),
  constraint encrypted_record_payload check (
    (deleted_at is not null and ciphertext is null and iv is null)
    or (deleted_at is null and ciphertext is not null and iv is not null)
  )
);

create index if not exists encrypted_records_user_updated_idx
  on public.encrypted_records (user_id, updated_at);

alter table public.user_keyrings enable row level security;
alter table public.encrypted_records enable row level security;

drop policy if exists "Users manage only their own keyring" on public.user_keyrings;
create policy "Users manage only their own keyring"
  on public.user_keyrings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage only their encrypted records" on public.encrypted_records;
create policy "Users manage only their encrypted records"
  on public.encrypted_records for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_keyrings to authenticated;
grant select, insert, update, delete on public.encrypted_records to authenticated;
