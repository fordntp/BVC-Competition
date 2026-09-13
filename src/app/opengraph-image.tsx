import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Beachy Vibe Club — Serving Thank Competition";

// รูป preview ตอนแปะลิงก์ใน LINE / Facebook / X
// ใช้ข้อความอังกฤษล้วน เพราะฟอนต์เริ่มต้นของ ImageResponse ไม่มีอักษรไทย
// ถ้าใส่ไทยจะขึ้นเป็นกล่องสี่เหลี่ยมในรูป
export default function OpengraphImage() {
  const flags = ["#FF6B4A", "#FFD166", "#7FD8BE", "#FF6B4A", "#FFD166"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#0E4F52",
          padding: "0 88px",
        }}
      >
        <div style={{ display: "flex", marginBottom: 34 }}>
          {flags.map((c, i) => (
            <div
              key={i}
              style={{
                width: 26,
                height: 36,
                marginRight: 12,
                borderRadius: 5,
                backgroundColor: c,
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 36, color: "#BFE3E0", letterSpacing: 3 }}>
          BEACHY VIBE CLUB
        </div>
        <div style={{ display: "flex", fontSize: 104, color: "#FFFCF6", marginTop: 14 }}>
          “Serving Thank”
        </div>
        <div style={{ display: "flex", fontSize: 104, color: "#FF6B4A" }}>
          Competition
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#BFE3E0", marginTop: 34 }}>
          14 Sep 2026 · 10:00 (GMT+7) · one link, one seat
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "100%",
            height: 44,
            backgroundColor: "#F2E7CB",
          }}
        />
      </div>
    ),
    size
  );
}
