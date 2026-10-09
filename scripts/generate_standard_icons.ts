import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'src', 'extension_files');
const publicDir = path.join(rootDir, 'public');
const sourceImage = path.join(rootDir, 'src', 'assets', 'images', 'gialong_fb_logo_1791247990192.jpg');

export async function generateAllIcons() {
  if (!fs.existsSync(sourceImage)) {
    console.warn('Không tìm thấy ảnh gốc:', sourceImage);
    return;
  }

  // 1. Tạo logo 512x512
  await sharp(sourceImage)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'logo.png'));

  await sharp(sourceImage)
    .resize(512, 512, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(extensionDir, 'logo.png'));

  // 2. Tạo các kích thước chuẩn 16, 48, 128
  const sizes = [16, 48, 128];
  for (const s of sizes) {
    const dest = path.join(extensionDir, `icon${s}.png`);
    await sharp(sourceImage)
      .resize(s, s, { fit: 'cover' })
      .png({ quality: 100 })
      .toFile(dest);
    console.log(`✓ Đã tạo icon chuẩn: icon${s}.png (${s}x${s})`);
  }

  // 2b. Tạo icon 300x300 bắt buộc cho Microsoft Edge Add-ons Store Listing
  await sharp(sourceImage)
    .resize(300, 300, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'store_logo_300x300.png'));
  console.log('✓ Đã tạo icon chuẩn Microsoft Edge Store Listing: store_logo_300x300.png (300x300)');

  // 2c. Tạo banner 440x280 cho Microsoft Edge Promo Tile
  await sharp(sourceImage)
    .resize(440, 280, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'store_promo_440x280.png'));
  console.log('✓ Đã tạo banner Microsoft Edge Promo Tile: store_promo_440x280.png (440x280)');

  // 3. Tạo icon.png và public/icon128.png
  await sharp(sourceImage)
    .resize(128, 128, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(extensionDir, 'icon.png'));

  await sharp(sourceImage)
    .resize(128, 128, { fit: 'cover' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'icon128.png'));

  // 4. Tạo SVG
  const base64Png = fs.readFileSync(path.join(publicDir, 'logo.png')).toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <clipPath id="logoClip">
      <rect width="512" height="512" rx="100" />
    </clipPath>
  </defs>
  <image href="data:image/png;base64,${base64Png}" width="512" height="512" clip-path="url(#logoClip)" />
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgContent, 'utf-8');
  fs.writeFileSync(path.join(extensionDir, 'logo.svg'), svgContent, 'utf-8');

  // 5. Cập nhật src/extension_files/index.ts
  const icon16B64 = 'data:image/png;base64,' + fs.readFileSync(path.join(extensionDir, 'icon16.png')).toString('base64');
  const icon48B64 = 'data:image/png;base64,' + fs.readFileSync(path.join(extensionDir, 'icon48.png')).toString('base64');
  const icon128B64 = 'data:image/png;base64,' + fs.readFileSync(path.join(extensionDir, 'icon128.png')).toString('base64');
  const logoPngB64 = 'data:image/png;base64,' + fs.readFileSync(path.join(extensionDir, 'logo.png')).toString('base64');

  const indexTsContent = `// Export extension files using Vite ?raw imports
import backgroundJs from './background.js?raw';
import contentJs from './content.js?raw';
import dashboardHtml from './dashboard.html?raw';
import dashboardJs from './dashboard.js?raw';
import popupHtml from './popup.html?raw';
import popupJs from './popup.js?raw';
import manifestJson from './manifest.json?raw';
import preloadedDataJson from './preloaded_data.json?raw';
import webBridgeJs from './web_bridge.js?raw';
import zaloCardSvg from './zalo_card.svg?raw';
import logoSvg from './logo.svg?raw';

export interface ExtensionFileDef {
  name: string;
  content: string;
  type: string;
  size: number;
  isBinary?: boolean;
}

export const DEFAULT_EXTENSION_BUNDLE: ExtensionFileDef[] = [
  {
    name: 'logo.svg',
    content: logoSvg,
    type: 'image/svg+xml',
    size: logoSvg.length,
  },
  {
    name: 'logo.png',
    content: '${logoPngB64}',
    type: 'image/png',
    size: ${fs.statSync(path.join(extensionDir, 'logo.png')).size},
    isBinary: true,
  },
  {
    name: 'manifest.json',
    content: manifestJson,
    type: 'application/json',
    size: manifestJson.length,
  },
  {
    name: 'background.js',
    content: backgroundJs,
    type: 'text/javascript',
    size: backgroundJs.length,
  },
  {
    name: 'content.js',
    content: contentJs,
    type: 'text/javascript',
    size: contentJs.length,
  },
  {
    name: 'popup.html',
    content: popupHtml,
    type: 'text/html',
    size: popupHtml.length,
  },
  {
    name: 'popup.js',
    content: popupJs,
    type: 'text/javascript',
    size: popupJs.length,
  },
  {
    name: 'dashboard.html',
    content: dashboardHtml,
    type: 'text/html',
    size: dashboardHtml.length,
  },
  {
    name: 'dashboard.js',
    content: dashboardJs,
    type: 'text/javascript',
    size: dashboardJs.length,
  },
  {
    name: 'preloaded_data.json',
    content: preloadedDataJson,
    type: 'application/json',
    size: preloadedDataJson.length,
  },
  {
    name: 'web_bridge.js',
    content: webBridgeJs,
    type: 'text/javascript',
    size: webBridgeJs.length,
  },
  {
    name: 'icon.png',
    content: '${icon128B64}',
    type: 'image/png',
    size: ${fs.statSync(path.join(extensionDir, 'icon.png')).size},
    isBinary: true,
  },
  {
    name: 'icon128.png',
    content: '${icon128B64}',
    type: 'image/png',
    size: ${fs.statSync(path.join(extensionDir, 'icon128.png')).size},
    isBinary: true,
  },
  {
    name: 'icon48.png',
    content: '${icon48B64}',
    type: 'image/png',
    size: ${fs.statSync(path.join(extensionDir, 'icon48.png')).size},
    isBinary: true,
  },
  {
    name: 'icon16.png',
    content: '${icon16B64}',
    type: 'image/png',
    size: ${fs.statSync(path.join(extensionDir, 'icon16.png')).size},
    isBinary: true,
  },
  {
    name: 'zalo_card.svg',
    content: zaloCardSvg,
    type: 'image/svg+xml',
    size: zaloCardSvg.length,
  },
];
`;
  fs.writeFileSync(path.join(extensionDir, 'index.ts'), indexTsContent, 'utf-8');
  console.log('✓ Đã cập nhật xong toàn bộ bộ Icon Gia Long FB mới vào src/extension_files/index.ts');
}

if (process.argv[1] && process.argv[1].endsWith('generate_standard_icons.ts')) {
  generateAllIcons().catch(console.error);
}
