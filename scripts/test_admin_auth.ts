import { requireAdmin, checkAdminCors } from '../src/security/admin_auth.ts';

async function testAdminAuthMiddleware() {
  console.log('--- Kiểm thử Admin Auth Middleware & Rate Limiting ---');
  let passed = 0;
  let total = 0;
  function assert(c: boolean, m: string) {
    total++;
    if (c) { console.log(`[PASS] ${m}`); passed++; }
    else { console.error(`[FAIL] ${m}`); process.exitCode = 1; }
  }

  process.env.ADMIN_PIN = 'GiaLongAdmin_2026_SecurePIN!';

  // Test 1: Không có header x-admin-pin -> 401
  let statusCode = 200;
  let resData: any = {};
  const mockReqNoPin: any = {
    headers: {},
    socket: { remoteAddress: '192.168.1.100' },
  };
  const mockRes: any = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (d: any) => { resData = d; },
      };
    },
  };
  requireAdmin(mockReqNoPin, mockRes, () => { statusCode = 200; });
  assert(statusCode === 401, 'Không có header x-admin-pin bị từ chối 401');

  // Test 2: PIN sai -> 401
  const mockReqWrongPin: any = {
    headers: { 'x-admin-pin': 'WrongPIN123' },
    socket: { remoteAddress: '192.168.1.100' },
  };
  requireAdmin(mockReqWrongPin, mockRes, () => { statusCode = 200; });
  assert(statusCode === 401, 'PIN sai bị từ chối 401');

  // Test 3: Thử sai 5 lần -> bị rate limit 429
  for (let i = 0; i < 4; i++) {
    requireAdmin(mockReqWrongPin, mockRes, () => {});
  }
  requireAdmin(mockReqWrongPin, mockRes, () => {});
  assert(statusCode === 429, 'Thử sai quá 5 lần bị khóa IP với mã 429');

  // Test 4: IP khác với PIN đúng -> thành công gọi next()
  let nextCalled: boolean = false;
  const mockReqValid: any = {
    headers: { 'x-admin-pin': 'GiaLongAdmin_2026_SecurePIN!' },
    socket: { remoteAddress: '192.168.1.200' },
  };
  requireAdmin(mockReqValid, mockRes, () => { nextCalled = true; });
  assert(Boolean(nextCalled), 'PIN đúng xác thực thành công và cho phép đi tiếp qua next()');

  // Test 5: CORS cho Admin chỉ cho domain chính thức
  let headerOrigin = '';
  const mockResCors: any = {
    header: (k: string, v: string) => { if (k === 'Access-Control-Allow-Origin') headerOrigin = v; },
    status: (code: number) => ({ end: () => {} }),
    sendStatus: (c: number) => {},
  };
  const mockReqAttacker: any = {
    headers: { origin: 'https://evil-attacker.com' },
    method: 'OPTIONS',
  };
  checkAdminCors(mockReqAttacker, mockResCors, () => {});
  assert(headerOrigin === '', 'CORS admin chặn hoàn toàn origin lạ (không cấp header Access-Control-Allow-Origin)');

  const mockReqOfficial: any = {
    headers: { origin: 'https://gia-long---tuy-n-d-ng.pages.dev' },
    method: 'GET',
  };
  checkAdminCors(mockReqOfficial, mockResCors, () => {});
  assert(headerOrigin === 'https://gia-long---tuy-n-d-ng.pages.dev', 'CORS admin cho phép domain chính thức');

  console.log(`Kết quả Admin Auth & CORS: ${passed}/${total} test ĐẠT.\n`);
}

testAdminAuthMiddleware();
