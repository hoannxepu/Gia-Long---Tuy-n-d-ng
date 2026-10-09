# 🌐 HƯỚNG DẪN NỘP TIỆN ÍCH LÊN MICROSOFT EDGE ADD-ONS STORE (DUYỆT SIÊU NHANH)

> **Tin vui cho bạn:** Microsoft Edge Add-ons Store duyệt **nhanh hơn rất nhiều** so với Google Chrome Web Store (thường chỉ mất **24h - 72h**, tức 1 - 3 ngày làm việc thay vì 1 - 2 tuần như Chrome). Đặc biệt, việc đăng ký tài khoản Microsoft Partner Center là **hoàn toàn MIỄN PHÍ (0đ)**, không tốn phí 5 USD như Google!

---

## ⚡ 1. TẠI SAO ĐẨY LÊN EDGE STORE LÀ LỰA CHỌN TUYỆT VỜI?

1. **Tương thích 100% không cần đổi code**:
   - Microsoft Edge chạy trên nền tảng Chromium y hệt Google Chrome.
   - Toàn bộ Manifest V3, Service Worker, Content Scripts và file ZIP `Gia_Long_FB_WebStore_v1.0.2.zip` đã được tối ưu chạy mượt mà 100% trên Edge.
2. **Xét duyệt nhanh chóng & thoáng hơn**:
   - Microsoft có đội ngũ xét duyệt tự động và thủ công rất nhanh, ít khi bị "ngâm" hàng tuần như Chrome.
3. **Chi phí $0**:
   - Miễn phí trọn đời tài khoản Developer, chỉ cần một email Microsoft (@outlook.com, @hotmail.com hoặc email bất kỳ).
4. **Trải nghiệm khách hàng cực tốt**:
   - Khách hàng dùng Windows có sẵn Microsoft Edge trên máy.
   - Dùng Microsoft Edge riêng để cắm tự động đăng bài Facebook, còn Google Chrome để làm việc cá nhân -> **Không bao giờ bị chớp nháy hay nhảy tab làm phiền!**
5. **Nộp song song 2 bên**:
   - Bạn có thể nộp cả Chrome Web Store và Microsoft Edge Add-ons cùng một lúc. Bên nào duyệt trước thì lấy link bên đó gửi khách trước!

---

## 🚀 2. QUY TRÌNH 5 BƯỚC NỘP TIỆN ÍCH LÊN EDGE ADD-ONS (CHỈ MẤT 5 PHÚT)

### 📍 Bước 1: Truy cập cổng Microsoft Partner Center
- Truy cập vào: **[https://partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge)**
- Đăng nhập bằng tài khoản Microsoft của bạn.
- Nếu là lần đầu tiên, chỉ cần điền tên Developer / Đơn vị đại diện (ví dụ: `Gia Long - FB` hoặc tên cá nhân bạn) rồi đồng ý điều khoản (hoàn toàn miễn phí).

### 📦 Bước 2: Bấm tạo mới Extension & Tải gói ZIP v1.0.2
- Trong mục **Microsoft Edge** ➔ Chọn **Developer** ➔ Bấm **"Create new extension"**.
- Kéo thả file ZIP: **`Gia_Long_FB_WebStore_v1.0.2.zip`** (tải trực tiếp từ giao diện Quản Trị / Workspace trong app).
- Hệ thống Microsoft sẽ kiểm tra tệp manifest và báo **Package verified successfully** màu xanh lá!

### 📝 Bước 3: Điền thông tin Store Listing (Thông tin cửa hàng)
- **Tên hiển thị (Extension name):** `Gia Long - FB`
- **Logo cửa hàng (Extension logo - BẮT BUỘC):** Tải lên tệp ảnh **`store_logo_300x300.png`** (kích thước đúng chuẩn 300x300 px đã được tạo sẵn trong app).
- **Mô tả ngắn (Short description):**
  > Tiện ích tự động hóa đăng bài viết và thông báo tuyển dụng lên nhóm Facebook, hỗ trợ hẹn giờ và lưu giữ dữ liệu an toàn.
- **Mô tả chi tiết (Description):**
  > Gia Long - FB là giải pháp tự động hóa thông minh giúp người quản trị và nhà tuyển dụng:
  > - Tự động đăng bài viết và thông báo lên các nhóm Facebook đã tham gia.
  > - Hỗ trợ đính kèm tối đa 3 ảnh sắc nét bằng công nghệ DataTransfer.
  > - Hẹn giờ tự động chính xác với cơ chế Service Worker Alarms.
  > - Chống nhảy tab và giãn cách ngẫu nhiên an toàn cho tài khoản.
  > - Lưu giữ 100% lịch sử và bài viết cục bộ trên máy tính.
- **Danh mục (Category):** Chọn **Productivity (Năng suất)** hoặc **Social (Mạng xã hội)**.
- **Ảnh chụp màn hình (Screenshots):** Tải lên 1 - 2 ảnh chụp giao diện Popup hoặc Dashboard (kích thước tối ưu 1280x800 hoặc 640x400 px).

---

## 🛠️ GIẢI PHÁP KHẮC PHỤC CÁC LỖI THƯỜNG GẶP KHI NỘP TRÊN EDGE:

1. **Lỗi `Package validation failed` hoặc `Invalid match pattern`:**
   - **Nguyên nhân:** Trước đây manifest chứa `localhost` hoặc đường dẫn chứa ký tự wildcard không hợp lệ đối với bộ quét Edge Store.
   - **Đã khắc phục:** Gói ZIP **`v1.0.2`** đã được làm sạch 100%, chuẩn hóa sang HTTPS chính quy (`dang-bai-fb.pages.dev`, `run.app`), đảm bảo vượt qua ngay lập tức.

2. **Lỗi `The version must be greater than previously uploaded version`:**
   - **Nguyên nhân:** Phiên bản cũ (1.0.0 hoặc 1.0.1) đã từng được nộp nháp.
   - **Đã khắc phục:** Bạn dùng ngay gói **`Gia_Long_FB_WebStore_v1.0.2.zip`** (phiên bản mới 1.0.2), hệ thống Edge sẽ chấp nhận ngay.

3. **Lỗi `Store logo must be 300 x 300 px`:**
   - **Nguyên nhân:** Tải ảnh sai kích cỡ vào ô Extension Logo trong Store Listings.
   - **Đã khắc phục:** Bấm nút **"Tải Logo 300x300 (Bắt Buộc)"** trên giao diện web để lấy file `store_logo_300x300.png` chuẩn từng pixel.

### 🛡️ Bước 4: Khai báo Quyền riêng tư (Privacy Policy)
- **Privacy policy URL:** Dán đường dẫn chính sách bảo mật đã tạo sẵn của bạn:
  > `https://<ten-mien-app-cua-ban>/privacy.html`
- **Tuyên bố bảo mật (Privacy declaration):** Tích chọn cam kết tiện ích không thu thập dữ liệu cá nhân hay mật khẩu ra ngoài máy tính người dùng.

### ✈️ Bước 5: Nộp xét duyệt (Submit for review)
- Kiểm tra lại các mục và bấm **"Submit"** (Nộp xét duyệt).
- Trạng thái sẽ chuyển sang **"In review"**.
- Thường sau **24 - 48 giờ**, Microsoft sẽ gửi email chúc mừng tiện ích của bạn đã được duyệt và cấp đường link chính thức trên Edge Add-ons!

---

## 💡 MẸO: TÍNH NĂNG "IMPORT FROM CHROME WEB STORE"
Sau này khi Chrome Web Store của bạn được Google duyệt xong, trên giao diện Microsoft Partner Center sẽ có thêm nút **"Import from Chrome Web Store"**:
- Bạn chỉ cần dán link Chrome Store vào, Microsoft sẽ tự động sao chép toàn bộ mô tả, hình ảnh và file zip sang mà bạn không cần phải gõ lại gì cả!

---

## 📲 CÁCH KHÁCH HÀNG CÀI ĐẶT SAU KHI EDGE DUYỆT

### Thông Tin Tiện Ích Đã Cấp Trên Microsoft Partner Center:
* **Tên tiện ích:** Gia Long - FB (Version 1.0.2)
* **CRX ID:** `blpkghkjimacggjlgiklkaddldbcnebo`
* **Store ID:** `0RDCKC6WT538`
* **Product ID:** `d51e5560-f786-49c3-bba8-cbf4272dfbe1`
* **Đường link lên kệ chính thức:**  
  👉 **`https://microsoftedge.microsoft.com/addons/detail/gia-long-fb/blpkghkjimacggjlgiklkaddldbcnebo`**

---

## ⚡ CHECKLIST 3 BƯỚC ĐÓN ĐẦU ĐƯA VÀO SỬ DỤNG NGAY:

1. **Bước 1 (1 phút):** Khi nhận được email *"Your extension is published"* từ Microsoft, bạn mở link trên. Kiểm tra nút màu xanh **"Get" (Nhận)** đã sáng lên.
2. **Bước 2 (1 phút):** Bấm "Get" để cài đặt thử nghiệm trên máy tính của bạn, kiểm tra biểu tượng sấm sét xanh của Gia Long - FB xuất hiện trên thanh công cụ.
3. **Bước 3 (1 phút):** Sử dụng nút **"Mẫu Gửi Khách (Kèm Link Edge Store)"** trong bảng Quản Trị để gửi cho khách. Khách hàng chỉ cần:
   - Nhấp link Edge Store ➔ Bấm **"Get"**.
   - Nhấp link kích hoạt 1-Click ➔ Bản quyền VIP tự động kích hoạt vào máy tính!

