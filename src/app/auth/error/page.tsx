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
