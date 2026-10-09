# 🚀 HƯỚNG DẪN TỰ ĐỘNG HÓA CI/CD: GITHUB ➔ MICROSOFT EDGE ADD-ONS

Hệ thống đã thiết lập sẵn luồng GitHub Actions (`.github/workflows/deploy-extension.yml`). Khi bạn thực hiện `git push` lên GitHub:
1. **Cloudflare Pages:** Tự động kích hoạt build và cập nhật Web App trên `https://dang-bai-fb.pages.dev` trong ~1 phút.
2. **GitHub Actions:** Tự động làm rối mã nguồn bảo mật (chống bẻ khóa) ➔ Tự động đẩy file ZIP lên **Microsoft Edge Add-ons Store** ➔ Gửi yêu cầu cập nhật tự động!
3. **Microsoft Edge Trình Duyệt Khách Hàng:** Tự động cập nhật ngầm phiên bản mới mà khách không cần thao tác gì!

---

## 🔑 CÁC THÔNG SỐ CẦN LẤY TRÊN MICROSOFT PARTNER CENTER (LÀM 1 LẦN DUY NHẤT)

### 1. `EDGE_PRODUCT_ID`
* Đã có sẵn từ tài khoản của bạn:
  ```text
  d51e5560-f786-49c3-bba8-cbf4272dfbe1
  ```
* (Hệ thống đã cài mặc định giá trị này trong workflow).

---

### 2. Tạo `EDGE_CLIENT_ID`, `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL`
1. Đăng nhập vào [Microsoft Partner Center](https://partner.microsoft.com/dashboard/).
2. Nhìn lên góc trên bên phải, bấm vào biểu tượng **Bánh răng (Settings)** ➔ Chọn **Account settings (Cài đặt tài khoản)**.
3. Ở menu bên trái, tìm mục **API access (Truy cập API)** hoặc **Microsoft Entra ID (Azure AD)**.
4. Bấm **"Associate an Azure AD app"** hoặc **"Create Azure AD app"**:
   - Đặt tên App: `GitHub Deployer Gia Long FB`.
5. Sau khi tạo xong, bạn sẽ thấy:
   - **Client ID** (Dán vào secret `EDGE_CLIENT_ID` trên GitHub).
   - Bấm **"Add new key"** để lấy **Client Secret** (Dán vào secret `EDGE_CLIENT_SECRET` trên GitHub).
   - **Tenant ID / Access Token URL:**
     ```text
     https://login.microsoftonline.com/<TENANT_ID_CỦA_BẠN>/oauth2/v2.0/token
     ```
     (Dán vào secret `EDGE_ACCESS_TOKEN_URL` trên GitHub).

---

## 🔒 DÁN CÁC MÃ BÍ MẬT VÀO GITHUB SECRETS

1. Mở Repository dự án của bạn trên GitHub.
2. Vào **Settings** ➔ **Secrets and variables** ➔ Chọn **Actions**.
3. Bấm **"New repository secret"** và thêm các secret:
   * `EDGE_PRODUCT_ID`: `d51e5560-f786-49c3-bba8-cbf4272dfbe1`
   * `EDGE_CLIENT_ID`: (Client ID vừa lấy)
   * `EDGE_CLIENT_SECRET`: (Client Secret vừa lấy)
   * `EDGE_ACCESS_TOKEN_URL`: (Link Token URL vừa lấy)

---

## 🎯 VẬN HÀNH THỐNG NHẤT 100%:
* Mỗi khi bạn sửa code và `git push` lên nhánh `main` hoặc `master`:
  * Cloudflare tự build web mới.
  * GitHub Actions tự đóng gói và nộp Store.
  * Tiện ích trên máy khách tự cập nhật ngầm.
  * Mọi gói cước, khóa gói, cấp bản quyền được điều khiển thời gian thực qua Dashboard web!
