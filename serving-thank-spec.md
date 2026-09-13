# Serving Thank Competition — สเปคสำหรับสร้างโปรเจค

เอกสารนี้ใช้เป็นคำสั่งให้ AI agent ใน VS Code สร้างโปรเจคทั้งหมด
โค้ดทุกไฟล์ด้านล่างผ่าน `npm install` และ `next build` มาแล้ว ให้คัดลอกตามตรง

---

## คำสั่งสำหรับ agent

สร้างโปรเจคใหม่ตามสเปคนี้ ทีละขั้น:

1. สร้างไฟล์ทุกไฟล์ในหัวข้อ "ไฟล์ทั้งหมด" ตาม path ที่ระบุ เนื้อหาคัดลอกตามตรง ห้ามดัดแปลงตรรกะ
2. รัน `npm install`
3. สร้าง `.env.local` จาก `.env.example` (ค่าจริงผู้ใช้จะใส่เอง)
4. รัน `npm run build` ให้ผ่านโดยไม่มี error
5. รายงานผล พร้อมบอกว่าต้องไปทำอะไรต่อใน Supabase Dashboard

ห้ามเพิ่ม dependency อื่นนอกจากที่อยู่ใน `package.json`
ห้ามเปลี่ยนพาเลตต์สีหรือ layout ใน `globals.css`
ห้ามย้ายตรรกะการตัดสินลำดับมาไว้ฝั่ง client ไม่ว่ากรณีใด

---

## โปรเจคนี้คืออะไร

หน้าคำเชิญของ Beachy Vibe Club สำหรับรายการแข่ง "Serving Thank"
ผู้เล่นแต่ละคนได้ลิงก์ส่วนตัวหนึ่งลิงก์ พอถึงเวลานัด (14 ก.ย. 2026 เวลา 10:00 น. เวลาไทย)
ใครกดรับก่อนได้ลำดับก่อน แอดมินดูตารางลำดับได้แบบเรียลไทม์

**Stack:** Next.js 16 (App Router) + TypeScript + Supabase (Postgres + Auth) + Vercel

---

## ปัญหาของโค้ดเดิมที่ต้องแก้

ต้นฉบับเป็นไฟล์ HTML เดียวที่เก็บข้อมูลผ่าน `window.storage` ซึ่งมีเฉพาะใน artifact
แต่ปัญหาหนักกว่าคือเรื่องความยุติธรรมของการแข่ง:

| ปัญหาเดิม | ผลที่ตามมา | วิธีแก้ในสเปคนี้ |
|---|---|---|
| `ts: Date.now()` จากเครื่องผู้เล่น | ตั้งนาฬิกาเครื่องย้อนหลัง = แซงคิวได้ทันที | `clock_timestamp()` ของ Postgres |
| ปุ่มปลดล็อกจาก `Date.now() < START_MS` | แก้ค่าใน console ก็กดก่อนเวลาได้ | เช็ค `now() < starts_at` ใน RPC ฝั่งเซิร์ฟเวอร์ |
| เขียน storage แบบ shared ตรง ๆ | ใครก็เขียนทับ/ยิงชื่อปลอมได้ | ตาราง RLS ปิดหมด เข้าผ่าน security definer function |
| ระบุตัวตนด้วยชื่อที่พิมพ์เอง | สวมชื่อคนอื่นได้ | ผูกกับ Supabase Auth + token คำเชิญใช้ครั้งเดียว |
| ไม่มีลิงก์คำเชิญจริง | แจกลิงก์เดียวกันทุกคน | ตาราง `invites` token สุ่ม 32 ตัวอักษร ต่อคน |
| กดพร้อมกันหลายคน | ลำดับชนกันได้ | `pg_advisory_xact_lock` ต่อรายการแข่ง |

---

## โครงสร้างไฟล์

```
serving-thank/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .gitignore
├── .env.example
├── supabase/
│   └── schema.sql              ตาราง + RLS + RPC ทั้งหมด
└── src/
    ├── proxy.ts                ต่ออายุ session cookie ทุก request
    ├── lib/supabase/
    │   ├── client.ts           browser client
    │   └── server.ts           server client
    └── app/
        ├── layout.tsx
        ├── globals.css         ธีม beachy เดิม
        ├── page.tsx            หน้าแรก (บอกว่าต้องใช้ลิงก์คำเชิญ)
        ├── i/[token]/
        │   ├── page.tsx
        │   └── InviteClient.tsx    หน้าคำเชิญ: login + countdown + ปุ่มกดรับ
        ├── admin/
        │   ├── page.tsx
        │   └── AdminClient.tsx     ลำดับผู้กดรับ + สร้าง/ยกเลิกลิงก์
        └── auth/
            ├── callback/route.ts   รับ magic link กลับจากอีเมล
            └── error/page.tsx
```

> หมายเหตุ Next.js 16: ไฟล์นี้ชื่อ `src/proxy.ts` และ export ฟังก์ชันชื่อ `proxy`
> ไม่ใช่ `middleware.ts` แบบเดิมอีกแล้ว

---

## โครงฐานข้อมูล

| ตาราง | หน้าที่ |
|---|---|
| `competitions` | รายการแข่ง: `slug`, `title`, `starts_at`, `capacity` |
| `invites` | ลิงก์คำเชิญ: `token` สุ่ม, `label` (ชื่อคนที่ส่งให้), `revoked_at` |
| `acceptances` | บันทึกการกดรับ: `invite_id` unique, `user_id` unique ต่อรายการ, `accepted_at` |
| `admins` | รายชื่อ user ที่เข้า `/admin` ได้ |

RPC ที่เปิดให้เรียก:

| ฟังก์ชัน | สิทธิ์ | ทำอะไร |
|---|---|---|
| `server_now()` | anon | คืนเวลาเซิร์ฟเวอร์ ใช้ซิงก์ countdown |
| `get_invite(token)` | anon | ข้อมูลหน้าคำเชิญ + สถานะของตัวเอง |
| `accept_invitation(token, name)` | authenticated | กดรับ คืนลำดับที่ได้ |
| `is_admin()` | authenticated | เช็คสิทธิ์ |
| `admin_list_acceptances(slug)` | admin | ตารางลำดับ |
| `admin_list_invites(slug)` | admin | รายการลิงก์ |
| `admin_create_invites(slug, count, labels)` | admin | สร้างลิงก์ |
| `admin_revoke_invite(token)` | admin | ยกเลิกลิงก์ |

`invites` และ `acceptances` **ไม่มี RLS policy เลย** ตั้งใจให้อ่านตรงไม่ได้
ทุกอย่างผ่าน function ที่เป็น `security definer` เท่านั้น

---

## ไฟล์ทั้งหมด

### `package.json`

```json
{
  "name": "serving-thank",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@supabase/ssr": "^0.12.7",
    "@supabase/supabase-js": "^2.116.0",
    "next": "^16.3.5",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

### `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

### `.gitignore`

```text
node_modules
.next
.env.local
.DS_Store
```

### `.env.example`

```bash
# Supabase > Project Settings > API
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# slug ของรายการแข่ง ตรงกับที่ seed ไว้ใน schema.sql
NEXT_PUBLIC_COMPETITION_SLUG=serving-thank
```

### `supabase/schema.sql`

```sql
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
```

### `src/lib/supabase/client.ts`

```ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const COMPETITION_SLUG =
  process.env.NEXT_PUBLIC_COMPETITION_SLUG || "serving-thank";
```

### `src/lib/supabase/server.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // เรียกจาก Server Component — middleware จะ refresh session ให้เอง
          }
        },
      },
    }
  );
}
```

### `src/proxy.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ต่ออายุ session cookie ทุก request เพื่อไม่ให้ผู้เล่นหลุด login ตอนนับถอยหลัง
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
```

### `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beachy Vibe Club — Serving Thank Competition",
  description: "คำเชิญเข้าร่วมการแข่งขัน Serving Thank",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Work+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### `src/app/globals.css`

```css
:root{
  --ocean-deep:#0E4F52;
  --ocean-lagoon:#1B7F80;
  --sand:#F2E7CB;
  --coral:#FF6B4A;
  --foam:#FFFCF6;
  --ink:#123331;
  --ink-soft:#4C6663;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:var(--sand);}
body{
  font-family:'Work Sans', sans-serif;
  color:var(--ink);
  min-height:100vh;
  display:flex;
  align-items:flex-start;
  justify-content:center;
  padding:32px 16px 64px;
}
:focus-visible{outline:3px solid var(--ocean-lagoon);outline-offset:2px;}

.card{
  width:100%;
  max-width:440px;
  background:var(--foam);
  border-radius:20px;
  overflow:hidden;
  box-shadow:0 18px 40px rgba(14,79,82,0.18);
}
.hero{
  position:relative;
  background:var(--ocean-deep);
  padding:34px 28px 46px;
  color:var(--foam);
  overflow:hidden;
}
.hero svg.wave{position:absolute;left:0;bottom:-2px;width:100%;height:38px;display:block;}
.hero .flags{display:flex;gap:6px;margin-bottom:18px;}
.hero .flags span{
  width:10px;height:14px;background:var(--coral);
  clip-path:polygon(0 0,100% 50%,0 100%);opacity:.9;
}
.hero .flags span:nth-child(2){background:#FFD166;}
.hero .flags span:nth-child(3){background:#7FD8BE;}
.hero .flags span:nth-child(4){background:var(--coral);opacity:.6;}
.hero .flags span:nth-child(5){background:#FFD166;opacity:.6;}
.club{
  font-family:'Fredoka', sans-serif;font-weight:600;font-size:15px;
  letter-spacing:.02em;color:#BFE3E0;margin:0 0 4px;
}
.title{font-family:'Fredoka', sans-serif;font-weight:700;font-size:30px;line-height:1.15;margin:0;}
.title em{font-style:normal;color:var(--coral);}

.body{padding:28px 28px 32px;}
.greeting{font-size:19px;font-weight:600;margin:0 0 10px;}
.letter{font-size:15px;line-height:1.6;color:var(--ink-soft);margin:0 0 24px;}
.rule{border:none;border-top:1px dashed rgba(18,51,49,0.18);margin:0 0 22px;}

.countdown-label{font-size:13px;color:var(--ink-soft);margin:0 0 8px;}
.countdown{display:flex;gap:8px;margin-bottom:10px;}
.countdown .unit{flex:1;background:var(--sand);border-radius:12px;padding:10px 4px;text-align:center;}
.countdown .unit .n{
  font-family:'Fredoka', sans-serif;font-weight:700;font-size:20px;
  display:block;color:var(--ocean-deep);
}
.countdown .unit .l{font-size:11px;color:var(--ink-soft);}
.start-line{font-size:13px;color:var(--ink-soft);margin:0 0 22px;}

button.accept{
  width:100%;padding:16px;border:none;border-radius:14px;
  font-family:'Fredoka', sans-serif;font-weight:600;font-size:17px;cursor:pointer;
  background:var(--coral);color:var(--foam);
  transition:transform .12s ease, box-shadow .12s ease, background .2s ease;
  box-shadow:0 8px 18px rgba(255,107,74,0.35);
}
button.accept:disabled{background:#D8CDB0;color:#8A8065;cursor:not-allowed;box-shadow:none;}
button.accept:not(:disabled):active{transform:scale(0.98);}
@media (prefers-reduced-motion: reduce){
  button.accept{transition:none;}
  button.accept:not(:disabled):active{transform:none;}
}

.status{margin-top:18px;padding:16px;border-radius:14px;font-size:14px;line-height:1.5;}
.status.ok{background:rgba(27,127,128,0.10);color:var(--ocean-deep);}
.status.err{background:rgba(255,107,74,0.12);color:#B84226;}
.status .rank{
  font-family:'Fredoka', sans-serif;font-weight:700;font-size:26px;
  color:var(--ocean-deep);display:block;margin-bottom:2px;
}

.field{margin-bottom:14px;}
.field label{display:block;font-size:13px;color:var(--ink-soft);margin-bottom:6px;}
.field input{
  width:100%;padding:12px 14px;border-radius:10px;
  border:1px solid rgba(18,51,49,0.2);font-size:15px;
  font-family:'Work Sans', sans-serif;background:var(--foam);color:var(--ink);
}
.signed-in{
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  font-size:13px;color:var(--ink-soft);margin-bottom:16px;
}
.signed-in button{
  background:none;border:none;color:var(--ocean-lagoon);
  font-family:'Work Sans', sans-serif;font-size:13px;cursor:pointer;
  text-decoration:underline;padding:0;
}
.footnote{text-align:center;font-size:12px;color:var(--ink-soft);margin-top:18px;}

/* ---------- Admin ---------- */
.admin-wrap{
  width:100%;max-width:720px;background:var(--foam);border-radius:20px;
  padding:28px;box-shadow:0 18px 40px rgba(14,79,82,0.18);
}
.admin-wrap h1{font-family:'Fredoka', sans-serif;font-size:22px;color:var(--ocean-deep);margin:0 0 4px;}
.admin-wrap p.sub{color:var(--ink-soft);font-size:13px;margin:0 0 20px;}
.tabs{display:flex;gap:8px;margin-bottom:18px;}
.tabs button{
  padding:9px 14px;border-radius:10px;border:1px solid rgba(18,51,49,0.2);
  background:var(--foam);color:var(--ocean-deep);
  font-family:'Work Sans', sans-serif;font-weight:600;font-size:13px;cursor:pointer;
}
.tabs button[aria-selected="true"]{background:var(--ocean-deep);color:var(--foam);border-color:var(--ocean-deep);}
.admin-actions{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center;}
.admin-actions input{
  padding:9px 12px;border-radius:10px;border:1px solid rgba(18,51,49,0.2);
  font-family:'Work Sans', sans-serif;font-size:13px;width:80px;
}
.admin-actions button{
  padding:9px 14px;border-radius:10px;border:1px solid rgba(18,51,49,0.2);
  background:var(--foam);color:var(--ocean-deep);
  font-family:'Work Sans', sans-serif;font-weight:600;font-size:13px;cursor:pointer;
}
.admin-actions button.primary{background:var(--ocean-deep);color:var(--foam);border-color:var(--ocean-deep);}
table{width:100%;border-collapse:collapse;font-size:14px;}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(18,51,49,0.10);}
th{color:var(--ink-soft);font-weight:600;font-size:12px;}
td.rank{font-family:'Fredoka', sans-serif;font-weight:700;color:var(--ocean-deep);width:36px;}
td.link{font-family:ui-monospace, monospace;font-size:12px;word-break:break-all;}
.empty{color:var(--ink-soft);font-size:14px;padding:20px 0;text-align:center;}
```

### `src/app/page.tsx`

```tsx
export default function Home() {
  return (
    <div className="card">
      <div className="body">
        <p className="greeting">ต้องใช้ลิงก์คำเชิญ</p>
        <p className="letter">
          หน้านี้เปิดได้จากลิงก์ส่วนตัวที่ทางคลับส่งให้เท่านั้น
          ลองเปิดลิงก์ที่ได้รับอีกครั้ง
        </p>
      </div>
    </div>
  );
}
```

### `src/app/i/[token]/page.tsx`

```tsx
import InviteClient from "./InviteClient";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
```

### `src/app/i/[token]/InviteClient.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type InviteInfo = {
  valid: boolean;
  competition_title: string | null;
  starts_at: string | null;
  capacity: number | null;
  accepted_count: number;
  invite_label: string | null;
  my_rank: number | null;
  my_accepted_at: string | null;
  my_display_name: string | null;
  server_time: string;
};

type Result = { rank: number; accepted_at: string; display_name: string };

const ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: "ต้องยืนยันอีเมลก่อนจึงจะกดรับคำเชิญได้",
  INVALID_INVITE: "ลิงก์คำเชิญนี้ใช้ไม่ได้แล้ว",
  NOT_OPEN_YET: "ยังไม่ถึงเวลาเปิดรับ",
  FULL: "ที่นั่งเต็มแล้ว",
};

function Wave() {
  return (
    <svg
      className="wave"
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M0,20 C50,40 100,0 150,15 C200,30 250,5 300,18 C340,28 370,12 400,20 L400,40 L0,40 Z"
        fill="#F2E7CB"
      />
    </svg>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok",
  });
}

export default function InviteClient({ token }: { token: string }) {
  const supabase = useRef(createClient()).current;

  const [user, setUser] = useState<User | null>(null);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0); // เวลาเซิร์ฟเวอร์ - เวลาเครื่อง (ms)

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setUser(auth.user ?? null);

    const clientBefore = Date.now();
    const { data } = await supabase.rpc("get_invite", { p_token: token });
    const row = (Array.isArray(data) ? data[0] : data) as InviteInfo | undefined;

    if (row) {
      // ชดเชย latency ครึ่งหนึ่งของ round trip
      const rtt = Date.now() - clientBefore;
      offsetRef.current =
        Date.parse(row.server_time) - (clientBefore + rtt / 2);
      setInfo(row);
      if (row.my_rank) {
        setResult({
          rank: row.my_rank,
          accepted_at: row.my_accepted_at!,
          display_name: row.my_display_name!,
        });
      }
      if (!name && row.my_display_name) setName(row.my_display_name);
    }
    setLoading(false);
  }, [supabase, token, name]);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  async function sendMagicLink() {
    setError(null);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      `/i/${token}`
    )}`;
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect },
    });
    if (e) setError("ส่งอีเมลไม่สำเร็จ ลองตรวจสอบอีเมลอีกครั้ง");
    else setEmailSent(true);
  }

  async function accept() {
    setSubmitting(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("accept_invitation", {
      p_token: token,
      p_display_name: name.trim(),
    });
    if (e) {
      const key = Object.keys(ERRORS).find((k) => e.message.includes(k));
      setError(key ? ERRORS[key] : "กดรับไม่สำเร็จ ลองใหม่อีกครั้ง");
      setSubmitting(false);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Result;
    setResult(row);
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="card">
        <div className="body">
          <p className="letter">กำลังโหลดคำเชิญ…</p>
        </div>
      </div>
    );
  }

  if (!info?.valid) {
    return (
      <div className="card">
        <div className="body">
          <p className="greeting">ไม่พบคำเชิญนี้</p>
          <p className="letter">
            ลิงก์อาจถูกยกเลิกหรือพิมพ์ไม่ครบ ลองเปิดจากลิงก์เดิมที่ได้รับอีกครั้ง
          </p>
        </div>
      </div>
    );
  }

  const startMs = Date.parse(info.starts_at!);
  const serverNow = now + offsetRef.current;
  const diff = startMs - serverNow;
  const isOpen = diff <= 0;

  const clamp = Math.max(0, diff);
  const units = [
    { n: Math.floor(clamp / 86400000), l: "วัน" },
    { n: Math.floor(clamp / 3600000) % 24, l: "ชม." },
    { n: Math.floor(clamp / 60000) % 60, l: "นาที" },
    { n: Math.floor(clamp / 1000) % 60, l: "วิ" },
  ];

  return (
    <div className="card">
      <div className="hero">
        <div className="flags">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} />
          ))}
        </div>
        <p className="club">Beachy Vibe Club</p>
        <h1 className="title">
          “Serving Thank”
          <br />
          <em>Competition</em>
        </h1>
        <Wave />
      </div>

      <div className="body">
        <p className="greeting">
          สวัสดี{info.invite_label ? ` ${info.invite_label}` : ""},
        </p>
        <p className="letter">
          ลิงก์นี้สงวนไว้สำหรับผู้เล่นประจำเพียงคนเดียว
          ยืนยันตัวตนไว้ก่อนได้เลย แล้วกดรับทันทีที่ประตูเปิด
          เพราะที่นั่งจัดตามลำดับการกดจริง
        </p>
        <hr className="rule" />

        <p className="countdown-label">ประตูเปิดอีก</p>
        <div className="countdown">
          {units.map((u) => (
            <div className="unit" key={u.l}>
              <span className="n">{u.n}</span>
              <span className="l">{u.l}</span>
            </div>
          ))}
        </div>
        <p className="start-line">
          {fmt(info.starts_at!)} (เวลาไทย)
          {info.capacity ? ` · รับ ${info.capacity} ที่นั่ง` : ""}
        </p>

        {result ? (
          <div className="status ok">
            <span className="rank">#{result.rank}</span>
            คุณได้ที่นั่งแล้ว ในชื่อ {result.display_name} · เวลา{" "}
            {fmt(result.accepted_at)}
          </div>
        ) : !user ? (
          emailSent ? (
            <div className="status ok">
              ส่งลิงก์ยืนยันไปที่ {email} แล้ว เปิดอีเมลแล้วกดลิงก์
              จากนั้นจะกลับมาที่หน้านี้เอง
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="email">อีเมลสำหรับยืนยันตัวตน</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <button
                className="accept"
                onClick={sendMagicLink}
                disabled={!email.includes("@")}
              >
                ส่งลิงก์ยืนยัน
              </button>
              <p className="footnote">
                ยืนยันไว้ล่วงหน้าก่อนถึงเวลา จะได้ไม่ต้องเปิดอีเมลตอนแข่ง
              </p>
            </>
          )
        ) : (
          <>
            <div className="signed-in">
              <span>ยืนยันแล้วในชื่อ {user.email}</span>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
                }}
              >
                เปลี่ยนบัญชี
              </button>
            </div>
            <div className="field">
              <label htmlFor="name">ชื่อที่จะแสดงในตาราง</label>
              <input
                id="name"
                type="text"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อของคุณ"
              />
            </div>
            <button
              className="accept"
              onClick={accept}
              disabled={!isOpen || submitting || !name.trim()}
            >
              {submitting
                ? "กำลังส่ง…"
                : isOpen
                  ? "กดรับคำเชิญ"
                  : "รอประตูเปิด"}
            </button>
          </>
        )}

        {error && (
          <div className="status err" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <p className="footnote">
          ลำดับตัดสินด้วยนาฬิกาของเซิร์ฟเวอร์ ไม่ใช่นาฬิกาเครื่องคุณ
        </p>
      </div>
    </div>
  );
}
```

### `src/app/admin/page.tsx`

```tsx
import AdminClient from "./AdminClient";

export default function AdminPage() {
  return <AdminClient />;
}
```

### `src/app/admin/AdminClient.tsx`

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, COMPETITION_SLUG } from "@/lib/supabase/client";

type Acceptance = {
  rank: number;
  display_name: string;
  accepted_at: string;
  invite_label: string | null;
};

type Invite = {
  token: string;
  label: string | null;
  created_at: string;
  revoked: boolean;
  used_by: string | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok",
  });
}

export default function AdminClient() {
  const supabase = useRef(createClient()).current;

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const [tab, setTab] = useState<"ranking" | "invites">("ranking");
  const [rows, setRows] = useState<Acceptance[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [count, setCount] = useState("5");
  const [labels, setLabels] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const refresh = useCallback(async () => {
    const [{ data: acc }, { data: inv }] = await Promise.all([
      supabase.rpc("admin_list_acceptances", { p_slug: COMPETITION_SLUG }),
      supabase.rpc("admin_list_invites", { p_slug: COMPETITION_SLUG }),
    ]);
    setRows((acc as Acceptance[]) ?? []);
    setInvites((inv as Invite[]) ?? []);
  }, [supabase]);

  const boot = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    setUser(auth.user ?? null);
    if (!auth.user) {
      setIsAdmin(false);
      return;
    }
    const { data: ok } = await supabase.rpc("is_admin");
    setIsAdmin(Boolean(ok));
    if (ok) await refresh();
  }, [supabase, refresh]);

  useEffect(() => {
    boot();
    const { data: sub } = supabase.auth.onAuthStateChange(() => boot());
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // อัปเดตอัตโนมัติทุก 5 วินาทีระหว่างเปิดหน้าไว้
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [isAdmin, refresh]);

  async function signIn() {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${origin}/auth/callback?next=/admin` },
    });
    if (!error) setEmailSent(true);
  }

  async function createInvites() {
    setBusy(true);
    const parsed = labels
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await supabase.rpc("admin_create_invites", {
      p_slug: COMPETITION_SLUG,
      p_count: parsed.length ? parsed.length : Number(count) || 1,
      p_labels: parsed.length ? parsed : null,
    });
    setLabels("");
    await refresh();
    setBusy(false);
  }

  async function copyCsv() {
    const csv =
      "rank,name,accepted_at\n" +
      rows.map((r) => `${r.rank},"${r.display_name}",${fmt(r.accepted_at)}`).join("\n");
    await navigator.clipboard.writeText(csv);
  }

  async function copyLinks() {
    const text = invites
      .filter((i) => !i.revoked)
      .map((i) => `${i.label ?? "-"}\t${origin}/i/${i.token}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
  }

  if (isAdmin === null) {
    return <div className="admin-wrap"><p className="empty">กำลังตรวจสอบสิทธิ์…</p></div>;
  }

  if (!user) {
    return (
      <div className="admin-wrap">
        <h1>เข้าสู่ระบบแอดมิน</h1>
        <p className="sub">ใช้อีเมลที่ถูกเพิ่มไว้ในตาราง admins</p>
        {emailSent ? (
          <div className="status ok">ส่งลิงก์ยืนยันไปที่ {email} แล้ว</div>
        ) : (
          <div className="admin-actions">
            <input
              style={{ width: 260 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button className="primary" onClick={signIn} disabled={!email.includes("@")}>
              ส่งลิงก์ยืนยัน
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-wrap">
        <h1>บัญชีนี้ยังไม่มีสิทธิ์แอดมิน</h1>
        <p className="sub">
          เพิ่ม user_id ของ {user.email} ลงในตาราง admins ก่อน แล้วโหลดหน้านี้ใหม่
        </p>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <h1>Serving Thank — ห้องควบคุม</h1>
      <p className="sub">ลำดับอัปเดตอัตโนมัติทุก 5 วินาที</p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "ranking"} onClick={() => setTab("ranking")}>
          ลำดับผู้กดรับ ({rows.length})
        </button>
        <button role="tab" aria-selected={tab === "invites"} onClick={() => setTab("invites")}>
          ลิงก์คำเชิญ ({invites.length})
        </button>
      </div>

      {tab === "ranking" ? (
        <>
          <div className="admin-actions">
            <button className="primary" onClick={refresh}>โหลดใหม่</button>
            <button onClick={copyCsv} disabled={!rows.length}>คัดลอกเป็น CSV</button>
          </div>
          {rows.length === 0 ? (
            <p className="empty">ยังไม่มีใครกดรับ</p>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>ชื่อ</th><th>ส่งให้</th><th>เวลาที่กดรับ</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rank}>
                    <td className="rank">{r.rank}</td>
                    <td>{r.display_name}</td>
                    <td>{r.invite_label ?? "—"}</td>
                    <td>{fmt(r.accepted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="admin-actions">
            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              aria-label="จำนวนลิงก์"
            />
            <button className="primary" onClick={createInvites} disabled={busy}>
              สร้างลิงก์
            </button>
            <button onClick={copyLinks} disabled={!invites.length}>คัดลอกลิงก์ทั้งหมด</button>
          </div>
          <div className="field">
            <label htmlFor="labels">หรือใส่ชื่อผู้รับทีละบรรทัด แล้วกดสร้างลิงก์</label>
            <textarea
              id="labels"
              rows={3}
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 10,
                border: "1px solid rgba(18,51,49,0.2)", fontFamily: "'Work Sans', sans-serif",
                fontSize: 14,
              }}
              placeholder={"พี่หนึ่ง\nน้องสอง"}
            />
          </div>
          {invites.length === 0 ? (
            <p className="empty">ยังไม่มีลิงก์คำเชิญ</p>
          ) : (
            <table>
              <thead>
                <tr><th>ส่งให้</th><th>ลิงก์</th><th>สถานะ</th><th /></tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.token}>
                    <td>{i.label ?? "—"}</td>
                    <td className="link">{`${origin}/i/${i.token}`}</td>
                    <td>{i.revoked ? "ยกเลิกแล้ว" : i.used_by ? `ใช้แล้ว (${i.used_by})` : "ยังไม่ใช้"}</td>
                    <td>
                      {!i.revoked && !i.used_by && (
                        <button
                          onClick={async () => {
                            await supabase.rpc("admin_revoke_invite", { p_token: i.token });
                            refresh();
                          }}
                        >
                          ยกเลิก
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
```

### `src/app/auth/callback/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
```

### `src/app/auth/error/page.tsx`

```tsx
export default function AuthErrorPage() {
  return (
    <div className="card">
      <div className="body">
        <p className="greeting">ลิงก์ยืนยันใช้ไม่ได้</p>
        <p className="letter">
          ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว กลับไปที่หน้าคำเชิญของคุณแล้วขอลิงก์ใหม่อีกครั้ง
        </p>
      </div>
    </div>
  );
}
```

---

## ขั้นตอนหลังสร้างไฟล์เสร็จ

### 1. Supabase

1. สร้างโปรเจคใหม่ที่ supabase.com
2. **SQL Editor** → วาง `supabase/schema.sql` ทั้งไฟล์ → Run
3. **Authentication → Providers** → เปิด Email
4. **Authentication → URL Configuration**
   - Site URL: `https://<project>.vercel.app`
   - Redirect URLs: `https://<project>.vercel.app/auth/callback`
     และ `http://localhost:3000/auth/callback`
5. **Project Settings → API** → เก็บ Project URL กับ anon public key

### 2. รันบนเครื่อง

```bash
npm install
cp .env.example .env.local     # ใส่ URL กับ anon key
npm run dev
```

เปิด `http://localhost:3000/admin` ส่งลิงก์ยืนยันเข้าอีเมลตัวเอง กดยืนยันในอีเมล
แล้วกลับไปที่ SQL Editor ตั้งตัวเองเป็นแอดมิน:

```sql
insert into admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

โหลด `/admin` ใหม่ จะเห็นห้องควบคุม

### 3. Vercel

```bash
git init && git add -A && git commit -m "init"
gh repo create serving-thank --private --source=. --push
```

vercel.com → New Project → เลือก repo → ใส่ env สามตัว:

| ชื่อ | ค่า |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `NEXT_PUBLIC_COMPETITION_SLUG` | `serving-thank` |

Deploy แล้วกลับไปแก้ Site URL / Redirect URLs ใน Supabase ให้ตรงโดเมนจริง

### 4. แจกลิงก์คำเชิญ

ที่ `/admin` แท็บ **ลิงก์คำเชิญ** — ใส่จำนวนแล้วกดสร้าง
หรือพิมพ์ชื่อผู้รับทีละบรรทัดเพื่อให้ลิงก์ติดชื่อกำกับ ตามดูง่ายว่าใครกดแล้ว
ลิงก์ที่ได้คือ `https://<โดเมน>/i/<token>` หนึ่งลิงก์ใช้ได้ครั้งเดียว

---

## เรื่องที่ต้องรู้ก่อนใช้งานจริง

**บอกผู้เล่นให้ยืนยันอีเมลล่วงหน้า** — magic link ต้องเปิดอีเมล ถ้าปล่อยให้ทำตอน 10:00 พอดี
คนที่อีเมลเข้าช้าเสียเปรียบทันที หน้าคำเชิญจึงแยกขั้นยืนยันออกมาก่อนและเขียนชวนไว้แล้ว
ตอนประตูเปิดเหลือแค่กดปุ่มเดียว

**แก้เวลาเริ่ม** ทำที่ฐานข้อมูล ไม่ใช่ในโค้ด:

```sql
update competitions set starts_at = '2026-09-14T10:00:00+07:00'
where slug = 'serving-thank';
```

**จำกัดที่นั่ง** ใส่ `capacity` แล้วคนถัดไปจะได้ข้อความว่าเต็ม:

```sql
update competitions set capacity = 20 where slug = 'serving-thank';
```

**เปลี่ยนวิธี login** — ทุกจุดที่เรียก `signInWithOtp` สลับเป็น OAuth ได้:

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}/auth/callback?next=/i/${token}` },
});
```

Google เปิดได้จาก Authentication → Providers โดยตรง
ส่วน LINE ยังไม่มีให้เลือกสำเร็จรูปใน Supabase ต้องตั้งเป็น custom OIDC provider
หรือทำ LINE Login เองแล้วแลกเป็น session ผ่าน Edge Function
ถ้าอยากเร็ว ใช้ Google หรืออีเมลไปก่อน

**อยากได้ leaderboard สาธารณะ** เพิ่ม RPC แบบ security definer ที่คืนเฉพาะ `display_name`
กับลำดับ อย่าเปิด RLS ให้อ่าน `acceptances` ตรง ๆ เพราะมี `user_id` ติดไปด้วย

---

## Checklist ตรวจรับ

- [ ] `npm run build` ผ่าน ไม่มี error
- [ ] เปิด `/i/<token>` ที่ไม่มีจริง → ขึ้น "ไม่พบคำเชิญนี้"
- [ ] countdown เดินตามเวลาเซิร์ฟเวอร์ ลองปรับนาฬิกาเครื่องแล้วต้องไม่เปลี่ยน
- [ ] ยังไม่ถึงเวลา → ปุ่มเป็น "รอประตูเปิด" และเรียก RPC ตรง ๆ ต้องได้ `NOT_OPEN_YET`
- [ ] กดรับซ้ำสองครั้ง → ได้ลำดับเดิม ไม่เกิดแถวใหม่
- [ ] บัญชีที่ไม่ได้อยู่ใน `admins` เปิด `/admin` → ไม่เห็นข้อมูล
- [ ] ลิงก์ที่ถูก revoke → เปิดแล้วใช้ไม่ได้
