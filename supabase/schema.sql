-- =====================================================================
-- Serving Thank Competition — Supabase schema
-- รันไฟล์นี้ทั้งไฟล์ใน Supabase Dashboard > SQL Editor
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- ตาราง
-- ---------------------------------------------------------------------

create table if not exists competitions (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  starts_at   timestamptz not null,
  capacity    int,                       -- null = ไม่จำกัดจำนวน
  created_at  timestamptz not null default now()
);

create table if not exists invites (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  token          text unique not null default encode(gen_random_bytes(16), 'hex'),
  label          text,                   -- โน้ตภายใน เช่น ชื่อคนที่ส่งให้
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

create table if not exists acceptances (
  id             bigint generated always as identity primary key,
  competition_id uuid not null references competitions(id) on delete cascade,
  invite_id      uuid not null unique references invites(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  display_name   text not null,
  accepted_at    timestamptz not null default clock_timestamp(),
  unique (competition_id, user_id)
);

create index if not exists acceptances_order_idx
  on acceptances (competition_id, accepted_at, id);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------
-- RLS: ปิดทุกอย่างไว้ก่อน แล้วเปิดทางผ่าน function เท่านั้น
-- ---------------------------------------------------------------------

alter table competitions enable row level security;
alter table invites      enable row level security;
alter table acceptances  enable row level security;
alter table admins       enable row level security;

drop policy if exists competitions_read on competitions;
create policy competitions_read on competitions for select using (true);

drop policy if exists admins_read_self on admins;
create policy admins_read_self on admins for select using (user_id = auth.uid());

-- invites / acceptances ไม่มี policy = client อ่านตรงไม่ได้เลย
-- ต้องผ่าน security definer function ด้านล่าง

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- เวลาของเซิร์ฟเวอร์ (ใช้ sync countdown ให้ตรงกับนาฬิกาที่ตัดสินจริง)
-- ---------------------------------------------------------------------

create or replace function server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- ---------------------------------------------------------------------
-- อ่านข้อมูลหน้าคำเชิญจาก token
-- ---------------------------------------------------------------------

create or replace function get_invite(p_token text)
returns table (
  valid              boolean,
  competition_title  text,
  starts_at          timestamptz,
  capacity           int,
  accepted_count     bigint,
  invite_label       text,
  my_rank            bigint,
  my_accepted_at     timestamptz,
  my_display_name    text,
  server_time        timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv  invites%rowtype;
  v_comp competitions%rowtype;
begin
  select * into v_inv from invites where token = p_token;

  if not found or v_inv.revoked_at is not null then
    return query select false, null::text, null::timestamptz, null::int,
                        0::bigint, null::text, null::bigint, null::timestamptz,
                        null::text, now();
    return;
  end if;

  select * into v_comp from competitions where id = v_inv.competition_id;

  return query
  with ranked as (
    select a.*, row_number() over (order by a.accepted_at, a.id) as rn
    from acceptances a
    where a.competition_id = v_comp.id
  )
  select
    true,
    v_comp.title,
    v_comp.starts_at,
    v_comp.capacity,
    (select count(*) from ranked),
    v_inv.label,
    (select rn from ranked where invite_id = v_inv.id),
    (select accepted_at from ranked where invite_id = v_inv.id),
    (select display_name from ranked where invite_id = v_inv.id),
    now();
end; $$;

-- ---------------------------------------------------------------------
-- กดรับคำเชิญ — หัวใจของระบบ
-- เวลาและลำดับตัดสินที่ฐานข้อมูลทั้งหมด client ปลอมไม่ได้
-- ---------------------------------------------------------------------

create or replace function accept_invitation(p_token text, p_display_name text)
returns table (rank bigint, accepted_at timestamptz, display_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_inv   invites%rowtype;
  v_comp  competitions%rowtype;
  v_user  uuid := auth.uid();
  v_acc   acceptances%rowtype;
  v_count bigint;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_inv from invites where token = p_token;
  if not found or v_inv.revoked_at is not null then
    raise exception 'INVALID_INVITE';
  end if;

  select * into v_comp from competitions where id = v_inv.competition_id;

  -- ล็อกต่อคิวทีละคน: ลำดับ first-come-first-served จึงถูกต้องแน่นอน
  perform pg_advisory_xact_lock(hashtextextended(v_comp.id::text, 0));

  if now() < v_comp.starts_at then
    raise exception 'NOT_OPEN_YET';
  end if;

  select * into v_acc from acceptances
   where competition_id = v_comp.id
     and (invite_id = v_inv.id or user_id = v_user)
   limit 1;

  if v_acc.id is null then
    select count(*) into v_count from acceptances where competition_id = v_comp.id;
    if v_comp.capacity is not null and v_count >= v_comp.capacity then
      raise exception 'FULL';
    end if;

    insert into acceptances (competition_id, invite_id, user_id, display_name)
    values (v_comp.id, v_inv.id, v_user,
            coalesce(nullif(btrim(p_display_name), ''), 'Player'))
    returning * into v_acc;
  end if;

  return query
  select r.rn, r.accepted_at, r.display_name
  from (
    select a.id, a.accepted_at, a.display_name,
           row_number() over (order by a.accepted_at, a.id) as rn
    from acceptances a where a.competition_id = v_comp.id
  ) r
  where r.id = v_acc.id;
end; $$;

-- ---------------------------------------------------------------------
-- ฝั่งแอดมิน
-- ---------------------------------------------------------------------

create or replace function admin_list_acceptances(p_slug text)
returns table (rank bigint, display_name text, accepted_at timestamptz, invite_label text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select row_number() over (order by a.accepted_at, a.id),
         a.display_name, a.accepted_at, i.label
  from acceptances a
  join competitions c on c.id = a.competition_id and c.slug = p_slug
  join invites i on i.id = a.invite_id
  order by a.accepted_at, a.id;
end; $$;

create or replace function admin_list_invites(p_slug text)
returns table (token text, label text, created_at timestamptz,
               revoked boolean, used_by text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select i.token, i.label, i.created_at, i.revoked_at is not null, a.display_name
  from invites i
  join competitions c on c.id = i.competition_id and c.slug = p_slug
  left join acceptances a on a.invite_id = i.id
  order by i.created_at desc;
end; $$;

create or replace function admin_create_invites(
  p_slug text, p_count int default 1, p_labels text[] default null
)
returns table (token text, label text)
language plpgsql security definer set search_path = public as $$
declare v_comp_id uuid;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select id into v_comp_id from competitions where slug = p_slug;
  if v_comp_id is null then raise exception 'NO_COMPETITION'; end if;

  if p_labels is not null and array_length(p_labels, 1) > 0 then
    return query
      insert into invites (competition_id, label)
      select v_comp_id, l from unnest(p_labels) as l
      returning invites.token, invites.label;
  else
    return query
      insert into invites (competition_id)
      select v_comp_id from generate_series(1, greatest(coalesce(p_count, 1), 1))
      returning invites.token, invites.label;
  end if;
end; $$;

create or replace function admin_revoke_invite(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  update invites set revoked_at = now() where token = p_token;
end; $$;

-- ---------------------------------------------------------------------
-- สิทธิ์เรียก function
-- ---------------------------------------------------------------------

grant execute on function server_now()                         to anon, authenticated;
grant execute on function get_invite(text)                     to anon, authenticated;
grant execute on function accept_invitation(text, text)        to authenticated;
grant execute on function is_admin()                           to authenticated;
grant execute on function admin_list_acceptances(text)         to authenticated;
grant execute on function admin_list_invites(text)             to authenticated;
grant execute on function admin_create_invites(text, int, text[]) to authenticated;
grant execute on function admin_revoke_invite(text)            to authenticated;

-- ---------------------------------------------------------------------
-- ข้อมูลตั้งต้น
-- ---------------------------------------------------------------------

insert into competitions (slug, title, starts_at, capacity)
values ('serving-thank', 'Serving Thank Competition',
        '2026-09-14T10:00:00+07:00', null)
on conflict (slug) do nothing;

-- หลังจากสมัครบัญชีตัวเองแล้ว รันบรรทัดนี้เพื่อตั้งตัวเองเป็นแอดมิน:
-- insert into admins (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict do nothing;
