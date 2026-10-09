# HƯỚNG DẪN ĐẨY LÊN GITHUB & TRIỂN KHAI CLOUDFLARE PAGES (GIA LONG - FB)

Tài liệu này hướng dẫn cách kết nối kho lưu trữ GitHub và triển khai lên **Cloudflare Pages** để toàn bộ hệ thống quản trị, web portal khách hàng và tiện ích Chrome/Edge Extension hoạt động đồng bộ 100%.

---

## I. CẤU TRÚC ĐÃ ĐƯỢC TỐI ƯU HÓA HOÀN TOÀN

1. **Hệ Thống Edge API Tự Động (`/functions/api/[[catchall]].ts`)**:
   - Khi triển khai lên Cloudflare Pages (ví dụ: `https://dang-bai-fb.pages.dev`), Cloudflare sẽ tự động kích hoạt **Pages Functions** cho toàn bộ đường dẫn `/api/*`.
   - Tuyệt đối không bao giờ bị lỗi trả về HTML (`index.html`) khi Extension hoặc trang Quản Trị gọi xác thực bản quyền (`/api/license/verify`, `/api/license/check-by-device`, `/api/orders/create`...).
   - Hỗ trợ đầy đủ CORS cho tất cả các trình duyệt và Chrome Extension.

2. **Cơ Chế Kiểm Soát Bản Quyền Hai Chiều (Admin ↔ Extension)**:
   - **Xác thực Heartbeat & Tự nhận diện máy**: Extension tự động kiểm tra định danh thiết bị (`deviceId`) và mã bản quyền (`licenseKey`).
   - **Ngắt Tức Thì Khi Thu Hồi / Khóa**: Khi Quản trị viên bấm **Thu hồi** (`Revoke`) hoặc **Tạm khóa** (`Suspend`), Extension lập tức ngắt toàn bộ lịch hẹn giờ (`chrome.alarms.clearAll()`), dừng ngay tiến trình đang chạy và vô hiệu hóa chế độ Grace Period.
   - **Tự Động Kích Hoạt (1-Click Approval)**: Khi khách gửi đơn đặt mua hoặc đăng ký dùng thử 1 ngày, Quản trị viên chỉ cần bấm **Duyệt 1-Click** tại trang Admin, thiết bị của khách sẽ tự động nhận bản quyền mà không cần gõ mã thủ công.
   - **Cơ Chế Dự Phòng (Multi-Server Fallback)**: Extension tự động thử kết nối lần lượt qua domain chính thức `dang-bai-fb.pages.dev`, máy chủ Backend hiện hành, và tự động cập nhật URL mới nhất khi người dùng mở trang web thông qua `web_bridge.js`.

3. **Tự Động Đóng Gói Extension (`scripts/build_webstore_zip.ts`)**:
   - Lệnh `npm run build` tự động chạy bộ đóng gói và sinh file ZIP chuẩn Store (`Gia_Long_FB_WebStore_latest.zip` và `v1.0.2.zip`) vào cả hai thư mục `dist-extension/` và `public/`, sau đó Vite sao chép trực tiếp vào `dist/` để khách hàng bấm là tải được ngay.

---

## II. CÁC BƯỚC ĐẨY CODE LÊN GITHUB

### 1. Khởi tạo Git & Đẩy Lên GitHub
Nếu bạn chưa đẩy code lên GitHub, mở Terminal tại thư mục dự án và chạy các lệnh sau:

```bash
# 1. Khởi tạo Git (nếu chưa có)
git init

# 2. Thêm toàn bộ file vào commit
git add .

# 3. Tạo commit đầu tiên
git commit -m "feat: Toan bo he thong Gia Long FB san sang cho GitHub va Cloudflare Pages"

# 4. Đổi tên nhánh sang main
git branch -M main

# 5. Liên kết với kho lưu trữ GitHub của bạn
git remote add origin https://github.com/TÊN_GITHUB_CỦA_BẠN/TÊN_REPO.git

# 6. Đẩy code lên GitHub
git push -u origin main
```

---

## III. CÁC BƯỚC TRIỂN KHAI LÊN CLOUDFLARE PAGES

### Bước 1: Đăng nhập Cloudflare
1. Truy cập [dash.cloudflare.com](https://dash.cloudflare.com).
2. Vào mục **Workers & Pages** > Chọn thẻ **Pages** > Bấm **Connect to Git** (Kết nối với GitHub).

### Bước 2: Chọn Repository GitHub
1. Chọn kho lưu trữ GitHub của dự án **Gia Long - FB**.
2. Bấm **Begin setup**.

### Bước 3: Cấu hình Build Settings
Điền chính xác các thông số sau:
- **Project name**: `dang-bai-fb` (hoặc tên tùy bạn chọn, ví dụ `gialong-fb`).
- **Production branch**: `main` (hoặc `master`).
- **Framework preset**: `Vite`.
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory (Thư mục gốc)**:
  - Nếu tệp `package.json` nằm ngay ở ngoài cùng của GitHub repo (khuyên dùng): **Để trống** (hoặc `/`).
  - Nếu khi tải lên GitHub, bạn vô tình để toàn bộ tệp trong một thư mục con (ví dụ `Gia-Long---Tuy-n-d-ng`): **Điền tên thư mục con đó vào ô Root directory**!
- **Node.js Version** (khuyến nghị): Vào **Environment variables**, thêm biến:
  - Tên: `NODE_VERSION`
  - Giá trị: `20`

### Bước 4: Thiết lập Biến Môi Trường (Tùy chọn)
Tại mục **Environment variables (advanced)** của Cloudflare Pages:
1. **`ADMIN_PIN`**: Mã PIN đăng nhập trang Quản Trị (Mặc định nếu không điền là `123456`).
2. **`BACKEND_URL`** (Tùy chọn):
   - Nếu bạn có máy chủ Node.js chạy riêng, bạn có thể điền link máy chủ đó (ví dụ: `https://your-server.run.app`). Cloudflare Pages Functions sẽ tự động chuyển tiếp (proxy) mọi API sang máy chủ này.
   - Nếu **không điền**, Cloudflare Pages Functions sẽ tự động xử lý toàn bộ API độc lập ngay tại mạng lưới Edge của Cloudflare!
3. **`GLFB_KV`** (Tùy chọn):
   - Tạo KV Namespace tên `GLFB_KV` trong Cloudflare rồi liên kết vào Pages Project để lưu trữ dữ liệu vĩnh viễn.

### Bước 5: Bấm Save and Deploy
- Bấm **Save and Deploy**. Cloudflare sẽ tự động tải thư viện, đóng gói Extension ZIP và xuất bản trang web trong khoảng 1-2 phút.
- Sau khi hoàn tất, bạn sẽ nhận được đường dẫn truy cập (ví dụ: `https://dang-bai-fb.pages.dev`).

---

## IV. CÁCH KHẮC PHỤC LỖI THƯỜNG GẶP TRÊN CLOUDFLARE PAGES

### 🚨 Lỗi 1: `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '/opt/buildhome/repo/package.json'`
**Nguyên nhân:**
Cloudflare Pages tìm tệp `package.json` tại thư mục gốc của repository nhưng không thấy. Lỗi này xảy ra do một trong 2 trường hợp:
1. **Trường hợp A (Phổ biến nhất):** Toàn bộ mã nguồn trên GitHub đang bị nằm bên trong một thư mục con (ví dụ: kho lưu trữ của bạn mở ra thì thấy thư mục `Gia-Long---Tuy-n-d-ng` rồi mới tới các file `package.json`, `src`, `public`...).
   - **Cách sửa nhanh trên Cloudflare Pages:**
     1. Vào dự án Cloudflare Pages > chọn **Settings** > **Builds & deployments** > **Configure Build**.
     2. Tại ô **Root directory (advanced)**, nhập tên thư mục con đó (ví dụ: `Gia-Long---Tuy-n-d-ng` hoặc tên thư mục chứa mã nguồn của bạn).
     3. Bấm **Save** rồi vào **Deployments** > Bấm **Retry deployment**.
   - **Cách sửa tận gốc trên GitHub:** Di chuyển toàn bộ các file (`package.json`, `src/`, `public/`, `server.ts`...) ra ngoài thư mục gốc của repo GitHub để khi mở link repo là thấy ngay `package.json`.

2. **Trường hợp B:** Kho lưu trữ GitHub vừa tạo mới (`81d1780 Initial commit`) chỉ mới có file README hoặc chưa được đẩy (push) đầy đủ các file dự án lên.
   - **Cách sửa:** Chạy `git add .`, `git commit -m "push full code"`, `git push -u origin main` từ thư mục dự án chứa `package.json`.

---

## V. ĐƯỜNG DẪN TRUY CẬP VÀ ĐIỀU KHIỂN HỆ THỐNG

| Chức năng | Đường dẫn |
|---|---|
| **Cổng Khách Hàng (Tải Tiện Ích & Bảng Giá)** | `https://dang-bai-fb.pages.dev/` |
| **Bảng Điều Khiển Quản Trị (Admin Portal)** | `https://dang-bai-fb.pages.dev/?admin=1` |
| **Kích Hoạt Tự Động 1-Click cho Khách** | `https://dang-bai-fb.pages.dev/?kich_hoat=MÃ_KEY` |
| **Link Tải File ZIP Extension Trực Tiếp** | `https://dang-bai-fb.pages.dev/download` |
| **Chính Sách Quyền Riêng Tư (Privacy Policy)** | `https://dang-bai-fb.pages.dev/privacy` |
| **API Xác Thực Bản Quyền cho Extension** | `https://dang-bai-fb.pages.dev/api/license/verify` |
| **API Kiểm Tra Thiết Bị Duyệt Tự Động** | `https://dang-bai-fb.pages.dev/api/license/check-by-device` |
