export const BACKEND_API_BASE = 'https://dang-bai-fb.pages.dev';

/**
 * Tự động xác định URL API phù hợp:
 * - Khi chạy trên Cloudflare Pages (dang-bai-fb.pages.dev): Sử dụng đường dẫn tương đối để Cloudflare Pages Functions (/functions/api/[[catchall]].ts) xử lý trực tiếp trên Edge cùng domain, không bị lỗi CORS.
 * - Khi chạy dev / local server: Giữ nguyên đường dẫn tương đối /api/*.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath;
}

