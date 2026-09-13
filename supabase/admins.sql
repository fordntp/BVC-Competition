-- =====================================================================
-- รายชื่ออีเมลที่ได้สิทธิ์แอดมินอัตโนมัติ
-- รันหลัง schema.sql — รันซ้ำได้ ไม่พัง
--
-- ทำไมต้องมีไฟล์นี้: admins.user_id อ้าง auth.users(id) จึงตั้งแอดมินล่วงหน้า
-- ก่อนเจ้าตัวสมัครไม่ได้ ไฟล์นี้เก็บ "อีเมลไหนควรเป็นแอดมิน" ไว้ก่อน
-- แล้ว trigger จะเติม admins ให้เองตอนบัญชีถูกสร้างจริง
-- =====================================================================

create table if not exists admin_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ปิดไม่ให้ client อ่านรายชื่อแอดมิน (ไม่มี policy = เข้าไม่ได้เลย)
alter table admin_emails enable row level security;

insert into admin_emails (email) values
  ('nattapat896@gmail.com'),
  ('sarunpat123@gmail.com')
on conflict (email) do nothing;

-- เมื่อมีบัญชีใหม่ ถ้าอีเมลอยู่ในลิสต์ ให้เป็นแอดมินทันที
create or replace function promote_admin_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from admin_emails where lower(email) = lower(new.email)) then
    insert into admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists promote_admin_on_signup_trg on auth.users;
create trigger promote_admin_on_signup_trg
  after insert on auth.users
  for each row execute function promote_admin_on_signup();

-- เผื่อมีคนในลิสต์สมัครไปก่อนหน้านี้แล้ว
insert into admins (user_id)
select u.id from auth.users u
join admin_emails a on lower(a.email) = lower(u.email)
on conflict do nothing;
