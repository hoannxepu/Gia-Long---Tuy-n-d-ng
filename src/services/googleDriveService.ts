// src/services/googleDriveService.ts
// Tự động kết nối, tạo và đồng bộ file JSON trực tiếp trên Google Drive qua Google Identity Services (GIS)
// Hoạt động 100% không phụ thuộc thư viện nặng, tương thích tuyệt đối với Cloudflare Pages & Node.js

export interface DriveFileInfo {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface DriveUserProfile {
  email?: string;
  name?: string;
  displayName?: string;
  picture?: string;
}

const DRIVE_JSON_FILE_NAME = 'gialong_fb_data.json';
const OAUTH_CLIENT_ID = '404841178461-8qo1bnudgf8rvqr7d0qivrqtdonfqebj.apps.googleusercontent.com';

let cachedAccessToken: string | null = null;
let cachedUser: DriveUserProfile | null = null;

// Tự động nạp thư viện Google Identity Services (GIS) chính thức của Google
function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if ((window as any).google?.accounts?.oauth2) {
      return resolve();
    }
    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không thể tải Google Identity Services từ Google'));
    document.head.appendChild(script);
  });
}

export const initGoogleDriveAuth = (
  onAuthSuccess?: (user: DriveUserProfile, token: string) => void,
  onAuthFailure?: () => void
) => {
  // Kiểm tra token đã lưu trong phiên làm việc
  if (cachedAccessToken && cachedUser) {
    if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure();
  }
  return () => {};
};

// Đăng nhập Google và cấp quyền drive.file
export const googleSignInForDrive = async (): Promise<{ user: DriveUserProfile; accessToken: string } | null> => {
  await loadGsiScript();
  const googleObj = (window as any).google;
  if (!googleObj?.accounts?.oauth2) {
    throw new Error('Google Identity Services chưa sẵn sàng');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = googleObj.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (resp: any) => {
          if (resp.error) {
            return reject(new Error(resp.error_description || resp.error));
          }
          if (!resp.access_token) {
            return reject(new Error('Không nhận được Access Token từ Google'));
          }

          cachedAccessToken = resp.access_token;

          // Lấy thông tin user
          let userProfile: DriveUserProfile = {
            displayName: 'Tài khoản Google',
            email: 'google-drive-user',
          };

          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            });
            if (userRes.ok) {
              const uData = await userRes.json();
              userProfile = {
                displayName: uData.name || uData.email,
                name: uData.name,
                email: uData.email,
                picture: uData.picture,
              };
            }
          } catch (e) {}

          cachedUser = userProfile;
          resolve({ user: userProfile, accessToken: resp.access_token });
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
    }
  });
};

export const getDriveAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const googleLogoutFromDrive = async () => {
  if (cachedAccessToken && (window as any).google?.accounts?.oauth2) {
    try {
      (window as any).google.accounts.oauth2.revoke(cachedAccessToken, () => {});
    } catch (e) {}
  }
  cachedAccessToken = null;
  cachedUser = null;
};

// 1. Tìm hoặc Tự Động Sinh File JSON trên Google Drive
export const findOrCreateDriveJsonFile = async (
  accessToken: string,
  initialContent?: any
): Promise<DriveFileInfo> => {
  const query = encodeURIComponent(`name='${DRIVE_JSON_FILE_NAME}' and trashed=false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,modifiedTime)&spaces=drive`;

  const searchRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Lỗi tìm file trên Google Drive (HTTP ${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (Array.isArray(searchData.files) && searchData.files.length > 0) {
    return searchData.files[0];
  }

  // Tự động tạo file mới
  const fileContent = initialContent || {
    app: 'Gia Long - FB',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orders: [],
    licenses: [],
    history: [],
  };

  const metadata = {
    name: DRIVE_JSON_FILE_NAME,
    mimeType: 'application/json',
    description: 'Cơ sở dữ liệu tự động của Tiện ích Gia Long - FB (Tự động lưu trữ & đồng bộ)',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(fileContent, null, 2) +
    closeDelimiter;

  const createRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Lỗi tự động tạo file trên Google Drive: ${errText}`);
  }

  const createdFile: DriveFileInfo = await createRes.json();
  return createdFile;
};

// 2. Đọc nội dung file JSON từ Google Drive
export const readDriveJsonContent = async (
  accessToken: string,
  fileId: string
): Promise<any> => {
  const readUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Không thể đọc file từ Google Drive (HTTP ${res.status})`);
  }

  return await res.json();
};

// 3. Tự động ghi đè / cập nhật file JSON trên Google Drive
export const updateDriveJsonContent = async (
  accessToken: string,
  fileId: string,
  newContent: any
): Promise<DriveFileInfo> => {
  const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,webViewLink,modifiedTime`;
  const res = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(newContent, null, 2),
  });

  if (!res.ok) {
    throw new Error(`Lỗi cập nhật file lên Google Drive (HTTP ${res.status})`);
  }

  return await res.json();
};

// 4. Đồng bộ 2 chiều tức thì giữa App Server và Google Drive
export const syncAppWithGoogleDrive = async (
  accessToken: string,
  adminPin: string
): Promise<{
  success: boolean;
  message: string;
  fileInfo: DriveFileInfo;
  ordersCount: number;
  licensesCount: number;
}> => {
  const localRes = await fetch('/api/database/export.json');
  if (!localRes.ok) {
    throw new Error('Không thể lấy dữ liệu nội tại từ Server');
  }
  const localData = await localRes.json();

  const fileInfo = await findOrCreateDriveJsonFile(accessToken, localData);

  let driveData: any = null;
  try {
    driveData = await readDriveJsonContent(accessToken, fileInfo.id);
  } catch (e) {
    driveData = null;
  }

  const localOrders: any[] = Array.isArray(localData.orders) ? localData.orders : [];
  const driveOrders: any[] = Array.isArray(driveData?.orders) ? driveData.orders : [];
  const orderMap = new Map<string, any>();
  [...driveOrders, ...localOrders].forEach((o) => {
    if (o && o.id) orderMap.set(o.id, o);
  });
  const mergedOrders = Array.from(orderMap.values());

  const localLics: any[] = Array.isArray(localData.licenses) ? localData.licenses : [];
  const driveLics: any[] = Array.isArray(driveData?.licenses) ? driveData.licenses : [];
  const licMap = new Map<string, any>();
  [...driveLics, ...localLics].forEach((l) => {
    if (l && l.key) licMap.set(l.key.toUpperCase(), l);
  });
  const mergedLics = Array.from(licMap.values());

  const mergedPayload = {
    app: 'Gia Long - FB',
    version: '1.0.4',
    updatedAt: new Date().toISOString(),
    orders: mergedOrders,
    licenses: mergedLics,
    history: localData.history || driveData?.history || [],
    settings: localData.settings || driveData?.settings || {},
  };

  const updatedInfo = await updateDriveJsonContent(accessToken, fileInfo.id, mergedPayload);

  await fetch('/api/admin/restore-json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': adminPin,
    },
    body: JSON.stringify(mergedPayload),
  });

  return {
    success: true,
    message: `✓ Đã tự động tạo & đồng bộ thành công vào file "${DRIVE_JSON_FILE_NAME}" trên Google Drive của bạn!`,
    fileInfo: updatedInfo,
    ordersCount: mergedOrders.length,
    licensesCount: mergedLics.length,
  };
};
