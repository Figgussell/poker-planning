create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_hash text not null unique,
  created_by uuid not null references auth.users(id),
  active_task_id uuid,
  active_round_id uuid,
  created_at timestamptz not null default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null check (role in ('host', 'participant')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  task_number integer not null check (task_number > 0),
  title text not null check (char_length(title) between 1 and 240),
  created_at timestamptz not null default now(),
  unique (room_id, task_number),
  unique (room_id, id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  task_id uuid not null,
  round_number integer not null check (round_number > 0),
  status text not null default 'voting' check (status in ('voting', 'revealed', 'complete')),
  final_estimate numeric(24, 8) check (final_estimate is null or (final_estimate >= 0 and final_estimate <> 'NaN'::numeric)),
  final_unestimated boolean not null default false,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  completed_at timestamptz,
  foreign key (room_id, task_id) references public.tasks(room_id, id) on delete cascade,
  unique (task_id, round_number),
  unique (room_id, id),
  check (not (final_unestimated and final_estimate is not null)),
  check (status <> 'complete' or final_unestimated or final_estimate is not null)
);

alter table public.rooms
  add constraint rooms_active_task_fk foreign key (id, active_task_id)
    references public.tasks(room_id, id) deferrable initially deferred,
  add constraint rooms_active_round_fk foreign key (id, active_round_id)
    references public.rounds(room_id, id) deferrable initially deferred;

create table public.votes (
  room_id uuid not null,
  round_id uuid not null,
  member_id uuid not null,
  value numeric(24, 8),
  cannot_estimate boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (round_id, member_id),
  foreign key (room_id, round_id) references public.rounds(room_id, id) on delete cascade,
  foreign key (room_id, member_id) references public.room_members(room_id, id) on delete cascade,
  check ((value is not null and value >= 0 and value <> 'NaN'::numeric and not cannot_estimate) or (value is null and cannot_estimate))
);

create index votes_room_round_idx on public.votes(room_id, round_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.tasks enable row level security;
alter table public.rounds enable row level security;
alter table public.votes enable row level security;

revoke all on public.rooms, public.room_members, public.tasks, public.rounds, public.votes from anon, authenticated;

create or replace function public._assert_room_member(p_room_id uuid)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.room_members;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id and user_id = auth.uid();

  if not found then
    raise exception 'Room membership required' using errcode = '42501';
  end if;

  return v_member;
end;
$$;

create or replace function public._assert_room_host(p_room_id uuid)
returns public.room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.room_members;
begin
  v_member := public._assert_room_member(p_room_id);
  if v_member.role <> 'host' then
    raise exception 'Host role required' using errcode = '42501';
  end if;
  return v_member;
end;
$$;

create or replace function public.create_room(p_name text, p_host_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
  v_token text;
  v_name text := btrim(p_name);
  v_host_name text := btrim(p_host_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 80 then
    raise exception 'Room name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  if v_host_name is null or char_length(v_host_name) not between 1 and 40 then
    raise exception 'Display name must contain 1 to 40 characters' using errcode = '22023';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.rooms (name, invite_hash, created_by)
  values (v_name, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), auth.uid())
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (v_room_id, auth.uid(), v_host_name, 'host');

  return jsonb_build_object('room_id', v_room_id, 'invite_token', v_token);
end;
$$;

create or replace function public.join_room(p_invite_token text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
  v_name text := btrim(p_display_name);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'Display name must contain 1 to 40 characters' using errcode = '22023';
  end if;
  if p_invite_token is null or char_length(p_invite_token) <> 64 then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  select id into v_room_id
  from public.rooms
  where invite_hash = encode(extensions.digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex');

  if v_room_id is null then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;

  insert into public.room_members (room_id, user_id, display_name, role)
  values (v_room_id, auth.uid(), v_name, 'participant')
  on conflict (room_id, user_id) do update set display_name = excluded.display_name;

  return v_room_id;
end;
$$;

create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer public.room_members;
  v_room public.rooms;
  v_snapshot jsonb;
begin
  v_viewer := public._assert_room_member(p_room_id);
  select * into v_room from public.rooms where id = p_room_id;

  select jsonb_build_object(
    'room', jsonb_build_object('id', v_room.id, 'name', v_room.name),
    'viewer', jsonb_build_object('member_id', v_viewer.id, 'display_name', v_viewer.display_name, 'role', v_viewer.role),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id,
        'display_name', m.display_name,
        'role', m.role,
        'has_voted', exists (
          select 1 from public.votes vote
          where vote.room_id = p_room_id and vote.round_id = v_room.active_round_id and vote.member_id = m.id
        )
      ) order by m.joined_at)
      from public.room_members m where m.room_id = p_room_id
    ), '[]'::jsonb),
    'active_task', (
      select jsonb_build_object('id', t.id, 'number', t.task_number, 'title', t.title)
      from public.tasks t where t.id = v_room.active_task_id
    ),
    'active_round', (
      select jsonb_build_object(
        'id', r.id,
        'number', r.round_number,
        'status', r.status,
        'my_vote', (
          select jsonb_build_object('value', vote.value, 'cannot_estimate', vote.cannot_estimate)
          from public.votes vote
          where vote.room_id = p_room_id and vote.round_id = r.id and vote.member_id = v_viewer.id
        ),
        'votes', case when r.status in ('revealed', 'complete') then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'display_name', m.display_name,
            'value', vote.value,
            'cannot_estimate', vote.cannot_estimate
          ) order by m.joined_at), '[]'::jsonb)
          from public.votes vote
          join public.room_members m on m.id = vote.member_id and m.room_id = vote.room_id
          where vote.room_id = p_room_id and vote.round_id = r.id
        ) else null end,
        'final_estimate', r.final_estimate,
        'final_unestimated', r.final_unestimated
      )
      from public.rounds r where r.id = v_room.active_round_id
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'number', t.task_number,
        'title', t.title,
        'rounds', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', r.id,
            'number', r.round_number,
            'status', r.status,
            'final_estimate', r.final_estimate,
            'final_unestimated', r.final_unestimated,
            'votes', case when r.status in ('revealed', 'complete') then (
              select coalesce(jsonb_agg(jsonb_build_object(
                'display_name', m.display_name,
                'value', vote.value,
                'cannot_estimate', vote.cannot_estimate
              ) order by m.joined_at), '[]'::jsonb)
              from public.votes vote
              join public.room_members m on m.id = vote.member_id and m.room_id = vote.room_id
              where vote.room_id = p_room_id and vote.round_id = r.id
            ) else null end
          ) order by r.round_number)
          from public.rounds r where r.task_id = t.id
        ), '[]'::jsonb)
      ) order by t.task_number desc)
      from public.tasks t where t.room_id = p_room_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

create or replace function public.add_task(p_room_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_task_id uuid;
  v_round_id uuid;
  v_title text := btrim(p_title);
begin
  perform public._assert_room_host(p_room_id);
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.active_round_id is not null and not exists (
    select 1 from public.rounds where id = v_room.active_round_id and status = 'complete'
  ) then
    raise exception 'Complete the active round before adding another task' using errcode = '55000';
  end if;
  if v_title is null or char_length(v_title) not between 1 and 240 then
    raise exception 'Task title must contain 1 to 240 characters' using errcode = '22023';
  end if;

  insert into public.tasks (room_id, task_number, title)
  select p_room_id, coalesce(max(task_number), 0) + 1, v_title from public.tasks where room_id = p_room_id
  returning id into v_task_id;
  insert into public.rounds (room_id, task_id, round_number) values (p_room_id, v_task_id, 1) returning id into v_round_id;
  update public.rooms set active_task_id = v_task_id, active_round_id = v_round_id where id = p_room_id;
  return v_task_id;
end;
$$;

create or replace function public.submit_vote(p_room_id uuid, p_value numeric, p_cannot_estimate boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.room_members;
  v_round_id uuid;
begin
  v_member := public._assert_room_member(p_room_id);
  if (p_value is null and not p_cannot_estimate)
    or (p_value is not null and (p_cannot_estimate or p_value < 0 or p_value::text = 'NaN')) then
    raise exception 'Choose a non-negative estimate or Cannot estimate' using errcode = '22023';
  end if;
  select active_round_id into v_round_id from public.rooms where id = p_room_id for update;
  if v_round_id is null or not exists (
    select 1 from public.rounds where id = v_round_id and status = 'voting'
  ) then
    raise exception 'Voting is not open' using errcode = '55000';
  end if;

  insert into public.votes (room_id, round_id, member_id, value, cannot_estimate)
  values (p_room_id, v_round_id, v_member.id, p_value, p_cannot_estimate)
  on conflict (round_id, member_id) do update
    set value = excluded.value, cannot_estimate = excluded.cannot_estimate, updated_at = now();
end;
$$;

create or replace function public.reveal_round(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  perform public._assert_room_host(p_room_id);
  select active_round_id into v_round_id from public.rooms where id = p_room_id for update;
  update public.rounds set status = 'revealed', revealed_at = now()
  where id = v_round_id and room_id = p_room_id and status = 'voting';
  if not found then
    raise exception 'No round is ready to reveal' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.save_round(p_room_id uuid, p_final_estimate numeric, p_unestimated boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id uuid;
begin
  perform public._assert_room_host(p_room_id);
  if (p_final_estimate is null and not p_unestimated)
    or (p_final_estimate is not null and (p_unestimated or p_final_estimate < 0 or p_final_estimate::text = 'NaN')) then
    raise exception 'Choose a non-negative final estimate or mark unestimated' using errcode = '22023';
  end if;
  select active_round_id into v_round_id from public.rooms where id = p_room_id for update;
  update public.rounds
  set status = 'complete', final_estimate = p_final_estimate, final_unestimated = p_unestimated, completed_at = now()
  where id = v_round_id and room_id = p_room_id and status = 'revealed';
  if not found then
    raise exception 'Reveal the round before saving its result' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.start_next_round(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_round_id uuid;
  v_round_number integer;
begin
  perform public._assert_room_host(p_room_id);
  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.active_task_id is null or not exists (
    select 1 from public.rounds where id = v_room.active_round_id and status = 'complete'
  ) then
    raise exception 'Save the active round before starting another' using errcode = '55000';
  end if;

  select coalesce(max(round_number), 0) + 1 into v_round_number
  from public.rounds where task_id = v_room.active_task_id;
  insert into public.rounds (room_id, task_id, round_number)
  values (p_room_id, v_room.active_task_id, v_round_number)
  returning id into v_round_id;
  update public.rooms set active_round_id = v_round_id where id = p_room_id;
  return v_round_id;
end;
$$;

revoke all on function public._assert_room_member(uuid) from public, anon, authenticated;
revoke all on function public._assert_room_host(uuid) from public, anon, authenticated;
revoke all on function public.create_room(text, text) from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.get_room_snapshot(uuid) from public, anon;
revoke all on function public.add_task(uuid, text) from public, anon;
revoke all on function public.submit_vote(uuid, numeric, boolean) from public, anon;
revoke all on function public.reveal_round(uuid) from public, anon;
revoke all on function public.save_round(uuid, numeric, boolean) from public, anon;
revoke all on function public.start_next_round(uuid) from public, anon;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.get_room_snapshot(uuid) to authenticated;
grant execute on function public.add_task(uuid, text) to authenticated;
grant execute on function public.submit_vote(uuid, numeric, boolean) to authenticated;
grant execute on function public.reveal_round(uuid) to authenticated;
grant execute on function public.save_round(uuid, numeric, boolean) to authenticated;
grant execute on function public.start_next_round(uuid) to authenticated;