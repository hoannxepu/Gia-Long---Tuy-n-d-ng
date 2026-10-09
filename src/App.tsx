import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import {
  FolderCode,
  Layers,
  FileCode,
  Bug,
  RefreshCw,
  Terminal,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Code2,
  CheckCircle2,
  Upload,
  Eye,
  FileText,
  AlertTriangle,
  Lightbulb,
  Cpu,
  Monitor,
  LayoutDashboard,
  AppWindow,
  Zap,
  Copy,
  Check,
  Download,
  FolderUp,
  FileUp,
  Trash2,
  Search,
  MessageSquare,
  Clock,
  History,
  CheckSquare,
  UserPlus,
  Key,
  ShieldCheck,
  Lock,
  Unlock,
  Users,
  CreditCard,
  Plus,
  PhoneCall,
  Send,
  Smartphone,
  Calendar,
  Globe,
  Share2,
  ShieldAlert,
  Package,
  Settings,
  X,
  Filter,
  SlidersHorizontal,
  Laptop,
  Edit3,
  EyeOff
} from 'lucide-react';
import { DEFAULT_EXTENSION_BUNDLE, ExtensionFileDef } from './extension_files/index.ts';
import { CustomerDownloadPortal } from './CustomerDownloadPortal.tsx';

export interface AdminLicenseItem {
  id: string;
  key: string;
  clientName: string;
  phone?: string;
  planType: 'individual' | 'team' | 'trial';
  maxDevices: number;
  devices: Array<{
    deviceId: string;
    deviceName?: string;
    activatedAt: string;
    lastSeenAt: string;
  }>;
  createdAt: string;
  expiresAt: string;
  isSuspended: boolean;
  isRevoked?: boolean;
  revokeReason?: string;
  revokedAt?: string;
  notes?: string;
  daysLeft?: number;
  isExpired?: boolean;
}

export interface LicenseHistoryItem {
  id: string;
  action: 'create' | 'extend' | 'approve' | 'renew' | 'regenerate' | 'update_date' | 'revoke' | 'unrevoke';
  actionName: string;
  clientName: string;
  phone?: string;
  deviceId?: string;
  key: string;
  planType?: string;
  pkgName?: string;
  daysAdded?: number;
  newExpiresAt?: string;
  amount?: string;
  createdAt: string;
  notes?: string;
}

interface FileInfo {
  name: string;
  type: string;
  role: string;
  whenToEdit: string;
  howToDebug: string;
  color: string;
  badge: string;
}

interface UploadedFile {
  name: string;
  content: string;
  size: number;
  type: string;
  isBinary?: boolean;
}

export function FbLightningLogo({ className = 'w-8 h-8 sm:w-9 sm:h-9' }: { className?: string }) {
  return (
    <div className={`relative shrink-0 flex items-center justify-center rounded-lg sm:rounded-xl overflow-hidden shadow-md shadow-blue-600/30 border border-blue-500/30 ${className}`}>
      <img src="/logo.png" alt="Gia Long - FB Logo" className="w-full h-full object-cover select-none" />
    </div>
  );
}

const EXTENSION_FILES_DOC: FileInfo[] = [
  {
    name: 'manifest.json',
    type: 'Cấu hình cốt lõi (Manifest V3)',
    role: 'Khai báo thông tin định danh, quyền hạn (permissions: storage, alarms, tabs...), các file script tham gia, version, phím tắt và biểu tượng extension.',
    whenToEdit: 'Khi cần xin thêm quyền, đổi tên/phiên bản, thêm trang web được phép chạy (host_permissions), hoặc đổi icon.',
    howToDebug: 'Nếu sai cú pháp JSON hoặc sai đường dẫn, Chrome sẽ báo lỗi đỏ trực tiếp tại chrome://extensions khi bấm "Load unpacked".',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    badge: 'Manifest V3'
  },
  {
    name: 'background.js',
    type: 'Service Worker (Bộ não ngầm & Hẹn giờ)',
    role: 'Chạy ngầm độc lập với các tab. Lắng nghe Alarms tự động kích hoạt khi đến giờ hẹn, điều phối mở tab đăng bài, ghi nhận lịch sử, chống sleep.',
    whenToEdit: 'Khi muốn sửa logic hẹn giờ, đổi thời gian giãn cách giữa các nhóm, lưu trữ chrome.storage.local, hoặc xử lý kết nối.',
    howToDebug: 'Vào chrome://extensions > Tìm extension > Bấm vào dòng chữ xanh "service worker" để mở DevTools riêng biệt.',
    color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400',
    badge: 'Background Worker'
  },
  {
    name: 'content.js',
    type: 'Content Script (Chạy trên trang Facebook)',
    role: 'Tập lệnh chèn vào Facebook: Mở ô tạo bài viết, điền bài viết (3 lớp chống gộp dòng), đính kèm tối đa 3 ảnh bằng DataTransfer, bấm nút Đăng và dò tìm nhóm.',
    whenToEdit: 'Khi Facebook thay đổi giao diện nút Đăng hoặc khi muốn can thiệp thêm vào DOM Facebook.',
    howToDebug: 'Nhấn F12 trên chính trang Facebook > Vào tab Console hoặc Sources > Content scripts.',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
    badge: 'DOM Injected'
  },
  {
    name: 'dashboard.html & dashboard.js',
    type: 'Bảng Điều Khiển Toàn Diện (Full Tab)',
    role: 'Trang quản trị toàn màn hình: Quản lý bài viết & 3 ảnh, chọn/bỏ chọn tất cả nhóm, xóa nhiều nhóm, hẹn giờ chuẩn Alarms, quét dò tìm nhóm, lịch sử đăng bài.',
    whenToEdit: 'Khi muốn thay đổi giao diện bảng điều khiển, thêm tính năng quản trị nâng cao.',
    howToDebug: 'Mở trang dashboard lên trên 1 tab > Nhấn F12 như một trang web bình thường.',
    color: 'from-indigo-500/20 to-violet-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
    badge: 'Full Page App'
  },
  {
    name: 'popup.html & popup.js',
    type: 'Giao diện Pop-up Nhanh',
    role: 'Cửa sổ nhỏ xuất hiện khi click biểu tượng extension trên thanh công cụ: Thao tác nhanh bài viết, chọn nhóm, xem tiến trình và nút Dừng tức thì 100%.',
    whenToEdit: 'Khi muốn sửa giao diện cửa sổ nhỏ bật ra.',
    howToDebug: 'Bấm mở popup > Click chuột phải vào bên trong popup > Chọn "Kiểm tra" (Inspect).',
    color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    badge: 'Mini UI'
  },
  {
    name: 'preloaded_data.json',
    type: 'Dữ liệu mồi (21 Nhóm & 4 Bài Mẫu)',
    role: 'Chứa sẵn 21 nhóm Facebook tuyển dụng thực tế và 4 bài đăng tuyển dụng mẫu cùng cấu hình ban đầu.',
    whenToEdit: 'Khi muốn thay đổi danh sách nhóm hoặc bài đăng khởi tạo ban đầu cho người dùng mới cài.',
    howToDebug: 'Kiểm tra cú pháp JSON hợp lệ.',
    color: 'from-slate-500/20 to-gray-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300',
    badge: 'Preset Data'
  },
  {
    name: 'web_bridge.js',
    type: 'Cầu Nối Đồng Bộ 2 Chiều',
    role: 'Đồng bộ thời gian thực giữa Web App (dang-bai-fb.pages.dev) và Chrome Extension.',
    whenToEdit: 'Khi có thay đổi về domain Web App hoặc format dữ liệu đồng bộ.',
    howToDebug: 'Mở F12 trên trang Web App > Tab Console xem log của bridge.',
    color: 'from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',
    badge: 'Real-time Bridge'
  }
];

function areArraysEqual(a: any[], b: any[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RealtimeClock() {
  const [time, setTime] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('vi-VN', { hour12: false }) + ' • ' + now.toLocaleDateString('vi-VN')
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-sky-500/25 rounded-lg text-[11px] font-mono text-sky-400 shadow-inner h-[34px] box-border">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
      <span>🕒 {time || 'Đang đồng bộ...'}</span>
    </div>
  );
}

export default function App() {
  const isPrivacyPage = typeof window !== 'undefined' && (
    window.location.pathname.includes('privacy') ||
    window.location.search.includes('privacy')
  );
  const isAdminPage = typeof window !== 'undefined' && (
    window.location.search.includes('admin') ||
    window.location.search.includes('license') ||
    window.location.search.includes('tab=license-admin')
  );
  const isWorkspacePage = typeof window !== 'undefined' && (
    window.location.search.includes('workspace') ||
    window.location.search.includes('tab=workspace') ||
    window.location.search.includes('dev=1')
  );
  const [showDevTools, setShowDevTools] = useState<boolean>(() => isWorkspacePage);
  const [activeTab, setActiveTab] = useState<'client-portal' | 'workspace' | 'quickstart' | 'files' | 'devtools' | 'license-admin' | 'privacy'>(
    () => isPrivacyPage ? 'privacy' : (isAdminPage ? 'license-admin' : (isWorkspacePage ? 'workspace' : 'client-portal'))
  );
  const [selectedDocFile, setSelectedDocFile] = useState<FileInfo>(EXTENSION_FILES_DOC[0]);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  // Admin License Portal State
  const [adminPin, setAdminPin] = useState<string>(() => {
    try {
      return localStorage.getItem('glfb_admin_pin') || 'Ha26062018$';
    } catch (e) {
      return 'Ha26062018$';
    }
  });
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [showPinPassword, setShowPinPassword] = useState<boolean>(false);
  const [showChangePinModal, setShowChangePinModal] = useState<boolean>(false);
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [showNewPinPassword, setShowNewPinPassword] = useState<boolean>(false);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [licenses, setLicenses] = useState<AdminLicenseItem[]>([]);
  const [isLoadingLicenses, setIsLoadingLicenses] = useState<boolean>(false);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showUserGuideModal, setShowUserGuideModal] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [copiedZaloMsg, setCopiedZaloMsg] = useState<string | null>(null);
  const [copiedHandoverMsg, setCopiedHandoverMsg] = useState<string | null>(null);
  const [extensionActivatedKey, setExtensionActivatedKey] = useState<string | null>(null);

  // Quản lý gói đóng gói bảo mật Obfuscated ZIP & Cài đặt Chrome Web Store
  const [packageInfo, setPackageInfo] = useState<{ isReady: boolean; sizeKb: number; updatedAt?: string; fileName?: string; version?: string } | null>(null);
  const [isRebuildingPackage, setIsRebuildingPackage] = useState<boolean>(false);
  const [chromeStoreUrl, setChromeStoreUrl] = useState<string>('https://chromewebstore.google.com/detail/gia-long-fb/');
  const [edgeStoreUrl, setEdgeStoreUrl] = useState<string>('https://microsoftedge.microsoft.com/addons/detail/gia-long-fb/blpkghkjimacggjlgiklkaddldbcnebo');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Kích hoạt tự động 1-Click qua URL (?kich_hoat=KEY hoặc ?activate=KEY)
  const [autoActivateKey, setAutoActivateKey] = useState<string | null>(null);
  const [autoActivateState, setAutoActivateState] = useState<'idle' | 'checking' | 'activating' | 'success' | 'failed' | 'no_extension'>('idle');
  const [autoActivateMsg, setAutoActivateMsg] = useState<string>('');
  const [autoActivateLic, setAutoActivateLic] = useState<any>(null);
  const [extensionDetected, setExtensionDetected] = useState<boolean>(false);
  const [orderModalPkg, setOrderModalPkg] = useState<{ name: string; price: string } | null>(null);
  const [orderCustomerName, setOrderCustomerName] = useState<string>('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState<string>('');
  const [orderSuccessData, setOrderSuccessData] = useState<{ order: any; messageText: string } | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [copiedOrderMsg, setCopiedOrderMsg] = useState<boolean>(false);
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const [adminZaloUrl, setAdminZaloUrl] = useState<string>('https://zalo.me/0869029310');
  const [isUploadingQr, setIsUploadingQr] = useState<boolean>(false);
  const [qrVersion, setQrVersion] = useState<number>(Date.now());

  // New License Form State
  const [newLicClient, setNewLicClient] = useState('');
  const [newLicPhone, setNewLicPhone] = useState('');
  const [newLicPlan, setNewLicPlan] = useState<'individual' | 'team' | 'trial'>('team');
  const [newLicDevices, setNewLicDevices] = useState(3);
  const [newLicDays, setNewLicDays] = useState(30);
  const [newLicCustomKey, setNewLicCustomKey] = useState('');
  const [newLicNotes, setNewLicNotes] = useState('');

  // Hộp thoại (Modal) Thao Tác Chi Tiết Khách Hàng
  const [actionModalLicense, setActionModalLicense] = useState<AdminLicenseItem | null>(null);
  const [actionCustomDays, setActionCustomDays] = useState<number>(30);
  const [actionEditDate, setActionEditDate] = useState<string>('');
  const [adminSearch, setAdminSearch] = useState<string>('');
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'active' | 'warning' | 'expired' | 'suspended' | 'revoked'>('all');

  // Lịch sử theo dõi các lần cấp mã, gia hạn... (Có chức năng mở / thu gọn, mặc định là thu gọn)
  const [historyList, setHistoryList] = useState<LicenseHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false); // Mặc định là thu gọn theo yêu cầu
  const [historySearchPhone, setHistorySearchPhone] = useState<string>('');
  const [historySearchName, setHistorySearchName] = useState<string>('');
  const [historySearchDeviceId, setHistorySearchDeviceId] = useState<string>('');
  const [historyFilterPkg, setHistoryFilterPkg] = useState<string>('all');
  const [historyFilterAction, setHistoryFilterAction] = useState<string>('all');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{
    id: string;
    type: 'order' | 'license';
    name: string;
    keyOrCode: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<{
    id: string;
    clientName: string;
    phone: string;
    pkgName: string;
    price: string;
    deviceId: string;
    note: string;
    status?: string;
  } | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState<boolean>(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3500);
  };

  const openActionModal = (lic: AdminLicenseItem) => {
    setActionModalLicense(lic);
    try {
      const d = new Date(lic.expiresAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      setActionEditDate(`${yyyy}-${mm}-${dd}`);
    } catch (e) {
      setActionEditDate('');
    }
  };

  const handleUpdateDirectDate = async () => {
    if (!actionModalLicense || !actionEditDate) return;
    try {
      const res = await fetch('/api/admin/licenses/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          id: actionModalLicense.id,
          expiresAt: new Date(actionEditDate + 'T23:59:59').toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchLicenses();
        setActionModalLicense((prev) =>
          prev ? { ...prev, expiresAt: new Date(actionEditDate + 'T23:59:59').toISOString() } : null
        );
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  // Lấy thông tin gói đóng gói ZIP bảo mật
  const fetchPackageInfo = async () => {
    try {
      const res = await fetch('/api/package/info');
      const data = await res.json();
      if (data.success) setPackageInfo(data);
    } catch (e) {}
  };

  // Lấy cài đặt hệ thống (link Chrome Web Store, Microsoft Edge Add-ons & link Zalo Quản trị)
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        if (data.settings.chromeStoreUrl) setChromeStoreUrl(data.settings.chromeStoreUrl);
        if (data.settings.edgeStoreUrl) setEdgeStoreUrl(data.settings.edgeStoreUrl);
        if (data.settings.zaloUrl) setAdminZaloUrl(data.settings.zaloUrl);
      }
    } catch (e) {}
  };

  // Lưu link Chrome Web Store & Edge Store
  const handleSaveStoreUrl = async () => {
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ chromeStoreUrl, edgeStoreUrl }),
      });
      const data = await res.json();
      if (data.success) {
        alert('✓ Đã lưu liên kết Cửa Hàng (Chrome Store & Edge Add-ons) thành công!');
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Lưu link Zalo Quản trị viên
  const handleSaveZaloUrl = async () => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ zaloUrl: adminZaloUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setQrVersion(Date.now());
        fetchPackageInfo();
        alert('✓ Đã lưu liên kết Zalo Quản trị viên và tự động đồng bộ lại Extension!');
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  // Tải lên ảnh mã QR Zalo gốc chuẩn 100%
  const handleUploadQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingQr(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64 = event.target?.result as string;
        const res = await fetch('/api/admin/upload-qr-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (data.success) {
          alert('✓ Đã tải lên ảnh mã QR Zalo gốc chuẩn 100%! Extension đã được tự động đóng gói lại.');
          setQrVersion(Date.now());
          fetchPackageInfo();
        } else {
          alert('Lỗi tải ảnh: ' + data.error);
        }
      } catch (err: any) {
        alert('Lỗi tải ảnh: ' + err.message);
      } finally {
        setIsUploadingQr(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Tạo lại gói ZIP Obfuscated Web Store (Có tùy chọn tự động tăng phiên bản +0.0.1)
  const handleRebuildPackage = async (bumpVersion: boolean = false) => {
    setIsRebuildingPackage(true);
    try {
      const res = await fetch('/api/admin/package/rebuild', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin 
        },
        body: JSON.stringify({ bumpVersion }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${data.message} (Dung lượng: ${data.sizeKb} KB)`);
        fetchPackageInfo();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi tạo gói: ' + e.message);
    } finally {
      setIsRebuildingPackage(false);
    }
  };

  // Copy link kích hoạt 1-Click
  const handleCopyOneClickLink = (licKey: string) => {
    const link = `${window.location.origin}/?kich_hoat=${encodeURIComponent(licKey)}`;
    navigator.clipboard.writeText(link);
    setCopiedLinkKey(licKey);
    setTimeout(() => setCopiedLinkKey(null), 2500);
  };

  // Lắng nghe kích hoạt tự động 1-Click khi mở link kèm query param
  useEffect(() => {
    fetchPackageInfo();
    fetchSettings();

    // Kiểm tra xem extension đã cài chưa
    const checkExt = () => {
      const isInstalled = !!(
        (window as any).__AUTORECRUIT_EXTENSION_INSTALLED__ ||
        document.documentElement.getAttribute('data-autorecruit-extension') === 'true'
      );
      if (isInstalled) setExtensionDetected(true);
      return isInstalled;
    };

    checkExt();
    window.dispatchEvent(new CustomEvent('AUTORECRUIT_WEBAPP_PING'));

    const handlePong = () => setExtensionDetected(true);
    window.addEventListener('AUTORECRUIT_EXTENSION_PONG', handlePong);
    window.addEventListener('AUTORECRUIT_EXTENSION_READY', handlePong);

    // Xử lý query param ?kich_hoat=KEY hoặc ?activate=KEY
    const urlParams = new URLSearchParams(window.location.search);
    const paramKey = urlParams.get('kich_hoat') || urlParams.get('activate');

    if (paramKey && paramKey.trim()) {
      const key = paramKey.trim().toUpperCase();
      setAutoActivateKey(key);
      executeOneClickActivation(key);
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'AUTORECRUIT_ACTIVATE_RESULT') {
        const res = event.data.result;
        if (res && res.success) {
          setAutoActivateState('success');
          setAutoActivateMsg(res.message || 'Kích hoạt bản quyền VIP thành công!');
          if (res.license) setAutoActivateLic(res.license);
        } else {
          setAutoActivateState('failed');
          setAutoActivateMsg(res?.message || 'Mã bản quyền không hợp lệ hoặc đã hết lượt sử dụng!');
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('AUTORECRUIT_EXTENSION_PONG', handlePong);
      window.removeEventListener('AUTORECRUIT_EXTENSION_READY', handlePong);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const executeOneClickActivation = async (key: string) => {
    setAutoActivateState('checking');
    setAutoActivateMsg('Đang kiểm tra mã bản quyền trên máy chủ...');

    // 1. Kiểm tra trên server
    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!data.valid && data.message && !data.message.includes('hợp lệ')) {
        setAutoActivateState('failed');
        setAutoActivateMsg(data.message || 'Mã bản quyền không tồn tại!');
        return;
      }
      if (data.license) setAutoActivateLic(data.license);
    } catch (e) {}

    setAutoActivateState('activating');
    setAutoActivateMsg('Đang gửi lệnh kích hoạt tự động sang Chrome Extension...');

    // 2. Gửi lệnh sang extension qua web_bridge.js
    window.postMessage({ type: 'AUTORECRUIT_ACTIVATE_KEY', key }, '*');

    // 3. Nếu sau 3.5 giây không có phản hồi từ extension -> người dùng chưa cài tiện ích
    setTimeout(() => {
      setAutoActivateState((prev) => {
        if (prev === 'activating' || prev === 'checking') {
          return 'no_extension';
        }
        return prev;
      });
    }, 3500);
  };

  // Fetch licenses and orders from server (hỗ trợ isSilent để chạy nền mượt mà không nháy màn hình)
  const fetchOrders = async (pin = adminPin, isSilent = false) => {
    try {
      if (!isSilent) setIsLoadingOrders(true);
      const res = await fetch('/api/admin/orders', {
        headers: { 'x-admin-pin': pin },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        setAdminOrders((prev) => {
          if (areArraysEqual(prev, data.orders)) return prev;
          const prevPending = prev.filter((o) => o.status === 'pending');
          const newPending = data.orders.filter((o: any) => o.status === 'pending');
          if (newPending.length > prevPending.length && prev.length > 0) {
            const latest = newPending[0];
            triggerToast(`🔔 Có đơn đặt mua mới: ${latest.pkgName} từ ${latest.clientName || 'Khách'} (${latest.phone || ''})!`);
          }
          return data.orders;
        });
      }
    } catch (e) {
      console.warn('Lỗi lấy orders:', e);
    } finally {
      if (!isSilent) setIsLoadingOrders(false);
    }
  };

  const fetchHistory = async (pin = adminPin, isSilent = false) => {
    try {
      if (!isSilent) setIsLoadingHistory(true);
      const res = await fetch('/api/admin/history', {
        headers: { 'x-admin-pin': pin },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        setHistoryList((prev) => (areArraysEqual(prev, data.history) ? prev : data.history));
      }
    } catch (e) {
      console.warn('Lỗi lấy lịch sử:', e);
    } finally {
      if (!isSilent) setIsLoadingHistory(false);
    }
  };

  // Tự động kiểm tra đơn hàng mới định kỳ trong nền mà KHÔNG làm giật/nháy giao diện
  useEffect(() => {
    if (!isAdminUnlocked) return;
    fetchOrders(adminPin, false);
    fetchLicenses(adminPin, false);
    fetchHistory(adminPin, false);

    // Polling silent: chạy ngầm 10s/lần, so sánh dữ liệu trước khi set state để hoàn toàn không gây nhấp nháy giao diện
    const timer = setInterval(() => {
      fetchLicenses(adminPin, true);
    }, 10000);

    return () => clearInterval(timer);
  }, [isAdminUnlocked, adminPin]);

  const handleApproveOrder = async (orderId: string) => {
    try {
      const res = await fetch('/api/admin/orders/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(data.message);
        // Cập nhật ngay lập tức cả giấy phép, đơn hàng và lịch sử từ response của server
        if (data.history) setHistoryList(data.history);
        if (data.orders) setAdminOrders(data.orders);
        if (data.licenses) setLicenses(data.licenses);
        fetchLicenses(adminPin, true);
        fetchOrders(adminPin, true);
        fetchHistory(adminPin, true);
      } else {
        alert(data.error || 'Lỗi phê duyệt đơn!');
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ!');
    }
  };

  // Cập nhật thông tin đơn đặt mua và đồng bộ ngay vào Lịch sử
  const handleSaveOrderUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setIsUpdatingOrder(true);
    try {
      const res = await fetch('/api/admin/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          orderId: editingOrder.id,
          clientName: editingOrder.clientName,
          phone: editingOrder.phone,
          pkgName: editingOrder.pkgName,
          price: editingOrder.price,
          deviceId: editingOrder.deviceId,
          note: editingOrder.note,
          status: (editingOrder as any).status || 'pending',
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerToast('✓ Đã cập nhật đơn đặt mua & đồng bộ lịch sử thành công!');
        setEditingOrder(null);
        // Đồng bộ ngay lập tức từ dữ liệu trả về của máy chủ
        if (data.history) setHistoryList(data.history);
        if (data.orders) setAdminOrders(data.orders);
        if (data.order) {
          setAdminOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
        }
        fetchOrders(adminPin, true);
        fetchHistory(adminPin, true);
      } else {
        alert(data.error || 'Lỗi cập nhật đơn hàng!');
      }
    } catch (err: any) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleOpenDeleteModal = (item: { id: string; type: 'order' | 'license'; name: string; keyOrCode: string }) => {
    setDeleteConfirmItem(item);
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmItem) return;
    setIsDeletingItem(true);
    const { id, type, name } = deleteConfirmItem;

    try {
      if (type === 'order') {
        const res = await fetch('/api/admin/orders/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin,
          },
          body: JSON.stringify({ orderId: id, id }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.orders) setAdminOrders(data.orders);
          else setAdminOrders((prev) => prev.filter((o) => o.id !== id));
          if (data.history) setHistoryList(data.history);
          triggerToast(`✓ Đã xóa đơn đặt mua của khách "${name}" thành công!`);
          fetchHistory(adminPin, true);
        } else {
          alert('Lỗi: ' + (data.error || 'Không thể xóa đơn'));
        }
      } else {
        const res = await fetch('/api/admin/licenses/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin,
          },
          body: JSON.stringify({ id, licenseId: id }),
        });
        const data = await res.json();
        if (data.success) {
          setLicenses((prev) => prev.filter((l) => l.id !== id));
          if (actionModalLicense && actionModalLicense.id === id) {
            setActionModalLicense(null);
          }
          triggerToast(`✓ Đã xóa mã bản quyền của khách "${name}" thành công!`);
          fetchHistory(adminPin, true);
        } else {
          alert('Lỗi: ' + (data.error || 'Không thể xóa mã bản quyền'));
        }
      }
    } catch (err: any) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setIsDeletingItem(false);
      setDeleteConfirmItem(null);
    }
  };

  const handleDeleteOrder = (orderId: string, clientName = 'Khách đặt mua') => {
    handleOpenDeleteModal({ id: orderId, type: 'order', name: clientName, keyOrCode: 'Đơn đặt mua' });
  };

  const handleSubmitCustomerOrder = async () => {
    if (!orderModalPkg) return;
    setIsSubmittingOrder(true);
    const isTrial = orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử');
    const msg = isTrial
      ? `Tôi muốn đăng ký Gói Dùng Thử 1 Ngày (20 bài đăng, 0đ) (Khách: ${orderCustomerName || 'Khách Web'}, SĐT: ${orderCustomerPhone || 'Chưa cung cấp'})`
      : `Tôi muốn mua ${orderModalPkg.name} - Giá ${orderModalPkg.price} (Khách: ${orderCustomerName || 'Khách Web'}, SĐT: ${orderCustomerPhone || 'Chưa cung cấp'})`;

    // 1. Sao chép vào clipboard an toàn
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msg);
      }
    } catch (e) {}

    // 2. Gửi API lên Server tự động
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pkgName: orderModalPkg.name,
          price: orderModalPkg.price,
          clientName: orderCustomerName || 'Khách Web',
          phone: orderCustomerPhone || '',
          note: msg,
        }),
      });
      const data = await res.json();
      setOrderSuccessData({
        order: data.order || { id: `ord_${Date.now()}` },
        messageText: msg,
      });
      if (isAdminUnlocked) {
        fetchOrders(adminPin, true);
        fetchHistory(adminPin, true);
      }
    } catch (err) {
      setOrderSuccessData({
        order: { id: `ord_${Date.now()}` },
        messageText: msg,
      });
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const fetchLicenses = async (pin = adminPin, isSilent = false) => {
    try {
      if (!isSilent) setIsLoadingLicenses(true);
      const res = await fetch('/api/admin/licenses', {
        headers: { 'x-admin-pin': pin },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.licenses)) {
        setLicenses((prev) => (areArraysEqual(prev, data.licenses) ? prev : data.licenses));
      }
      fetchOrders(pin, isSilent);
      fetchHistory(pin, isSilent);
    } catch (err) {
      console.warn('Lỗi lấy danh sách license:', err);
    } finally {
      if (!isSilent) setIsLoadingLicenses(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = adminPinInput.trim();
    if (!cleanInput) {
      alert('Vui lòng nhập khóa / mật khẩu quản trị!');
      return;
    }
    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanInput }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminPin(cleanInput);
        try {
          localStorage.setItem('glfb_admin_pin', cleanInput);
        } catch (e) {}
        setIsAdminUnlocked(true);
        fetchLicenses(cleanInput);
      } else {
        alert('Khóa Quản Trị không chính xác! Vui lòng thử lại.');
      }
    } catch (e) {
      if (cleanInput === adminPin || cleanInput === 'Ha26062018$') {
        setAdminPin(cleanInput);
        try {
          localStorage.setItem('glfb_admin_pin', cleanInput);
        } catch (err) {}
        setIsAdminUnlocked(true);
        fetchLicenses(cleanInput);
      } else {
        alert('Khóa Quản Trị không chính xác! Vui lòng thử lại.');
      }
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cur = currentPinInput.trim();
    const nw = newPinInput.trim();
    const cf = confirmPinInput.trim();

    if (!cur) {
      alert('Vui lòng nhập mật khẩu hiện tại!');
      return;
    }
    if (!nw || nw.length < 6) {
      alert('Mật khẩu mới phải có tối thiểu 6 ký tự!');
      return;
    }
    if (nw !== cf) {
      alert('Xác nhận mật khẩu mới không trùng khớp!');
      return;
    }

    setIsChangingPin(true);
    try {
      const res = await fetch('/api/admin/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          currentPin: cur,
          newPin: nw,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminPin(nw);
        try {
          localStorage.setItem('glfb_admin_pin', nw);
        } catch (e) {}
        alert('✅ Đổi mật khẩu Quản Trị thành công!');
        setShowChangePinModal(false);
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
      } else {
        alert('❌ ' + (data.error || 'Đổi mật khẩu thất bại! Vui lòng kiểm tra lại mật khẩu hiện tại.'));
      }
    } catch (err: any) {
      // Offline fallback
      if (cur === adminPin || cur === 'Ha26062018$') {
        setAdminPin(nw);
        try {
          localStorage.setItem('glfb_admin_pin', nw);
        } catch (e) {}
        alert('✅ Đổi mật khẩu Quản Trị thành công!');
        setShowChangePinModal(false);
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
      } else {
        alert('❌ Mật khẩu hiện tại không chính xác!');
      }
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLicClient.trim()) return alert('Vui lòng nhập tên khách hàng hoặc công ty!');
    try {
      const res = await fetch('/api/admin/licenses/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          clientName: newLicClient,
          phone: newLicPhone,
          planType: newLicPlan,
          maxDevices: newLicDevices,
          durationDays: newLicDays,
          customKey: newLicCustomKey,
          notes: newLicNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewLicClient('');
        setNewLicPhone('');
        setNewLicCustomKey('');
        setNewLicNotes('');
        fetchLicenses();
        alert('✓ Đã tạo mã bản quyền mới thành công: ' + data.license.key);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi tạo mã: ' + err.message);
    }
  };

  const handleExtendLicense = async (id: string, addDays = 30) => {
    try {
      const res = await fetch('/api/admin/licenses/extend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id, addDays }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id && data.license) {
          setActionModalLicense((prev) => (prev ? { ...prev, ...data.license } : null));
          try {
            const d = new Date(data.license.expiresAt);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            setActionEditDate(`${yyyy}-${mm}-${dd}`);
          } catch (e) {}
        }
        alert(data.message);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleToggleLicense = async (id: string) => {
    try {
      const res = await fetch('/api/admin/licenses/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id) {
          setActionModalLicense((prev) => (prev ? { ...prev, isSuspended: data.isSuspended } : null));
        }
        alert(data.message);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleRevokeLicense = async (id: string, clientName: string) => {
    const reason = prompt(
      `🚫 XÁC NHẬN THU HỒI BẢN QUYỀN KHẨN CẤP\n\nBạn muốn thu hồi mã của khách: "${clientName}"?\nSau khi thu hồi, toàn bộ máy tính của khách này sẽ bị ngắt kết nối ngay lập tức!\n\nNhập lý do thu hồi:`,
      'Khách hàng vi phạm điều khoản / Có hành vi gian lận'
    );
    if (reason === null) return;

    try {
      const res = await fetch('/api/admin/licenses/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id, reason }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id && data.license) {
          setActionModalLicense((prev) => (prev ? { ...prev, ...data.license } : null));
        }
        alert(`🚫 ĐÃ THU HỒI THÀNH CÔNG!\n\n${data.message}`);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleUnrevokeLicense = async (id: string, clientName: string) => {
    if (!confirm(`Khôi phục quyền sử dụng lại cho khách "${clientName}"?`)) return;
    try {
      const res = await fetch('/api/admin/licenses/unrevoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id && data.license) {
          setActionModalLicense((prev) => (prev ? { ...prev, ...data.license } : null));
        }
        alert(`✓ ĐÃ KHÔI PHỤC BẢN QUYỀN!\n\n${data.message}`);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleRegenerateKey = async (id: string, clientName: string, currentKey: string) => {
    if (
      !confirm(
        `🔄 CẤP ĐỔI SANG MÃ MỚI TOANH?\n\nKhách hàng: "${clientName}"\nMã hiện tại: ${currentKey}\n\nKhi cấp đổi:\n• Hệ thống sẽ sinh một mã mới hoàn toàn.\n• Giữ nguyên toàn bộ số ngày sử dụng còn lại của khách.\n• Hủy bỏ mã cũ và ngắt máy cũ để khách nạp mã mới.\n\nBạn có muốn thực hiện?`
      )
    )
      return;

    try {
      const res = await fetch('/api/admin/licenses/regenerate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id && data.license) {
          setActionModalLicense((prev) => (prev ? { ...prev, ...data.license } : null));
        }
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(data.newKey);
        }
        alert(
          `✓ ĐÃ CẤP ĐỔI MÃ MỚI THÀNH CÔNG!\n\n• Mã mới: ${data.newKey}\n• Đã tự động sao chép mã mới vào Clipboard.\n• Hãy gửi mã mới này cho khách hàng nhé!`
        );
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleResetDevices = async (id: string) => {
    if (!confirm('Bạn có chắc muốn Reset thiết bị cho mã này? (Khách có thể kích hoạt lại trên máy tính mới)')) return;
    try {
      const res = await fetch('/api/admin/licenses/reset-devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        fetchLicenses();
        if (actionModalLicense && actionModalLicense.id === id) {
          setActionModalLicense((prev) => (prev ? { ...prev, devices: [] } : null));
        }
        alert(data.message);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDeleteLicense = (id: string, keyName: string, clientName = 'Khách hàng') => {
    handleOpenDeleteModal({ id, type: 'license', name: clientName, keyOrCode: keyName });
  };

  const handlePushKeyToExtension = (key: string) => {
    window.postMessage({ type: 'AUTORECRUIT_ACTIVATE_KEY', key }, '*');
    setExtensionActivatedKey(key);
    setTimeout(() => setExtensionActivatedKey(null), 3000);
    alert(`✓ Đã gửi lệnh kích hoạt mã ${key} sang Chrome Extension trên máy của bạn!`);
  };

  const handleCopyZaloTemplate = (lic: AdminLicenseItem) => {
    const devices = lic.maxDevices || 1;
    const price1m = (devices * 1000000).toLocaleString('vi-VN') + 'đ';
    const price3m = (devices * 2700000).toLocaleString('vi-VN') + 'đ';
    const price6m = (devices * 5400000).toLocaleString('vi-VN') + 'đ';
    const price12m = (devices * 10800000).toLocaleString('vi-VN') + 'đ';
    const cleanName = lic.clientName ? lic.clientName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'D').replace(/[^a-zA-Z0-9\s]/g, '').trim().toUpperCase() : 'KHACH';
    const cleanPhone = (lic.phone || '').replace(/\D/g, '') || 'SDT';
    const cleanDev = lic.devices?.[0]?.deviceId || lic.key || 'AFB-PC';
    const sampleMemo = `${cleanName} ${cleanPhone} 3TH ${cleanDev}`;
    const oneClickUrl = `${window.location.origin}/?kich_hoat=${encodeURIComponent(lic.key)}`;
    const text = `Dạ chào anh/chị ${lic.clientName} ạ!
Bản quyền phần mềm Gia Long - FB (${devices} máy tính) của anh/chị sắp đến hạn gia hạn (${new Date(lic.expiresAt).toLocaleDateString('vi-VN')}).

🔥 HIỆU SUẤT KHỦNG - TIẾT KIỆM TỐI ĐA (Chi phí chỉ từ ~ 70đ - 90đ / 1 Bài Đăng!)
💳 BẢNG GIÁ CÁC KỲ HẠN GIA HẠN LINH HOẠT (${devices} MÁY TÍNH):
• 🎁 Gói Dùng Thử (1 ngày): 0đ (Miễn phí 100%, giới hạn 20 bài đăng, không cần chuyển khoản)
• 📌 Gói 1 Tháng (30 ngày): ${price1m} (~9.000 - 10.500 bài/tháng)
• ⭐ Gói 3 Tháng (100 ngày - 🎁 TẶNG 10 NGÀY): ${price3m} (Tiết kiệm 800.000đ / Giảm 10% - Khuyên dùng)
• 🚀 Gói 6 Tháng (195 ngày - 🎁 TẶNG 15 NGÀY): ${price6m} (Tiết kiệm 1.600.000đ + VIP Support 1-1)
• 👑 Gói 12 Tháng (390 ngày - 🎁 TẶNG 30 NGÀY): ${price12m} (Tiết kiệm 3.200.000đ + Đặc quyền)

🏦 Thông tin chuyển khoản (MBBank):
• Số tài khoản: 0869.029.310 (MBBank - Ngân hàng Quân Đội)
• Chủ tài khoản: GIA LONG - FB
• Cấu trúc nội dung CK: Tên, SĐT, Gói (1TH/3TH/6TH/1N), Mã máy
• Ví dụ nội dung CK: ${sampleMemo}

⚡ Nhấp vào link 1-Click dưới đây để bản quyền tự động kích hoạt ngay trên máy:
👉 ${oneClickUrl}
📲 Kênh Zalo Hỗ Trợ (Chỉ Nhận Zalo): https://zalo.me/0869029310 (0869.029.310)`;

    navigator.clipboard.writeText(text);
    setCopiedZaloMsg(lic.id);
    setTimeout(() => setCopiedZaloMsg(null), 2500);
  };

  // Mẫu tin nhắn bàn giao cài đặt chính thức (Kèm link Edge Add-ons + Kích hoạt 1-Click)
  const handleCopyStoreHandoverTemplate = (lic?: AdminLicenseItem) => {
    const devices = lic?.maxDevices || 1;
    const clientName = lic?.clientName || 'Quý khách';
    const key = lic?.key || 'GLFB-VIP-KEY';
    const expiresText = lic?.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('vi-VN') : '30 ngày';
    const oneClickUrl = lic?.key ? `${window.location.origin}/?kich_hoat=${encodeURIComponent(lic.key)}` : `${window.location.origin}/`;

    const text = `Dạ em chào anh/chị ${clientName} ạ!
Em xin gửi anh/chị hướng dẫn cài đặt và kích hoạt bản quyền tiện ích Gia Long - FB trên máy tính:

1️⃣ BƯỚC 1: Cài đặt tiện ích chính thức từ Microsoft Edge Add-ons (1-Click):
👉 ${edgeStoreUrl}
(Anh/chị mở trên Microsoft Edge và bấm nút "Get" / "Nhận" màu xanh là tiện ích tự động cài đặt xong trong 3 giây)

2️⃣ BƯỚC 2: Kích hoạt bản quyền tự động trên máy:
👉 ${oneClickUrl}
(Chỉ cần nhấp vào link trên, tiện ích sẽ tự động nhận diện máy tính và kích hoạt gói VIP ngay lập tức mà không cần gõ mã)

🔑 Mã bản quyền dự phòng: ${key}
💻 Số lượng máy đăng ký: ${devices} máy tính
📅 Thời hạn sử dụng: ${expiresText}

📲 Cần hỗ trợ kỹ thuật hoặc có thắc mắc trong quá trình dùng, anh/chị cứ nhắn Zalo em: 0869.029.310 (Gia Long - FB) nhé!`;

    navigator.clipboard.writeText(text);
    if (lic?.id) {
      setCopiedHandoverMsg(lic.id);
      setTimeout(() => setCopiedHandoverMsg(null), 2500);
    } else {
      alert('✓ Đã sao chép Mẫu tin nhắn Zalo bàn giao cài đặt (kèm Link Store Edge + Kích hoạt 1-Click)!');
    }
  };

  // Initialize with full default bundle from extension_files
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(() => {
    return DEFAULT_EXTENSION_BUNDLE.map((f) => ({
      name: f.name,
      content: f.content,
      size: f.size,
      type: f.type,
      isBinary: f.isBinary,
    }));
  });

  const [activeWorkspaceFileName, setActiveWorkspaceFileName] = useState<string>('manifest.json');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const currentFile = uploadedFiles.find((f) => f.name === activeWorkspaceFileName) || uploadedFiles[0];

  // Handle uploading files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isText = file.name.endsWith('.js') || file.name.endsWith('.json') || file.name.endsWith('.html') || file.name.endsWith('.css') || file.name.endsWith('.txt');
      const reader = new FileReader();

      if (isText) {
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setUploadedFiles((prev) => {
            const filtered = prev.filter((p) => p.name !== file.name);
            return [
              ...filtered,
              { name: file.name, content, size: file.size, type: file.type || 'text/plain' }
            ];
          });
          setActiveWorkspaceFileName(file.name);
        };
        reader.readAsText(file);
      } else {
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setUploadedFiles((prev) => {
            const filtered = prev.filter((p) => p.name !== file.name);
            return [
              ...filtered,
              { name: file.name, content, size: file.size, type: file.type || 'image/png', isBinary: true }
            ];
          });
          setActiveWorkspaceFileName(file.name);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleContentChange = (newContent: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.name === activeWorkspaceFileName ? { ...f, content: newContent } : f))
    );
  };

  // Reset to default bundle
  const handleResetToDefault = () => {
    if (confirm('Khôi phục toàn bộ file về mã nguồn chuẩn đã sửa mới nhất (đầy đủ 21 nhóm, 4 bài mẫu, hẹn giờ, lịch sử)?')) {
      setUploadedFiles(DEFAULT_EXTENSION_BUNDLE.map((f) => ({
        name: f.name,
        content: f.content,
        size: f.size,
        type: f.type,
        isBinary: f.isBinary,
      })));
      setActiveWorkspaceFileName('manifest.json');
    }
  };

  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);

  // Tải Gói ZIP Obfuscated Web Store (Blob Stream An Toàn 100%, Không Bị Lỗi WinRAR)
  const handleDownloadStoreZip = async () => {
    try {
      setIsDownloadingZip(true);
      const res = await fetch('/api/package/download-obfuscated-zip');
      if (!res.ok) {
        throw new Error(`Lỗi tải file từ máy chủ (Mã lỗi ${res.status})`);
      }
      const blob = await res.blob();
      if (blob.size < 20000) {
        const text = await blob.text();
        if (text.startsWith('{') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
          throw new Error('Dữ liệu trả về không đúng định dạng zip. Chuyển sang đóng gói trực tiếp...');
        }
      }
      const contentDisposition = res.headers.get('Content-Disposition');
      let downloadFileName = packageInfo?.fileName || `Gia_Long_FB_WebStore_v${packageInfo?.version || '1.0.2'}.zip`;
      if (contentDisposition && contentDisposition.includes('filename="')) {
        const match = contentDisposition.match(/filename="([^"]+)"/);
        if (match && match[1]) downloadFileName = match[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      console.warn('Fallback to client JSZip generator:', err);
      await handleExportZip();
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Export ZIP
  const handleExportZip = async () => {
    try {
      setIsExporting(true);
      const zip = new JSZip();

      uploadedFiles.forEach((file) => {
        if (file.isBinary && file.content.startsWith('data:')) {
          const base64Data = file.content.split(',')[1];
          zip.file(file.name, base64Data, { base64: true });
        } else {
          zip.file(file.name, file.content);
        }
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Gia_Long_FB_Extension_v${packageInfo?.version || '1.0.2'}_Source.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export zip', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBundleForChat = () => {
    let bundleText = `### Danh sách các file Chrome Extension Gia Long - FB:\n\n`;
    uploadedFiles.forEach((f) => {
      if (f.isBinary) {
        bundleText += `File: **${f.name}** (File ảnh/nhị phân)\n\n`;
      } else {
        const ext = f.name.split('.').pop() || '';
        bundleText += `\`\`\`${ext} [${f.name}]\n${f.content}\n\`\`\`\n\n`;
      }
    });

    navigator.clipboard.writeText(bundleText);
    setCopiedBundle(true);
    setTimeout(() => setCopiedBundle(false), 2500);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* MODAL KÍCH HOẠT TỰ ĐỘNG 1-CLICK KHI TRUY CẬP TỪ LINK (?kich_hoat=KEY) */}
      {autoActivateKey && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center animate-in fade-in zoom-in duration-200">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  ⚡
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold text-white">Cổng Kích Hoạt Bản Quyền 1-Click</h3>
                  <p className="text-[11px] text-slate-400">Tự động kết nối và nạp bản quyền vào Extension</p>
                </div>
              </div>
              <button
                onClick={() => setAutoActivateKey(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Trạng thái 1: Đang kiểm tra / đang gửi lệnh */}
            {(autoActivateState === 'checking' || autoActivateState === 'activating') && (
              <div className="py-8 space-y-4">
                <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Đang Kích Hoạt Tự Động...</h4>
                  <p className="text-xs text-slate-400">{autoActivateMsg}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400">
                  Mã bản quyền: <strong>{autoActivateKey}</strong>
                </div>
              </div>
            )}

            {/* Trạng thái 2: THÀNH CÔNG */}
            {autoActivateState === 'success' && (
              <div className="py-4 space-y-5">
                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-black text-emerald-400">KÍCH HOẠT THÀNH CÔNG!</h4>
                  <p className="text-xs text-slate-300">
                    Bản quyền VIP đã được kết nối và ghi nhận an toàn trên máy tính này.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Mã kích hoạt:</span>
                    <span className="font-mono font-bold text-white">{autoActivateKey}</span>
                  </div>
                  {autoActivateLic?.clientName && (
                    <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                      <span className="text-slate-400">Khách hàng / Đơn vị:</span>
                      <span className="font-bold text-emerald-400">{autoActivateLic.clientName}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                    <span className="text-slate-400">Gói cước:</span>
                    <span className="font-bold text-blue-400">
                      {autoActivateLic?.planType === 'team' ? 'Doanh Nghiệp (Team HCNS 3 máy)' : 'Cá Nhân (1 máy VIP)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Thời hạn sử dụng:</span>
                    <span className="font-bold text-white">
                      {autoActivateLic?.daysLeft !== undefined ? `${autoActivateLic.daysLeft} ngày tiếp theo` : '30 ngày'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <a
                    href="https://www.facebook.com"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2"
                  >
                    <span>Mở Facebook & Bắt Đầu Đăng Bài Ngay</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => setAutoActivateKey(null)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Đóng cửa sổ này
                  </button>
                </div>
              </div>
            )}

            {/* Trạng thái 3: CHƯA PHÁT HIỆN EXTENSION (HƯỚNG DẪN 1 THAO TÁC CÀI ĐẶT) */}
            {autoActivateState === 'no_extension' && (
              <div className="py-2 space-y-4">
                <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white">Chưa Phát Hiện Extension Trên Chrome!</h4>
                  <p className="text-xs text-slate-400">
                    Trình duyệt chưa cài đặt tiện ích Gia Long - FB. Vui lòng cài đặt trước:
                  </p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      1
                    </div>
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-bold text-white">Cài đặt 1-Click từ Cửa hàng Tiện ích chính thức:</p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={chromeStoreUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition shadow-md shadow-blue-600/20"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Thêm vào Google Chrome</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                          href={edgeStoreUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[11px] font-bold transition shadow-md shadow-teal-600/20"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>Thêm vào Microsoft Edge</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      2
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <p className="text-xs font-bold text-white">Sau khi cài xong, bấm nút bên dưới:</p>
                      <button
                        onClick={() => executeOneClickActivation(autoActivateKey)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Kích Hoạt Ngay Mã {autoActivateKey}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Hoặc nếu bạn dùng file .ZIP thủ công:</span>
                  <button
                    onClick={handleDownloadStoreZip}
                    disabled={isDownloadingZip}
                    className="text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                  >
                    <Download className={`w-3 h-3 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                    <span>{isDownloadingZip ? 'Đang tải...' : 'Tải ZIP Obfuscated'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Trạng thái 4: LỖI KÍCH HOẠT */}
            {autoActivateState === 'failed' && (
              <div className="py-4 space-y-4">
                <div className="w-16 h-16 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-rose-400">Không Thể Kích Hoạt Mã Này</h4>
                  <p className="text-xs text-slate-300">{autoActivateMsg}</p>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400">
                  Mã: <strong className="text-white font-mono">{autoActivateKey}</strong>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => executeOneClickActivation(autoActivateKey)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Thử Lại
                  </button>
                  <a
                    href={adminZaloUrl || 'https://zalo.me/0869029310'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                  >
                    <span>Liên Hệ Zalo Hỗ Trợ</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header: Thanh Điều Hướng & Trạng Thái Hỗ Trợ Nhanh (Sticky Header) */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-3 sm:px-6 py-2 sm:py-3 shadow-xl space-y-2 sm:space-y-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          {/* Bên trái: Logo + Badge V1.0 - Phiên Bản Đầu Tiên */}
          <div className="flex items-center gap-2 sm:gap-3">
            <FbLightningLogo className="w-8 h-8 sm:w-9 sm:h-9" />
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Gia Long - FB
                </h1>
                <span className="text-[10px] sm:text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                  V1.0 - Phiên Bản Đầu Tiên
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                Nền tảng tự động hóa Facebook, lưu giữ dữ liệu, hẹn giờ Alarms, lịch sử đăng bài
              </p>
            </div>
          </div>

          {/* Bên phải: Đồng hồ Real-time + Email Hỗ trợ + Nút Zalo Admin */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Đồng hồ real-time: Chỉ giữ lại ở Header */}
            <RealtimeClock />

            {/* Email Hỗ trợ */}
            <div className="hidden md:inline-flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-[11px] text-slate-300 h-[34px] box-border">
              <span className="text-slate-400">✉️ Email:</span>
              <span className="text-white font-medium">gialonggiaiphapvanhanh@gmail.com</span>
            </div>

            {/* Nút Zalo Admin */}
            <a
              href={adminZaloUrl || 'https://zalo.me/0869029310'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 border border-sky-400/50 text-white rounded-lg text-[11.5px] font-bold transition shadow-md shadow-blue-600/30 h-[34px] box-border"
            >
              <span>💬 Zalo Admin: 0869.029.310</span>
              <span className="text-white font-black text-xs">↗</span>
            </a>
          </div>
        </div>

        {/* Thanh Navigation Tabs (Gọn gàng dành cho Khách & Quản trị) */}
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 shadow-inner text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Tab 1: Cổng Khách Hàng (Xem Tiện Ích & Mua Key) */}
            <button
              onClick={() => setActiveTab('client-portal')}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all flex items-center ${
                activeTab === 'client-portal'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
              }`}
            >
              <span>Cổng Tiện Ích &amp; Đặt Mua Key</span>
            </button>

            {/* Tab 2: Chính Sách Quyền Riêng Tư */}
            <button
              onClick={() => setActiveTab('privacy')}
              className={`px-3.5 py-2 rounded-lg font-semibold transition-all flex items-center ${
                activeTab === 'privacy'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
              }`}
            >
              <span>Chính Sách Quyền Riêng Tư</span>
            </button>

            {/* Tab 3: Quản Trị Cấp Key (Duy nhất 1 nút Quản Trị tập trung tại thanh Tab) */}
            <button
              onClick={() => {
                setActiveTab('license-admin');
                if (isAdminUnlocked) fetchLicenses();
              }}
              className={`px-3.5 py-2 rounded-lg font-semibold transition-all flex items-center ${
                activeTab === 'license-admin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-indigo-400 hover:text-indigo-200 hover:bg-slate-800/80'
              }`}
              title="Dành riêng cho Quản trị viên quản lý và cấp key"
            >
              <span>{isAdminUnlocked ? 'Bảng Quản Trị (Admin)' : 'Quản Trị Cấp Key'}</span>
            </button>

            {/* Các tab kỹ thuật: CHỈ hiển thị khi bật chế độ nhà phát triển */}
            {showDevTools && (
              <>
                <button
                  onClick={() => setActiveTab('workspace')}
                  className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center ${
                    activeTab === 'workspace'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <span>Workspace IDE</span>
                </button>
                <button
                  onClick={() => setActiveTab('quickstart')}
                  className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center ${
                    activeTab === 'quickstart'
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                      : 'text-teal-400 hover:text-teal-200 hover:bg-slate-800/80'
                  }`}
                >
                  <span>Nạp Store</span>
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center ${
                    activeTab === 'files'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <span>Vai Trò File</span>
                </button>
                <button
                  onClick={() => setActiveTab('devtools')}
                  className={`px-3 py-2 rounded-lg font-semibold transition-all flex items-center ${
                    activeTab === 'devtools'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  <span>Debug F12</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* CỔNG KHÁCH HÀNG: TẢI TIỆN ÍCH EXTENSION (.ZIP) & ĐẶT MUA BẢN QUYỀN */}
        {activeTab === 'client-portal' && (
          <CustomerDownloadPortal
            packageInfo={packageInfo}
            onDownloadZip={handleDownloadStoreZip}
            isDownloadingZip={isDownloadingZip}
            edgeStoreUrl={edgeStoreUrl}
            chromeStoreUrl={chromeStoreUrl}
            adminZaloUrl={adminZaloUrl}
            onSelectPlan={(plan) => {
              setOrderModalPkg(plan);
              setOrderCustomerName('');
              setOrderCustomerPhone('');
              setOrderSuccessData(null);
            }}
            onGoToAdmin={() => {
              setActiveTab('license-admin');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* PRIVACY POLICY TAB */}
        {activeTab === 'privacy' && (
          <div className="max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 text-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                  Chrome Web Store Compliance
                </span>
                <h2 className="text-base sm:text-lg font-bold text-white mt-1">Chính Sách Quyền Riêng Tư (Privacy Policy)</h2>
                <p className="text-[11px] text-slate-400">Cập nhật lần cuối: Tháng 10/2026</p>
              </div>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/privacy.html`;
                  navigator.clipboard.writeText(url);
                  alert('✓ Đã sao chép link Chính sách quyền riêng tư:\n' + url);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 self-start shadow-sm cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Sao Chép Link</span>
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Tiện ích mở rộng <strong>Gia Long - FB</strong> cam kết tôn trọng và bảo vệ tối đa quyền riêng tư của người dùng theo đúng nguyên tắc bảo mật và quyền riêng tư tiêu chuẩn.
            </p>

            {/* 2-column compact grid for broad overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <h3 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  1. Mục Đích Hoạt Động (Single Purpose)
                </h3>
                <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
                  Gia Long - FB là tiện ích hỗ trợ tự động hóa việc đăng bài viết và thông báo tuyển dụng lên các nhóm Facebook mà người dùng đã tự nguyện tham gia, giúp tiết kiệm thời gian quản trị.
                </p>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  2. Cam Kết Dữ Liệu (Data Collection)
                </h3>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-400 text-[11px] sm:text-xs leading-relaxed">
                  <li><strong>Không lưu mật khẩu:</strong> Hoàn toàn không đọc hoặc gửi mật khẩu. Hoạt động trên phiên hiện hữu.</li>
                  <li><strong>Không lấy thông tin cá nhân:</strong> Không đọc tin nhắn, danh bạ, định vị hay lịch sử duyệt web.</li>
                  <li><strong>Lưu trữ 100% cục bộ:</strong> Danh sách bài viết & nhóm lưu tại <code>chrome.storage.local</code> trên máy bạn.</li>
                </ul>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <h3 className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  3. Xác Thực Bản Quyền
                </h3>
                <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
                  Khi kích hoạt bản quyền, tiện ích chỉ gửi mã License Key và mã định danh máy (Device ID) để đối soát hạn dùng. Tuyệt đối không liên kết tài khoản Facebook hay dữ liệu cá nhân.
                </p>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  4. Chia Sẻ Với Bên Thứ Ba
                </h3>
                <p className="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
                  Chúng tôi cam kết <strong>tuyệt đối không bán, không cho thuê, không chia sẻ</strong> bất kỳ dữ liệu người dùng nào cho bất kỳ bên thứ ba hay mạng quảng cáo nào.
                </p>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>• Email: <strong className="text-slate-300">gialonggiaiphapvanhanh@gmail.com</strong></span>
                <span>• Zalo hỗ trợ: <strong className="text-slate-300">0869.029.310</strong></span>
                <span>• Đơn vị: <strong className="text-slate-300">Gia Long - FB Team</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE TAB */}
        {activeTab === 'workspace' && (
          <div className="space-y-6">
            {/* Status & Highlights Card */}
            <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/30 border border-blue-500/30 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                      <CheckCircle2 className="w-4 h-4" />
                    </span>
                    <h2 className="text-base font-bold text-white">
                      Hệ Thống Tự Động Facebook + Khiên Bảo Vệ Chống Giới Hạn Tần Suất & Anti-Spam
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-300 pt-1">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="font-semibold text-rose-400 block mb-0.5">🛡️ Chống Giới Hạn Tần Suất:</span>
                      <span className="text-slate-400">Tự nhận diện cảnh báo spam Facebook, ngắt khẩn cấp bảo vệ nick, nghỉ giải lao sau mỗi 4 nhóm.</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="font-semibold text-emerald-400 block mb-0.5">📸 Đổi Mã Băm Ảnh (Hash Buster):</span>
                      <span className="text-slate-400">Biến thiên nhẹ pixel & độ nén giúp mỗi nhóm nhận ảnh có mã MD5 độc nhất, vượt qua PhotoDNA.</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="font-semibold text-blue-400 block mb-0.5">✍️ Chèn Salt Vô Hình:</span>
                      <span className="text-slate-400">Kết hợp Spintax & chuỗi ký tự vô hình Zero-Width giúp mọi bài đăng có chữ ký số khác biệt 100%.</span>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="font-semibold text-amber-400 block mb-0.5">⏱️ Giãn Cách & Jitter Ngẫu Nhiên:</span>
                      <span className="text-slate-400">Tự động thêm độ trễ ngẫu nhiên (+10-20s), giả lập cuộn trang lướt tin như người dùng thật.</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
                  <button
                    onClick={handleDownloadStoreZip}
                    disabled={isDownloadingZip}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-98 disabled:opacity-75"
                  >
                    <Download className={`w-4 h-4 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                    <span>{isDownloadingZip ? 'Đang nén & tải (327 KB)...' : `Tải ZIP v1.0.2 Chuẩn Store (${packageInfo?.sizeKb || 328} KB)`}</span>
                  </button>
                  <a
                    href="/store_logo_300x300.png"
                    download="store_logo_300x300.png"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/40 rounded-xl text-xs font-bold flex items-center gap-2 transition"
                    title="Tải ảnh đại diện 300x300 pixel bắt buộc cho Store Listings trên Microsoft Edge"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Logo 300x300 (Bắt Buộc)</span>
                  </a>
                  <button
                    onClick={handleExportZip}
                    disabled={isExporting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium flex items-center gap-2 transition"
                    title="Xuất file ZIP chứa toàn bộ code bạn đang chỉnh sửa trong Workspace"
                  >
                    <Package className="w-3.5 h-3.5 text-sky-400" />
                    <span>{isExporting ? 'Đang nén file...' : 'Tải ZIP Mã Nguồn Workspace'}</span>
                  </button>
                  <button
                    onClick={handleResetToDefault}
                    className="px-4 py-2 bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
                    title="Khôi phục lại mã nguồn gốc chuẩn đã sửa"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Khôi phục code gốc</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Workspace Explorer & Editor Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* File list on left */}
              <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FolderCode className="w-4 h-4 text-blue-400" />
                      Tất Cả Các File Trong Extension ({uploadedFiles.length})
                    </span>
                  </div>

                  {/* Search file */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm tên file..."
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs pl-8 pr-3 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* File items list */}
                  <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                    {uploadedFiles
                      .filter((f) => f.name.toLowerCase().includes(searchKeyword.toLowerCase()))
                      .map((file) => {
                        const isSelected = file.name === activeWorkspaceFileName;
                        return (
                          <div
                            key={file.name}
                            onClick={() => setActiveWorkspaceFileName(file.name)}
                            className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-600/20'
                                : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-blue-400'}`} />
                              <span className="font-mono truncate">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                                {file.isBinary ? 'Ảnh/Binary' : `${file.content.length} chars`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Bottom actions */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <button
                    onClick={handleBundleForChat}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 border border-slate-700"
                  >
                    {copiedBundle ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-400" />}
                    <span>{copiedBundle ? 'Đã sao chép! Hãy dán vào chat' : 'Sao chép tất cả gửi Chat'}</span>
                  </button>
                </div>
              </div>

              {/* Code Editor on right */}
              <div className="lg:col-span-8 p-4 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-amber-400" />
                      {currentFile?.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {currentFile?.isBinary ? 'Tệp ảnh / Nhị phân' : 'Mã nguồn hoàn chỉnh sẵn sàng tải về'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(currentFile?.content || '')}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1 transition"
                    >
                      {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSnippet ? 'Đã copy' : 'Copy file này'}</span>
                    </button>
                  </div>
                </div>

                {/* Editor textarea */}
                {currentFile?.isBinary ? (
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-8 flex flex-col items-center justify-center min-h-[380px] space-y-3">
                    <img src={currentFile.content} alt={currentFile.name} className="max-h-32 rounded-lg shadow-md border border-slate-800" />
                    <p className="text-xs text-slate-400 font-mono">{currentFile.name}</p>
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      value={currentFile?.content || ''}
                      onChange={(e) => handleContentChange(e.target.value)}
                      rows={22}
                      spellCheck={false}
                      className="w-full bg-slate-950 text-slate-200 font-mono text-xs p-4 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 leading-relaxed font-normal"
                      placeholder="Nội dung mã nguồn..."
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 pt-1">
                  <span>
                    💡 Bấm <strong className="text-emerald-400">"Tải về toàn bộ (.ZIP)"</strong> &rarr; Giải nén ra thư mục extension &rarr; Vào Chrome bấm nút 🔄 (Tải lại).
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QUICKSTART TAB - HƯỚNG DẪN CHI TIẾT NỘP CHROME & CHUYỂN SANG MICROSOFT EDGE */}
        {activeTab === 'quickstart' && (
          <div className="space-y-8">
            {/* Banner nổi bật giải đáp câu hỏi Microsoft Edge */}
            <div className="bg-gradient-to-r from-blue-900/40 via-teal-950/40 to-slate-900 border border-teal-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>Đẩy Sang Microsoft Edge Được Không?</span>
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                        ĐƯỢC 100% - CHẠY CỰC MƯỢT
                      </span>
                    </h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Microsoft Edge chạy cùng nhân Chromium với Chrome. Giải pháp dùng riêng Microsoft Edge cho Facebook là <strong>cực kỳ thông minh</strong> giúp không bị nhảy tab làm gián đoạn công việc trên Chrome!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const text = `HƯỚNG DẪN CÀI AUTO RECRUIT TRÊN MICROSOFT EDGE:
1. Mở Microsoft Edge, vào địa chỉ: edge://extensions
2. Bật công tắc "Chế độ dành cho nhà phát triển" (Developer mode) ở cột bên trái.
3. Bấm "Tải phần mở rộng đã giải nén" (Load unpacked) -> Chọn thư mục giải nén từ file ZIP.
4. Đăng nhập nick Facebook trên Edge.
5. MẸO CHỐNG NHẢY TAB: Bấm Windows + Tab -> Tạo Màn hình Desktop 2 -> Kéo Edge sang Desktop 2. Ở Desktop 1 anh làm việc bình thường, Edge tự mở tab đăng bài ở Desktop 2 mà không hề chớp nháy trước mắt!`;
                      navigator.clipboard.writeText(text);
                      alert('✓ Đã sao chép hướng dẫn Edge vào clipboard!');
                    }}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-teal-600/30"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao Chép Hướng Dẫn Edge</span>
                  </button>
                </div>
              </div>

              {/* Giải pháp chống gián đoạn tab */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-teal-400 font-bold">
                    <Monitor className="w-4 h-4" />
                    <span>Bí Quyết 1: Tách Biệt Hoàn Toàn 2 Trình Duyệt</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    • <strong>Google Chrome:</strong> Dành 100% cho công việc cá nhân, soạn thảo Word/Excel, họp Zoom, xem video... không bị bất kỳ tab nào của Facebook làm gián đoạn.<br />
                    • <strong>Microsoft Edge:</strong> Dành riêng cho nick Facebook chạy tự động. Tiện ích tự động mở tab nhóm, chèn ảnh, bấm Đăng và đóng tab gói gọn trong Edge.
                  </p>
                </div>

                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>Bí Quyết 2: Chạy Tàng Hình Qua Virtual Desktop (Windows)</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    • Bấm tổ hợp phím <strong>Windows + Tab</strong> trên bàn phím &rarr; Bấm <strong>"+ New Desktop"</strong> (Màn hình Desktop 2).<br />
                    • Mở Microsoft Edge và kéo sang Desktop 2.<br />
                    • Quay lại Desktop 1 làm việc bình thường. Tiện ích ở Desktop 2 tự mở tab đăng bài ngầm, trước mắt anh hoàn toàn tĩnh lặng không có tab nào bật lên!
                  </p>
                </div>
              </div>
            </div>

            {/* PHẦN 1: CÁC BƯỚC TIẾP THEO TRÊN CHROME DEVELOPER DASHBOARD */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-400" />
                  <span>Quy Trình Tiếp Theo Trên Chrome Developer Dashboard (Sau Khi Up File ZIP)</span>
                </h3>
                <span className="text-xs text-slate-400">Hoàn thành 3 mục &rarr; Bấm "Submit for review"</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Bước 1: Store Listing */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold flex items-center justify-center text-xs">
                        1
                      </span>
                      <h4 className="font-bold text-white text-sm">Store Listing (Thông tin cửa hàng)</h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Điền thông tin giới thiệu và tải ảnh giao diện:
                    </p>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block font-semibold">Tên tiện ích:</span>
                        <span className="text-slate-200">Gia Long - FB</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Danh mục (Category):</span>
                        <span className="text-emerald-400 font-mono">Productivity (Năng suất)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Ảnh chụp màn hình (Screenshots):</span>
                        <span className="text-slate-300">Tối thiểu 1 ảnh kích thước <strong>1280x800</strong> hoặc <strong>640x400</strong> px (chụp giao diện Popup hoặc Dashboard).</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bước 2: Privacy Practices (Quan trọng nhất) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 font-bold flex items-center justify-center text-xs">
                        2
                      </span>
                      <h4 className="font-bold text-white text-sm">Privacy Practices (Quyền riêng tư)</h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Google xét duyệt rất kỹ mục này. Sử dụng câu trả lời mẫu chuẩn đã chuẩn bị sẵn:
                    </p>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px]">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-400 font-semibold">Mục đích đơn lẻ (Single purpose):</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText('Tiện ích hỗ trợ người dùng tự động hóa việc đăng bài viết và thông báo tuyển dụng lên các hội nhóm Facebook cá nhân quản lý theo lịch định sẵn.');
                              alert('✓ Đã chép Single Purpose!');
                            }}
                            className="text-blue-400 hover:text-blue-300 text-[10px] flex items-center gap-1 font-semibold"
                          >
                            <Copy className="w-3 h-3" /> Chép
                          </button>
                        </div>
                        <p className="text-slate-300 text-[10px] italic">Tiện ích hỗ trợ tự động hóa việc đăng bài viết tuyển dụng lên nhóm Facebook cá nhân...</p>
                      </div>

                      <div className="pt-1 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-slate-400 font-semibold">Link Chính sách bảo mật:</span>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/privacy.html`;
                              navigator.clipboard.writeText(url);
                              alert('✓ Đã chép link Privacy Policy:\n' + url);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 text-[10px] flex items-center gap-1 font-semibold"
                          >
                            <Copy className="w-3 h-3" /> Chép Link
                          </button>
                        </div>
                        <p className="text-emerald-400/90 font-mono text-[10px] truncate">{window.location.origin}/privacy.html</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bước 3: Distribution & Submit */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold flex items-center justify-center text-xs">
                        3
                      </span>
                      <h4 className="font-bold text-white text-sm">Chế Độ Hiển Thị & Nộp Duyệt</h4>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Lựa chọn chế độ phân phối phù hợp:
                    </p>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block font-semibold">Chế độ Visibility:</span>
                        <p className="text-amber-400 font-semibold mt-0.5">
                          Khuyên dùng: Chọn "Unlisted" (Ẩn / Không công khai)
                        </p>
                        <p className="text-slate-400 text-[10px] mt-0.5">
                          Chỉ những ai có link trực tiếp mới cài được, không lộ diện cho người lạ tìm kiếm. Rất an toàn và duyệt cực nhanh!
                        </p>
                      </div>
                      <div className="pt-1 border-t border-slate-800">
                        <span className="text-slate-400 block font-semibold">Nộp duyệt (Submit for review):</span>
                        <p className="text-slate-300 text-[10px]">
                          Sau khi xong, nút <strong>"Submit for review"</strong> góc trên sáng lên. Bấm nộp và đợi Google duyệt trong 24h - 48h.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PHẦN 2: HƯỚNG DẪN CÀI ĐẶT & NỘP LÊN MICROSOFT EDGE ADD-ONS */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold">
                      <Globe className="w-4 h-4" />
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      Đẩy Lên Microsoft Edge Add-ons (Giải Pháp Thay Thế & Song Song Hoàn Hảo)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Chờ Chrome duyệt lâu? Đẩy lên Microsoft Edge Add-ons chỉ mất <strong>24h - 72h</strong> và <strong>hoàn toàn miễn phí</strong>!
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href="https://partner.microsoft.com/dashboard/microsoftedge"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-teal-600/20"
                  >
                    <span>Mở Microsoft Partner Center</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={handleDownloadStoreZip}
                    disabled={isDownloadingZip}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                    <span>Tải ZIP v1.0.2 Chuẩn Edge</span>
                  </button>
                  <a
                    href="/store_logo_300x300.png"
                    download="store_logo_300x300.png"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-teal-500/30"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Logo 300x300 (Bắt Buộc)</span>
                  </a>
                </div>
              </div>

              {/* Hộp thoại xử lý lỗi nộp Edge */}
              <div className="bg-amber-950/20 border border-amber-500/40 p-4 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>HỆ THỐNG ĐÃ TỰ ĐỘNG SỬA TRIỆT ĐỂ CÁC NGUYÊN NHÂN GÂY LỖI KHI NỘP EDGE:</span>
                </div>
                <ul className="text-[11.5px] text-slate-300 space-y-1.5 list-disc pl-5">
                  <li>
                    <strong className="text-white">Lỗi Package / Manifest invalid:</strong> Đã làm sạch hoàn toàn match pattern (loại bỏ <code>localhost</code>, chuẩn hóa URL HTTPS và chỉ giữ các tệp extension thuần túy).
                  </li>
                  <li>
                    <strong className="text-white">Lỗi xung đột phiên bản (Version already exists):</strong> Đã tự động nâng cấp manifest lên <strong className="text-emerald-400 font-mono">v1.0.2</strong> trong gói ZIP mới.
                  </li>
                  <li>
                    <strong className="text-white">Store Listings bắt buộc ảnh 300x300 px:</strong> Microsoft Edge yêu cầu Store Logo phải đúng kích thước <strong>300x300</strong> (nếu sai kích thước sẽ báo lỗi). Bạn bấm nút <em>"Tải Logo 300x300"</em> ở trên để nộp nhé.
                  </li>
                </ul>
              </div>

              {/* Bảng so sánh trực quan Edge Store vs Chrome Store */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Bảng So Sánh Lợi Thế: Microsoft Edge Store vs Google Chrome Store</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px] mb-1">⏱️ Thời gian xét duyệt:</span>
                    <div className="text-teal-400 font-bold text-sm">Edge: 1 - 3 ngày</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Chrome: 3 - 14 ngày</div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px] mb-1">💵 Phí đăng ký tài khoản:</span>
                    <div className="text-emerald-400 font-bold text-sm">Edge: Miễn phí (0đ)</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Chrome: $5 USD (thẻ quốc tế)</div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px] mb-1">🧩 Độ tương thích code:</span>
                    <div className="text-sky-400 font-bold text-sm">Chung 100% File ZIP</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Không cần đổi 1 dòng code</div>
                  </div>
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px] mb-1">🚀 Chiến lược phân phối:</span>
                    <div className="text-amber-400 font-bold text-sm">Nộp Cả 2 Song Song</div>
                    <div className="text-slate-500 text-[10px] mt-0.5">Bên nào duyệt trước dùng trước</div>
                  </div>
                </div>
              </div>

              {/* 2 Cách Triển Khai */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                {/* Cách 1: Đăng lên kho Microsoft Edge Add-ons chính thức */}
                <div className="bg-slate-950 p-5 rounded-2xl border border-teal-500/30 space-y-3.5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs">
                          A
                        </span>
                        <h4 className="font-bold text-teal-300 text-sm">Nộp Lên Microsoft Edge Add-ons (Khuyên Dùng)</h4>
                      </div>
                      <span className="text-[10px] bg-teal-500/20 text-teal-400 px-2 py-0.5 rounded-full font-bold">Duyệt 24h-72h</span>
                    </div>

                    <p className="text-slate-300 text-xs leading-relaxed">
                      Chỉ mất 5 phút để tạo bản nộp:
                    </p>

                    <ol className="list-decimal pl-4 space-y-2 text-slate-300 text-xs">
                      <li>Truy cập <a href="https://partner.microsoft.com/dashboard/microsoftedge" target="_blank" rel="noreferrer" className="text-teal-400 underline font-mono font-bold">partner.microsoft.com</a> và đăng nhập tài khoản Microsoft.</li>
                      <li>Chọn <strong>"Developer"</strong> &rarr; <strong>"Microsoft Edge"</strong> &rarr; Bấm <strong>"Create new extension"</strong>.</li>
                      <li>Tải file ZIP <strong className="text-white font-mono">Gia_Long_FB_WebStore_v1.0.2.zip</strong> lên.</li>
                      <li>Điền tên tiện ích: <strong className="text-white">Gia Long - FB</strong>, danh mục: <strong>Productivity (Năng suất)</strong>.</li>
                      <li>Dán link Chính sách quyền riêng tư:
                        <div className="flex items-center gap-2 mt-1 bg-slate-900 p-1.5 rounded-lg border border-slate-800 font-mono text-[10.5px]">
                          <span className="text-emerald-400 truncate flex-1">{window.location.origin}/privacy.html</span>
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/privacy.html`;
                              navigator.clipboard.writeText(url);
                              alert('✓ Đã sao chép link Privacy Policy:\n' + url);
                            }}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold shrink-0"
                          >
                            Copy Link
                          </button>
                        </div>
                      </li>
                      <li>Bấm <strong>"Submit"</strong> để nộp xét duyệt. Sau 1 - 3 ngày bạn sẽ nhận email duyệt kèm link chính thức!</li>
                    </ol>
                  </div>

                  <div className="bg-teal-950/30 border border-teal-500/30 p-2.5 rounded-xl text-[11px] text-teal-300">
                    💡 <em>Sau khi có link Edge Add-ons, khách hàng chỉ cần mở link và bấm <strong>"Get" (Nhận)</strong> là tiện ích tự động cài đặt và tự động cập nhật ngầm!</em>
                  </div>
                </div>

                {/* Cách 2: Cho khách dùng ngay lúc này (Load unpacked trên Edge) */}
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3.5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                          B
                        </span>
                        <h4 className="font-bold text-blue-300 text-sm">Cài Đặt Dùng Ngay Trên Edge (Trong Lúc Chờ Duyệt)</h4>
                      </div>
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">Dùng Ngay 100%</span>
                    </div>

                    <p className="text-slate-300 text-xs leading-relaxed">
                      Nếu khách mua cần dùng ngay lập tức hôm nay mà không muốn chờ Store:
                    </p>

                    <ol className="list-decimal pl-4 space-y-2 text-slate-300 text-xs">
                      <li>Gửi file ZIP cho khách và hướng dẫn giải nén ra 1 thư mục.</li>
                      <li>Mở Microsoft Edge, vào địa chỉ: <code className="text-teal-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded">edge://extensions</code>.</li>
                      <li>Bật công tắc <strong>"Chế độ dành cho nhà phát triển" (Developer mode)</strong> ở thanh menu bên trái.</li>
                      <li>Bấm nút <strong>"Tải phần mở rộng đã giải nén" (Load unpacked)</strong> &rarr; Chọn thư mục vừa giải nén.</li>
                      <li>Gửi link kích hoạt 1-Click: <code className="text-amber-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded">/?kich_hoat=MÃ_KEY</code> &rarr; Tiện ích tự động nhận bản quyền trong 1 giây!</li>
                    </ol>
                  </div>

                  {/* Nút copy hướng dẫn nhanh cho khách */}
                  <button
                    onClick={() => {
                      const text = `HƯỚNG DẪN CÀI ĐẶT NHANH GIA LONG - FB TRÊN MICROSOFT EDGE:
1. Giải nén file ZIP được gửi ra một thư mục trên máy tính.
2. Mở trình duyệt Microsoft Edge, truy cập: edge://extensions
3. Bật công tắc "Chế độ dành cho nhà phát triển" (Developer mode) ở cột bên trái.
4. Bấm "Tải phần mở rộng đã giải nén" (Load unpacked) -> Chọn thư mục vừa giải nén.
5. Tiện ích Gia Long - FB đã sẵn sàng hoạt động! Bấm vào link kích hoạt 1-Click để nhận bản quyền VIP.`;
                      navigator.clipboard.writeText(text);
                      alert('✓ Đã sao chép hướng dẫn Edge gửi khách vào Clipboard!');
                    }}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sao Chép Hướng Dẫn Cài Edge Gửi Khách Hàng</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILES TAB */}
        {activeTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-2">
              {EXTENSION_FILES_DOC.map((file) => {
                const isSelected = selectedDocFile.name === file.name;
                return (
                  <button
                    key={file.name}
                    onClick={() => setSelectedDocFile(file)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-900 border-blue-500/60 shadow-lg shadow-blue-500/10 text-white'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-mono font-semibold">{file.name}</p>
                      <p className="text-[11px] text-slate-500">{file.type}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                      {file.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold font-mono text-white">{selectedDocFile.name}</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Vai trò:</h4>
                  <p className="text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800">{selectedDocFile.role}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Khi nào cần sửa:</h4>
                  <p className="text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800">{selectedDocFile.whenToEdit}</p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Cách Debug F12:</h4>
                  <p className="text-slate-200 bg-slate-950/60 p-3 rounded-xl border border-slate-800">{selectedDocFile.howToDebug}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DEVTOOLS TAB */}
        {activeTab === 'devtools' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-rose-400" />
              Cách Bật F12 Để Xem Lỗi Cho Từng Thành Phần
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-emerald-400">1. Popup (popup.js & popup.html):</p>
                <p className="text-slate-400">Bấm icon extension để mở popup &rarr; Click chuột phải vào bên trong popup &rarr; Chọn "Kiểm tra" (Inspect).</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-purple-400">2. Service Worker (background.js):</p>
                <p className="text-slate-400">Vào chrome://extensions &rarr; Bấm vào dòng chữ xanh "service worker" tại thẻ của extension.</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-blue-400">3. Content Script (content.js):</p>
                <p className="text-slate-400">Mở trang web Facebook &rarr; Nhấn F12 &rarr; Xem tab Console.</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-bold text-amber-400">4. Dashboard (dashboard.html):</p>
                <p className="text-slate-400">Mở trang Dashboard lên &rarr; Nhấn F12 trực tiếp như một website bình thường.</p>
              </div>
            </div>
          </div>
        )}

        {/* LICENSE ADMIN PORTAL TAB */}
        {activeTab === 'license-admin' && (
          <div className="space-y-6">
            {!isAdminUnlocked ? (
              /* Màn Hình Đăng Nhập PIN Bảo Mật (Ảnh 2 - Tinh chỉnh gọn gàng, vừa mắt, chuẩn điện thoại) */
              <div className="max-w-sm mx-auto my-6 sm:my-10 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl text-center space-y-3.5 animate-in fade-in zoom-in-95">
                <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
                  <Lock className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Cổng Quản Trị Bản Quyền</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Khu vực bảo mật dành cho Quản trị viên quản lý cấp phép &amp; gia hạn
                  </p>
                </div>

                <form onSubmit={handleVerifyPin} className="space-y-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block text-left mb-1">
                      Khóa / Mật Khẩu Quản Trị:
                    </label>
                    <div className="relative">
                      <input
                        type={showPinPassword ? "text" : "password"}
                        maxLength={64}
                        value={adminPinInput}
                        onChange={(e) => setAdminPinInput(e.target.value)}
                        placeholder="Nhập khóa quản trị..."
                        className="w-full text-center tracking-wider text-sm sm:text-base font-mono font-bold bg-slate-950 border border-slate-700 rounded-lg px-9 py-2 sm:py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinPassword(!showPinPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition"
                        title={showPinPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showPinPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/25 transition flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    <Key className="w-4 h-4" />
                    <span>Mở Khóa Quản Trị</span>
                  </button>
                  <p className="text-[10.5px] text-slate-500 italic flex items-center justify-center gap-1.5">
                    <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Hệ thống bảo mật độc quyền. Quản trị viên sử dụng khóa bí mật để đăng nhập.</span>
                  </p>
                </form>
              </div>
            ) : (
              /* Giao Diện Quản Trị Đầy Đủ (Ảnh 1 - Tinh chỉnh cỡ chữ, hình ảnh chuẩn điện thoại, hiển thị nhiều nội dung) */
              <div className="space-y-3 sm:space-y-4">
                {/* Header & Thao Tác Nhanh */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-slate-900 border border-slate-800 p-2.5 sm:p-3.5 rounded-xl shadow-lg">
                  <div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Quản Trị Khách Hàng &amp; Duyệt Cấp Bản Quyền</span>
                      </h2>
                      <span className="text-[9.5px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                        API Online
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      Hệ thống tự động nhận đơn đề xuất mua &amp; Quản lý mã máy tính thiết bị
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm active:scale-98"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tạo Mã Mới</span>
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPinInput('');
                        setNewPinInput('');
                        setConfirmPinInput('');
                        setShowChangePinModal(true);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm active:scale-98"
                      title="Đổi mật khẩu / khóa quản trị"
                    >
                      <Key className="w-3 h-3 text-amber-400" />
                      <span>Đổi Mật Khẩu</span>
                    </button>
                    <button
                      onClick={() => fetchLicenses()}
                      disabled={isLoadingLicenses}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium transition flex items-center gap-1 border border-slate-700 active:scale-98"
                      title="Tải lại danh sách"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingLicenses ? 'animate-spin' : ''}`} />
                      <span>Làm mới</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsAdminUnlocked(false);
                        setAdminPinInput('');
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-200 rounded-lg text-[11px] font-medium transition border border-slate-700 flex items-center gap-1 active:scale-98"
                      title="Khóa lại giao diện quản trị"
                    >
                      <Lock className="w-3 h-3 text-rose-400" />
                      <span>Khóa Lại</span>
                    </button>
                  </div>
                </div>

                {/* 4 Thẻ Thống Kê Tổng Quan Gọn Gàng - Cỡ Chuẩn Điện Thoại & Desktop */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {/* Card 1: Đơn Mua Chờ Duyệt */}
                  <div className="bg-slate-900 border border-slate-800 p-2 sm:p-2.5 rounded-xl shadow">
                    <div className="flex items-center justify-between text-[10px] sm:text-[10.5px] text-slate-400 mb-0.5">
                      <span>Đơn Chờ Duyệt</span>
                      <Send className="w-3 h-3 text-sky-400" />
                    </div>
                    <div className="text-sm sm:text-base font-black text-sky-400 flex items-center gap-1">
                      <span>{adminOrders.filter((o) => o.status === 'pending').length}</span>
                      {adminOrders.filter((o) => o.status === 'pending').length > 0 && (
                        <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-1 py-0.2 rounded-full font-bold">
                          Cần duyệt
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">Yêu cầu từ tiện ích khách gửi</p>
                  </div>

                  {/* Card 2: Tổng Khách / Mã */}
                  <div className="bg-slate-900 border border-slate-800 p-2 sm:p-2.5 rounded-xl shadow">
                    <div className="flex items-center justify-between text-[10px] sm:text-[10.5px] text-slate-400 mb-0.5">
                      <span>Tổng Khách Hàng</span>
                      <Key className="w-3 h-3 text-blue-400" />
                    </div>
                    <div className="text-sm sm:text-base font-black text-white">
                      {licenses.length} <span className="text-[10px] font-normal text-slate-400">mã cấp</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">
                      {licenses.reduce((acc, curr) => acc + (curr.maxDevices || 1), 0)} máy được cấp phép
                    </p>
                  </div>

                  {/* Card 3: Máy đang dùng */}
                  <div className="bg-slate-900 border border-slate-800 p-2 sm:p-2.5 rounded-xl shadow">
                    <div className="flex items-center justify-between text-[10px] sm:text-[10.5px] text-slate-400 mb-0.5">
                      <span>Thiết Bị Kích Hoạt</span>
                      <Smartphone className="w-3 h-3 text-purple-400" />
                    </div>
                    <div className="text-sm sm:text-base font-black text-white">
                      {licenses.reduce((acc, curr) => acc + (curr.devices?.length || 0), 0)}{' '}
                      <span className="text-[10px] font-normal text-slate-400">
                        / {licenses.reduce((acc, curr) => acc + (curr.maxDevices || 1), 0)} máy
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">Tự động nhận theo Device ID</p>
                  </div>

                  {/* Card 4: Sắp hết hạn */}
                  <div className="bg-slate-900 border border-slate-800 p-2 sm:p-2.5 rounded-xl shadow">
                    <div className="flex items-center justify-between text-[10px] sm:text-[10.5px] text-slate-400 mb-0.5">
                      <span>Sắp Hết Hạn (&le; 7 ngày)</span>
                      <Clock className="w-3 h-3 text-amber-400" />
                    </div>
                    <div className="text-sm sm:text-base font-black text-amber-400">
                      {licenses.filter((l) => (l.daysLeft || 0) <= 7 && !l.isExpired && !l.isSuspended && !l.isRevoked).length}{' '}
                      <span className="text-[10px] font-normal text-slate-400">khách cần nhắc</span>
                    </div>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">Nhấp để xem và gia hạn</p>
                  </div>
                </div>

                {/* ================= KHỐI LỊCH SỬ THEO DÕI CẤP MÃ & GIA HẠN (MỞ / THU GỌN - MẶC ĐỊNH THU GỌN) ================= */}
                {(() => {
                  const filteredHist = historyList.filter((item) => {
                    if (historySearchName.trim() && !item.clientName.toLowerCase().includes(historySearchName.trim().toLowerCase())) {
                      return false;
                    }
                    if (historySearchPhone.trim() && (!item.phone || !item.phone.toLowerCase().includes(historySearchPhone.trim().toLowerCase()))) {
                      return false;
                    }
                    if (historySearchDeviceId.trim() && (!item.deviceId || !item.deviceId.toLowerCase().includes(historySearchDeviceId.trim().toLowerCase()))) {
                      return false;
                    }
                    if (historyFilterPkg !== 'all') {
                      const p = (item.pkgName || '').toUpperCase();
                      if (!p.includes(historyFilterPkg.toUpperCase())) return false;
                    }
                    if (historyFilterAction !== 'all' && item.action !== historyFilterAction) {
                      return false;
                    }
                    return true;
                  });

                  return (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all">
                      {/* Header Khối Lịch Sử: Có Chức Năng Mở / Thu Gọn (Mặc Định Là Thu Gọn) */}
                      <div
                        onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                        className="p-2 sm:p-3 bg-slate-950/90 hover:bg-slate-800/50 cursor-pointer transition flex items-center justify-between gap-2 select-none border-b border-slate-800/60"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                            <History className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1">
                                <span>Lịch Sử Cấp Mã &amp; Gia Hạn</span>
                              </h3>
                              <span className="text-[10px] bg-slate-800 text-emerald-400 border border-slate-700 px-1.5 py-0.2 rounded-full font-mono font-bold">
                                {historyList.length} lần
                              </span>
                              <span className="text-[9.5px] text-slate-400">
                                ({isHistoryExpanded ? 'Đang mở' : 'Mặc định: Thu gọn'})
                              </span>
                            </div>
                            <p className="text-[9.5px] sm:text-[10.5px] text-slate-400 mt-0.2">
                              Lịch sử theo dõi các lần cấp mã, gia hạn, duyệt đơn 1-click... Lọc theo SĐT, Tên, Mã máy, Gói
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-400 hidden sm:inline">
                            {isHistoryExpanded ? 'Thu gọn' : 'Mở xem lịch sử'}
                          </span>
                          <button
                            type="button"
                            className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                            title={isHistoryExpanded ? 'Thu gọn lịch sử' : 'Mở xem lịch sử'}
                          >
                            {isHistoryExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Nội Dung Bảng Lịch Sử Khi Mở Rộng */}
                      {isHistoryExpanded && (
                        <div className="p-2 sm:p-3 space-y-2.5 animate-in fade-in duration-150">
                          {/* Thanh Bộ Lọc Lịch Sử Đầy Đủ (SĐT, Tên, Mã Máy, Gói Cước) */}
                          <div className="bg-slate-950/70 p-2 sm:p-2.5 rounded-lg border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-[10.5px] sm:text-[11px] text-slate-300 font-semibold border-b border-slate-800/80 pb-1">
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Filter className="w-3 h-3" />
                                <span>Bộ Lọc Lịch Sử Theo Dõi</span>
                              </span>
                              {(historySearchName || historySearchPhone || historySearchDeviceId || historyFilterPkg !== 'all' || historyFilterAction !== 'all') && (
                                <button
                                  onClick={() => {
                                    setHistorySearchName('');
                                    setHistorySearchPhone('');
                                    setHistorySearchDeviceId('');
                                    setHistoryFilterPkg('all');
                                    setHistoryFilterAction('all');
                                  }}
                                  className="text-[10px] text-rose-400 hover:text-rose-300 transition underline underline-offset-2"
                                >
                                  Xóa lọc
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                              {/* 1. Lọc theo Tên */}
                              <div>
                                <input
                                  type="text"
                                  value={historySearchName}
                                  onChange={(e) => setHistorySearchName(e.target.value)}
                                  placeholder="🔍 Lọc theo Tên..."
                                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                                />
                              </div>

                              {/* 2. Lọc theo SĐT */}
                              <div>
                                <input
                                  type="text"
                                  value={historySearchPhone}
                                  onChange={(e) => setHistorySearchPhone(e.target.value)}
                                  placeholder="📞 Lọc theo SĐT..."
                                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                                />
                              </div>

                              {/* 3. Lọc theo Mã máy (Device ID) */}
                              <div>
                                <input
                                  type="text"
                                  value={historySearchDeviceId}
                                  onChange={(e) => setHistorySearchDeviceId(e.target.value)}
                                  placeholder="💻 Lọc theo Mã máy..."
                                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                                />
                              </div>

                              {/* 4. Lọc theo Gói cước (1TH, 3TH, 6TH, 1N...) */}
                              <div>
                                <select
                                  value={historyFilterPkg}
                                  onChange={(e) => setHistoryFilterPkg(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-emerald-500 font-medium"
                                >
                                  <option value="all">Tất cả gói</option>
                                  <option value="1TH">Gói 1 Tháng (1TH)</option>
                                  <option value="3TH">Gói 3 Tháng (3TH)</option>
                                  <option value="6TH">Gói 6 Tháng (6TH)</option>
                                  <option value="1N">Gói 1 Năm (1N)</option>
                                  <option value="TRIAL">Dùng Thử</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Bảng Hiển Thị Lịch Sử (Tối Ưu Điện Thoại & Desktop) */}
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            {isLoadingHistory && historyList.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                <span>Đang đồng bộ dữ liệu lịch sử...</span>
                              </div>
                            ) : filteredHist.length === 0 ? (
                              <div className="p-5 text-center text-slate-400 space-y-1">
                                <p className="text-xs font-semibold text-slate-300">Không tìm thấy bản ghi lịch sử nào phù hợp!</p>
                                <p className="text-[10px] text-slate-500">Hãy thử xóa bộ lọc hoặc tìm với từ khóa khác.</p>
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[9.5px] sm:text-[10px] uppercase tracking-wider">
                                  <tr>
                                    <th className="py-2 px-2.5 whitespace-nowrap">Thời Gian</th>
                                    <th className="py-2 px-2.5 whitespace-nowrap">Hành Động</th>
                                    <th className="py-2 px-2.5">Khách Hàng / SĐT</th>
                                    <th className="py-2 px-2.5 whitespace-nowrap">Mã Máy (Device ID)</th>
                                    <th className="py-2 px-2.5 whitespace-nowrap">Gói Cước</th>
                                    <th className="py-2 px-2.5">Mã Key &amp; Chi Tiết</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-[10.5px] sm:text-[11px]">
                                  {filteredHist.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                                      {/* Thời gian */}
                                      <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap text-slate-300">
                                        <div className="font-mono text-[10px] sm:text-[10.5px]">
                                          {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                                        </div>
                                        <div className="text-[9px] text-slate-500">
                                          {new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                      </td>

                                      {/* Hành động */}
                                      <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[9.5px] font-bold inline-flex items-center gap-1 ${
                                            item.action === 'create'
                                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                              : item.action === 'extend'
                                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                              : item.action === 'approve'
                                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                              : item.action === 'update_date'
                                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                              : item.action === 'regenerate'
                                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                              : item.action === 'revoke'
                                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                              : 'bg-slate-800 text-slate-300'
                                          }`}
                                        >
                                          {item.actionName || item.action}
                                        </span>
                                      </td>

                                      {/* Khách hàng / SĐT */}
                                      <td className="py-1.5 sm:py-2 px-2.5">
                                        <div className="font-semibold text-white truncate max-w-[150px] sm:max-w-none">{item.clientName}</div>
                                        {item.phone && (
                                          <div className="text-[9.5px] sm:text-[10px] text-slate-400 font-mono flex items-center gap-0.5 mt-0.5">
                                            <PhoneCall className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                            <span>{item.phone}</span>
                                          </div>
                                        )}
                                      </td>

                                      {/* Mã Máy */}
                                      <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                                        {item.deviceId ? (
                                          <span className="font-mono text-[9.5px] sm:text-[10px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700 text-sky-300">
                                            {item.deviceId}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-slate-500 italic">--</span>
                                        )}
                                      </td>

                                      {/* Gói Cước (1TH, 3TH, 6TH, 1N...) */}
                                      <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                                        <span className="font-bold text-[9.5px] sm:text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-mono">
                                          {item.pkgName || '1TH'}
                                        </span>
                                      </td>

                                      {/* Mã Bản Quyền & Chi tiết */}
                                      <td className="py-1.5 sm:py-2 px-2.5">
                                        <div className="flex items-center gap-1 font-mono text-[10px] sm:text-[10.5px] text-white">
                                          <span>{item.key}</span>
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(item.key);
                                              setCopiedKey(item.id);
                                              setTimeout(() => setCopiedKey(null), 2000);
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-white"
                                            title="Copy Key"
                                          >
                                            {copiedKey === item.id ? (
                                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                                            ) : (
                                              <Copy className="w-2.5 h-2.5" />
                                            )}
                                          </button>
                                        </div>
                                        {item.notes && (
                                          <div className="text-[9px] sm:text-[9.5px] text-slate-400 mt-0.5 max-w-[220px] truncate" title={item.notes}>
                                            {item.notes}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                    {/* BẢNG QUẢN LÝ THỐNG NHẤT BẢN QUYỀN & ĐƠN ĐẶT MUA (ALL-IN-ONE TABLE) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                  {/* Thanh Tiêu Đề & Tìm Kiếm Nhanh */}
                  <div className="p-3 sm:px-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span>Bảng Quản Lý Khách Hàng &amp; Đơn Đặt Mua</span>
                        <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full font-bold">
                          {licenses.length + adminOrders.filter((o) => o.status === 'pending').length} Tổng số
                        </span>
                        {adminOrders.filter((o) => o.status === 'pending').length > 0 && (
                          <span className="text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-2 py-0.2 rounded-full font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>
                            {adminOrders.filter((o) => o.status === 'pending').length} Chờ Duyệt
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tất cả đơn đặt mua tự động và mã bản quyền được quản lý tập trung trong một bảng duy nhất
                      </p>
                    </div>

                    {/* Ô Tìm Kiếm Nhanh */}
                    <div className="relative min-w-[220px] max-w-sm">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={adminSearch}
                        onChange={(e) => setAdminSearch(e.target.value)}
                        placeholder="Tìm tên khách, SĐT, mã key, mã đơn..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      {adminSearch && (
                        <button
                          onClick={() => setAdminSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          title="Xóa tìm kiếm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Thanh Bộ Lọc Trạng Thái Nhanh */}
                  {(() => {
                    const pendingCount = adminOrders.filter((o) => o.status === 'pending').length;
                    const activeCount = licenses.filter((l) => !l.isExpired && !l.isSuspended && !l.isRevoked).length;
                    const warningCount = licenses.filter((l) => (l.daysLeft || 0) <= 7 && !l.isExpired && !l.isSuspended && !l.isRevoked).length;
                    const expiredCount = licenses.filter((l) => l.isExpired && !l.isRevoked).length;
                    const suspendedCount = licenses.filter((l) => l.isSuspended && !l.isRevoked).length;
                    const revokedCount = licenses.filter((l) => l.isRevoked).length;
                    const totalCount = licenses.length + pendingCount;

                    return (
                      <div className="px-3 py-1.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center gap-1 flex-wrap text-xs">
                        <span className="text-slate-400 font-semibold mr-1 flex items-center gap-1 text-[10.5px]">
                          <Filter className="w-3 h-3 text-slate-400" />
                          Lọc:
                        </span>
                        <button
                          onClick={() => setAdminFilter('all')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'all'
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          Tất Cả ({totalCount})
                        </button>
                        <button
                          onClick={() => setAdminFilter('pending')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition flex items-center gap-1 ${
                            adminFilter === 'pending'
                              ? 'bg-sky-600 text-white font-bold'
                              : 'bg-slate-900 text-sky-400 hover:text-white border border-sky-500/30'
                          }`}
                        >
                          <span>🔔 Chờ Duyệt ({pendingCount})</span>
                          {pendingCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>}
                        </button>
                        <button
                          onClick={() => setAdminFilter('active')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'active'
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          ✓ Đang Dùng ({activeCount})
                        </button>
                        <button
                          onClick={() => setAdminFilter('warning')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'warning'
                              ? 'bg-amber-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          ⏳ Sắp Hết ({warningCount})
                        </button>
                        <button
                          onClick={() => setAdminFilter('expired')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'expired'
                              ? 'bg-rose-600 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          🚨 Hết Hạn ({expiredCount})
                        </button>
                        <button
                          onClick={() => setAdminFilter('suspended')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'suspended'
                              ? 'bg-amber-700 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          ⏸️ Tạm Khóa ({suspendedCount})
                        </button>
                        <button
                          onClick={() => setAdminFilter('revoked')}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
                            adminFilter === 'revoked'
                              ? 'bg-rose-800 text-white font-bold'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          🚫 Đã Thu Hồi ({revokedCount})
                        </button>
                      </div>
                    );
                  })()}

                  {/* Bảng Hiển Thị Vừa Vặn - Dễ Nhìn, Gọn Gàng, Thông Tin Bao Quát */}
                  <div className="overflow-x-auto">
                    {(() => {
                      const q = adminSearch.trim().toLowerCase();

                      // 1. Lọc đơn hàng chờ duyệt
                      const filteredOrders = adminOrders
                        .filter((o) => o.status === 'pending')
                        .filter((ord) => {
                          const matchQ =
                            !q ||
                            (ord.clientName && ord.clientName.toLowerCase().includes(q)) ||
                            (ord.phone && ord.phone.toLowerCase().includes(q)) ||
                            (ord.pkgName && ord.pkgName.toLowerCase().includes(q)) ||
                            (ord.note && ord.note.toLowerCase().includes(q)) ||
                            ord.id.toLowerCase().includes(q);

                          if (!matchQ) return false;
                          if (adminFilter === 'all' || adminFilter === 'pending') return true;
                          return false;
                        });

                      // 2. Lọc danh sách bản quyền
                      const filteredLicenses = licenses.filter((lic) => {
                        const matchQ =
                          !q ||
                          lic.key.toLowerCase().includes(q) ||
                          lic.clientName.toLowerCase().includes(q) ||
                          (lic.phone && lic.phone.toLowerCase().includes(q)) ||
                          (lic.notes && lic.notes.toLowerCase().includes(q));

                        if (!matchQ) return false;
                        if (adminFilter === 'pending') return false;
                        if (adminFilter === 'all') return true;
                        if (adminFilter === 'revoked') return lic.isRevoked;
                        if (adminFilter === 'suspended') return lic.isSuspended && !lic.isRevoked;
                        if (adminFilter === 'expired') return lic.isExpired && !lic.isRevoked;
                        if (adminFilter === 'warning')
                          return (lic.daysLeft || 0) <= 7 && !lic.isExpired && !lic.isSuspended && !lic.isRevoked;
                        if (adminFilter === 'active') return !lic.isExpired && !lic.isSuspended && !lic.isRevoked;
                        return true;
                      });

                      const totalFilteredRows = filteredOrders.length + filteredLicenses.length;

                      if (totalFilteredRows === 0) {
                        return (
                          <div className="p-8 text-center text-slate-400 space-y-1.5">
                            <p className="text-xs font-semibold text-slate-300">Không tìm thấy bản ghi nào phù hợp!</p>
                            <p className="text-[11px] text-slate-500">Hãy thử xóa bộ lọc hoặc đổi từ khóa tìm kiếm.</p>
                            <button
                              onClick={() => {
                                setAdminSearch('');
                                setAdminFilter('all');
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg transition"
                            >
                              Xóa Bộ Lọc
                            </button>
                          </div>
                        );
                      }

                      return (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[10px] sm:text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">Mã Định Danh / Key</th>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3">Khách Hàng / Đơn Vị</th>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">Gói &amp; Mã Máy (Device ID)</th>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">Thời Gian / Hạn Dùng</th>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3 whitespace-nowrap">Trạng Thái</th>
                              <th className="py-2 sm:py-2.5 px-2 sm:px-3 text-right whitespace-nowrap">Thao Tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80">
                            {/* Danh Sách Đơn Đặt Mua Mới (Chờ Duyệt - Ưu tiên hiện trên cùng) */}
                            {filteredOrders.map((ord) => (
                              <tr
                                key={ord.id}
                                onClick={() =>
                                  setEditingOrder({
                                    id: ord.id,
                                    clientName: ord.clientName || '',
                                    phone: ord.phone || '',
                                    pkgName: ord.pkgName || 'Gói 1 Tháng (30 ngày)',
                                    price: ord.price || '1.000.000đ',
                                    deviceId: ord.deviceId || '',
                                    note: ord.note || '',
                                    status: ord.status || 'pending',
                                  })
                                }
                                className="bg-sky-950/20 hover:bg-sky-900/30 cursor-pointer transition group border-l-4 border-l-sky-500"
                                title="Nhấp để chỉnh sửa thông tin đơn đặt mua và đồng bộ lịch sử"
                              >
                                {/* Cột 1: Mã Đơn */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-sky-300 bg-sky-950/90 px-1.5 sm:px-2 py-0.5 rounded border border-sky-500/40 text-[10px] sm:text-[11px]">
                                      {ord.id.slice(-8).toUpperCase()}
                                    </span>
                                    {ord.price === '0đ' || ord.pkgName?.includes('Dùng Thử') ? (
                                      <span className="text-[9px] sm:text-[9.5px] bg-purple-500/20 text-purple-300 border border-purple-500/40 px-1.5 py-0.2 rounded font-bold uppercase">
                                        🎁 DÙNG THỬ 0Đ
                                      </span>
                                    ) : (
                                      <span className="text-[9px] sm:text-[9.5px] bg-sky-500/20 text-sky-300 px-1.5 py-0.2 rounded font-bold uppercase">
                                        Đơn Mới
                                      </span>
                                    )}
                                  </div>
                                  {ord.note && (
                                    <p className="text-[9.5px] sm:text-[10px] text-slate-400 mt-0.5 max-w-[180px] sm:max-w-[200px] truncate" title={ord.note}>
                                      {ord.note}
                                    </p>
                                  )}
                                </td>

                                {/* Cột 2: Khách Hàng */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3">
                                  <div className="font-bold text-white text-[11px] sm:text-xs">
                                    {ord.clientName || 'Khách Web'}
                                  </div>
                                  {ord.phone && (
                                    <div className="text-[10px] sm:text-[10.5px] text-sky-400 flex items-center gap-1 mt-0.5 font-mono">
                                      <PhoneCall className="w-2.5 h-2.5 text-sky-400" />
                                      <span>{ord.phone}</span>
                                    </div>
                                  )}
                                </td>

                                {/* Cột 3: Gói & Mã Thiết Bị tự động (Device ID) */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                  <div className="font-bold text-emerald-400 text-[11px] sm:text-xs">
                                    {ord.pkgName} • <span className="text-white">{ord.price}</span>
                                  </div>
                                  <div className="text-[9.5px] sm:text-[10px] text-sky-300 mt-0.5 flex items-center gap-1 font-mono">
                                    <Cpu className="w-3 h-3 text-sky-400 shrink-0" />
                                    <span>Mã máy: <strong className="text-sky-200 bg-sky-950 px-1 py-0.2 rounded border border-sky-500/30">{ord.deviceId || 'Tự động lấy'}</strong></span>
                                  </div>
                                </td>

                                {/* Cột 4: Thời Gian */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                  <div className="text-slate-300 text-[10.5px] sm:text-xs font-mono">
                                    {new Date(ord.createdAt).toLocaleDateString('vi-VN')}
                                  </div>
                                  <div className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5">
                                    {new Date(ord.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </td>

                                {/* Cột 5: Trạng Thái */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold text-[9.5px] sm:text-[10px] inline-flex items-center gap-1.5 shadow-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block"></span>
                                    <span>Chờ Duyệt Đơn</span>
                                  </span>
                                </td>

                                {/* Cột 6: Thao Tác Trực Tiếp */}
                                <td className="py-1.5 sm:py-2 px-2 sm:px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleApproveOrder(ord.id)}
                                      className={`px-2 sm:px-2.5 py-1 text-white rounded-lg text-[10.5px] sm:text-[11px] font-bold transition shadow-sm active:scale-95 flex items-center gap-1 ${
                                        ord.price === '0đ' || ord.pkgName?.includes('Dùng Thử')
                                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500'
                                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                                      }`}
                                      title={ord.price === '0đ' || ord.pkgName?.includes('Dùng Thử') ? 'Duyệt đơn và cấp Key Dùng Thử 1 ngày (20 bài) 1-Click' : 'Duyệt đơn và tự động cấp mã Key 1-Click'}
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>
                                        {ord.price === '0đ' || ord.pkgName?.includes('Dùng Thử') ? 'Cấp Key Dùng Thử 1N' : 'Cấp Mã Ngay'}
                                      </span>
                                    </button>

                                    <button
                                      onClick={() =>
                                        setEditingOrder({
                                          id: ord.id,
                                          clientName: ord.clientName || '',
                                          phone: ord.phone || '',
                                          pkgName: ord.pkgName || 'Gói 1 Tháng (30 ngày)',
                                          price: ord.price || '1.000.000đ',
                                          deviceId: ord.deviceId || '',
                                          note: ord.note || '',
                                          status: ord.status || 'pending',
                                        })
                                      }
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded-lg text-[10.5px] sm:text-[11px] font-semibold transition border border-slate-700 flex items-center gap-1 active:scale-95"
                                      title="Chỉnh sửa thông tin đơn đặt mua và đồng bộ lịch sử"
                                    >
                                      <Edit3 className="w-3 h-3 text-sky-400" />
                                      <span>Sửa Đơn</span>
                                    </button>

                                    <button
                                      onClick={() => handleDeleteOrder(ord.id, ord.clientName || 'Khách đặt mua')}
                                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition border border-slate-800 hover:border-rose-500/30 active:scale-95"
                                      title="Xóa đơn hàng này khỏi danh sách"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}

                            {/* Danh Sách Bản Quyền Khách Hàng */}
                            {filteredLicenses.map((lic) => {
                              const isTeam = lic.planType === 'team';
                              const isTrial = lic.planType === 'trial';
                              const activeDevices = lic.devices?.length || 0;
                              const isWarning = (lic.daysLeft || 0) <= 7 && !lic.isExpired && !lic.isSuspended && !lic.isRevoked;

                              return (
                                <tr
                                  key={lic.id}
                                  onClick={() => openActionModal(lic)}
                                  className="hover:bg-slate-800/40 cursor-pointer transition group"
                                  title="Nhấp để mở Hộp thoại thao tác chi tiết"
                                >
                                  {/* Cột 1: Mã Key & Ghi chú */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3">
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <span className="font-mono font-bold text-white bg-slate-950 px-1.5 sm:px-2 py-0.5 rounded border border-slate-800 group-hover:border-emerald-500/40 text-[10px] sm:text-[11px] transition">
                                        {lic.key}
                                      </span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(lic.key);
                                          setCopiedKey(lic.id);
                                          setTimeout(() => setCopiedKey(null), 2000);
                                        }}
                                        className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                                        title="Copy mã Key"
                                      >
                                        {copiedKey === lic.id ? (
                                          <Check className="w-3 h-3 text-emerald-400" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                    {lic.notes && (
                                      <p className="text-[9.5px] sm:text-[10px] text-slate-500 mt-0.5 max-w-[180px] sm:max-w-[200px] truncate" title={lic.notes}>
                                        {lic.notes}
                                      </p>
                                    )}
                                  </td>

                                  {/* Cột 2: Khách hàng */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3">
                                    <div className="font-semibold text-slate-200 text-[11px] sm:text-xs group-hover:text-emerald-300 transition">
                                      {lic.clientName}
                                    </div>
                                    {lic.phone && (
                                      <div className="text-[10px] sm:text-[10.5px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                                        <PhoneCall className="w-2.5 h-2.5 text-slate-500" />
                                        <span>{lic.phone}</span>
                                      </div>
                                    )}
                                  </td>

                                  {/* Cột 3: Gói & Thiết bị */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      <span
                                        className={`px-1.5 py-0.2 rounded font-bold text-[9px] sm:text-[9.5px] ${
                                          isTeam
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            : isTrial
                                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        }`}
                                      >
                                        {isTeam ? 'Doanh Nghiệp' : isTrial ? 'Dùng Thử' : 'Cá Nhân'}
                                      </span>
                                    </div>
                                    <div className="text-[9.5px] sm:text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-1">
                                      <Smartphone className="w-2.5 h-2.5 text-slate-500" />
                                      <span>
                                        {activeDevices}/{lic.maxDevices} máy
                                      </span>
                                    </div>
                                  </td>

                                  {/* Cột 4: Hạn sử dụng */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                    <div className="font-semibold text-slate-200 text-[10.5px] sm:text-xs font-mono">
                                      {new Date(lic.expiresAt).toLocaleDateString('vi-VN')}
                                    </div>
                                    <div
                                      className={`text-[9.5px] sm:text-[10px] font-bold mt-0.5 ${
                                        lic.isExpired
                                          ? 'text-rose-400'
                                          : isWarning
                                          ? 'text-amber-400'
                                          : 'text-emerald-400'
                                      }`}
                                    >
                                      {lic.isExpired ? 'Đã hết hạn' : `Còn ${lic.daysLeft} ngày`}
                                    </div>
                                  </td>

                                  {/* Cột 5: Trạng thái */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap">
                                    {lic.isRevoked ? (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-600/30 text-rose-300 border border-rose-500 font-bold text-[9px] sm:text-[9.5px] inline-flex items-center gap-0.5">
                                        🚫 Thu Hồi
                                      </span>
                                    ) : lic.isSuspended ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[9px] sm:text-[9.5px]">
                                        ⏸️ Đang Khóa
                                      </span>
                                    ) : lic.isExpired ? (
                                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-[9px] sm:text-[9.5px]">
                                        🚨 Hết Hạn
                                      </span>
                                    ) : isWarning ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[9px] sm:text-[9.5px]">
                                        ⏳ Sắp Hết
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[9px] sm:text-[9.5px]">
                                        ✓ Hoạt Động
                                      </span>
                                    )}
                                  </td>

                                  {/* Cột 6: Nút Thao Tác Gọn Gàng */}
                                  <td className="py-1.5 sm:py-2 px-2 sm:px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                      {/* Nút chính: Mở Hộp thoại Quản Lý Toàn Diện */}
                                      <button
                                        onClick={() => openActionModal(lic)}
                                        className="px-2 sm:px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10.5px] sm:text-[11px] font-bold transition flex items-center gap-1 shadow-sm active:scale-95"
                                        title="Mở hộp thoại thao tác: Gia hạn, sửa ngày, đổi mã, ngắt máy..."
                                      >
                                        <SlidersHorizontal className="w-3 h-3" />
                                        <span>Quản Lý</span>
                                      </button>

                                      {/* Nút phụ: Copy nhanh link 1-Click */}
                                      <button
                                        onClick={() => handleCopyOneClickLink(lic.key)}
                                        className="px-1.5 sm:px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-[10.5px] sm:text-[11px] font-medium transition flex items-center gap-0.5 active:scale-95"
                                        title="Copy link kích hoạt 1-click gửi khách"
                                      >
                                        <Share2 className="w-3 h-3 text-indigo-400" />
                                        <span>{copiedLinkKey === lic.key ? '✓ Xong' : 'Link'}</span>
                                      </button>

                                      {/* Nút Xóa Trực Tiếp Trên Từng Hàng */}
                                      <button
                                        onClick={() => handleDeleteLicense(lic.id, lic.key, lic.clientName)}
                                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition border border-slate-800 hover:border-rose-500/30 active:scale-95"
                                        title="Xóa mã bản quyền này khỏi danh sách"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>

                {/* HỘP THOẠI QUẢN LÝ KHÁCH HÀNG (ACTION MODAL DIALOG) - THIẾT KẾ GỌN GÀNG, CHUẨN WEB & ĐIỆN THOẠI */}
                {actionModalLicense && (
                  <div
                    className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
                    onClick={() => setActionModalLicense(null)}
                  >
                    <div
                      className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* 1. Modal Header Cố Định - Cỡ chữ chuẩn */}
                      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center shrink-0">
                            <Settings className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm sm:text-base font-bold text-white">
                                {actionModalLicense.clientName}
                              </h3>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  actionModalLicense.isRevoked
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : actionModalLicense.isSuspended
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : actionModalLicense.isExpired
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {actionModalLicense.isRevoked
                                  ? '🚫 Đã Thu Hồi'
                                  : actionModalLicense.isSuspended
                                  ? '⏸️ Đang Khóa'
                                  : actionModalLicense.isExpired
                                  ? '🚨 Hết Hạn'
                                  : '✓ Đang Dùng'}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-slate-400">
                              Quản trị bản quyền • Đồng bộ tức thì với Chrome Extension
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setActionModalLicense(null)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0"
                          title="Đóng hộp thoại"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* 2. Thẻ Tóm Tắt Thông Tin Tổng Quan (4 Thẻ Ngang Gọn Gàng) */}
                      <div className="bg-slate-950/70 px-3.5 py-2 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0 text-xs">
                        {/* Thẻ 1: Mã Key */}
                        <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Mã Bản Quyền</span>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold text-white truncate">
                              {actionModalLicense.key}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(actionModalLicense.key);
                                setCopiedKey(actionModalLicense.id);
                                setTimeout(() => setCopiedKey(null), 2000);
                              }}
                              className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition shrink-0"
                              title="Sao chép Key"
                            >
                              {copiedKey === actionModalLicense.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Thẻ 2: Hạn sử dụng */}
                        <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Hạn Sử Dụng</span>
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{new Date(actionModalLicense.expiresAt).toLocaleDateString('vi-VN')}</span>
                          </div>
                          <span
                            className={`text-[10px] font-bold block ${
                              actionModalLicense.isExpired
                                ? 'text-rose-400'
                                : (actionModalLicense.daysLeft || 0) <= 7
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {actionModalLicense.isExpired ? 'Hết hạn' : `Còn ${actionModalLicense.daysLeft} ngày`}
                          </span>
                        </div>

                        {/* Thẻ 3: Gói & Máy */}
                        <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Gói &amp; Thiết Bị</span>
                          <div className="text-xs font-bold text-slate-200">
                            {actionModalLicense.planType === 'team' ? 'Doanh Nghiệp' : 'Cá Nhân'}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Smartphone className="w-2.5 h-2.5 text-slate-500" />
                            <span>{actionModalLicense.devices?.length || 0}/{actionModalLicense.maxDevices} máy</span>
                          </div>
                        </div>

                        {/* Thẻ 4: Liên hệ */}
                        <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase block">Khách Hàng</span>
                          <div className="text-xs font-bold text-slate-200 truncate">
                            {actionModalLicense.phone || 'Chưa có SĐT'}
                          </div>
                          <span className="text-[10px] text-slate-500 truncate block">
                            {actionModalLicense.notes || 'Không có ghi chú'}
                          </span>
                        </div>
                      </div>

                      {/* 3. Thân Modal - Bố Cục Khoa Học & Cỡ Chữ Chuẩn */}
                      <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* ================= CỘT TRÁI: GIA HẠN & SỬA THỜI HẠN ================= */}
                          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-3 flex flex-col justify-between">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>1. Gia Hạn Nhanh (Giữ Nguyên Mã)</span>
                                </h4>
                                <span className="text-[10px] text-slate-400">+ ngày dồn</span>
                              </div>

                              {/* 4 Nút Gia Hạn Cỡ Gọn Gàng Chuẩn Web & Mobile */}
                              <div className="grid grid-cols-4 gap-1.5">
                                <button
                                  onClick={() => handleExtendLicense(actionModalLicense.id, 30)}
                                  className="py-1.5 px-1 bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition flex flex-col items-center justify-center active:scale-95"
                                >
                                  <span className="text-xs font-bold">+1 Tháng</span>
                                  <span className="text-[9.5px] text-emerald-400/80">+30n</span>
                                </button>
                                <button
                                  onClick={() => handleExtendLicense(actionModalLicense.id, 90)}
                                  className="py-1.5 px-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg transition flex flex-col items-center justify-center active:scale-95"
                                >
                                  <span className="text-xs font-bold">+3 Tháng</span>
                                  <span className="text-[9.5px] text-emerald-400/80">+90n</span>
                                </button>
                                <button
                                  onClick={() => handleExtendLicense(actionModalLicense.id, 180)}
                                  className="py-1.5 px-1 bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/50 rounded-lg transition flex flex-col items-center justify-center active:scale-95"
                                >
                                  <span className="text-xs font-bold">+6 Tháng</span>
                                  <span className="text-[9.5px] text-emerald-300/80">+180n</span>
                                </button>
                                <button
                                  onClick={() => handleExtendLicense(actionModalLicense.id, 365)}
                                  className="py-1.5 px-1 bg-emerald-600/35 hover:bg-emerald-600/50 text-white border border-emerald-400/50 rounded-lg transition flex flex-col items-center justify-center active:scale-95"
                                >
                                  <span className="text-xs font-bold">+1 Năm</span>
                                  <span className="text-[9.5px] text-emerald-200/80">+365n</span>
                                </button>
                              </div>

                              {/* Cộng Ngày Tùy Ý */}
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-xs text-slate-300 font-medium whitespace-nowrap">
                                  Cộng thêm:
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  max="1000"
                                  value={actionCustomDays}
                                  onChange={(e) => setActionCustomDays(parseInt(e.target.value, 10) || 1)}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center font-bold focus:outline-none focus:border-emerald-500"
                                />
                                <span className="text-xs text-slate-400">ngày</span>
                                <button
                                  onClick={() => handleExtendLicense(actionModalLicense.id, actionCustomDays)}
                                  className="ml-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95"
                                >
                                  Cộng Thêm
                                </button>
                              </div>
                            </div>

                            {/* SỬA TRỰC TIẾP NGÀY HẾT HẠN (DATE PICKER) */}
                            <div className="pt-2 border-t border-slate-800 space-y-1.5">
                              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                                <span className="flex items-center gap-1 text-indigo-300">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>2. Sửa Trực Tiếp Ngày Hết Hạn:</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">Tùy ý tăng/giảm lùi ngày</span>
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={actionEditDate}
                                  onChange={(e) => setActionEditDate(e.target.value)}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                                />
                                <button
                                  onClick={handleUpdateDirectDate}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap active:scale-95"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Lưu Ngày</span>
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-400 italic">
                                * Khắc phục khi cấp nhầm thời hạn hoặc muốn rút ngắn ngày dùng.
                              </p>
                            </div>
                          </div>

                          {/* ================= CỘT PHẢI: TIỆN ÍCH GỬI KHÁCH & THIẾT BỊ ================= */}
                          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl space-y-3 flex flex-col justify-between">
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wide flex items-center gap-1.5">
                                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>3. Tiện Ích Gửi Khách Hàng</span>
                                </h4>
                                <span className="text-[10px] text-emerald-400 font-medium">1-Click nạp ngay</span>
                              </div>

                              {/* Link 1-Click gọn gàng */}
                              <div className="space-y-1">
                                <span className="text-xs font-semibold text-slate-300 block">
                                  Link Kích Hoạt Tự Động (1-Click):
                                </span>
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    readOnly
                                    value={`${window.location.origin}/?kich_hoat=${encodeURIComponent(actionModalLicense.key)}`}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300 font-mono select-all focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleCopyOneClickLink(actionModalLicense.key)}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 whitespace-nowrap active:scale-95"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>{copiedLinkKey === actionModalLicense.key ? '✓ Xong' : 'Copy'}</span>
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  Gửi qua Zalo/FB: khách mở link là tiện ích tự kích hoạt không cần gõ mã.
                                </p>
                              </div>

                              {/* 3 Nút Thao Tác Tiện Lợi */}
                              <div className="space-y-1.5 pt-0.5">
                                <button
                                  onClick={() => handleCopyStoreHandoverTemplate(actionModalLicense)}
                                  className="w-full p-2 bg-gradient-to-r from-teal-600/25 to-emerald-600/25 hover:from-teal-600/35 hover:to-emerald-600/35 text-teal-300 border border-teal-500/40 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                                  title="Copy mẫu tin nhắn Zalo kèm Link Edge Store chính thức + Link tự động kích hoạt 1-Click"
                                >
                                  <Globe className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                  <span className="truncate">
                                    {copiedHandoverMsg === actionModalLicense.id ? '✓ Đã Copy Mẫu Bàn Giao' : 'Mẫu Gửi Khách (Kèm Link Edge Store)'}
                                  </span>
                                </button>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    onClick={() => handleCopyZaloTemplate(actionModalLicense)}
                                    className="p-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95"
                                    title="Copy mẫu tin nhắn Zalo kèm thông tin thanh toán MBBank"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span className="truncate">{copiedZaloMsg === actionModalLicense.id ? '✓ Đã Copy' : 'Mẫu Nhắc Tiền'}</span>
                                  </button>

                                  <button
                                    onClick={() =>
                                      handleRegenerateKey(actionModalLicense.id, actionModalLicense.clientName, actionModalLicense.key)
                                    }
                                    className="p-2 bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95"
                                    title="Cấp đổi sang mã mới toanh (Hủy mã cũ, giữ nguyên số ngày sử dụng còn lại)"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="truncate">Đổi Sang Mã Mới</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Quản lý thiết bị máy tính */}
                            <div className="pt-2 border-t border-slate-800 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                                  <Laptop className="w-3.5 h-3.5 text-sky-400" />
                                  <span>4. Thiết Bị ({actionModalLicense.devices?.length || 0}/{actionModalLicense.maxDevices} máy)</span>
                                </h4>
                                <button
                                  onClick={() => handleResetDevices(actionModalLicense.id)}
                                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10.5px] font-semibold transition border border-slate-700 active:scale-95"
                                >
                                  Reset Máy
                                </button>
                              </div>

                              {(!actionModalLicense.devices || actionModalLicense.devices.length === 0) ? (
                                <p className="text-[10.5px] text-slate-500 italic bg-slate-900/60 p-1.5 rounded-lg border border-slate-800/80">
                                  Chưa có máy tính nào kích hoạt. Khách có thể nhập mã bình thường.
                                </p>
                              ) : (
                                <div className="space-y-1 max-h-20 overflow-y-auto">
                                  {actionModalLicense.devices.map((d, idx) => (
                                    <div
                                      key={idx}
                                      className="bg-slate-900 p-1.5 rounded-md border border-slate-800 flex items-center justify-between text-[11px]"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <Smartphone className="w-3 h-3 text-slate-400" />
                                        <span className="font-semibold text-slate-200">
                                          {d.deviceName || `Máy ${idx + 1}`}
                                        </span>
                                        <span className="font-mono text-[9.5px] text-slate-500">
                                          ({d.deviceId.slice(-6)})
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(d.activatedAt).toLocaleDateString('vi-VN')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 4. Modal Footer Cố Định - Cỡ chữ chuẩn, thao tác nhanh */}
                      <div className="px-3.5 py-2.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        {/* Nhóm nút bảo mật & khẩn cấp */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Tạm khóa / Mở khóa */}
                          <button
                            onClick={() => handleToggleLicense(actionModalLicense.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 ${
                              actionModalLicense.isSuspended
                                ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/50'
                                : 'bg-amber-600/30 text-amber-300 border border-amber-500/40 hover:bg-amber-600/50'
                            }`}
                          >
                            {actionModalLicense.isSuspended ? (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Mở Khóa</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>Tạm Khóa</span>
                              </>
                            )}
                          </button>

                          {/* Thu hồi khẩn cấp / Mở lại */}
                          {actionModalLicense.isRevoked ? (
                            <button
                              onClick={() => handleUnrevokeLicense(actionModalLicense.id, actionModalLicense.clientName)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Khôi Phục Quyền</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevokeLicense(actionModalLicense.id, actionModalLicense.clientName)}
                              className="px-2.5 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95"
                              title="Ngắt kết nối ngay lập tức toàn bộ máy tính của khách"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>🚫 Thu Hồi (Ngắt Máy)</span>
                            </button>
                          )}

                          {/* Xóa vĩnh viễn */}
                          <button
                            onClick={() => handleDeleteLicense(actionModalLicense.id, actionModalLicense.key, actionModalLicense.clientName)}
                            className="px-2 py-1.5 bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-lg text-xs font-medium transition border border-slate-800 flex items-center gap-1 active:scale-95"
                            title="Xóa hẳn bản ghi này khỏi hệ thống"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        </div>

                        {/* Nút Đóng */}
                        <button
                          onClick={() => setActionModalLicense(null)}
                          className="ml-auto px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition active:scale-95"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* HỘP THOẠI XÁC NHẬN XÓA TỰ TẠO (CUSTOM IN-APP DELETE MODAL - CHỐNG BỊ CHẶN BỞI IFRAME) */}
                {deleteConfirmItem && (
                  <div
                    className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
                    onClick={() => setDeleteConfirmItem(null)}
                  >
                    <div
                      className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800 pb-3">
                        <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center shrink-0">
                          <Trash2 className="w-5 h-5 text-rose-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Xác Nhận Xóa Khỏi Danh Sách</h3>
                          <p className="text-[11px] text-slate-400">
                            {deleteConfirmItem.type === 'order' ? 'Xóa đơn đặt mua gói bản quyền' : 'Xóa mã bản quyền khách hàng'}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                        <div className="text-slate-300">
                          Bạn có chắc chắn muốn xóa bản ghi của khách hàng:
                        </div>
                        <div className="text-white font-bold text-sm text-emerald-400">
                          {deleteConfirmItem.name}
                        </div>
                        <div className="font-mono text-slate-400 text-[11px] flex items-center gap-1.5 pt-0.5">
                          <span>Mã:</span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded text-white border border-slate-700">
                            {deleteConfirmItem.keyOrCode}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-rose-400/90 pt-1 italic">
                          ⚠️ Thao tác này sẽ xóa vĩnh viễn dữ liệu và không thể hoàn tác!
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setDeleteConfirmItem(null)}
                          disabled={isDeletingItem}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition active:scale-95"
                        >
                          Hủy Bỏ
                        </button>
                        <button
                          onClick={handleExecuteDelete}
                          disabled={isDeletingItem}
                          className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-900/40 active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isDeletingItem ? 'Đang xóa...' : 'Xác Nhận Xóa'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* THÔNG BÁO TOAST THAO TÁC XÓA / THÀNH CÔNG */}
                {actionToast && (
                  <div className="fixed bottom-5 right-5 z-[110] bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-3 border border-emerald-400/40">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{actionToast}</span>
                  </div>
                )}

                {/* MODAL CHỈNH SỬA & CẬP NHẬT ĐƠN ĐẶT MUA - ĐỒNG BỘ LỊCH SỬ TỨC THÌ */}
                {editingOrder && (
                  <div
                    className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
                    onClick={() => setEditingOrder(null)}
                  >
                    <div
                      className="bg-slate-900 border border-sky-500/40 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                            <Edit3 className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                              <span>Chỉnh Sửa Đơn Đặt Mua</span>
                              <span className="font-mono text-xs text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-500/30">
                                #{editingOrder.id.slice(-8).toUpperCase()}
                              </span>
                            </h3>
                            <p className="text-[10.5px] text-slate-400">
                              Cập nhật thông tin khách hàng, gói cước và đồng bộ ngay vào Lịch sử
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingOrder(null)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Form Body */}
                      <form onSubmit={handleSaveOrderUpdate} className="p-4 overflow-y-auto space-y-3.5 text-xs">
                        {/* Tên khách hàng */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                            Tên Khách Hàng / Đơn Vị: <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={editingOrder.clientName}
                            onChange={(e) => setEditingOrder({ ...editingOrder, clientName: e.target.value })}
                            placeholder="VD: Anh Long (hoặc Công ty...)"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        {/* Số điện thoại / Zalo */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                            Số Điện Thoại / Zalo Nhận Mã: <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={editingOrder.phone}
                            onChange={(e) => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                            placeholder="VD: 0869029310"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        {/* Chọn gói cước */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                            Gói Bản Quyền:
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 mb-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrder({
                                  ...editingOrder,
                                  pkgName: 'Gói Dùng Thử (1 ngày)',
                                  price: '0đ',
                                })
                              }
                              className={`p-1.5 rounded-lg border text-left transition ${
                                editingOrder.pkgName.includes('Dùng Thử') || editingOrder.price === '0đ'
                                  ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold text-[11px]">Dùng Thử (1N)</div>
                              <div className="text-[10px] text-purple-400">0đ (20 bài)</div>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrder({
                                  ...editingOrder,
                                  pkgName: 'Gói 1 Tháng (30 ngày)',
                                  price: '1.000.000đ',
                                })
                              }
                              className={`p-1.5 rounded-lg border text-left transition ${
                                (editingOrder.pkgName.includes('1 Tháng') || editingOrder.pkgName.includes('30 ngày')) && !editingOrder.pkgName.includes('Dùng Thử')
                                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold text-[11px]">1 Tháng</div>
                              <div className="text-[10px] text-slate-400">1.000.000đ</div>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrder({
                                  ...editingOrder,
                                  pkgName: 'Gói 3 Tháng (100 ngày)',
                                  price: '2.700.000đ',
                                })
                              }
                              className={`p-1.5 rounded-lg border text-left transition ${
                                editingOrder.pkgName.includes('3 Tháng') || editingOrder.pkgName.includes('100 ngày')
                                  ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold text-[11px]">3 Tháng (+10n)</div>
                              <div className="text-[10px] text-amber-400">2.700.000đ</div>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrder({
                                  ...editingOrder,
                                  pkgName: 'Gói 6 Tháng (195 ngày)',
                                  price: '5.400.000đ',
                                })
                              }
                              className={`p-1.5 rounded-lg border text-left transition ${
                                editingOrder.pkgName.includes('6 Tháng') || editingOrder.pkgName.includes('195 ngày')
                                  ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold text-[11px]">6 Tháng (+15n)</div>
                              <div className="text-[10px] text-cyan-400">5.400.000đ</div>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingOrder({
                                  ...editingOrder,
                                  pkgName: 'Gói 12 Tháng (390 ngày)',
                                  price: '10.800.000đ',
                                })
                              }
                              className={`p-1.5 rounded-lg border text-left transition ${
                                editingOrder.pkgName.includes('12 Tháng') || editingOrder.pkgName.includes('1 Năm') || editingOrder.pkgName.includes('390 ngày')
                                  ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="font-bold text-[11px]">12 Tháng (+30n)</div>
                              <div className="text-[10px] text-purple-400">10.800.000đ</div>
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <input
                                type="text"
                                value={editingOrder.pkgName}
                                onChange={(e) => setEditingOrder({ ...editingOrder, pkgName: e.target.value })}
                                placeholder="Tên gói (VD: Gói 1 Tháng (30 ngày))"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                value={editingOrder.price}
                                onChange={(e) => setEditingOrder({ ...editingOrder, price: e.target.value })}
                                placeholder="Giá tiền (VD: 1.000.000đ)"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:outline-none focus:border-sky-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Mã máy tính (Device ID) */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                            Mã Thiết Bị Máy Tính (Device ID):
                          </label>
                          <div className="relative">
                            <Cpu className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={editingOrder.deviceId}
                              onChange={(e) => setEditingOrder({ ...editingOrder, deviceId: e.target.value })}
                              placeholder="VD: HP-ME-PC01 hoặc DESKTOP-XYZ"
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-sky-300 font-mono focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Mã định danh máy tính để hệ thống tự động gán bản quyền ngay khi duyệt.
                          </p>
                        </div>

                        {/* Ghi chú */}
                        <div>
                          <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                            Ghi Chú Đơn Hàng / Lời Nhắn:
                          </label>
                          <textarea
                            rows={2}
                            value={editingOrder.note}
                            onChange={(e) => setEditingOrder({ ...editingOrder, note: e.target.value })}
                            placeholder="Ghi chú nội bộ, phương thức chuyển khoản MBBank, yêu cầu xuất hóa đơn..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        {/* Thông báo đồng bộ lịch sử */}
                        <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Đồng bộ tự động:</strong> Khi bấm lưu, hệ thống sẽ cập nhật đơn đặt mua và tự động đồng bộ ngay vào mục <strong>Lịch Sử Cấp Mã &amp; Gia Hạn</strong> theo thời gian thực!
                          </span>
                        </div>

                        {/* Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => setEditingOrder(null)}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                          >
                            Hủy Bỏ
                          </button>
                          <button
                            type="submit"
                            disabled={isUpdatingOrder}
                            className="px-4 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-600/30 active:scale-95 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isUpdatingOrder ? 'Đang lưu...' : 'Lưu Cập Nhật & Đồng Bộ Lịch Sử'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* MODAL XÁC NHẬN MUA GÓI BẢN QUYỀN - TỰ ĐỘNG GỬI VỀ SERVER */}
                {orderModalPkg && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto"
                    onClick={() => {
                      setOrderModalPkg(null);
                      setOrderSuccessData(null);
                    }}
                  >
                    <div
                      className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-3.5 my-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Key className="w-4 h-4 text-sky-400" />
                          <span>
                            {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                              ? 'Kích Hoạt Gói Dùng Thử 1 Ngày'
                              : 'Đặt Mua Gói Bản Quyền'}
                          </span>
                        </h3>
                        <button
                          onClick={() => {
                            setOrderModalPkg(null);
                            setOrderSuccessData(null);
                          }}
                          className="text-slate-400 hover:text-white p-1 rounded-lg text-xs font-bold hover:bg-slate-800"
                        >
                          ✕
                        </button>
                      </div>

                      {!orderSuccessData ? (
                        /* BƯỚC 1: NHẬP THÔNG TIN VÀ BẤM GỬI */
                        <div className="space-y-3 text-xs">
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Gói đã chọn:</span>
                              <strong className="text-sky-400 font-bold">{orderModalPkg.name}</strong>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Chi phí:</span>
                              <strong className="text-emerald-400 text-sm font-black">
                                {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                                  ? '0đ (Miễn phí 100% • Không cần chuyển khoản)'
                                  : `${orderModalPkg.price} / 1 máy`}
                              </strong>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                                Tên của bạn hoặc Tên đơn vị (Tùy chọn):
                              </label>
                              <input
                                type="text"
                                value={orderCustomerName}
                                onChange={(e) => setOrderCustomerName(e.target.value)}
                                placeholder="VD: Anh Long (hoặc Cty Hoa Phượng)"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                                Số Điện Thoại / Zalo để nhận mã kích hoạt: <span className="text-rose-400">*</span>
                              </label>
                              <input
                                type="text"
                                value={orderCustomerPhone}
                                onChange={(e) => setOrderCustomerPhone(e.target.value)}
                                placeholder="VD: 0869029310"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400 font-mono"
                              />
                            </div>
                          </div>

                          <div className={`p-2.5 rounded-xl text-[11px] flex items-start gap-2 ${
                            orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử')
                              ? 'bg-purple-950/40 border border-purple-500/30 text-purple-200'
                              : 'bg-blue-950/30 border border-blue-500/25 text-slate-300'
                          }`}>
                            <Zap className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                            <span>
                              {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử')) ? (
                                <>
                                  🎁 <strong>Gói dùng thử 1 ngày (giới hạn 20 bài đăng)</strong>. Hoàn toàn miễn phí, không mất tiền và <strong>không cần chuyển khoản ngân hàng</strong>. Bấm nút bên dưới để gửi yêu cầu kích hoạt ngay!
                                </>
                              ) : (
                                <>
                                  Khi bấm <strong>"Gửi Đơn Đặt Mua"</strong>: Yêu cầu của bạn sẽ được gửi thẳng lên hệ thống Quản Trị Viên để cấp mã bản quyền tự động.
                                </>
                              )}
                            </span>
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button
                              onClick={() => setOrderModalPkg(null)}
                              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-lg transition"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={handleSubmitCustomerOrder}
                              disabled={isSubmittingOrder}
                              className={`px-4 py-1.5 text-white font-bold text-xs rounded-lg shadow-md transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer ${
                                orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử')
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/20'
                                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {isSubmittingOrder
                                  ? 'Đang gửi...'
                                  : (orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                                  ? '🚀 Gửi Yêu Cầu Kích Hoạt Dùng Thử (0đ)'
                                  : '🚀 Gửi Đơn Đặt Mua'}
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* BƯỚC 2: THÔNG BÁO GỬI ĐƠN THÀNH CÔNG */
                        <div className="space-y-3.5 text-xs text-center py-2">
                          <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>

                          <div>
                            <h4 className="text-sm font-bold text-white">
                              {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                                ? 'ĐÃ GỬI YÊU CẦU KÍCH HOẠT DÙNG THỬ THÀNH CÔNG!'
                                : 'ĐÃ GỬI ĐƠN ĐẶT MUA THÀNH CÔNG!'}
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Mã đơn hàng: <strong className="text-sky-400 font-mono">#{orderSuccessData.order.id}</strong>
                            </p>
                          </div>

                          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/30 text-left space-y-1.5 text-[11px] text-slate-300">
                            <div>📦 Gói đăng ký: <strong className="text-white">{orderModalPkg.name}</strong></div>
                            <div>💰 Chi phí: <strong className="text-emerald-400">{orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử') ? '0 VNĐ (Miễn phí • Không mất tiền)' : orderModalPkg.price}</strong></div>
                            {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử')) && (
                              <div className="text-purple-300 font-medium">🎯 Hạn mức: <strong>1 Ngày • Tối đa 20 bài đăng tự động</strong></div>
                            )}
                            {orderCustomerPhone && (
                              <div>📞 SĐT / Zalo nhận mã: <strong className="text-sky-400">{orderCustomerPhone}</strong></div>
                            )}
                            <div className="pt-1 border-t border-slate-800 text-[10.5px] text-slate-400">
                              {(orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                                ? '✓ Yêu cầu dùng thử đã được lưu. Không cần chuyển khoản ngân hàng, Quản trị viên đang kích hoạt mã cho bạn!'
                                : '✓ Đơn hàng đã được lưu trên máy chủ Quản trị viên. Quản trị viên sẽ phê duyệt và kích hoạt mã bản quyền cho bạn ngay!'}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <a
                              href={`https://zalo.me/0869029310?text=${encodeURIComponent(
                                (orderModalPkg.price === '0đ' || orderModalPkg.name.includes('Dùng Thử'))
                                  ? `Chào Admin, tôi vừa gửi yêu cầu Gói Dùng Thử 1 Ngày (20 bài đăng, SĐT: ${orderCustomerPhone || 'Chưa rõ'}, Mã đơn: #${orderSuccessData.order.id}). Nhờ Admin duyệt và cấp key dùng thử giúp tôi nhé!`
                                  : `Chào Admin, tôi vừa gửi đơn mua ${orderModalPkg.name} (SĐT: ${orderCustomerPhone || 'Chưa rõ'}, Mã đơn: #${orderSuccessData.order.id}). Nhờ Admin duyệt và cấp key giúp tôi nhé!`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition shadow-md flex items-center justify-center gap-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Nhắn Zalo Nhận Key Ngay</span>
                            </a>
                            <button
                              onClick={() => {
                                setOrderModalPkg(null);
                                setOrderSuccessData(null);
                              }}
                              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition"
                            >
                              Đóng
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MODAL ĐỔI MẬT KHẨU / KHÓA QUẢN TRỊ */}
            {showChangePinModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-3.5 my-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-400" />
                      <span>Đổi Khóa / Mật Khẩu Quản Trị</span>
                    </h3>
                    <button
                      onClick={() => setShowChangePinModal(false)}
                      className="text-slate-400 hover:text-white p-1 text-xs font-bold rounded-lg hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleChangePin} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Mật Khẩu Hiện Tại: <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type={showNewPinPassword ? "text" : "password"}
                        required
                        value={currentPinInput}
                        onChange={(e) => setCurrentPinInput(e.target.value)}
                        placeholder="Nhập mật khẩu hiện tại..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Mật Khẩu Mới (Tối thiểu 6 ký tự): <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type={showNewPinPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        placeholder="Nhập mật khẩu mới..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Xác Nhận Mật Khẩu Mới: <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type={showNewPinPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value)}
                        placeholder="Nhập lại mật khẩu mới..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showNewPinPassword}
                          onChange={(e) => setShowNewPinPassword(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                        />
                        <span>Hiện ký tự mật khẩu</span>
                      </label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowChangePinModal(false)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={isChangingPin}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/30 transition disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isChangingPin ? 'Đang lưu...' : 'Lưu Mật Khẩu Mới'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL TẠO MÃ BẢN QUYỀN MỚI - GỌN GÀNG, CHUẨN ĐỘ PHÂN GIẢI */}
            {showCreateModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 shadow-2xl space-y-3.5 my-auto max-h-[95vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-emerald-400" />
                      <span>Tạo Mã Bản Quyền Mới</span>
                    </h3>
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="text-slate-400 hover:text-white p-1 text-xs font-bold rounded-lg hover:bg-slate-800"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleCreateLicense} className="space-y-3 text-xs">
                    {/* Tên khách */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Tên Khách Hàng / Đơn Vị: <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newLicClient}
                        onChange={(e) => setNewLicClient(e.target.value)}
                        placeholder="VD: Công Ty CP Hoa Phượng ME (hoặc Anh Tuấn)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Số điện thoại / Zalo */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">Số Điện Thoại / Zalo Khách:</label>
                      <input
                        type="text"
                        value={newLicPhone}
                        onChange={(e) => setNewLicPhone(e.target.value)}
                        placeholder="VD: 0869029310"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Lựa chọn kỳ hạn (1 tháng, 3 tháng, 6 tháng, 12 tháng, dùng thử) */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Kỳ Hạn Kích Hoạt (Kèm Ngày Tặng Ưu Đãi):
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setNewLicDays(1);
                            setNewLicPlan('trial');
                          }}
                          className={`p-1.5 rounded-lg border text-center transition ${
                            newLicDays === 1 && newLicPlan === 'trial'
                              ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-[11px]">Dùng Thử</div>
                          <div className="text-[9px] text-purple-400 mt-0.5">1 ngày (20 bài)</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewLicDays(30);
                            setNewLicPlan('individual');
                          }}
                          className={`p-1.5 rounded-lg border text-center transition ${
                            newLicDays === 30 && newLicPlan !== 'trial'
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-[11px]">1 Tháng</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">30 ngày</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewLicDays(100);
                            setNewLicPlan('individual');
                          }}
                          className={`p-1.5 rounded-lg border text-center transition ${
                            newLicDays === 100
                              ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-[11px]">3 Tháng</div>
                          <div className="text-[9px] text-amber-400/90 mt-0.5">+10n tặng</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewLicDays(195);
                            setNewLicPlan('individual');
                          }}
                          className={`p-1.5 rounded-lg border text-center transition ${
                            newLicDays === 195
                              ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-[11px]">6 Tháng</div>
                          <div className="text-[9px] text-cyan-400/90 mt-0.5">+15n tặng</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setNewLicDays(390);
                            setNewLicPlan('individual');
                          }}
                          className={`p-1.5 rounded-lg border text-center transition ${
                            newLicDays === 390
                              ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="font-bold text-[11px]">12 Tháng</div>
                          <div className="text-[9px] text-purple-400/90 mt-0.5">+30n tặng</div>
                        </button>
                      </div>
                    </div>

                    {/* Số máy tính mua theo nhu cầu */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Số Lượng Máy Tính Mua:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={newLicDevices}
                          onChange={(e) => setNewLicDevices(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-bold text-center focus:border-emerald-500 focus:outline-none"
                        />
                        <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5 px-2.5 text-right">
                          <span className="text-[10px] text-slate-400 block">Thành tiền tạm tính:</span>
                          <strong className="text-emerald-400 text-xs font-bold">
                            {newLicPlan === 'trial'
                              ? '0 đ (Miễn phí dùng thử)'
                              : newLicDays === 100
                              ? `${(newLicDevices * 2700000).toLocaleString('vi-VN')} đ (Đã giảm 10%)`
                              : newLicDays === 195
                              ? `${(newLicDevices * 5400000).toLocaleString('vi-VN')} đ (Đã giảm 10%)`
                              : newLicDays === 390
                              ? `${(newLicDevices * 10800000).toLocaleString('vi-VN')} đ (Đã giảm 10%)`
                              : `${(newLicDevices * (newLicDays / 30) * 1000000).toLocaleString('vi-VN')} đ`}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Tùy chỉnh mã Key */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">
                        Mã Key Tùy Chọn (Để trống để tự động sinh mã ngẫu nhiên):
                      </label>
                      <input
                        type="text"
                        value={newLicCustomKey}
                        onChange={(e) => setNewLicCustomKey(e.target.value.toUpperCase())}
                        placeholder="VD: VIP-HOAPHUONG (hoặc để trống)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Ghi chú */}
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11.5px]">Ghi chú nội bộ:</label>
                      <input
                        type="text"
                        value={newLicNotes}
                        onChange={(e) => setNewLicNotes(e.target.value)}
                        placeholder="VD: Chuyển khoản MBBank..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-1.5 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(false)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/25 transition flex items-center gap-1 active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tạo Mã Bản Quyền</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* Footer (Thanh dưới cùng): Xóa thông tin trùng lặp, giữ thanh pháp lý & hướng dẫn sử dụng */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400">
          <div>
            © 2026 Gia Long - FB. Bản quyền thuộc về Giải pháp vận hành tự động.
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <button
              onClick={() => setShowUserGuideModal(true)}
              className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-4 transition-colors bg-transparent border-none p-0 cursor-pointer flex items-center gap-1 text-xs"
            >
              📖 Hướng dẫn sử dụng &amp; Lưu ý
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => setActiveTab('license-admin')}
              className="hover:text-sky-400 transition-colors bg-transparent border-none p-0 cursor-pointer text-slate-400 text-xs"
            >
              Điều khoản sử dụng
            </button>
          </div>
        </div>
      </footer>

      {/* MODAL HƯỚNG DẪN SỬ DỤNG & NHỮNG ĐIỀU CẦN LƯU Ý */}
      {showUserGuideModal && (
        <div
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          onClick={() => setShowUserGuideModal(false)}
        >
          <div
            className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-black overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <span className="text-xl">📖</span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    HƯỚNG DẪN SỬ DỤNG &amp; LƯU Ý VẬN HÀNH AN TOÀN
                  </h3>
                  <span className="text-[11px] text-slate-400">Phần mềm tự động đăng bài Facebook - Gia Long FB (V1.0)</span>
                </div>
              </div>
              <button
                onClick={() => setShowUserGuideModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body Modal */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed max-h-[75vh]">
              
              {/* PHẦN 1: QUY TRÌNH 4 BƯỚC SỬ DỤNG CHUẨN & HIỆU QUẢ */}
              <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase">
                  <span>⚡ 1. QUY TRÌNH 4 BƯỚC ĐĂNG BÀI HIỆU QUẢ TỰ ĐỘNG HÓA</span>
                </div>

                <div className="space-y-2.5">
                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-[10.5px]">1</span>
                      <strong className="text-sky-400 font-bold text-xs">Đăng nhập Facebook &amp; Dò tìm nhóm đúng tệp mục tiêu</strong>
                    </div>
                    <p className="text-[11.5px] text-slate-400 pl-7">
                      • Mở Facebook trên trình duyệt và đăng nhập tài khoản cần đăng bài.<br />
                      • Vào tab <strong>"Dò Tìm Nhóm"</strong>, nhập từ khóa ngành nghề (VD: <em>Tuyển dụng, Việc làm, Bất động sản, Nhà đất, Mua bán...</em>) ➔ Tích chọn <em>"Tự bấm Tham gia nhóm"</em> ➔ Bấm <em>"Tham Gia &amp; Thêm Vào Đăng Bài"</em>.
                    </p>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10.5px]">2</span>
                      <strong className="text-emerald-400 font-bold text-xs">Soạn nội dung cuốn hút &amp; Đính kèm 1 - 3 ảnh chất lượng</strong>
                    </div>
                    <p className="text-[11.5px] text-slate-400 pl-7">
                      • Soạn nội dung bài viết và tải lên 1 - 3 ảnh minh họa chất lượng cao.<br />
                      • Hệ thống tự động kích hoạt <strong>Image Hash Buster</strong> (biến thiên mã băm MD5/PhotoDNA để mỗi nhóm nhận 1 mã ảnh khác nhau) kết hợp <strong>Zero-Width Space</strong> vô hình chống Facebook AI quét trùng lặp nội dung 100%.
                    </p>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10.5px]">3</span>
                      <strong className="text-amber-400 font-bold text-xs">Cài đặt thời gian giãn cách tối ưu (&gt; 30s) &amp; Bật 3 biến thể nội dung</strong>
                    </div>
                    <p className="text-[11.5px] text-slate-400 pl-7">
                      • <strong>Thời gian giãn cách tối ưu khuyến cáo: khoảng &gt; 30 giây</strong> (Khuyên dùng từ <strong>35s - 55s</strong> giữa các nhóm). Đây là khoảng cách vàng để mô phỏng chính xác hành vi người thật thao tác, tránh tình trạng bị Facebook nghi ngờ spam tần suất nhanh.<br />
                      • Bật tùy chọn <strong>"Xoay vòng 3 biến thể nội dung"</strong> để hệ thống tự động luân phiên gửi các phiên bản bài viết xen kẽ nhau giữa các nhóm.
                    </p>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 font-bold flex items-center justify-center text-[10.5px]">4</span>
                      <strong className="text-purple-400 font-bold text-xs">Chế độ đăng ngay hoặc Hẹn giờ linh hoạt (Khung Giờ Vàng / Giờ Tùy Chọn)</strong>
                    </div>
                    <p className="text-[11.5px] text-slate-400 pl-7">
                      • <strong>Đăng ngay:</strong> Bấm <strong>"🚀 Bắt Đầu Đăng Bài"</strong> để tiến trình kích hoạt chạy ngay lập tức.<br />
                      • <strong>Hẹn giờ tự động linh hoạt:</strong> Bật tính năng <strong>"Hẹn giờ đăng bài tự động"</strong>. Bạn có thể:<br />
                      &nbsp;&nbsp;+ Chọn <strong>4 Khung Giờ Vàng tương tác cao nhất</strong>: <code>08:30 (Sáng)</code>, <code>11:30 (Trưa)</code>, <code>17:30 (Chiều)</code>, <code>20:00 (Tối)</code>.<br />
                      &nbsp;&nbsp;+ Hoặc <strong>Tự do thêm &amp; chọn bất kỳ khung giờ nào khác</strong> (VD: 06:00, 09:15, 14:30, 21:45...) phù hợp theo đặc thù khách hàng / ứng viên riêng của bạn. Extension sẽ tự động kích hoạt đăng đúng giờ chuẩn xác.
                    </p>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: HƯỚNG DẪN MỞ MÀN HÌNH 2 & DÙNG MICROSOFT EDGE CHẠY ẨN ĐỂ LÀM VIỆC KHÁC */}
              <div className="bg-gradient-to-r from-teal-950/30 via-slate-950 to-teal-950/30 border border-teal-500/40 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-teal-300 flex items-center gap-1.5 uppercase">
                  <span>🖥️ 2. HƯỚNG DẪN MỞ MÀN HÌNH 2 &amp; DÙNG EDGE ĐỂ CHẠY ẨN LÀM VIỆC KHÁC</span>
                  <span className="text-[9.5px] bg-teal-500/20 text-teal-300 px-2 py-0.2 rounded-full font-bold">Mẹo Đa Nhiệm 100%</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11.5px]">
                  {/* Cách 1: Dùng Microsoft Edge độc lập */}
                  <div className="bg-slate-900/90 p-3 rounded-lg border border-teal-500/30 space-y-1.5">
                    <strong className="text-teal-300 block font-bold flex items-center gap-1">
                      <span>🌐 Cách 1: Chạy Facebook riêng trên Microsoft Edge</span>
                    </strong>
                    <p className="text-slate-400 leading-relaxed">
                      • <strong>Microsoft Edge</strong> dùng chung nhân với Chrome nên chạy cực kỳ mượt mà.<br />
                      • Bạn hãy mở <strong>Microsoft Edge</strong> để đăng nhập Facebook và bật Extension cho chạy tự động.<br />
                      • Trình duyệt <strong>Google Chrome</strong> chính vẫn dùng để lướt web, làm việc Word/Excel, xem Youtube, chat Zalo mà <strong>không bao giờ bị nhảy tab làm phiền chuột hay bàn phím</strong>!
                    </p>
                  </div>

                  {/* Cách 2: Mở màn hình 2 hoặc Virtual Desktop */}
                  <div className="bg-slate-900/90 p-3 rounded-lg border border-teal-500/30 space-y-1.5">
                    <strong className="text-emerald-300 block font-bold flex items-center gap-1">
                      <span>💻 Cách 2: Kéo sang Màn Hình 2 hoặc Màn Hình Ảo (Windows + Tab)</span>
                    </strong>
                    <p className="text-slate-400 leading-relaxed">
                      • <strong>Có 2 màn hình vật lý:</strong> Kéo cửa sổ trình duyệt đang chạy Facebook sang Màn hình 2 để máy tự động đăng bài, Màn hình 1 làm việc tự do.<br />
                      • <strong>Dùng 1 màn hình máy tính (Mẹo Màn hình ảo):</strong><br />
                      &nbsp;&nbsp;1. Bấm tổ hợp phím <strong>Windows + Tab</strong> trên bàn phím.<br />
                      &nbsp;&nbsp;2. Nhấn nút <strong>"+ New Desktop"</strong> để tạo Màn hình 2 (Desktop 2).<br />
                      &nbsp;&nbsp;3. Kéo cửa sổ Edge sang Desktop 2 ➔ Quay về Desktop 1 làm việc bình thường. Tiện ích tự động chạy ngầm ở Desktop 2 mà không hề chớp nháy trước mắt bạn!
                    </p>
                  </div>
                </div>
              </div>

              {/* PHẦN 3: NHỮNG ĐIỀU QUAN TRỌNG PHẢI CHÚ Ý ĐỂ TRÁNH BỊ FACEBOOK PHẠT */}
              <div className="bg-rose-950/20 border border-rose-500/40 rounded-xl p-4 space-y-2.5">
                <div className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase">
                  <span>⚠️ 3. NHỮNG ĐIỀU QUAN TRỌNG PHẢI CHÚ Ý ĐỂ TRÁNH BỊ FACEBOOK PHẠT</span>
                </div>

                <div className="space-y-2 text-[11.5px] text-slate-300">
                  <div className="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-rose-500/20">
                    <span className="text-rose-400 font-bold shrink-0 text-xs">1.</span>
                    <div>
                      <strong className="text-white">Không để thời gian giãn cách quá nhanh:</strong> Tuyệt đối không để delay dưới 20 - 30 giây. Khuyến cáo đặt thời gian giãn cách <strong>&gt; 30 giây</strong> (lý tưởng nhất là <strong>35s - 55s</strong>) để mô phỏng chính xác thao tác người thật.
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-rose-500/20">
                    <span className="text-rose-400 font-bold shrink-0 text-xs">2.</span>
                    <div>
                      <strong className="text-white">Đăng bài theo hạn mức an toàn:</strong> Nick mới nên đăng 100 - 150 bài/ngày; nick lâu năm uy tín có thể chạy 300 - 350 bài/ngày chia đều ra 3 - 4 ca trong ngày (hoặc chia theo 4 khung giờ vàng).
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-rose-500/20">
                    <span className="text-rose-400 font-bold shrink-0 text-xs">3.</span>
                    <div>
                      <strong className="text-white">Đảm bảo nick đã tham gia nhóm:</strong> Nếu nhóm yêu cầu trả lời câu hỏi hoặc nhóm kín chưa được duyệt, Facebook sẽ ẩn khung đăng bài ➔ Hãy tham gia nhóm trước khi chọn đăng.
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-rose-500/20">
                    <span className="text-rose-400 font-bold shrink-0 text-xs">4.</span>
                    <div>
                      <strong className="text-white">Cơ chế tự động dừng khẩn cấp (Anti-Spam Shield):</strong> Khi Facebook hiện thông báo giới hạn tần suất, Extension sẽ <strong>tự động DỪNG TỨC THÌ</strong>. Hãy cho tài khoản nghỉ ngơi 4 - 6 tiếng trước khi đăng ca tiếp theo.
                    </div>
                  </div>

                  <div className="flex items-start gap-2 bg-slate-900/70 p-2 rounded-lg border border-rose-500/20">
                    <span className="text-rose-400 font-bold shrink-0 text-xs">5.</span>
                    <div>
                      <strong className="text-white">Giữ trình duyệt chạy nền khi hẹn giờ:</strong> Để ca hẹn giờ tự động kích hoạt đúng giờ (khung giờ vàng hoặc giờ tùy chọn), hãy đảm bảo trình duyệt (Edge hoặc Chrome) đang được mở hoặc chạy nền trên máy tính.
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer Modal */}
            <div className="flex justify-between items-center px-5 py-3 border-t border-slate-800 bg-slate-950">
              <span className="text-[11px] text-slate-400">
                Kỹ thuật viên hỗ trợ Zalo: <strong className="text-sky-400 font-bold">0869.029.310</strong>
              </span>
              <button
                onClick={() => setShowUserGuideModal(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-blue-600/20"
              >
                ✓ Đã Nắm Rõ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
