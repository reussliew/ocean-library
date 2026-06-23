-- Ocean Library: run this entire file in Supabase > SQL Editor.

create table if not exists public.members (
  id bigint generated always as identity primary key,
  name text not null,
  level int not null default 1,
  points int not null default 0 check (points >= 0),
  weekly int not null default 0,
  books_count int not null default 0,
  diamonds int not null default 0 check (diamonds >= 0),
  role text not null default '',
  is_new boolean not null default false,
  avatar text not null default 'av-wf1.png',
  created_at timestamptz not null default now()
);

create unique index if not exists members_name_unique
  on public.members (lower(name));

create table if not exists public.books (
  id bigint generated always as identity primary key,
  title text not null,
  author text not null default '',
  icon text not null default '📘',
  created_at timestamptz not null default now()
);

create unique index if not exists books_title_unique
  on public.books (lower(title));
create unique index if not exists books_title_exact_unique
  on public.books (title);

alter table public.books add column if not exists pdf_url text;
alter table public.books add column if not exists pdf_path text;

create table if not exists public.diamonds (
  id bigint generated always as identity primary key,
  author_name text not null,
  title text not null,
  body text not null,
  avatar text not null default 'av-wf1.png',
  created_at timestamptz not null default now()
);

alter table public.diamonds add column if not exists source_key text;
drop index if exists public.diamonds_source_key_unique;
create unique index diamonds_source_key_unique
  on public.diamonds (source_key);

create index if not exists diamonds_created_at_idx
  on public.diamonds (created_at desc);

create table if not exists public.teacher_activity (
  member_name text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.daily_votes (
  vote_date date not null,
  member_name text not null,
  question_key text not null,
  option_index int not null check (option_index between 0 and 2),
  created_at timestamptz not null default now(),
  primary key (vote_date, member_name)
);

create schema if not exists private;

create or replace function private.is_ocean_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce((select auth.jwt()->>'email'), '')) in
    ('reuss@ocedu.co', 'penny@ocedu.co');
$$;

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('book-pdfs', 'book-pdfs', true, array['application/pdf'])
on conflict (id) do update
set public = true,
    allowed_mime_types = array['application/pdf'];

drop policy if exists "ocean public reads book pdfs" on storage.objects;
drop policy if exists "ocean admins upload book pdfs" on storage.objects;
drop policy if exists "ocean admins update book pdfs" on storage.objects;
drop policy if exists "ocean admins delete book pdfs" on storage.objects;

create policy "ocean public reads book pdfs"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'book-pdfs');

create policy "ocean admins upload book pdfs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'book-pdfs' and (select private.is_ocean_admin()));

create policy "ocean admins update book pdfs"
  on storage.objects for update to authenticated
  using (bucket_id = 'book-pdfs' and (select private.is_ocean_admin()))
  with check (bucket_id = 'book-pdfs' and (select private.is_ocean_admin()));

create policy "ocean admins delete book pdfs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'book-pdfs' and (select private.is_ocean_admin()));

alter table public.members enable row level security;
alter table public.books enable row level security;
alter table public.diamonds enable row level security;
alter table public.teacher_activity enable row level security;
alter table public.daily_votes enable row level security;

drop policy if exists "public read members" on public.members;
drop policy if exists "public read books" on public.books;
drop policy if exists "teachers add books" on public.books;
drop policy if exists "public read diamonds" on public.diamonds;
drop policy if exists "teachers submit diamonds" on public.diamonds;
drop policy if exists "admins manage members" on public.members;
drop policy if exists "admins manage books" on public.books;
drop policy if exists "admins manage diamonds" on public.diamonds;
drop policy if exists "public read teacher activity" on public.teacher_activity;
drop policy if exists "teachers record activity" on public.teacher_activity;
drop policy if exists "teachers update activity" on public.teacher_activity;
drop policy if exists "admins manage teacher activity" on public.teacher_activity;
drop policy if exists "public read daily votes" on public.daily_votes;
drop policy if exists "teachers submit daily votes" on public.daily_votes;
drop policy if exists "admins manage daily votes" on public.daily_votes;

create policy "public read members"
  on public.members for select to anon, authenticated using (true);

create policy "public read books"
  on public.books for select to anon, authenticated using (true);

create policy "teachers add books"
  on public.books for insert to anon, authenticated
  with check (
    char_length(trim(title)) between 1 and 200
    and char_length(trim(author)) <= 200
    and char_length(trim(icon)) between 1 and 12
  );

create policy "public read diamonds"
  on public.diamonds for select to anon, authenticated using (true);

create policy "public read teacher activity"
  on public.teacher_activity for select to anon, authenticated using (true);

create policy "teachers record activity"
  on public.teacher_activity for insert to anon, authenticated
  with check (exists (
    select 1 from public.members m
    where lower(m.name) = lower(trim(member_name))
  ));

create policy "teachers update activity"
  on public.teacher_activity for update to anon, authenticated
  using (true)
  with check (exists (
    select 1 from public.members m
    where lower(m.name) = lower(trim(member_name))
  ));

create policy "public read daily votes"
  on public.daily_votes for select to anon, authenticated using (true);

create policy "teachers submit daily votes"
  on public.daily_votes for insert to anon, authenticated
  with check (
    vote_date = (now() at time zone 'Asia/Kuala_Lumpur')::date
    and exists (
      select 1 from public.members m
      where lower(m.name) = lower(trim(member_name))
    )
  );

create policy "teachers submit diamonds"
  on public.diamonds for insert to anon, authenticated
  with check (
    char_length(trim(author_name)) between 1 and 80
    and char_length(trim(title)) between 1 and 200
    and char_length(trim(body)) between 1 and 10000
    and exists (
      select 1 from public.members m
      where lower(m.name) = lower(trim(author_name))
    )
  );

create policy "admins manage members"
  on public.members for all to authenticated
  using ((select private.is_ocean_admin()))
  with check ((select private.is_ocean_admin()));

create policy "admins manage books"
  on public.books for all to authenticated
  using ((select private.is_ocean_admin()))
  with check ((select private.is_ocean_admin()));

create policy "admins manage diamonds"
  on public.diamonds for all to authenticated
  using ((select private.is_ocean_admin()))
  with check ((select private.is_ocean_admin()));

create policy "admins manage teacher activity"
  on public.teacher_activity for all to authenticated
  using ((select private.is_ocean_admin()))
  with check ((select private.is_ocean_admin()));

create policy "admins manage daily votes"
  on public.daily_votes for all to authenticated
  using ((select private.is_ocean_admin()))
  with check ((select private.is_ocean_admin()));

drop trigger if exists enforce_weekly_diamond_limit_trigger on public.diamonds;
drop function if exists public.enforce_weekly_diamond_limit();

create or replace function public.sync_diamond_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  book_title text;
begin
  if tg_op = 'INSERT' then
    book_title := case trim(new.title)
      when '躺平，是浪费你的人生' then '躺平，是在浪费你的人生'
      when '为什么你道歉' then '为什么你不道歉'
      else trim(new.title)
    end;
    insert into public.books (title)
      values (book_title)
      on conflict do nothing;
    update public.members
      set points = points + 1, diamonds = diamonds + 1
      where lower(name) = lower(trim(new.author_name));
    if not found then
      raise exception 'Unknown teacher: %', new.author_name;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.members
      set points = greatest(points - 1, 0),
          diamonds = greatest(diamonds - 1, 0)
      where lower(name) = lower(trim(old.author_name));
    return old;
  elsif lower(trim(old.author_name)) <> lower(trim(new.author_name)) then
    update public.members
      set points = greatest(points - 1, 0),
          diamonds = greatest(diamonds - 1, 0)
      where lower(name) = lower(trim(old.author_name));
    update public.members
      set points = points + 1, diamonds = diamonds + 1
      where lower(name) = lower(trim(new.author_name));
  end if;
  return new;
end;
$$;

drop trigger if exists sync_diamond_points_trigger on public.diamonds;
create trigger sync_diamond_points_trigger
after insert or delete or update of author_name on public.diamonds
for each row execute function public.sync_diamond_points();

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
  set points = counts.total,
      diamonds = counts.total
  from (
    select m2.id, count(d.id)::int as total
    from public.members m2
    left join public.diamonds d on lower(d.author_name) = lower(m2.name)
    group by m2.id
  ) counts
  where m.id = counts.id;
end;
$$;

revoke all on table public.members, public.books, public.diamonds, public.teacher_activity, public.daily_votes from anon, authenticated;
grant select on table public.members, public.books, public.diamonds, public.teacher_activity, public.daily_votes to anon, authenticated;
grant insert on table public.books to anon, authenticated;
grant insert on table public.diamonds to anon, authenticated;
grant insert, update on table public.teacher_activity to anon, authenticated;
grant insert on table public.daily_votes to anon, authenticated;
grant insert, update, delete on table public.members, public.books to authenticated;
grant update, delete on table public.diamonds to authenticated;
grant update, delete on table public.daily_votes to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_ocean_admin() to authenticated;
grant execute on function public.recalculate_member_points() to authenticated;
revoke execute on function public.sync_diamond_points() from public, anon, authenticated;
revoke execute on function public.recalculate_member_points() from public, anon;

insert into public.members (name, level, role, avatar)
values
  ('Wenly',28,'馆长','av-wf1.png'),
  ('Cheryl',22,'资深','av-wf2.png'),
  ('Mira',18,'资深','av-wf3.png'),
  ('Chloe',16,'','av-c-whaleA.png'),
  ('Shirley',14,'','av-wf4.png'),
  ('Kam',13,'','av-c-crab.png'),
  ('Koh',12,'','av-c-whaleB.png'),
  ('Rong',11,'','av-c-star.png'),
  ('Lee',11,'','av-c-jelly.png'),
  ('Jonny',10,'','av-wf4.png'),
  ('Jorryn',10,'','av-c-whaleA.png'),
  ('CK',10,'','av-c-whaleB.png'),
  ('Evelyn',9,'','av-wf1.png'),
  ('Lau',9,'','av-wf2.png'),
  ('Justin',9,'','av-wf3.png'),
  ('Ocean',8,'','av-c-jelly.png'),
  ('Yew',8,'','av-wf4.png'),
  ('Xiao Wei',8,'','av-wf1.png'),
  ('Kah Yeng',7,'','av-wf2.png'),
  ('Xin Hui',7,'','av-wf3.png'),
  ('Lam',6,'','av-wf4.png'),
  ('FM',6,'','av-c-whaleA.png'),
  ('Cathy',5,'','av-c-whaleB.png'),
  ('Joshua',5,'','av-c-crab.png'),
  ('Kah Lok',4,'','av-c-crab.png'),
  ('Rachel',4,'','av-wf3.png'),
  ('Penny',3,'管理员','av-c-star.png'),
  ('Reuss',3,'管理员','av-c-whaleA.png')
on conflict do nothing;

insert into public.books (title, author, icon)
values
  ('可复制的领导力：樊登的9堂商业课','樊登','🧭'),
  ('目标感','威廉·戴蒙','🎯'),
  ('能力陷阱','埃米尼亚·伊贝拉','🪜'),
  ('干法','稻盛和夫','🛠️'),
  ('为什么你不道歉','哈丽特·勒纳','🤝'),
  ('躺平，是在浪费你的人生','作者未标注','🌱')
on conflict do nothing;

update public.books
set pdf_url = 'https://ocean-library-zeta.vercel.app/copyable-leadership-fan-deng.pdf',
    pdf_path = null
where title = '可复制的领导力：樊登的9堂商业课'
  and (coalesce(pdf_url, '') = '' or pdf_url like '%supabase.co/storage/%' or pdf_url not like 'http%');

insert into public.books (title)
select distinct case trim(d.title)
  when '躺平，是浪费你的人生' then '躺平，是在浪费你的人生'
  when '为什么你道歉' then '为什么你不道歉'
  else trim(d.title)
end
from public.diamonds d
where trim(d.title) <> ''
on conflict do nothing;

update public.members m
set points = counts.total,
    diamonds = counts.total
from (
  select m2.id, count(d.id)::int as total
  from public.members m2
  left join public.diamonds d on lower(d.author_name) = lower(m2.name)
  group by m2.id
) counts
where m.id = counts.id;
