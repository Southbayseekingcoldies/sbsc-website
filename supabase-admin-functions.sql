-- SBSC V5.8 admin approval functions
-- Run once in Supabase SQL Editor BEFORE using /admin.

-- Remove the temporary broad SELECT policy used during upload debugging.
drop policy if exists "public can read submitted object metadata" on storage.objects;

-- Admin-only access to evidence photos.
drop policy if exists "admins can view submission photos" on storage.objects;
create policy "admins can view submission photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'submission-photos'
  and public.is_admin()
);

-- Atomic approval: re-use a bar at the same normalized address or create it,
-- add the verified reading, then mark the submission approved.
create or replace function public.approve_submission(
  p_submission_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.submissions%rowtype;
  v_bar_id public.bars.id%type;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into s
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  if s.status <> 'pending' then
    raise exception 'Submission has already been reviewed';
  end if;

  select id into v_bar_id
  from public.bars
  where lower(trim(address)) = lower(trim(s.address))
    and lower(trim(city)) = lower(trim(s.city))
    and lower(trim(coalesce(state, 'CA'))) = lower(trim(coalesce(s.state, 'CA')))
  order by id
  limit 1;

  if v_bar_id is null then
    insert into public.bars (name, address, city, state, latitude, longitude)
    values (s.bar_name, s.address, s.city, coalesce(s.state, 'CA'), p_latitude, p_longitude)
    returning id into v_bar_id;
  else
    update public.bars
    set name = s.bar_name,
        latitude = coalesce(latitude, p_latitude),
        longitude = coalesce(longitude, p_longitude)
    where id = v_bar_id;
  end if;

  insert into public.readings (bar_id, beer_name, temperature_f, measured_at, notes, approved)
  values (v_bar_id, s.beer_name, s.temperature_f, s.measured_at, s.notes, true);

  update public.submissions
  set status = 'approved', reviewed_at = now(), review_notes = null
  where id = p_submission_id;
end;
$$;

create or replace function public.reject_submission(
  p_submission_id uuid,
  p_review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  update public.submissions
  set status = 'rejected', reviewed_at = now(), review_notes = p_review_notes
  where id = p_submission_id
    and status = 'pending';

  if not found then
    raise exception 'Pending submission not found';
  end if;
end;
$$;

revoke all on function public.approve_submission(uuid,double precision,double precision) from public;
revoke all on function public.reject_submission(uuid,text) from public;
grant execute on function public.approve_submission(uuid,double precision,double precision) to authenticated;
grant execute on function public.reject_submission(uuid,text) to authenticated;
