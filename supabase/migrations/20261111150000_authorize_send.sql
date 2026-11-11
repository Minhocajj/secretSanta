alter table private.participants add column send_count integer not null default 0;

insert into private.settings (name, value) values
  ('send_per_participant', 6),
  ('send_per_day', 100);

create function public.authorize_send(p_session_id text, p_admin_token text, p_participant_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session private.sessions := private.authorize(p_session_id, p_admin_token);
  v_participant private.participants;
  v_hits integer;
begin
  if v_session.status <> 'closed' or v_session.draw_started_at is null then
    raise exception 'app:conflict';
  end if;

  select * into v_participant
  from private.participants
  where id = p_participant_id and session_id = v_session.id
  for update;
  if not found then
    raise exception 'app:not_found';
  end if;

  if v_participant.send_count >= private.setting('send_per_participant') then
    raise exception 'app:rate_limited';
  end if;

  insert into private.throttle_hits as t (bucket, window_start, hits)
  values ('send:all', pg_catalog.date_trunc('day', pg_catalog.now()), 1)
  on conflict (bucket, window_start) do update set hits = t.hits + 1
  returning t.hits into v_hits;
  if v_hits > private.setting('send_per_day') then
    raise exception 'app:rate_limited';
  end if;

  update private.participants set send_count = send_count + 1 where id = v_participant.id;

  return jsonb_build_object('name', v_participant.name, 'email', v_participant.email);
end;
$$;

revoke all on function public.authorize_send(text, text, bigint) from public, anon, authenticated;
grant execute on function public.authorize_send(text, text, bigint) to anon, authenticated;

notify pgrst, 'reload schema';
