alter table public.rounds
  add column development_estimate numeric(24, 8),
  add column testing_estimate numeric(24, 8);

update public.rounds
set development_estimate = final_estimate,
    testing_estimate = 0
where final_estimate is not null and not final_unestimated;

alter table public.rounds
  add constraint rounds_development_estimate_nonnegative
    check (development_estimate is null or (development_estimate >= 0 and development_estimate <> 'NaN'::numeric)),
  add constraint rounds_testing_estimate_nonnegative
    check (testing_estimate is null or (testing_estimate >= 0 and testing_estimate <> 'NaN'::numeric)),
  add constraint rounds_estimate_sum_matches_total
    check (
      (development_estimate is null and testing_estimate is null and final_estimate is null)
      or (
        development_estimate is not null
        and testing_estimate is not null
        and final_estimate = development_estimate + testing_estimate
      )
    );

drop function public.save_round(uuid, numeric, boolean);

create function public.save_round(
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
declare
  v_round_id uuid;
begin
  perform public._assert_room_host(p_room_id);
  if p_unestimated then
    if p_development_estimate is not null or p_testing_estimate is not null then
      raise exception 'Clear both estimates when marking unestimated' using errcode = '22023';
    end if;
  elsif p_development_estimate is null or p_testing_estimate is null
    or p_development_estimate < 0 or p_testing_estimate < 0
    or p_development_estimate::text = 'NaN' or p_testing_estimate::text = 'NaN' then
    raise exception 'Enter non-negative development and testing estimates' using errcode = '22023';
  end if;

  select active_round_id into v_round_id
  from public.rooms where id = p_room_id for update;

  update public.rounds
  set status = 'complete',
      development_estimate = p_development_estimate,
      testing_estimate = p_testing_estimate,
      final_estimate = case when p_unestimated then null else p_development_estimate + p_testing_estimate end,
      final_unestimated = p_unestimated,
      completed_at = now()
  where id = v_round_id and room_id = p_room_id and status = 'revealed';

  if not found then
    raise exception 'Reveal the round before saving its result' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.get_saved_round_estimates(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estimates jsonb;
begin
  perform public._assert_room_member(p_room_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', task_id,
    'round_id', id,
    'development_estimate', development_estimate,
    'testing_estimate', testing_estimate,
    'final_estimate', final_estimate,
    'final_unestimated', final_unestimated
  ) order by created_at), '[]'::jsonb)
  into v_estimates
  from public.rounds
  where room_id = p_room_id and status = 'complete';

  return v_estimates;
end;
$$;

revoke all on function public.save_round(uuid, numeric, numeric, boolean) from public, anon;
revoke all on function public.get_saved_round_estimates(uuid) from public, anon;
grant execute on function public.save_round(uuid, numeric, numeric, boolean) to authenticated;
grant execute on function public.get_saved_round_estimates(uuid) to authenticated;