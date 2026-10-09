import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { generateAllIcons } from './generate_standard_icons.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'src', 'extension_files');
const outputDir = path.join(rootDir, 'dist-extension');

export function getExtensionVersion(): string {
  try {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      return manifest.version || '1.0.4';
    }
  } catch (e) {}
  return '1.0.4';
}

export function bumpExtensionVersion(type: 'patch' | 'minor' = 'patch'): string {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const current = manifest.version || '1.0.4';
  const parts = current.split('.').map((n: string) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);

  if (type === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }

  const newVer = parts.join('.');
  manifest.version = newVer;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[Version Auto-Bumper] ✓ Đã tự động tăng phiên bản từ ${current} ➔ ${newVer}`);

  // Đồng bộ sang package.json
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      pkg.version = newVer;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  } catch (e) {}

  return newVer;
}

export async function generateObfuscatedExtensionZip(options: { bumpVersion?: boolean } = {}): Promise<{ buffer: Buffer; version: string; fileName: string }> {
  let version = getExtensionVersion();

  if (options.bumpVersion) {
    version = bumpExtensionVersion('patch');
  }

  // Tạo icon chuẩn 32-bit RGBA & icon 300x300 cho Store Listing trước khi đóng gói
  try {
    await generateAllIcons();
  } catch (e) {
    console.warn('Lỗi generate icons:', e);
  }

  console.log(`[Store Package Builder] Bắt đầu đóng gói tiện ích chuẩn Edge & Chrome Store (v${version}) từ:`, extensionDir);
  const zip = new JSZip();

  const files = fs.readdirSync(extensionDir);

  for (const fileName of files) {
    const filePath = path.join(extensionDir, fileName);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    if (fileName.endsWith('.js')) {
      // Đóng gói mã nguồn sạch, minh bạch (KHÔNG làm rối control flow hay mã hóa Base64 để vượt qua 100% bộ quét AMSI/Windows Defender của Microsoft)
      const originalCode = fs.readFileSync(filePath, 'utf-8');
      zip.file(fileName, originalCode);
      console.log(`[Store Package Builder] ✓ Đã thêm tệp JavaScript chuẩn Store: ${fileName} (${originalCode.length}B)`);
    } else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.ico')) {
      const buffer = fs.readFileSync(filePath);
      zip.file(fileName, buffer);
    } else if (fileName === 'index.ts') {
      // Bỏ qua index.ts (chỉ dùng nội bộ trong React App)
      continue;
    } else {
      // Các file html, json...
      const content = fs.readFileSync(filePath, 'utf-8');
      zip.file(fileName, content);
    }
  }

  console.log('[Store Package Builder] Đang nén thành file ZIP chuẩn Microsoft Edge & Chrome Web Store...');
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const fileName = `Gia_Long_FB_WebStore_v${version}.zip`;
  return { buffer: zipBuffer, version, fileName };
}

// Nếu chạy trực tiếp bằng dòng lệnh: tsx scripts/build_webstore_zip.ts [--bump]
if (process.argv[1] && process.argv[1].endsWith('build_webstore_zip.ts')) {
  (async () => {
    try {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const publicDir = path.join(rootDir, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }

      const shouldBump = process.argv.includes('--bump');
      const { buffer: zipBuffer, version, fileName } = await generateObfuscatedExtensionZip({ bumpVersion: shouldBump });
      
      const zipPathCurrent = path.join(outputDir, fileName);
      const zipPathLatest = path.join(outputDir, 'Gia_Long_FB_WebStore_latest.zip');
      fs.writeFileSync(zipPathCurrent, zipBuffer);
      fs.writeFileSync(zipPathLatest, zipBuffer);

      // Đồng bộ trực tiếp vào thư mục public để phục vụ tải trực tiếp trên Cloudflare Pages & Vercel
      fs.writeFileSync(path.join(publicDir, fileName), zipBuffer);
      fs.writeFileSync(path.join(publicDir, 'Gia_Long_FB_WebStore_latest.zip'), zipBuffer);
      fs.writeFileSync(path.join(publicDir, 'Gia_Long_FB_WebStore_v1.0.4.zip'), zipBuffer);

      const distDir = path.join(rootDir, 'dist');
      if (fs.existsSync(distDir)) {
        fs.writeFileSync(path.join(distDir, fileName), zipBuffer);
        fs.writeFileSync(path.join(distDir, 'Gia_Long_FB_WebStore_latest.zip'), zipBuffer);
        fs.writeFileSync(path.join(distDir, 'Gia_Long_FB_WebStore_v1.0.4.zip'), zipBuffer);
      }

      // Lưu thêm các phiên bản để tương thích ngược tuyệt đối
      fs.writeFileSync(path.join(outputDir, 'Gia_Long_FB_WebStore_v1.0.4.zip'), zipBuffer);
      fs.writeFileSync(path.join(outputDir, 'Gia_Long_FB_WebStore_v1.0.0.zip'), zipBuffer);
      fs.writeFileSync(path.join(outputDir, 'Gia_Long_FB_WebStore_Unlisted_v1.6.zip'), zipBuffer);
      fs.writeFileSync(path.join(outputDir, 'AutoRecruit_FB_WebStore_Unlisted_v1.5.zip'), zipBuffer);

      console.log('🎉 TẠO GÓI CHUẨN STORE COMPLIANCE THÀNH CÔNG:');
      console.log(`-> Phiên bản: v${version}`);
      console.log(`-> File chính: ${fileName}`);
      console.log('-> Kích thước:', (zipBuffer.length / 1024).toFixed(2), 'KB');
      console.log('-> Đã đồng bộ vào dist-extension/ & public/ sẵn sàng cho Cloudflare Pages & Store!');
    } catch (e) {
      console.error('Lỗi build:', e);
      process.exit(1);
    }
  })();
}
