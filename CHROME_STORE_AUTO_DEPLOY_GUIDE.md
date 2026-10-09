# 🚀 HƯỚNG DẪN THIẾT LẬP TỰ ĐỘNG HÓA (GITHUB ➔ CHROME WEB STORE)

Khi bạn đã nộp bản **v1.0.0** lên Chrome Web Store và đang chờ Google duyệt, bạn có thể thiết lập sẵn hệ thống tự động hóa này. Sau khi Google duyệt xong, mỗi lần bạn `git push` lên GitHub, bản cập nhật mới sẽ được tự động đóng gói và đẩy lên Chrome Store!

---

## 🔑 BƯỚC 1: LẤY 4 THÔNG SỐ BÍ MẬT (LÀM 1 LẦN DUY NHẤT)

### 1. `CHROME_EXTENSION_ID`
* Đăng nhập vào [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
* Nhấp vào tiện ích **Gia Long - FB** của bạn.
* Nhìn lên thanh địa chỉ trình duyệt, ID là chuỗi ký tự 32 chữ cái ở cuối URL (ví dụ: `abcdefghijklmnopqrstuvwxyz123456`).

---

### 2. Tạo `CHROME_CLIENT_ID` & `CHROME_CLIENT_SECRET` (Google Cloud Console)
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Tạo một Project mới (đặt tên ví dụ: `GiaLong-ChromeStore-Publish`).
3. Vào mục **APIs & Services (API & Dịch vụ)** ➔ **Library (Thư viện)**.
4. Tìm kiếm từ khóa **"Chrome Web Store API"** ➔ Bấm **Enable (Bật)**.
5. Vào mục **OAuth consent screen (Màn hình đồng ý OAuth)**:
   * Chọn **External (Bên ngoài)** ➔ Bấm Create.
   * Điền App name: `Gia Long Deployer`, điền email của bạn ➔ Bấm Save and Continue.
6. Vào mục **Credentials (Thông tin xác thực)** ➔ Bấm **Create Credentials** ➔ Chọn **OAuth client ID**:
   * Application type (Loại ứng dụng): Chọn **Desktop app (Ứng dụng trên máy tính bàn)**.
   * Name: `GitHub Actions Deployer` ➔ Bấm Create.
7. Bạn sẽ nhận được 2 chuỗi:
   * **Client ID** (Dán vào secret `CHROME_CLIENT_ID`)
   * **Client Secret** (Dán vào secret `CHROME_CLIENT_SECRET`)

---

### 3. Lấy `CHROME_REFRESH_TOKEN`
Sau khi có `CLIENT_ID` và `CLIENT_SECRET`, bạn mở trình duyệt và dán link sau vào thanh địa chỉ (thay thế chuỗi `YOUR_CLIENT_ID` bằng Client ID của bạn):

```text
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
```

1. Đăng nhập bằng đúng tài khoản Google Developer của Chrome Web Store.
2. Google sẽ cấp cho bạn một chuỗi **Authorization Code**.
3. Mở Terminal (hoặc công cụ như Postman / curl) chạy lệnh sau để lấy `refresh_token`:

```bash
curl -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob"
```

* Trong kết quả JSON trả về, copy chuỗi nằm trong mục `"refresh_token": "..."`.

---

## 🔒 BƯỚC 2: DÁN CÁC THÔNG SỐ VÀO GITHUB SECRETS

1. Mở Repository dự án của bạn trên GitHub.
2. Vào tab **Settings** ➔ Mục **Secrets and variables** ➔ Chọn **Actions**.
3. Bấm **New repository secret** và lần lượt tạo 4 Secret sau:
   * `CHROME_EXTENSION_ID`: *(ID của extension)*
   * `CHROME_CLIENT_ID`: *(Client ID)*
   * `CHROME_CLIENT_SECRET`: *(Client Secret)*
   * `CHROME_REFRESH_TOKEN`: *(Refresh Token)*

---

## ⚡ BƯỚC 3: CÁCH HOẠT ĐỘNG TỪ NAY VỀ SAU

1. Mỗi khi cần cập nhật code, mở file `src/extension_files/manifest.json` và tăng phiên bản:
   ```json
   "version": "1.0.1"
   ```
2. Gõ lệnh:
   ```bash
   git add .
   git commit -m "Nâng cấp tính năng mới v1.0.1"
   git push origin main
   ```
3. **GitHub Actions sẽ tự động:**
   * Làm rối mã nguồn (Obfuscate) bảo mật chống bẻ khóa.
   * Nén file ZIP.
   * Đẩy trực tiếp lên Google Chrome Web Store.
   * Gửi yêu cầu duyệt tự động.
4. Ngay khi Google duyệt xong, **toàn bộ máy của khách hàng sẽ tự động cập nhật ngầm**!
