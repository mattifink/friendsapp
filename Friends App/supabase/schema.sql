-- Tabelle für die Status-Einträge.
create table if not exists public.statuses (
  id         text primary key,                       -- zufällige ID des Geräts/Mitglieds
  group_id   text not null,                          -- geheime Gruppen-ID aus dem Link
  name       text not null check (char_length(name) between 1 and 24),
  free       boolean not null default false,
  note       text not null default '' check (char_length(note) <= 140),
  updated_at timestamptz not null default now()
);

create index if not exists statuses_group_idx on public.statuses (group_id, updated_at desc);

-- Zugriff: wer die (nicht erratbare) Gruppen-ID kennt, darf lesen und schreiben.
alter table public.statuses enable row level security;

drop policy if exists "read"   on public.statuses;
drop policy if exists "write"  on public.statuses;
drop policy if exists "update" on public.statuses;
drop policy if exists "delete" on public.statuses;

create policy "read"   on public.statuses for select using (true);
create policy "write"  on public.statuses for insert with check (true);
create policy "update" on public.statuses for update using (true) with check (true);
create policy "delete" on public.statuses for delete using (true);

-- Live-Updates für diese Tabelle einschalten (mehrfaches Ausführen ist unschädlich).
do $$
begin
  alter publication supabase_realtime add table public.statuses;
exception
  when duplicate_object then null;
end $$;

-- Aufräumen: Einträge, die seit 14 Tagen niemand angefasst hat, löschen.
-- (Optional; unter Database -> Cron ausführen oder gelegentlich von Hand.)
-- delete from public.statuses where updated_at < now() - interval '14 days';
