# HƯỚNG DẪN NÂNG CẤP HỆ THỐNG: CLOUDFLARE D1 (SQLITE) & CACHE THÔNG MINH CHO EXTENSION

Tài liệu này hướng dẫn chi tiết cách vận hành hệ thống bản quyền nâng cấp sử dụng **Cloudflare D1 Database** kết hợp **Mã xác nhận bảo mật (Signed Token) & Smart Cache** cho Chrome Extension Gia Long FB.

---

## 🎯 1. Các Vấn Đề Đã Được Khắc Phục Triệt Để

1. **Khắc phục lỗi Build Wrangler Cloudflare Pages Functions:**
   - Đã xử lý lỗi cú pháp `Unexpected "}"` tại `functions/api/[[catchall]].ts`.
   - File đã được chuẩn hóa TypeScript, biên dịch qua Esbuild và Vite thành công 100%.

2. **Khắc phục triệt để lỗi Admin nháy nháy (Flickering / Re-rendering):**
   - Đã loại bỏ vòng lặp `setInterval` trùng lặp bị rò rỉ (memory leak).
   - Áp dụng kiểm tra tham chiếu `areArraysEqual` cho danh sách đơn hàng `adminOrders`, giấy phép `licenses`, và `historyList`. Khi dữ liệu không có thay đổi mới, React không re-render lại bảng, giao diện hoàn toàn êm ái, mượt mà và không giật/nháy.
   - Các lượt kiểm tra định kỳ nền (`isSilent: true`) chạy ngầm không hiển thị vòng xoay loading làm giật bảng.

3. **Thay thế Cloudflare KV sang Cloudflare D1 Database (SQLite):**
   - Loại bỏ hoàn toàn hạn chế ghi 1 lần/giây và độ trễ đồng bộ của KV.
   - Sử dụng bảng SQLite `licenses` với index tăng tốc truy vấn cho `machine_id` và `status`.

4. **Cơ chế Smart Cache tại Extension (100% Miễn Phí khi mở rộng hàng nghìn máy):**
   - Sinh mã máy cố định phần cứng (`GLFB-PC-xxxxxx`) duy nhất và không bao giờ đổi.
   - **Chế độ kiểm tra nhanh (khi mua gói):** Kiểm tra liên tục 3 giây/lần trong 3–5 phút ngay khi gửi đơn, tự động nhận kích hoạt ngay khi Admin bấm Duyệt.
   - **Chế độ lưu Cache (khi dùng hàng ngày):** Khi nhận được `Signed Token` từ Server, lưu vào bộ nhớ máy (`chrome.storage.local`). Hàng ngày Extension chỉ cần đọc mã này để chạy (không tốn request), và chỉ kiểm tra lại với Server ngầm sau mỗi **60 phút**.

---

## 🚀 2. Hướng Dẫn Kích Hoạt Cloudflare D1 Database

### Bước 1: Tạo D1 Database trên Cloudflare
Chạy lệnh sau trong Terminal (hoặc tạo trên Cloudflare Dashboard):
```bash
npx wrangler d1 create gia-long-db
```
Lệnh trên sẽ trả về kết quả tương tự:
```
[[d1_databases]]
binding = "DB"
database_name = "gia-long-db"
database_id = "xxxx-xxxx-xxxx-xxxx"
```

### Bước 2: Khởi tạo bảng dữ liệu `licenses`
Chạy lệnh sau để khởi tạo bảng quản lý bản quyền SQLite:
```bash
# Khởi tạo cho môi trường local
npx wrangler d1 execute gia-long-db --local --file=./d1_schema.sql

# Khởi tạo cho môi trường Cloudflare Production
npx wrangler d1 execute gia-long-db --remote --file=./d1_schema.sql
```

### Bước 3: Liên kết D1 Database vào Cloudflare Pages (Trên Web Dashboard)
1. Truy cập [dash.cloudflare.com](https://dash.cloudflare.com) > Chọn dự án Pages **gia-long---tuy-n-d-ng**.
2. Vào **Settings** > **Functions** > Mục **D1 database bindings**.
3. Bấm **Add binding**:
   - **Variable name**: `DB`
   - **D1 database**: Chọn `gia-long-db`
4. Bấm **Save and Deploy**.

> **Lưu ý:** Hệ thống Backend (`catchall.ts` và `server.ts`) được thiết kế kiến trúc thông minh **Dual-Mode**: Nếu chưa gắn D1, hệ thống sẽ tự động dùng bộ nhớ máy chủ và KV để chạy trơn tru, không bao giờ bị gián đoạn hoạt động!

---

## 📡 3. Danh Sách Các API Mới Hoàn Chỉnh

| Phương thức | Endpoint | Chức năng | Tham số chính |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/register` | Nhận yêu cầu mua gói từ Extension | `machine_id`, `pkg_name`, `client_name`, `phone`, `price` |
| **POST** | `/api/admin/approve` | Admin duyệt gói & cấp Signed Token | `machine_id`, `pkg_name`, `days`, mã PIN quản trị |
| **GET / POST** | `/api/check` | Kiểm tra máy, cấp Signed Token | `machine_id` |

### Mã Xác Nhận Bảo Mật (Signed Token)
Token có định dạng: `GLFB_SIG_<base64_payload_and_signature>`
Bao gồm: `machine_id`, `expires_at`, chữ ký kiểm tra tính toàn vẹn (checksum). Extension kiểm tra token này trực tiếp tại máy mà không cần gửi request lên máy chủ liên tục.

---

## 🔄 4. Tự Động Hóa CI/CD (GitHub Actions)

Đã bổ sung workflow `.github/workflows/deploy-cloudflare.yml`:
- Tự động đóng gói ZIP extension chuẩn Microsoft Edge & Chrome Web Store.
- Tự động build mã nguồn và triển khai lên Cloudflare Pages mỗi khi có commit mới được push lên nhánh `main` hoặc `master`.
