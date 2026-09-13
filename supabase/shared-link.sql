-- =====================================================================
-- เปลี่ยนจาก "ลิงก์ส่วนตัวคนละใบ" เป็น "ลิงก์เดียวแย่งกันกด"
-- รันหลัง schema.sql — รันซ้ำได้ ไม่พัง
--
-- เดิมหนึ่งลิงก์ใช้ได้ครั้งเดียว ตัวลิงก์จึงเป็นตัวระบุตัวตนไปในตัว
-- แบบใหม่ทุกคนใช้ลิงก์เดียวกัน ตัวระบุตัวตนเหลือแค่บัญชี Google
-- ทุกจุดที่เคยอ้าง invite_id เพื่อหา "ที่นั่งของฉัน" ต้องเปลี่ยนเป็น user_id
-- =====================================================================

-- 1) ปลดล็อกให้ลิงก์เดียวรับได้หลายคน
--    ส่วน unique (competition_id, user_id) ยังอยู่ครบ — หนึ่งบัญชีได้ที่นั่งเดียว
alter table acceptances drop constraint if exists acceptances_invite_id_key;

create index if not exists acceptances_invite_idx on acceptances (invite_id);

-- 2) หน้าคำเชิญต้องหาลำดับของ "ผู้ใช้ที่ล็อกอินอยู่" ไม่ใช่ของลิงก์
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
  v_user uuid := auth.uid();
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
    (select rn from ranked where user_id = v_user),
    (select accepted_at from ranked where user_id = v_user),
    (select display_name from ranked where user_id = v_user),
    now();
end; $$;

-- 3) การกดรับต้องเช็คซ้ำจากบัญชีอย่างเดียว
--    เดิมเช็ค (invite_id = ลิงก์นี้ or user_id = ฉัน) ซึ่งพอลิงก์ใช้ร่วมกัน
--    เงื่อนไขแรกจะไปเจอที่นั่งของคนแรกแล้วคืนของเขาให้ทุกคน
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
   where competition_id = v_comp.id and user_id = v_user
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

-- 4) ห้องควบคุม: ลิงก์เดียวมีผู้ใช้หลายคน ถ้า join ตรง ๆ แถวจะซ้ำเท่าจำนวนคน
create or replace function admin_list_invites(p_slug text)
returns table (token text, label text, created_at timestamptz,
               revoked boolean, used_by text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  select i.token, i.label, i.created_at, i.revoked_at is not null,
         (select case when count(*) = 0 then null
                      else count(*)::text || ' คน' end
            from acceptances a where a.invite_id = i.id)
  from invites i
  join competitions c on c.id = i.competition_id and c.slug = p_slug
  order by i.created_at desc;
end; $$;
