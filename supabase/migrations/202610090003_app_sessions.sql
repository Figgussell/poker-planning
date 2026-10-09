alter table public.rooms
  drop constraint if exists rooms_created_by_fkey;

alter table public.room_members
  drop constraint if exists room_members_user_id_fkey;

create or replace function public._set_app_identity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Application session required' using errcode = '28000';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function public.create_room(p_user_id uuid, p_name text, p_host_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.create_room(p_name, p_host_name);
end;
$$;

create or replace function public.join_room(p_user_id uuid, p_invite_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.join_room(p_invite_token, p_display_name);
end;
$$;

create or replace function public.get_room_snapshot(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.get_room_snapshot(p_room_id);
end;
$$;

create or replace function public.get_saved_round_estimates(p_user_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.get_saved_round_estimates(p_room_id);
end;
$$;

create or replace function public.add_task(p_user_id uuid, p_room_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.add_task(p_room_id, p_title);
end;
$$;

create or replace function public.submit_vote(p_user_id uuid, p_room_id uuid, p_value numeric, p_cannot_estimate boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  perform public.submit_vote(p_room_id, p_value, p_cannot_estimate);
end;
$$;

create or replace function public.reveal_round(p_user_id uuid, p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  perform public.reveal_round(p_room_id);
end;
$$;

create or replace function public.save_round(
  p_user_id uuid,
  p_room_id uuid,
  p_development_estimate numeric,
  p_testing_estimate numeric,
  p_unestimated boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  perform public.save_round(p_room_id, p_development_estimate, p_testing_estimate, p_unestimated);
end;
$$;

create or replace function public.start_next_round(p_user_id uuid, p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._set_app_identity(p_user_id);
  return public.start_next_round(p_room_id);
end;
$$;

revoke all on function public._set_app_identity(uuid) from public, anon, authenticated;
revoke all on function public.create_room(text, text) from public, anon, authenticated;
revoke all on function public.join_room(text, text) from public, anon, authenticated;
revoke all on function public.get_room_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_saved_round_estimates(uuid) from public, anon, authenticated;
revoke all on function public.add_task(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_vote(uuid, numeric, boolean) from public, anon, authenticated;
revoke all on function public.reveal_round(uuid) from public, anon, authenticated;
revoke all on function public.save_round(uuid, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.start_next_round(uuid) from public, anon, authenticated;

revoke all on function public.create_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_room(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_room_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_saved_round_estimates(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_task(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.submit_vote(uuid, uuid, numeric, boolean) from public, anon, authenticated;
revoke all on function public.reveal_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_round(uuid, uuid, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.start_next_round(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_room(uuid, text, text) to service_role;
grant execute on function public.join_room(uuid, text, text) to service_role;
grant execute on function public.get_room_snapshot(uuid, uuid) to service_role;
grant execute on function public.get_saved_round_estimates(uuid, uuid) to service_role;
grant execute on function public.add_task(uuid, uuid, text) to service_role;
grant execute on function public.submit_vote(uuid, uuid, numeric, boolean) to service_role;
grant execute on function public.reveal_round(uuid, uuid) to service_role;
grant execute on function public.save_round(uuid, uuid, numeric, numeric, boolean) to service_role;
grant execute on function public.start_next_round(uuid, uuid) to service_role;