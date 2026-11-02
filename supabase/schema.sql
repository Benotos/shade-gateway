-- SHADE gateway: anonymous accounts, prepaid credit ledger, SOL deposits, usage metering.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Units: all money is stored as integer "units", where 1,000,000 units = $1.00 USD.
-- The UI shows "credits", where 1 credit = 1,000 units = $0.001 (so $1 = 1,000 credits).
-- No prompts or responses are stored anywhere in this schema. Usage rows keep model,
-- token counts and cost only, so balances can be audited.

create extension if not exists pgcrypto;

-- Anonymous accounts. The user only ever holds the secret key; we store its SHA-256 hash.
create table if not exists shade_accounts (
  id            uuid primary key default gen_random_uuid(),
  key_hash      text not null unique,
  key_prefix    text not null,                -- first chars, for display ("shade_sk_ab12…")
  balance_units bigint not null default 0 check (balance_units >= 0),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

-- Append-only ledger. Every balance change has exactly one row here.
create table if not exists shade_ledger (
  id          bigserial primary key,
  account_id  uuid not null references shade_accounts(id),
  delta_units bigint not null,
  kind        text not null check (kind in ('deposit','usage','refund','adjustment')),
  ref         text,                            -- deposit id / usage id
  created_at  timestamptz not null default now()
);
create index if not exists shade_ledger_account_idx on shade_ledger(account_id, created_at desc);

-- SOL deposits. Each one has a unique Solana Pay reference AND a unique exact lamport amount,
-- so a transfer to the single treasury address can be matched to exactly one purchase.
create table if not exists shade_deposits (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references shade_accounts(id),
  package_id       text not null,
  usd_cents        integer not null,
  credit_units     bigint not null,
  sol_usd          numeric(18,6) not null,      -- price locked at creation
  expected_lamports bigint not null,
  reference        text not null unique,        -- base58 public key used as Solana Pay reference
  status           text not null default 'pending' check (status in ('pending','credited','expired')),
  signature        text unique,                 -- a signature can only ever credit one deposit
  received_lamports bigint,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  credited_at      timestamptz
);
create index if not exists shade_deposits_pending_idx on shade_deposits(status, expires_at);
-- No two open deposits may share the same exact amount.
create unique index if not exists shade_deposits_open_amount_idx
  on shade_deposits(expected_lamports) where status = 'pending';

-- Usage metering (no content).
create table if not exists shade_usage (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid references shade_accounts(id),
  model_id          text not null,
  provider_model    text not null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  cost_units        bigint not null default 0,
  source            text not null check (source in ('chat','api','free')),
  created_at        timestamptz not null default now()
);
create index if not exists shade_usage_created_idx on shade_usage(created_at desc);

-- Fixed-window rate limit buckets (key is e.g. "acct:<id>" or "ip:<salted hash>").
create table if not exists shade_rate_buckets (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

-- Lock everything down: only the server (service role key) touches these tables.
alter table shade_accounts     enable row level security;
alter table shade_ledger       enable row level security;
alter table shade_deposits     enable row level security;
alter table shade_usage        enable row level security;
alter table shade_rate_buckets enable row level security;

-- ---------------------------------------------------------------------------
-- Atomic credit operations
-- ---------------------------------------------------------------------------

-- Credit a deposit exactly once. Returns true only on the call that actually credited it.
create or replace function shade_credit_deposit(p_deposit uuid, p_signature text, p_lamports bigint)
returns boolean language plpgsql security definer as $$
declare d shade_deposits;
begin
  update shade_deposits
     set status = 'credited', signature = p_signature, received_lamports = p_lamports, credited_at = now()
   where id = p_deposit and status = 'pending'
  returning * into d;
  if not found then return false; end if;

  update shade_accounts set balance_units = balance_units + d.credit_units where id = d.account_id;
  insert into shade_ledger(account_id, delta_units, kind, ref) values (d.account_id, d.credit_units, 'deposit', d.id::text);
  return true;
exception when unique_violation then
  -- Signature already used for another deposit: refuse.
  return false;
end $$;

-- Hold funds before calling a model. Returns false if the balance is too low.
create or replace function shade_reserve(p_account uuid, p_units bigint)
returns boolean language plpgsql security definer as $$
begin
  update shade_accounts set balance_units = balance_units - p_units
   where id = p_account and revoked_at is null and balance_units >= p_units;
  return found;
end $$;

-- Settle a hold: charge the actual cost, refund the rest, record usage. Returns the new balance.
create or replace function shade_settle(
  p_account uuid, p_reserved bigint, p_actual bigint,
  p_model text, p_provider_model text, p_prompt integer, p_completion integer, p_source text
) returns bigint language plpgsql security definer as $$
declare charge bigint := least(greatest(p_actual, 0), p_reserved);
        u uuid;
        bal bigint;
begin
  insert into shade_usage(account_id, model_id, provider_model, prompt_tokens, completion_tokens, cost_units, source)
  values (p_account, p_model, p_provider_model, p_prompt, p_completion, charge, p_source)
  returning id into u;

  update shade_accounts set balance_units = balance_units + (p_reserved - charge)
   where id = p_account returning balance_units into bal;

  if charge > 0 then
    insert into shade_ledger(account_id, delta_units, kind, ref) values (p_account, -charge, 'usage', u::text);
  end if;
  return bal;
end $$;

-- Release a hold completely (model call failed).
create or replace function shade_release(p_account uuid, p_units bigint)
returns void language sql security definer as $$
  update shade_accounts set balance_units = balance_units + p_units where id = p_account;
$$;

-- Record a free-tier call (no account, no charge).
create or replace function shade_record_free(p_model text, p_provider_model text, p_prompt integer, p_completion integer)
returns void language sql security definer as $$
  insert into shade_usage(model_id, provider_model, prompt_tokens, completion_tokens, cost_units, source)
  values (p_model, p_provider_model, p_prompt, p_completion, 0, 'free');
$$;

-- Fixed-window rate limiter. Returns true if this hit is allowed.
create or replace function shade_rate_hit(p_bucket text, p_window_seconds integer, p_limit integer)
returns boolean language plpgsql security definer as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
        n integer;
begin
  insert into shade_rate_buckets(bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = shade_rate_buckets.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from shade_rate_buckets where window_start < now() - interval '2 days';
  end if;
  return n <= p_limit;
end $$;

-- Public, real counters for the live stats on the site.
create or replace function shade_public_stats()
returns json language sql security definer stable as $$
  select json_build_object(
    'requests_total', (select count(*) from shade_usage),
    'requests_24h',   (select count(*) from shade_usage where created_at > now() - interval '24 hours'),
    'tokens_total',   (select coalesce(sum(prompt_tokens + completion_tokens), 0) from shade_usage),
    'deposits_total', (select count(*) from shade_deposits where status = 'credited')
  );
$$;

-- Expire stale pending deposits (called opportunistically by the server).
create or replace function shade_expire_deposits()
returns void language sql security definer as $$
  update shade_deposits set status = 'expired' where status = 'pending' and expires_at < now() - interval '15 minutes';
$$;

-- Only the service role may call these.
revoke all on function shade_credit_deposit(uuid, text, bigint) from public, anon, authenticated;
revoke all on function shade_reserve(uuid, bigint)              from public, anon, authenticated;
revoke all on function shade_settle(uuid, bigint, bigint, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function shade_release(uuid, bigint)              from public, anon, authenticated;
revoke all on function shade_record_free(text, text, integer, integer) from public, anon, authenticated;
revoke all on function shade_rate_hit(text, integer, integer)   from public, anon, authenticated;
revoke all on function shade_public_stats()                     from public, anon, authenticated;
revoke all on function shade_expire_deposits()                  from public, anon, authenticated;
