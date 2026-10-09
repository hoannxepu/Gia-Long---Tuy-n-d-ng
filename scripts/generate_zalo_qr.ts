import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Tạo mã QR Zalo chất lượng cao kết nối hỗ trợ
export async function generateZaloQrAssets(zaloUrl: string = 'https://zalo.me') {
  
  // 1. Tạo SVG QR code
  const svgString = await QRCode.toString(zaloUrl, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#0068ff', // Màu xanh Zalo chuẩn
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });

  // 2. Tạo DataURL PNG
  const dataUrl = await QRCode.toDataURL(zaloUrl, {
    margin: 1,
    width: 320,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });

  return { svgString, dataUrl };
}
