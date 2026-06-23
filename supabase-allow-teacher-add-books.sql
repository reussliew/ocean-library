drop policy if exists "teachers add books" on public.books;

create policy "teachers add books"
  on public.books for insert to anon, authenticated
  with check (
    char_length(trim(title)) between 1 and 200
    and char_length(trim(author)) <= 200
    and char_length(trim(icon)) between 1 and 12
  );

grant insert on table public.books to anon, authenticated;
