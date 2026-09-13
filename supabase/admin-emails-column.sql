-- =====================================================================
-- เอาอีเมลขึ้นตารางแอดมิน + ตรวจจับคนที่ใช้หลายบัญชี
-- รันหลัง shared-link.sql — รันซ้ำได้ ไม่พัง
--
-- พอเปลี่ยนเป็นลิงก์เดียวใช้ร่วมกัน ตัวกันสวมรอยเหลือแค่บัญชี Google
-- คนหนึ่งคนที่มีหลายบัญชีจึงกดได้หลายที่นั่ง การเห็นอีเมลเฉย ๆ จับไม่ได้
-- เพราะ Gmail ไม่สนจุดและส่วนต่อท้าย + : a.b+x@gmail.com = ab@gmail.com
-- =====================================================================

create or replace function norm_email(p_email text)
returns text language sql immutable set search_path = public as $$
  select case
    when lower(split_part(p_email, '@', 2)) in ('gmail.com', 'googlemail.com')
      then replace(split_part(lower(split_part(p_email, '@', 1)), '+', 1), '.', '')
           || '@gmail.com'
    else lower(p_email)
  end;
$$;

-- เปลี่ยนรูปแบบค่าที่คืน ต้อง drop ก่อน create or replace ทำไม่ได้
drop function if exists admin_list_acceptances(text);

create or replace function admin_list_acceptances(p_slug text)
returns table (
  rank          bigint,
  display_name  text,
  email         text,
  dup_count     bigint,      -- >1 = มีบัญชีอื่นที่เป็นกล่องอีเมลเดียวกัน
  accepted_at   timestamptz,
  invite_label  text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
  with rows_ as (
    select a.id, a.accepted_at, a.display_name, i.label, u.email::text as email,
           norm_email(u.email::text) as ne
    from acceptances a
    join competitions c on c.id = a.competition_id and c.slug = p_slug
    join invites i on i.id = a.invite_id
    join auth.users u on u.id = a.user_id
  )
  select row_number() over (order by r.accepted_at, r.id),
         r.display_name,
         r.email,
         count(*) over (partition by r.ne),
         r.accepted_at,
         r.label
  from rows_ r
  order by r.accepted_at, r.id;
end; $$;

grant execute on function admin_list_acceptances(text) to authenticated;
