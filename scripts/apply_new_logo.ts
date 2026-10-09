import { generateAllIcons } from './generate_standard_icons.ts';

async function main() {
  console.log('Đang đồng bộ hóa logo và icons cho toàn bộ dự án...');
  await generateAllIcons();
  console.log('✓ Hoàn tất đồng bộ hóa!');
}

main().catch(console.error);
