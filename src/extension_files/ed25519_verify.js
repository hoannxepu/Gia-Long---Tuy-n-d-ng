// ed25519_verify.js - XÁC THỰC CHỮ KÝ BẤT ĐỐI XỨNG ED25519 TRÊN TRÌNH DUYỆT (CHROME EXTENSION)
// Thuần Web Crypto API chuẩn W3C, không dùng thư viện ngoài, tương thích Manifest V3

(function (root) {
  const ED25519_PUBLIC_KEY_HEX = 'ecceda4cabef90555cb6d86742c1123668b9648a18528675ed17808828bd9183';
  const MAX_OFFLINE_HOURS = 48;
  const MAX_OFFLINE_MS = MAX_OFFLINE_HOURS * 60 * 60 * 1000;

  function hexToUint8Array(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  function base64UrlToUint8Array(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  let cachedCryptoKey = null;

  async function getCryptoKey() {
    if (cachedCryptoKey) return cachedCryptoKey;
    const rawKey = hexToUint8Array(ED25519_PUBLIC_KEY_HEX);
    cachedCryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return cachedCryptoKey;
  }

  /**
   * Xác minh chữ ký Ed25519 của token bản quyền
   * @param {string} tokenString - Token bắt đầu bằng GLFB_ED25519_
   * @param {string} currentMachineId - Mã máy hiện tại để kiểm tra
   * @param {number|string} lastOnlineCheckMs - Thời điểm kiểm tra online gần nhất
   * @returns {Promise<{ valid: boolean, payload?: object, error?: string, needsOnlineCheck?: boolean }>}
   */
  async function verifyEd25519LicenseToken(tokenString, currentMachineId, lastOnlineCheckMs = Date.now()) {
    try {
      if (!tokenString || typeof tokenString !== 'string') {
        return { valid: false, error: 'Thiếu chuỗi token' };
      }

      if (!tokenString.startsWith('GLFB_ED25519_')) {
        return { valid: false, error: 'Định dạng token không đúng chuẩn chữ ký Ed25519' };
      }

      const raw = tokenString.slice('GLFB_ED25519_'.length);
      const parts = raw.split('.');
      if (parts.length !== 2) {
        return { valid: false, error: 'Cấu trúc token bị thay đổi hoặc sai lệch' };
      }

      const [payloadB64, signatureB64] = parts;
      const signatureBytes = base64UrlToUint8Array(signatureB64);
      const dataBytes = new TextEncoder().encode(payloadB64);

      const pubKey = await getCryptoKey();
      const isSignatureValid = await crypto.subtle.verify(
        { name: 'Ed25519' },
        pubKey,
        signatureBytes,
        dataBytes
      );

      if (!isSignatureValid) {
        return { valid: false, error: 'Chữ ký token không hợp lệ (Dữ liệu đã bị sửa đổi trong DevTools/Storage)' };
      }

      const payloadJson = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
      const payload = JSON.parse(payloadJson);

      const now = Date.now();
      if (payload.exp && payload.exp < now) {
        return { valid: false, payload, error: 'Bản quyền đã hết hạn' };
      }

      if (currentMachineId && payload.machineId && payload.machineId !== currentMachineId) {
        return { valid: false, payload, error: 'Mã máy của token không khớp với thiết bị này' };
      }

      // Giới hạn thời gian cho phép offline tối đa 48 giờ
      const lastCheck = typeof lastOnlineCheckMs === 'number' ? lastOnlineCheckMs : new Date(lastOnlineCheckMs || 0).getTime();
      const offlineElapsed = now - lastCheck;
      if (lastCheck > 0 && offlineElapsed > MAX_OFFLINE_MS) {
        return {
          valid: false,
          payload,
          needsOnlineCheck: true,
          error: `Đã vượt quá thời gian cho phép offline (${MAX_OFFLINE_HOURS} giờ). Cần kết nối mạng để xác thực lại bản quyền.`
        };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, error: err.message || 'Lỗi giải mã token' };
    }
  }

  // Xuất hàm vào scope chung (Service Worker, Window, hoặc Module)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { verifyEd25519LicenseToken, ED25519_PUBLIC_KEY_HEX, MAX_OFFLINE_HOURS };
  }
  if (typeof self !== 'undefined') {
    self.verifyEd25519LicenseToken = verifyEd25519LicenseToken;
    self.ED25519_PUBLIC_KEY_HEX = ED25519_PUBLIC_KEY_HEX;
  }
  if (typeof window !== 'undefined') {
    window.verifyEd25519LicenseToken = verifyEd25519LicenseToken;
    window.ED25519_PUBLIC_KEY_HEX = ED25519_PUBLIC_KEY_HEX;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
