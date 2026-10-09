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

## 🛠️ GIẢI PHÁP KHẮC PHỤC TRIỆT ĐỂ LỖI KHI BẤM "GỬI ĐỀ NGHỊ" (SUBMIT):

Khi bạn bấm nút **"Gửi đề nghị"** (Submit) ở cuối trang tổng quan bản đệ trình mà hệ thống báo lỗi đỏ hoặc không cho gửi, nguyên nhân là do **1 trong 4 mục bắt buộc** sau chưa hoàn tất:

### 🔴 1. LỖI THIẾU ẢNH CHỤP MÀN HÌNH (SCREENSHOTS - NGUYÊN NHÂN PHỔ BIẾN NHẤT 90%):
- **Hiện tượng:** Mục *Danh sách trang thông tin của Store* (Store Listings) hiện dấu chấm than vàng/đỏ hoặc báo *"At least 1 screenshot is required"*.
- **Quy định của Microsoft:** Bắt buộc phải có **tối thiểu 1 ảnh chụp màn hình** kích thước chuẩn **1280 x 800 px** (hoặc 640 x 400 px), định dạng PNG/JPG.
- **Cách khắc phục:**
  1. Tải 2 ảnh chụp màn hình chuẩn 1280x800 px đã được tạo sẵn trong app:
     - [store_screenshot_1280x800_1.png](/store_screenshot_1280x800_1.png) (Ảnh giao diện Đăng bài tự động)
     - [store_screenshot_1280x800_2.png](/store_screenshot_1280x800_2.png) (Ảnh quản lý Bản quyền VIP)
  2. Kéo thả 1 hoặc cả 2 ảnh này vào ô **Ảnh chụp màn hình (Screenshots)** trong mục Store Listings.

### 🔴 2. LỖI THIẾU GHI CHÚ CHỨNG NHẬN (NOTES FOR CERTIFICATION):
- **Hiện tượng:** Microsoft chặn không cho "Gửi đề nghị" vì tiện ích yêu cầu các quyền `tabs`, `scripting`, `alarms`, `host_permissions` nhưng ô **Ghi chú chứng nhận** bị bỏ trống.
- **Cách khắc phục:** Trong mục **Bản đệ trình** (Submission), tìm ô **Ghi chú chứng nhận (Notes for certification)** và dán đoạn văn bản mẫu sau:
  > **Extension Functionality:** Gia Long - FB automates Facebook group post management and recruitment publishing for HR teams and business managers.  
  > **Permissions Justification:**  
  > - `activeTab`, `scripting`, `tabs`: Interacts with Facebook group post composer on user-authorized browser sessions.  
  > - `storage`, `alarms`: Stores posting schedules and triggers timer events in background service worker.  
  > - `host_permissions` (*.facebook.com): Required to publish posts to user's joined groups.  
  > **Test License Key for Reviewer:** `GLFB-STORE-REVIEW-TEST` (Valid 365 days VIP).

### 🔴 3. LỖI THIẾU HOẶC SAI KÍCH THƯỚC LOGO (STORE LOGO):
- **Hiện tượng:** Báo lỗi *"Logo must be 300 x 300 pixels"*.
- **Cách khắc phục:** Bấm tải ảnh **[store_logo_300x300.png](/store_logo_300x300.png)** (đúng chuẩn 300x300 px PNG) và tải lên ô **Biểu trưng tiện ích (Extension logo)**.

### 🔴 4. SỬ DỤNG GÓI ZIP MỚI NHẤT V1.0.3 (KHÔNG BỊ TRÙNG PHIÊN BẢN):
- Dùng gói **`Gia_Long_FB_WebStore_v1.0.3.zip`** (đã được làm sạch 100% manifest, loại bỏ hoàn toàn localhost và match pattern không hợp lệ).

---

### 🛡️ Bước 4: Khai báo Quyền riêng tư (Privacy Policy)
- **Privacy policy URL:** Dán đường dẫn chính sách bảo mật đã tạo sẵn:
  > `https://dang-bai-fb.pages.dev/privacy.html`
- **Tuyên bố bảo mật (Privacy declaration):** Tích chọn cam kết tiện ích không thu thập dữ liệu cá nhân hay mật khẩu ra ngoài máy tính người dùng.

### ✈️ Bước 5: Bấm "Gửi đề nghị" (Submit for review)
- Sau khi 4 mục trên đều hiển thị biểu tượng **✔ Hoàn tất (Complete)** màu xanh lá.
- Bấm nút **"Gửi đề nghị"** ➔ Trạng thái chuyển sang **"Đang xem xét" (In review)** thành công 100%!
- Microsoft sẽ duyệt trong **24 - 48 giờ** và gửi email chúc mừng xuất bản.

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

