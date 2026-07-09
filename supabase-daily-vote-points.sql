-- Ocean Library: 每日反思投票积分
-- Run this in Supabase > SQL Editor.
-- 每位老师每天第一次投票成功时 +1 分；同一天重复投票不会再加分。

create or replace function public.sync_daily_vote_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.members
      set points = points + 1
      where lower(name) = lower(trim(new.member_name));
    if not found then
      raise exception 'Unknown teacher: %', new.member_name;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.members
      set points = greatest(points - 1, 0)
      where lower(name) = lower(trim(old.member_name));
    return old;
  elsif lower(trim(old.member_name)) <> lower(trim(new.member_name)) then
    update public.members
      set points = greatest(points - 1, 0)
      where lower(name) = lower(trim(old.member_name));
    update public.members
      set points = points + 1
      where lower(name) = lower(trim(new.member_name));
  end if;
  return new;
end;
$$;

drop trigger if exists sync_daily_vote_points_trigger on public.daily_votes;
create trigger sync_daily_vote_points_trigger
after insert or delete or update of member_name on public.daily_votes
for each row execute function public.sync_daily_vote_points();

create or replace function public.recalculate_member_points()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_ocean_admin() then
    raise exception 'Admin access required';
  end if;

  update public.members m
  set points = counts.diamond_total + counts.vote_total,
      diamonds = counts.diamond_total
  from (
    select m2.id,
           count(distinct d.id)::int as diamond_total,
           count(distinct v.vote_date)::int as vote_total
    from public.members m2
    left join public.diamonds d on lower(d.author_name) = lower(m2.name)
    left join public.daily_votes v on lower(v.member_name) = lower(m2.name)
    group by m2.id
  ) counts
  where m.id = counts.id;
end;
$$;

update public.members m
set points = counts.diamond_total + counts.vote_total,
    diamonds = counts.diamond_total
from (
  select m2.id,
         count(distinct d.id)::int as diamond_total,
         count(distinct v.vote_date)::int as vote_total
  from public.members m2
  left join public.diamonds d on lower(d.author_name) = lower(m2.name)
  left join public.daily_votes v on lower(v.member_name) = lower(m2.name)
  group by m2.id
) counts
where m.id = counts.id;

revoke execute on function public.sync_daily_vote_points() from public, anon, authenticated;
grant execute on function public.recalculate_member_points() to authenticated;
revoke execute on function public.recalculate_member_points() from public, anon;
