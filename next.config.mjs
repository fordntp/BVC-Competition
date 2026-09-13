/** @type {import('next').NextConfig} */
const nextConfig = {
  // กัน Turbopack ไปหยิบ package-lock.json ที่ค้างอยู่นอก repo มาเป็น root
  turbopack: { root: import.meta.dirname },
};
export default nextConfig;
