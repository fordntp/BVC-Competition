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

  const [name, setName] = useState("");

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

  async function signInWithGoogle() {
    setError(null);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      `/i/${token}`
    )}`;
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect },
    });
    if (e) setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
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
          <>
            <button className="accept" onClick={signInWithGoogle}>
              เข้าสู่ระบบด้วย Google
            </button>
            <p className="footnote">
              ล็อกอินไว้ล่วงหน้าก่อนถึงเวลา ตอนประตูเปิดจะได้เหลือแค่กดปุ่มเดียว
            </p>
          </>
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
