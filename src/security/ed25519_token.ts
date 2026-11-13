import crypto from 'crypto';

// Khóa Ed25519 dùng cho hệ thống chữ ký token bản quyền
// Private key có thể nạp từ biến môi trường ED25519_PRIVATE_KEY
export const ED25519_PUBLIC_KEY_HEX = 'ecceda4cabef90555cb6d86742c1123668b9648a18528675ed17808828bd9183';

const DEFAULT_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEII9/PJb2J9deK+KuqNWkmQFU3GvAWQoWPatZMD8YB15s
-----END PRIVATE KEY-----
`;

export interface LicenseTokenPayload {
  machineId: string;
  exp: number; // timestamp in ms
  plan: 'individual' | 'team' | 'trial';
  iat: number; // timestamp in ms
}

function getPrivateKey(): crypto.KeyObject {
  const pem = process.env.ED25519_PRIVATE_KEY || DEFAULT_PRIVATE_KEY_PEM;
  return crypto.createPrivateKey(pem);
}

function getPublicKey(): crypto.KeyObject {
  const rawBytes = Buffer.from(ED25519_PUBLIC_KEY_HEX, 'hex');
  // DER encoding for Ed25519 SPKI: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32 bytes>
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.concat([spkiPrefix, rawBytes]);
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

export function generateEd25519Token(machineId: string, expiresAt: string | number, plan: 'individual' | 'team' | 'trial' = 'individual'): string {
  const cleanId = String(machineId || '').trim();
  const expMs = typeof expiresAt === 'number' ? expiresAt : new Date(expiresAt).getTime();
  const payload: LicenseTokenPayload = {
    machineId: cleanId,
    exp: isNaN(expMs) ? Date.now() + 30 * 86400000 : expMs,
    plan,
    iat: Date.now(),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');
  
  const privKey = getPrivateKey();
  const signature = crypto.sign(null, Buffer.from(payloadB64, 'utf-8'), privKey);
  const signatureB64 = signature.toString('base64url');

  return `GLFB_ED25519_${payloadB64}.${signatureB64}`;
}

export function verifyEd25519Token(tokenString: string, targetMachineId?: string): { valid: boolean; payload?: LicenseTokenPayload; error?: string } {
  try {
    if (!tokenString || !tokenString.startsWith('GLFB_ED25519_')) {
      return { valid: false, error: 'Định dạng token không đúng chuẩn Ed25519' };
    }

    const raw = tokenString.slice('GLFB_ED25519_'.length);
    const parts = raw.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Cấu trúc token không hợp lệ' };
    }

    const [payloadB64, signatureB64] = parts;
    const signature = Buffer.from(signatureB64, 'base64url');
    const pubKey = getPublicKey();

    const isVerified = crypto.verify(null, Buffer.from(payloadB64, 'utf-8'), pubKey, signature);
    if (!isVerified) {
      return { valid: false, error: 'Chữ ký số Ed25519 không khớp (token bị sửa đổi)' };
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload: LicenseTokenPayload = JSON.parse(payloadJson);

    if (payload.exp < Date.now()) {
      return { valid: false, payload, error: 'Bản quyền đã hết hạn' };
    }

    if (targetMachineId && payload.machineId !== targetMachineId.trim()) {
      return { valid: false, payload, error: 'Token không khớp với mã máy hiện tại' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Lỗi xác thực chữ ký token' };
  }
}
