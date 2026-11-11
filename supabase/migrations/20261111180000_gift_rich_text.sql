alter table private.participants drop constraint participants_gift_check;
alter table private.participants add constraint participants_gift_check check (
  char_length(gift) <= 500
  and gift = private.squash_note(gift)
  and not private.has_note_control(gift)
);

create or replace function private.participant_errors(p_name text, p_email text, p_gift text)
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

  if pg_catalog.char_length(p_gift) > 500 then
    v_errors := v_errors || jsonb_build_object('gift', 'too_long');
  elsif private.has_note_control(p_gift) then
    v_errors := v_errors || jsonb_build_object('gift', 'unsupported');
  end if;

  return v_errors;
end;
$$;

create or replace function private.insert_participant(p_session private.sessions, p_name text, p_email text, p_gift text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name text := private.squash(coalesce(p_name, ''));
  v_email text := pg_catalog.btrim(coalesce(p_email, ''));
  v_gift text := private.squash_note(coalesce(p_gift, ''));
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

notify pgrst, 'reload schema';
