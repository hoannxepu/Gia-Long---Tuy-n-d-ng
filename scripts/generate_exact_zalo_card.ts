import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export async function generateExactZaloCard(qrData: string = 'https://zalo.me/0869029310') {
  // Tạo ma trận QR chuẩn quốc tế với mức sửa lỗi cao nhất (Level H - phục hồi 30%)
  const qr = QRCode.create(qrData, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const qrBoxSize = 310;
  const margin = 20;
  const availableSize = qrBoxSize - margin * 2; // 270px
  const cellSize = availableSize / size;
  const roundRadius = Math.min(2.5, cellSize * 0.28);

  // Vùng 3 mắt định vị (Finder patterns 7x7)
  function isFinderZone(r: number, c: number) {
    if (r < 7 && c < 7) return true; // Top-Left
    if (r < 7 && c >= size - 7) return true; // Top-Right
    if (r >= size - 7 && c < 7) return true; // Bottom-Left
    return false;
  }

  // Vùng tâm che bởi logo Zalo
  function isCenterZone(r: number, c: number) {
    const center = (size - 1) / 2;
    const dist = Math.sqrt((r - center) ** 2 + (c - center) ** 2);
    return dist < 3.8;
  }

  // Vẽ các module dữ liệu chuẩn xác 100% với bo góc nhẹ tinh tế
  let modulesSvg = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isDark = data[r * size + c];
      if (isDark && !isFinderZone(r, c) && !isCenterZone(r, c)) {
        const x = margin + c * cellSize;
        const y = margin + r * cellSize;
        modulesSvg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" rx="${roundRadius.toFixed(1)}" fill="#0c1726" />\n`;
      }
    }
  }

  // 3 mắt Finder chuẩn tỷ lệ 1:1:3:1:1 bo góc tròn sắc nét
  function renderFinderEye(x: number, y: number) {
    const outerW = 7 * cellSize;
    const innerW = 3 * cellSize;
    const innerOffset = 2 * cellSize;
    const rxOuter = cellSize * 1.6;
    const rxInner = cellSize * 0.9;
    const strokeW = cellSize * 1.0;

    return `
      <g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
        <rect x="${(strokeW/2).toFixed(2)}" y="${(strokeW/2).toFixed(2)}" 
              width="${(outerW - strokeW).toFixed(2)}" height="${(outerW - strokeW).toFixed(2)}" 
              rx="${rxOuter.toFixed(2)}" fill="none" stroke="#0c1726" stroke-width="${strokeW.toFixed(2)}" />
        <rect x="${innerOffset.toFixed(2)}" y="${innerOffset.toFixed(2)}" 
              width="${innerW.toFixed(2)}" height="${innerW.toFixed(2)}" 
              rx="${rxInner.toFixed(2)}" fill="#0c1726" />
      </g>
    `;
  }

  const eyeTL = renderFinderEye(margin, margin);
  const eyeTR = renderFinderEye(margin + (size - 7) * cellSize, margin);
  const eyeBL = renderFinderEye(margin, margin + (size - 7) * cellSize);

  // Logo Zalo tâm tròn đen chữ trắng sắc nét
  const centerCoord = margin + availableSize / 2;
  const centerBadgeSvg = `
    <circle cx="${centerCoord.toFixed(2)}" cy="${centerCoord.toFixed(2)}" r="30" fill="#000000" stroke="#ffffff" stroke-width="4" />
    <text x="${centerCoord.toFixed(2)}" y="${(centerCoord + 6).toFixed(2)}" text-anchor="middle" font-size="15" font-weight="900" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letter-spacing="-0.3">Zalo</text>
  `;

  // Thẻ card hoàn chỉnh đúng nhận diện thương hiệu Gia Long
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 640" width="100%" height="100%">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000000" flood-opacity="0.18"/>
    </filter>

    <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#dfba73"/>
      <stop offset="35%" stop-color="#f5e1ad"/>
      <stop offset="70%" stop-color="#c5a059"/>
      <stop offset="100%" stop-color="#9a7b38"/>
    </linearGradient>

    <linearGradient id="pillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e1f1fc"/>
      <stop offset="100%" stop-color="#bfe4fa"/>
    </linearGradient>

    <linearGradient id="navyBanner" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14375f"/>
      <stop offset="100%" stop-color="#0a2342"/>
    </linearGradient>
  </defs>

  <!-- Nền thẻ kem sang trọng -->
  <rect x="12" y="12" width="516" height="616" rx="14" fill="#faf8f3" stroke="#e8e2d5" stroke-width="1.5" filter="url(#cardShadow)"/>

  <!-- Khung viền chỉ vàng kim -->
  <line x1="28" y1="26" x2="512" y2="26" stroke="url(#goldBorder)" stroke-width="1.8" />
  <line x1="28" y1="614" x2="512" y2="614" stroke="url(#goldBorder)" stroke-width="1.8" />
  <line x1="28" y1="26" x2="28" y2="614" stroke="url(#goldBorder)" stroke-width="1.8" />
  <line x1="512" y1="26" x2="512" y2="614" stroke="url(#goldBorder)" stroke-width="1.8" />

  <!-- Tiêu đề thương hiệu -->
  <text x="270" y="65" text-anchor="middle" font-size="25" font-weight="900" fill="#14375f" font-family="'Times New Roman', Times, 'Playfair Display', Georgia, serif" letter-spacing="0.4">
    Gia Long - FB
  </text>

  <!-- Nút pill Liên hệ Zalo -->
  <g transform="translate(182, 82)">
    <rect x="0" y="0" width="176" height="34" rx="17" fill="url(#pillGrad)"/>
    <text x="64" y="23" font-size="16" font-weight="800" fill="#0068ff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      Liên hệ Zalo
    </text>
    <circle cx="152" cy="17" r="13" fill="#0068ff"/>
    <text x="152" y="21" text-anchor="middle" font-size="9" font-weight="900" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Zalo</text>
  </g>

  <!-- Họa tiết bánh răng & biểu đồ bên trái -->
  <g transform="translate(35, 230)" fill="none" stroke="#c5a059" stroke-width="1.6" opacity="0.85">
    <circle cx="16" cy="16" r="8"/>
    <path d="M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"/>
    <circle cx="28" cy="38" r="6"/>
    <path d="M28 29v3M28 44v3M19 38h3M34 38h3"/>
    <path d="M6 75h22M6 75l7-10 6 5 8-13" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="27,57 27,62 22,57" fill="#c5a059"/>
    <rect x="6" y="98" width="4.5" height="14" fill="#c5a059" stroke="none"/>
    <rect x="14" y="90" width="4.5" height="22" fill="#c5a059" stroke="none"/>
    <rect x="22" y="82" width="4.5" height="30" fill="#c5a059" stroke="none"/>
  </g>

  <!-- Monogram GL bên phải -->
  <g transform="translate(460, 260)">
    <text x="0" y="32" font-size="32" font-weight="800" font-family="'Times New Roman', Times, serif" fill="#c5a059" opacity="0.9">GL</text>
    <line x1="-12" y1="-20" x2="-12" y2="70" stroke="#c5a059" stroke-width="1.6" opacity="0.6"/>
  </g>

  <!-- Vùng chứa mã QR -->
  <g transform="translate(115, 130)">
    <rect x="0" y="0" width="${qrBoxSize}" height="${qrBoxSize}" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
    ${eyeTL}
    ${eyeTR}
    ${eyeBL}
    ${modulesSvg}
    ${centerBadgeSvg}
  </g>

  <!-- Banner Giải Pháp Kết Nối Chuyên Nghiệp -->
  <rect x="85" y="475" width="370" height="38" rx="8" fill="url(#navyBanner)"/>
  <text x="270" y="500" text-anchor="middle" font-size="14" font-weight="800" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letter-spacing="1.2">
    GIẢI PHÁP KẾT NỐI CHUYÊN NGHIỆP
  </text>

  <!-- Hướng dẫn & Email -->
  <text x="270" y="540" text-anchor="middle" font-size="14.5" font-weight="600" fill="#334155" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    Quét mã để được tư vấn và hỗ trợ nhanh nhất
  </text>

  <text x="270" y="568" text-anchor="middle" font-size="15" font-weight="700" fill="#0f172a" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace">
    Email: gialonggiaiphapvanhanh@gmail.com
  </text>
</svg>`;

  // Lưu file SVG
  fs.writeFileSync('public/zalo_card.svg', fullSvg, 'utf-8');
  fs.writeFileSync('src/extension_files/zalo_card.svg', fullSvg, 'utf-8');

  // Lưu file PNG chuẩn QR để tương thích mọi nơi
  const pngBuffer = await QRCode.toBuffer(qrData, {
    errorCorrectionLevel: 'H',
    width: 400,
    margin: 2,
    color: {
      dark: '#0c1726',
      light: '#ffffff'
    }
  });
  fs.writeFileSync('public/zalo_qr.png', pngBuffer);
  fs.writeFileSync('src/extension_files/zalo_qr.png', pngBuffer);

  console.log(`✓ Đã tạo thành công Card QR Zalo chuẩn xác 100% cho link: ${qrData}`);
  return { fullSvg, pngBuffer };
}

// Chạy trực tiếp nếu file được gọi từ CLI
if (process.argv[1] && process.argv[1].endsWith('generate_exact_zalo_card.ts')) {
  const targetUrl = process.argv[2] || 'https://zalo.me/0869029310';
  generateExactZaloCard(targetUrl);
}
