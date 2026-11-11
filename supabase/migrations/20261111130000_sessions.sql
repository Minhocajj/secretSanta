create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.settings (
  name text primary key,
  value integer not null check (value >= 0)
);

insert into private.settings (name, value) values
  ('create_per_hour_per_ip', 10),
  ('join_per_hour_per_ip', 60),
  ('max_sessions', 2000),
  ('retention_days', 60);

create table private.secrets (
  name text primary key,
  value text not null
);

insert into private.secrets (name, value)
values ('throttle_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function private.squash(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(p_text, '\s+', ' ', 'g'))
$$;

create function private.has_control(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text ~ '[\x01-\x1f\x7f-\x9f]'
$$;

create function private.is_email(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text ~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
$$;

create function private.max_participants()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 100
$$;

create table private.sessions (
  id uuid primary key default gen_random_uuid(),
  admin_token_hash bytea not null,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  draw_started_at timestamptz,
  constraint sessions_status_check check (status in ('open', 'closed', 'completed')),
  constraint sessions_title_check check (
    char_length(title) between 1 and 80 and title = private.squash(title) and not private.has_control(title)
  ),
  constraint sessions_description_check check (
    char_length(description) <= 500 and description = private.squash(description) and not private.has_control(description)
  ),
  constraint sessions_draw_check check (draw_started_at is null or status <> 'open')
);

create index sessions_expires_at_idx on private.sessions (expires_at);

create table private.participants (
  id bigint generated always as identity primary key,
  session_id uuid not null references private.sessions (id) on delete cascade,
  name text not null,
  email text not null,
  gift text not null default '',
  created_at timestamptz not null default now(),
  constraint participants_name_check check (
    char_length(name) between 1 and 60 and name = private.squash(name) and not private.has_control(name)
  ),
  constraint participants_email_check check (
    char_length(email) between 3 and 254 and email = pg_catalog.btrim(email) and private.is_email(email)
  ),
  constraint participants_gift_check check (
    char_length(gift) <= 200 and gift = private.squash(gift) and not private.has_control(gift)
  )
);

create unique index participants_session_name_key on private.participants (session_id, lower(name));
create unique index participants_session_email_key on private.participants (session_id, lower(email));

create table private.throttle_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, window_start)
);

alter table private.settings enable row level security;
alter table private.secrets enable row level security;
alter table private.sessions enable row level security;
alter table private.participants enable row level security;
alter table private.throttle_hits enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;

create function private.guard_session_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.admin_token_hash is distinct from old.admin_token_hash
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at then
    raise exception 'app:conflict';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'open' and new.status = 'closed')
      or (old.status = 'closed' and new.status = 'open' and old.draw_started_at is null)
      or (old.status = 'closed' and new.status = 'completed' and old.draw_started_at is not null)
    ) then
      raise exception 'app:conflict';
    end if;
  end if;

  if new.draw_started_at is distinct from old.draw_started_at
    and (old.draw_started_at is not null or new.status <> 'closed') then
    raise exception 'app:conflict';
  end if;

  return new;
end;
$$;

create trigger sessions_guard_update
before update on private.sessions
for each row execute function private.guard_session_update();

create function private.guard_participant_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from private.participants where session_id = new.session_id) >= private.max_participants() then
    raise exception 'app:full';
  end if;
  return new;
end;
$$;

create trigger participants_guard_insert
before insert on private.participants
for each row execute function private.guard_participant_insert();

create function private.setting(p_name text)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  v_value integer;
begin
  select value into v_value from private.settings where name = p_name;
  if not found then
    raise exception 'missing setting %', p_name;
  end if;
  return v_value;
end;
$$;

create function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create function private.client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
  exception
    when others then
      v_headers := null;
  end;

  v_ip := nullif(pg_catalog.btrim(v_headers ->> 'cf-connecting-ip'), '');
  if v_ip is null then
    v_ip := pg_catalog.substring(v_headers ->> 'x-forwarded-for', '([^,[:space:]]+)[[:space:]]*$');
  end if;

  return pg_catalog.left(coalesce(v_ip, 'unknown'), 64);
end;
$$;

create function private.throttle(p_action text, p_limit_setting text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_salt text;
  v_bucket text;
  v_hits integer;
begin
  select value into v_salt from private.secrets where name = 'throttle_salt';
  v_bucket := p_action || ':' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_salt || ':' || private.client_ip(), 'UTF8')),
    'hex'
  );

  insert into private.throttle_hits as t (bucket, window_start, hits)
  values (v_bucket, pg_catalog.date_trunc('hour', pg_catalog.now()), 1)
  on conflict (bucket, window_start) do update set hits = t.hits + 1
  returning t.hits into v_hits;

  if v_hits > private.setting(p_limit_setting) then
    raise exception 'app:rate_limited';
  end if;
end;
$$;

create function private.session_errors(p_title text, p_description text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_errors jsonb := '{}'::jsonb;
begin
  if p_title = '' then
    v_errors := v_errors || jsonb_build_object('title', 'required');
  elsif pg_catalog.char_length(p_title) > 80 then
    v_errors := v_errors || jsonb_build_object('title', 'too_long');
  elsif private.has_control(p_title) then
    v_errors := v_errors || jsonb_build_object('title', 'unsupported');
  end if;

  if pg_catalog.char_length(p_description) > 500 then
    v_errors := v_errors || jsonb_build_object('description', 'too_long');
  elsif private.has_control(p_description) then
    v_errors := v_errors || jsonb_build_object('description', 'unsupported');
  end if;

  return v_errors;
end;
$$;

create function private.participant_errors(p_name text, p_email text, p_gift text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_errors jsonb := '{}'::jsonb;
begin
  if p_name = '' then
    v_errors := v_errors || jsonb_build_object('name', 'required');
  elsif pg_catalog.char_length(p_name) > 60 then
    v_errors := v_errors || jsonb_build_object('name', 'too_long');
  elsif private.has_control(p_name) then
    v_errors := v_errors || jsonb_build_object('name', 'unsupported');
  end if;

  if p_email = '' then
    v_errors := v_errors || jsonb_build_object('email', 'required');
  elsif pg_catalog.char_length(p_email) > 254 or not private.is_email(p_email) then
    v_errors := v_errors || jsonb_build_object('email', 'invalid');
  end if;

  if pg_catalog.char_length(p_gift) > 200 then
    v_errors := v_errors || jsonb_build_object('gift', 'too_long');
  elsif private.has_control(p_gift) then
    v_errors := v_errors || jsonb_build_object('gift', 'unsupported');
  end if;

  return v_errors;
end;
$$;

create function private.find_session(p_id text, p_lock boolean default false)
returns private.sessions
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := private.try_uuid(p_id);
  v_session private.sessions;
begin
  if v_id is not null then
    if p_lock then
      select * into v_session from private.sessions where id = v_id and expires_at > pg_catalog.now() for update;
    else
      select * into v_session from private.sessions where id = v_id and expires_at > pg_catalog.now();
    end if;
  end if;

  if v_session.id is null then
    raise exception 'app:not_found';
  end if;
  return v_session;
end;
$$;

create function private.authorize(p_id text, p_token text, p_lock boolean default true)
returns private.sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session private.sessions;
begin
  v_session := private.find_session(p_id, p_lock);
  if v_session.admin_token_hash is distinct from
    pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_token, ''), 'UTF8')) then
    raise exception 'app:not_found';
  end if;
  return v_session;
end;
$$;

create function private.is_full(p_session_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select count(*) from private.participants where session_id = p_session_id) >= private.max_participants()
$$;

create function private.insert_participant(p_session private.sessions, p_name text, p_email text, p_gift text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := private.squash(coalesce(p_name, ''));
  v_email text := pg_catalog.btrim(coalesce(p_email, ''));
  v_gift text := private.squash(coalesce(p_gift, ''));
  v_errors jsonb;
  v_id bigint;
begin
  if p_session.status <> 'open' then
    raise exception 'app:closed';
  end if;
  if private.is_full(p_session.id) then
    raise exception 'app:full';
  end if;

  v_errors := private.participant_errors(v_name, v_email, v_gift);

  if not v_errors ? 'name' and exists (
    select 1 from private.participants where session_id = p_session.id and lower(name) = lower(v_name)
  ) then
    v_errors := v_errors || jsonb_build_object('name', 'taken');
  end if;
  if not v_errors ? 'email' and exists (
    select 1 from private.participants where session_id = p_session.id and lower(email) = lower(v_email)
  ) then
    v_errors := v_errors || jsonb_build_object('email', 'taken');
  end if;

  if v_errors <> '{}'::jsonb then
    raise exception using message = 'app:invalid', detail = v_errors::text;
  end if;

  insert into private.participants (session_id, name, email, gift)
  values (p_session.id, v_name, v_email, v_gift)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'name', v_name, 'email', v_email, 'gift', v_gift);
end;
$$;

create function private.purge_expired()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from private.sessions where expires_at <= pg_catalog.now();
  get diagnostics v_deleted = row_count;
  delete from private.throttle_hits where window_start < pg_catalog.now() - interval '2 days';
  return v_deleted;
end;
$$;

create function public.create_session(p_title text, p_description text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := private.squash(coalesce(p_title, ''));
  v_description text := private.squash(coalesce(p_description, ''));
  v_errors jsonb;
  v_token text;
  v_id uuid;
begin
  v_errors := private.session_errors(v_title, v_description);
  if v_errors <> '{}'::jsonb then
    raise exception using message = 'app:invalid', detail = v_errors::text;
  end if;

  perform private.throttle('create', 'create_per_hour_per_ip');

  if (select count(*) from private.sessions where expires_at > pg_catalog.now()) >= private.setting('max_sessions') then
    raise exception 'app:rate_limited';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into private.sessions (admin_token_hash, title, description, expires_at)
  values (
    pg_catalog.sha256(pg_catalog.convert_to(v_token, 'UTF8')),
    v_title,
    v_description,
    pg_catalog.now() + pg_catalog.make_interval(days => private.setting('retention_days'))
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'admin_token', v_token);
end;
$$;

create function public.get_public_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.find_session(p_session_id);
begin
  return jsonb_build_object(
    'id', v_session.id,
    'title', v_session.title,
    'description', v_session.description,
    'status', v_session.status,
    'full', private.is_full(v_session.id)
  );
end;
$$;

create function public.join_session(p_session_id text, p_name text, p_email text, p_gift text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions;
begin
  perform private.throttle('join', 'join_per_hour_per_ip');
  v_session := private.find_session(p_session_id, true);
  perform private.insert_participant(v_session, p_name, p_email, p_gift);
end;
$$;

create function public.get_admin_view(p_session_id text, p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token, false);
begin
  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'title', v_session.title,
      'description', v_session.description,
      'status', v_session.status,
      'full', private.is_full(v_session.id),
      'created_at', v_session.created_at,
      'draw_started_at', v_session.draw_started_at
    ),
    'participants', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'gift', p.gift) order by p.id
        )
        from private.participants p
        where p.session_id = v_session.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create function public.add_participant(
  p_session_id text,
  p_admin_token text,
  p_name text,
  p_email text,
  p_gift text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  return private.insert_participant(v_session, p_name, p_email, p_gift);
end;
$$;

create function public.remove_participant(p_session_id text, p_admin_token text, p_participant_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
  v_deleted integer;
begin
  if v_session.status <> 'open' then
    raise exception 'app:closed';
  end if;

  delete from private.participants where id = p_participant_id and session_id = v_session.id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'app:not_found';
  end if;
end;
$$;

create function public.close_session(p_session_id text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  if v_session.status = 'completed' then
    raise exception 'app:conflict';
  end if;
  if v_session.status = 'open' then
    update private.sessions set status = 'closed' where id = v_session.id;
  end if;
end;
$$;

create function public.reopen_session(p_session_id text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  if v_session.status = 'completed' or v_session.draw_started_at is not null then
    raise exception 'app:conflict';
  end if;
  if v_session.status = 'closed' then
    update private.sessions set status = 'open' where id = v_session.id;
  end if;
end;
$$;

create function public.mark_draw_started(p_session_id text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  if v_session.status <> 'closed' then
    raise exception 'app:conflict';
  end if;
  if v_session.draw_started_at is null then
    update private.sessions set draw_started_at = pg_catalog.now() where id = v_session.id;
  end if;
end;
$$;

create function public.complete_session(p_session_id text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  if v_session.status = 'completed' then
    return;
  end if;
  if v_session.status <> 'closed' or v_session.draw_started_at is null then
    raise exception 'app:conflict';
  end if;
  update private.sessions set status = 'completed' where id = v_session.id;
end;
$$;

create function public.delete_session(p_session_id text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
begin
  delete from private.sessions where id = v_session.id;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.create_session(text, text) from public, anon, authenticated;
revoke all on function public.get_public_session(text) from public, anon, authenticated;
revoke all on function public.join_session(text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_admin_view(text, text) from public, anon, authenticated;
revoke all on function public.add_participant(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_participant(text, text, bigint) from public, anon, authenticated;
revoke all on function public.close_session(text, text) from public, anon, authenticated;
revoke all on function public.reopen_session(text, text) from public, anon, authenticated;
revoke all on function public.mark_draw_started(text, text) from public, anon, authenticated;
revoke all on function public.complete_session(text, text) from public, anon, authenticated;
revoke all on function public.delete_session(text, text) from public, anon, authenticated;

grant execute on function public.create_session(text, text) to anon, authenticated;
grant execute on function public.get_public_session(text) to anon, authenticated;
grant execute on function public.join_session(text, text, text, text) to anon, authenticated;
grant execute on function public.get_admin_view(text, text) to anon, authenticated;
grant execute on function public.add_participant(text, text, text, text, text) to anon, authenticated;
grant execute on function public.remove_participant(text, text, bigint) to anon, authenticated;
grant execute on function public.close_session(text, text) to anon, authenticated;
grant execute on function public.reopen_session(text, text) to anon, authenticated;
grant execute on function public.mark_draw_started(text, text) to anon, authenticated;
grant execute on function public.complete_session(text, text) to anon, authenticated;
grant execute on function public.delete_session(text, text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('secretsanta-purge-expired', '17 3 * * *', 'select private.purge_expired()');
  else
    raise notice 'pg_cron is not available: schedule select private.purge_expired() daily yourself';
  end if;
exception
  when others then
    raise notice 'pg_cron was not scheduled (%): schedule select private.purge_expired() daily yourself', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
