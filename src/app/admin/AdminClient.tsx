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

// ตอนทุกคนกดพร้อมกัน ระดับวินาทีแยกไม่ออกว่าใครก่อน จึงต่อมิลลิวินาทีไว้ด้วย
function fmtMs(iso: string) {
  const ms = String(new Date(iso).getMilliseconds()).padStart(3, "0");
  return `${fmt(iso)}.${ms}`;
}

// ครอบ " และ escape " ข้างในตามมาตรฐาน CSV กันชื่อผู้เล่นทำไฟล์เพี้ยน
function cell(v: string | number) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export default function AdminClient() {
  const supabase = useRef(createClient()).current;

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

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

  async function signInWithGoogle() {
    // อ่าน origin จาก window ตรง ๆ กัน state ที่ยังว่างตอนกดเร็ว ๆ
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });
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
    // accepted_at_iso เก็บความละเอียดเต็มจากฐานข้อมูล ใช้ตัดสินตอนมีคนทักท้วง
    const csv = [
      "rank,name,invite_label,accepted_at_thai,accepted_at_iso",
      ...rows.map((r) =>
        [
          r.rank,
          cell(r.display_name),
          cell(r.invite_label ?? ""),
          cell(fmtMs(r.accepted_at)),
          cell(r.accepted_at),
        ].join(",")
      ),
    ].join("\n");
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
        <p className="sub">ใช้บัญชี Google ที่อยู่ในรายชื่อแอดมิน</p>
        <div className="admin-actions">
          <button className="primary" onClick={signInWithGoogle}>
            เข้าสู่ระบบด้วย Google
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-wrap">
        <h1>บัญชีนี้ยังไม่มีสิทธิ์แอดมิน</h1>
        <p className="sub">
          บัญชี {user.email} ไม่ได้อยู่ในรายชื่อแอดมิน ลองเข้าด้วยบัญชีอื่น
          หรือให้คนที่ดูแลฐานข้อมูลเพิ่มอีเมลนี้ลงตาราง admin_emails
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
                    <td>{fmtMs(r.accepted_at)}</td>
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
