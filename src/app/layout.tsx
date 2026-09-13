import type { Metadata } from "next";
import "./globals.css";

// ต้องมี metadataBase ไม่งั้น Next สร้าง URL ของรูป preview เป็น path สัมพัทธ์
// แล้ว LINE/Facebook ดึงรูปไม่ได้ เพราะ crawler ต้องการ URL เต็ม
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Beachy Vibe Club — Serving Thank Competition",
  description: "คำเชิญเข้าร่วมการแข่งขัน Serving Thank",
  openGraph: {
    title: "Beachy Vibe Club — Serving Thank Competition",
    description:
      "ลิงก์คำเชิญส่วนตัว หนึ่งลิงก์ต่อหนึ่งคน กดรับก่อนได้ลำดับก่อน",
    siteName: "Beachy Vibe Club",
    locale: "th_TH",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Beachy Vibe Club — Serving Thank Competition",
    description:
      "ลิงก์คำเชิญส่วนตัว หนึ่งลิงก์ต่อหนึ่งคน กดรับก่อนได้ลำดับก่อน",
  },
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
