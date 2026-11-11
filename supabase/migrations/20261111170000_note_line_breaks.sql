create function private.squash_note(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(p_text, '\r\n?', E'\n', 'g'),
          '[ \t\f\v]+', ' ', 'g'
        ),
        ' ?\n ?', E'\n', 'g'
      ),
      '\n{3,}', E'\n\n', 'g'
    ),
    E' \n'
  )
$$;

create function private.has_note_control(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_text ~ '[\x01-\x09\x0b-\x1f\x7f-\x9f]'
$$;

alter table private.sessions drop constraint sessions_description_check;
alter table private.sessions add constraint sessions_description_check check (
  char_length(description) <= 500
  and description = private.squash_note(description)
  and not private.has_note_control(description)
);

create or replace function private.session_errors(p_title text, p_description text)
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
  elsif private.has_note_control(p_description) then
    v_errors := v_errors || jsonb_build_object('description', 'unsupported');
  end if;

  return v_errors;
end;
$$;

create or replace function public.create_session(p_title text, p_description text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := private.squash(coalesce(p_title, ''));
  v_description text := private.squash_note(coalesce(p_description, ''));
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

revoke all on function private.squash_note(text) from public, anon, authenticated;
revoke all on function private.has_note_control(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
