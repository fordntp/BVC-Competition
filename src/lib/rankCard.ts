// วาดการ์ดผลลำดับเป็นรูป PNG ด้วย Canvas API ล้วน ๆ
// ไม่ใช้ไลบรารีภายนอก เพื่อไม่ให้ dependency เกินจากที่สเปคกำหนด

const SAND = "#F2E7CB";
const FOAM = "#FFFCF6";
const OCEAN = "#0E4F52";
const CORAL = "#FF6B4A";
const INK = "#123331";
const INK_SOFT = "#4C6663";
const SEAFOAM = "#BFE3E0";

const W = 1080;
const H = 1350;

// ฟอนต์ Fredoka ไม่มีสระและพยัญชนะไทย ต้องมี fallback ไม่งั้นชื่อไทยจะเป็นกล่องสี่เหลี่ยม
const DISPLAY = "'Fredoka', 'Noto Sans Thai', 'Thonburi', sans-serif";
const BODY = "'Work Sans', 'Noto Sans Thai', 'Thonburi', sans-serif";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function centered(
  ctx: CanvasRenderingContext2D,
  text: string, y: number, font: string, color: string
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, y);
}

export type RankCard = {
  rank: number;
  name: string;
  acceptedAt: string;
  when: string;
};

export async function drawRankCard(data: RankCard): Promise<Blob> {
  // รอฟอนต์โหลดเสร็จก่อน ไม่งั้น canvas จะวาดด้วยฟอนต์สำรองแล้วหน้าตาเพี้ยน
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.load(`700 64px ${DISPLAY}`);
      await document.fonts.ready;
    } catch {
      // โหลดฟอนต์ไม่ได้ก็วาดต่อด้วยฟอนต์ระบบ ดีกว่าไม่ได้รูปเลย
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");

  ctx.fillStyle = SAND;
  ctx.fillRect(0, 0, W, H);

  // ตัวการ์ด
  const cx = 60, cy = 90, cw = W - 120, ch = H - 180;
  ctx.save();
  ctx.shadowColor = "rgba(14,79,82,0.22)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, cx, cy, cw, ch, 48);
  ctx.fillStyle = FOAM;
  ctx.fill();
  ctx.restore();

  // ส่วนหัวสีทะเล ตัดขอบตามการ์ด
  ctx.save();
  roundRect(ctx, cx, cy, cw, ch, 48);
  ctx.clip();
  ctx.fillStyle = OCEAN;
  ctx.fillRect(cx, cy, cw, 470);

  // คลื่นคั่นหัวกับตัวการ์ด
  ctx.beginPath();
  ctx.moveTo(cx, cy + 400);
  ctx.bezierCurveTo(cx + 200, cy + 470, cx + 380, cy + 370, cx + 560, cy + 425);
  ctx.bezierCurveTo(cx + 720, cy + 472, cx + 830, cy + 392, cx + cw, cy + 428);
  ctx.lineTo(cx + cw, cy + 480);
  ctx.lineTo(cx, cy + 480);
  ctx.closePath();
  ctx.fillStyle = SAND;
  ctx.fill();
  ctx.restore();

  // ธงราว
  const flags = [CORAL, "#FFD166", "#7FD8BE", CORAL, "#FFD166"];
  flags.forEach((color, i) => {
    ctx.save();
    ctx.globalAlpha = i >= 3 ? 0.6 : 0.9;
    ctx.fillStyle = color;
    const fx = cx + 64 + i * 34;
    const fy = cy + 70;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 26, fy + 18);
    ctx.lineTo(fx, fy + 36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  ctx.textAlign = "left";
  ctx.font = `600 34px ${DISPLAY}`;
  ctx.fillStyle = SEAFOAM;
  ctx.fillText("Beachy Vibe Club", cx + 64, cy + 168);

  ctx.font = `700 68px ${DISPLAY}`;
  ctx.fillStyle = FOAM;
  ctx.fillText("“Serving Thank”", cx + 64, cy + 258);
  ctx.fillStyle = CORAL;
  ctx.fillText("Competition", cx + 64, cy + 340);

  // ลำดับที่ได้
  centered(ctx, "คุณได้ที่นั่งแล้ว ลำดับที่", cy + 610, `500 36px ${BODY}`, INK_SOFT);

  ctx.textAlign = "center";
  ctx.font = `700 240px ${DISPLAY}`;
  ctx.fillStyle = OCEAN;
  ctx.fillText(`#${data.rank}`, W / 2, cy + 830);

  centered(ctx, data.name, cy + 920, `600 52px ${BODY}`, INK);

  // เส้นประคั่น
  ctx.save();
  ctx.strokeStyle = "rgba(18,51,49,0.20)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 12]);
  ctx.beginPath();
  ctx.moveTo(cx + 90, cy + 985);
  ctx.lineTo(cx + cw - 90, cy + 985);
  ctx.stroke();
  ctx.restore();

  centered(ctx, "เวลาที่กดรับ (เวลาไทย)", cy + 1042, `400 28px ${BODY}`, INK_SOFT);
  centered(ctx, data.when, cy + 1092, `600 34px ${BODY}`, INK);
  centered(
    ctx,
    "ลำดับตัดสินด้วยนาฬิกาของเซิร์ฟเวอร์",
    cy + 1150,
    `400 26px ${BODY}`,
    INK_SOFT
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("no-blob"))),
      "image/png"
    );
  });
}
