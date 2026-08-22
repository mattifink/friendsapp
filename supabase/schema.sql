-- =============================================================
--  Zeit? – Datenbank-Setup
--
--  Grundidee der Absicherung: Auf die Tabelle selbst darf von außen
--  NIEMAND zugreifen. Erlaubt sind nur die drei Funktionen unten, und
--  die verlangen jeweils die geheime Gruppen-ID aus dem Link. Ohne Link
--  ist also nichts zu holen — auch nicht mit dem öffentlichen anon-Key.
-- =============================================================

create table if not exists public.statuses (
  id         text primary key,                       -- zufällige ID des Geräts
  group_id   text not null,                          -- geheime Gruppen-ID aus dem Link
  secret     text not null,                          -- privat: beweist, dass der Eintrag mir gehört
  name       text not null check (char_length(name) between 1 and 24),
  free       boolean not null default false,
  note       text not null default '' check (char_length(note) <= 140),
  updated_at timestamptz not null default now()
);

-- Nachrüsten, falls die Tabelle aus einer früheren Version ohne "secret" stammt.
-- Solche Einträge haben keinen Besitzer, den man prüfen könnte, und werden verworfen —
-- betroffen sind höchstens Test-Einträge aus der ersten Fassung.
alter table public.statuses add column if not exists secret text;
delete from public.statuses where secret is null;
alter table public.statuses alter column secret set not null;

create index if not exists statuses_group_idx on public.statuses (group_id, updated_at desc);

-- Tür zu: RLS an, keine einzige Policy, keine Rechte für Besucher.
alter table public.statuses enable row level security;
revoke all on public.statuses from anon, authenticated;

drop policy if exists "read"   on public.statuses;
drop policy if exists "write"  on public.statuses;
drop policy if exists "update" on public.statuses;
drop policy if exists "delete" on public.statuses;

-- ---------- Lesen: nur die eigene Gruppe, ohne die geheimen Spalten ----------
create or replace function public.list_statuses(g text)
returns table (id text, name text, free boolean, note text, updated_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.name, s.free, s.note, s.updated_at
  from public.statuses s
  where s.group_id = g and char_length(g) >= 6
  order by s.updated_at desc
  limit 200;
$$;

-- ---------- Schreiben: nur den eigenen Eintrag ----------
create or replace function public.set_status(
  g text, mid text, sec text, nm text, is_free boolean, txt text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(g) < 6 or char_length(mid) < 8 or char_length(sec) < 8 then
    raise exception 'ungueltige Angaben';
  end if;

  insert into public.statuses (id, group_id, secret, name, free, note, updated_at)
  values (mid, g, sec, left(nm, 24), coalesce(is_free, false), left(coalesce(txt, ''), 140), now())
  on conflict (id) do update
    set name = excluded.name, free = excluded.free, note = excluded.note, updated_at = now()
    where public.statuses.secret = sec and public.statuses.group_id = g;

  if not found then
    raise exception 'Eintrag gehoert jemand anderem';
  end if;
end;
$$;

-- ---------- Löschen: nur den eigenen Eintrag ----------
create or replace function public.delete_status(mid text, sec text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.statuses where id = mid and secret = sec;
$$;

-- Nur diese drei Wege sind von außen erlaubt.
revoke all on function public.list_statuses(text)                                   from public;
revoke all on function public.set_status(text, text, text, text, boolean, text)     from public;
revoke all on function public.delete_status(text, text)                             from public;
grant execute on function public.list_statuses(text)                                to anon, authenticated;
grant execute on function public.set_status(text, text, text, text, boolean, text)  to anon, authenticated;
grant execute on function public.delete_status(text, text)                          to anon, authenticated;

-- Aufräumen: Einträge, die seit 14 Tagen niemand angefasst hat, löschen.
-- (Optional; unter Database -> Cron einplanen oder gelegentlich von Hand ausführen.)
-- delete from public.statuses where updated_at < now() - interval '14 days';
