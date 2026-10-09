import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  ExternalLink,
  Zap,
  ShieldCheck,
  Sparkles,
  Laptop,
  Check,
  Key,
  MessageSquare,
  QrCode,
  Layers,
  Cpu,
  Copy,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ArrowDown,
  X,
  Send,
  Package
} from 'lucide-react';

interface CustomerDownloadPortalProps {
  packageInfo: { isReady: boolean; sizeKb: number; version?: string; fileName?: string } | null;
  onDownloadZip: () => void;
  isDownloadingZip: boolean;
  edgeStoreUrl: string;
  chromeStoreUrl: string;
  adminZaloUrl: string;
  onSelectPlan?: (plan: { name: string; price: string }) => void;
  onGoToAdmin?: () => void;
}

interface PlanDetail {
  id: string;
  name: string;
  duration: string;
  price: string;
  oldPrice?: string;
  discount?: string;
  badge?: string;
  isPopular?: boolean;
  theme: {
    cardBorder: string;
    cardBg: string;
    badgeStyle: string;
    priceColor: string;
    checkColor: string;
    btnClass: string;
  };
  features: string[];
}

const PRICING_PLANS: PlanDetail[] = [
  {
    id: 'plan_trial',
    name: 'Gói Dùng Thử',
    duration: '1 Ngày (24h)',
    price: '0đ',
    badge: '1 NGÀY (20 BÀI)',
    theme: {
      cardBorder: 'border-slate-700/80 hover:border-slate-500',
      cardBg: 'bg-slate-900/90 hover:bg-slate-850',
      badgeStyle: 'text-slate-300 bg-slate-800 border-slate-700',
      priceColor: 'text-slate-200',
      checkColor: 'text-slate-400',
      btnClass: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 hover:border-slate-500 shadow-sm'
    },
    features: [
      'Đăng tối đa 20 bài tự động',
      'Thời hạn sử dụng 1 ngày (24h)',
      'Đổi mã băm PhotoDNA & Salt vô hình',
      'Hỗ trợ kỹ thuật 1-1 qua Zalo',
      'Miễn phí 100%, không cần chuyển khoản'
    ]
  },
  {
    id: 'plan_1m',
    name: 'Gói 1 Tháng',
    duration: '30 Ngày',
    price: '1.000.000đ',
    badge: '30 NGÀY',
    theme: {
      cardBorder: 'border-blue-500/40 hover:border-blue-400',
      cardBg: 'bg-gradient-to-b from-blue-950/25 via-slate-900 to-slate-900 shadow-lg shadow-blue-950/30',
      badgeStyle: 'text-blue-300 bg-blue-500/15 border-blue-500/35',
      priceColor: 'text-blue-400',
      checkColor: 'text-blue-400',
      btnClass: 'bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md shadow-blue-600/25'
    },
    features: [
      'Đăng ~9.000 – 10.500 bài/tháng',
      'Chống checkpoint & spam Facebook',
      'Thuật toán ngắt nghỉ ngẫu nhiên',
      'Đổi mã băm PhotoDNA & Salt vô hình',
      'Hỗ trợ kỹ thuật 1-1 qua Zalo'
    ]
  },
  {
    id: 'plan_3m',
    name: 'Gói 3 Tháng',
    duration: '100 Ngày',
    price: '2.700.000đ',
    oldPrice: '3.000.000đ',
    discount: 'Tiết kiệm 800.000đ (-10%)',
    badge: '🎁 TẶNG 10 NGÀY',
    isPopular: true,
    theme: {
      cardBorder: 'border-2 border-amber-500 hover:border-amber-400',
      cardBg: 'bg-gradient-to-b from-amber-950/45 via-slate-900 to-slate-900 shadow-xl shadow-amber-500/20 scale-[1.02] z-10',
      badgeStyle: 'text-amber-300 bg-amber-500/20 border-amber-500/40',
      priceColor: 'text-amber-400',
      checkColor: 'text-amber-400',
      btnClass: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black shadow-lg shadow-amber-500/30'
    },
    features: [
      'Đăng ~30.000 bài tự động',
      'Sử dụng trọn vẹn 100 ngày (tặng 10 ngày)',
      'Hẹn giờ Alarms theo khung giờ vàng',
      'Bảo hành hỗ trợ đổi máy tính khi cần',
      'Hỗ trợ kỹ thuật 1-1 qua Zalo'
    ]
  },
  {
    id: 'plan_6m',
    name: 'Gói 6 Tháng',
    duration: '195 Ngày',
    price: '5.400.000đ',
    oldPrice: '6.000.000đ',
    discount: 'Tiết kiệm 1.600.000đ',
    badge: '🎁 TẶNG 15 NGÀY',
    theme: {
      cardBorder: 'border-teal-500/50 hover:border-teal-400',
      cardBg: 'bg-gradient-to-b from-teal-950/30 via-slate-900 to-slate-900 shadow-lg shadow-teal-500/10',
      badgeStyle: 'text-teal-300 bg-teal-500/20 border-teal-500/40',
      priceColor: 'text-teal-400',
      checkColor: 'text-teal-400',
      btnClass: 'bg-teal-600 hover:bg-teal-500 text-white font-bold shadow-md shadow-teal-600/25 border border-teal-400/40'
    },
    features: [
      'Đăng ~60.000 bài tự động',
      'Sử dụng trọn 195 ngày (tặng 15 ngày)',
      'Hẹn giờ đa khung giờ linh hoạt',
      'Bảo hành đổi máy tính trọn chu kỳ',
      'Hỗ trợ kỹ thuật ưu tiên qua Zalo'
    ]
  },
  {
    id: 'plan_12m',
    name: 'Gói 12 Tháng',
    duration: '390 Ngày',
    price: '10.800.000đ',
    oldPrice: '12.000.000đ',
    discount: 'Tiết kiệm 3.200.000đ',
    badge: '🎁 TẶNG 30 NGÀY',
    theme: {
      cardBorder: 'border-purple-500/50 hover:border-purple-400',
      cardBg: 'bg-gradient-to-b from-purple-950/35 via-slate-900 to-slate-900 shadow-lg shadow-purple-500/10',
      badgeStyle: 'text-purple-300 bg-purple-500/20 border-purple-500/40',
      priceColor: 'text-purple-300',
      checkColor: 'text-purple-400',
      btnClass: 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold shadow-md shadow-purple-600/25 border border-purple-400/40'
    },
    features: [
      'Đăng ~120.000 bài tự động',
      'Sử dụng 390 ngày (tặng trọn 1 tháng)',
      'Cập nhật toàn bộ tính năng mới miễn phí',
      'Chuyển đổi thiết bị máy tính không giới hạn',
      'Hỗ trợ kỹ thuật VIP 1-1 qua Zalo'
    ]
  }
];

export function CustomerDownloadPortal({
  packageInfo,
  onDownloadZip,
  isDownloadingZip,
  adminZaloUrl,
  onSelectPlan,
  onGoToAdmin,
}: CustomerDownloadPortalProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [customerActivationKey, setCustomerActivationKey] = useState<string>('');
  const [activationStatus, setActivationStatus] = useState<string | null>(null);
  const [showQuickActivate, setShowQuickActivate] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [purchaseGuidePlan, setPurchaseGuidePlan] = useState<PlanDetail | null>(null);
  const [quickOrderPhone, setQuickOrderPhone] = useState('');
  const [quickOrderName, setQuickOrderName] = useState('');
  const [isSubmittingQuickOrder, setIsSubmittingQuickOrder] = useState(false);
  const [quickOrderSuccess, setQuickOrderSuccess] = useState<any>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedFullGuide, setCopiedFullGuide] = useState(false);

  const currentVersion = packageInfo?.version || '1.0.3';
  const fileSizeKb = packageInfo?.sizeKb || 335;
  const zaloUrl = adminZaloUrl || 'https://zalo.me/0869029310';

  const handleQuickWebOrder = async () => {
    if (!quickOrderPhone.trim() || quickOrderPhone.trim().length < 8) {
      alert('Vui lòng nhập Số điện thoại hoặc Zalo hợp lệ để Quản trị viên cấp key!');
      return;
    }
    setIsSubmittingQuickOrder(true);
    try {
      const planName = purchaseGuidePlan?.name || 'Gói Bản Quyền';
      const planPrice = purchaseGuidePlan?.price || '1.000.000đ';
      const isTrial = planPrice === '0đ' || planName.includes('Dùng Thử');
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pkgName: planName,
          price: planPrice,
          deviceId: 'WEB-CLIENT',
          clientName: quickOrderName.trim() || `Khách ${quickOrderPhone.trim()}`,
          phone: quickOrderPhone.trim(),
          note: isTrial
            ? 'Đăng ký dùng thử 1 ngày từ Web Portal'
            : `Đơn mua ${planName} từ Web Portal (Khách: ${quickOrderName.trim() || quickOrderPhone.trim()})`,
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        setQuickOrderSuccess(data.order);
      } else {
        alert('Lỗi gửi đơn: ' + (data.message || 'Không thể kết nối máy chủ'));
      }
    } catch (e: any) {
      alert('Lỗi kết nối máy chủ: ' + e.message);
    } finally {
      setIsSubmittingQuickOrder(false);
    }
  };

  const handleActivateViaBridge = (key: string) => {
    if (!key.trim()) return alert('Vui lòng nhập mã bản quyền đã được Admin cấp!');
    setActivationStatus('Đang gửi lệnh kích hoạt sang Extension...');
    window.postMessage({ type: 'AUTORECRUIT_ACTIVATE_KEY', key: key.trim().toUpperCase() }, '*');

    setTimeout(() => {
      setActivationStatus('✓ Lệnh kích hoạt đã được gửi! Vui lòng mở biểu tượng Extension trên trình duyệt để kiểm tra trạng thái.');
    }, 1500);
  };

  // Khi click vào phần báo giá, tự động chọn gói và cuộn mượt xuống khu vực bản quyền & hỗ trợ
  const handleSelectPlanAndScroll = (plan: PlanDetail) => {
    setSelectedPlan(plan);
    const target = document.getElementById('khu-vuc-ban-quyen-ho-tro');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const copyFullGuideText = () => {
    const guideText = `📖 HƯỚNG DẪN CÀI ĐẶT EXTENSION GIA LONG - FB (FILE .ZIP)
1. Tải file ZIP và giải nén ra 1 thư mục trên máy tính.
2. Mở chrome://extensions (hoặc edge://extensions) -> Bật Developer Mode ở góc trên bên phải.
3. Bấm "Load unpacked" (Tải tiện ích đã giải nén) -> Chọn thư mục vừa giải nén.
4. Ghim (Pin) tiện ích lên thanh công cụ để mở sử dụng hàng ngày!
Hỗ trợ Zalo: 0869.029.310 (Gia Long - FB)`;

    navigator.clipboard.writeText(guideText);
    setCopiedFullGuide(true);
    setTimeout(() => setCopiedFullGuide(false), 2500);
  };

  return (
    <div className="space-y-5 pb-10 max-w-6xl mx-auto">
      {/* 1. HERO COMPACT & TOÀN DIỆN */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-950 border border-indigo-500/30 p-4 sm:p-5 shadow-lg text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Gia Long - FB Extension • Phiên Bản Chuẩn v{currentVersion}</span>
        </div>

        <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-snug max-w-2xl mx-auto">
          Tự Động Hóa Đăng Bài Facebook{' '}
          <span className="bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
            • Tiếp Cận Khách Hàng Mỗi Ngày
          </span>
        </h1>

        <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
          Đăng tự động <strong>300 – 350 bài/ngày</strong> • Chống checkpoint • Đổi mã băm PhotoDNA • Hoạt động 100% trên máy tính.
        </p>

        {/* Cụm nút hành động chính: Nhỏ gọn, trực quan */}
        <div className="pt-0.5 flex flex-wrap items-center justify-center gap-2.5">
          <button
            onClick={onDownloadZip}
            disabled={isDownloadingZip}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer border border-emerald-400/30"
          >
            <Download className={`w-3.5 h-3.5 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
            <span>{isDownloadingZip ? 'Đang Tải File ZIP...' : 'Tải Tiện Ích Cài Đặt (.ZIP)'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 text-emerald-200 font-mono">
              ZIP Cài Đặt Nhanh
            </span>
          </button>

          {/* NÚT BẬT / TẮT HƯỚNG DẪN ẨN: Khi click vào mới hiện ra */}
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border cursor-pointer ${
              isGuideOpen
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>{isGuideOpen ? 'Đóng Hướng Dẫn' : 'Xem Hướng Dẫn Cài Đặt'}</span>
            {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <a
            href="#bang-gia"
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Báo Giá Các Gói</span>
          </a>
        </div>

        {/* Cam kết nhanh 1 dòng */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400 pt-0.5">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" /> An toàn 100%
          </span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" /> Cài đặt trong 1 phút
          </span>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="flex items-center gap-1">
            <Laptop className="w-3 h-3 text-sky-400" /> Chrome, Edge, Cốc Cốc
          </span>
        </div>
      </section>

      {/* 2. KHU VỰC HƯỚNG DẪN DẠNG ẨN (ACCORDION COLLAPSIBLE): KHI KÍCH VÀO MỚI HIỆN RA */}
      {isGuideOpen && (
        <section className="bg-slate-900 border border-sky-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-sky-500/20 text-sky-400">
                <BookOpen className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Hướng Dẫn Cài Đặt File .ZIP Vào Trình Duyệt (1 Phút Là Xong)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Áp dụng cho Google Chrome, Microsoft Edge và Cốc Cốc
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={copyFullGuideText}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                title="Sao chép toàn bộ hướng dẫn"
              >
                {copiedFullGuide ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Đã chép!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>Thu gọn</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Sườn các bước gọn gàng, dạng văn bản hướng dẫn rõ ràng */}
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            {/* Bước 1 */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </span>
              <div className="space-y-1 flex-1">
                <strong className="text-white block text-xs">
                  Tải về bộ cài đặt &amp; Giải nén file .ZIP
                </strong>
                <p className="text-slate-300 text-[11.5px]">
                  Bấm nút <strong>"Tải Tiện Ích Cài Đặt (.ZIP)"</strong> ở trên. Chuột phải vào file vừa tải trong thư mục Downloads ➔ Chọn <strong>"Extract All..."</strong> (Giải nén tất cả) ra màn hình Desktop hoặc ổ đĩa máy tính.
                </p>
                <p className="text-amber-400/90 text-[11px]">
                  ⚠️ <em>Lưu ý: Giữ nguyên thư mục giải nén, không xóa sau khi cài để tiện ích hoạt động liên tục.</em>
                </p>
              </div>
            </div>

            {/* Bước 2 */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="w-6 h-6 rounded-md bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </span>
              <div className="space-y-1.5 flex-1">
                <strong className="text-white block text-xs">
                  Mở trang Quản lý tiện ích &amp; Bật Developer Mode
                </strong>
                <p className="text-slate-300 text-[11.5px]">
                  Mở trình duyệt lên, gõ vào thanh địa chỉ rồi nhấn Enter:
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <div className="inline-flex items-center gap-2 bg-slate-900 border border-teal-500/30 px-2 py-1 rounded text-[11px]">
                    <span className="text-slate-400">Chrome/Cốc Cốc:</span>
                    <code className="text-teal-300 font-mono font-bold">chrome://extensions</code>
                    <button
                      onClick={() => copyToClipboard('chrome://extensions', 'chrome')}
                      className="text-sky-400 hover:underline text-[10px]"
                    >
                      {copiedUrl === 'chrome' ? '✓ Đã chép' : 'Chép'}
                    </button>
                  </div>
                  <div className="inline-flex items-center gap-2 bg-slate-900 border border-sky-500/30 px-2 py-1 rounded text-[11px]">
                    <span className="text-slate-400">Edge:</span>
                    <code className="text-sky-300 font-mono font-bold">edge://extensions</code>
                    <button
                      onClick={() => copyToClipboard('edge://extensions', 'edge')}
                      className="text-sky-400 hover:underline text-[10px]"
                    >
                      {copiedUrl === 'edge' ? '✓ Đã chép' : 'Chép'}
                    </button>
                  </div>
                </div>
                <p className="text-slate-300 text-[11.5px]">
                  Gạt <strong>BẬT</strong> công tắc <strong>"Chế độ dành cho nhà phát triển" (Developer mode)</strong> ở góc trên bên phải màn hình.
                </p>
              </div>
            </div>

            {/* Bước 3 */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </span>
              <div className="space-y-1 flex-1">
                <strong className="text-white block text-xs">
                  Tải tiện ích đã giải nén vào trình duyệt (Load Unpacked)
                </strong>
                <p className="text-slate-300 text-[11.5px]">
                  Bấm nút <strong>"Tải tiện ích đã giải nén" (Load unpacked)</strong> ở góc trên bên trái ➔ Chọn đúng thư mục bạn đã giải nén ở Bước 1. Tiện ích <strong>Gia Long - FB</strong> sẽ xuất hiện ngay!
                </p>
              </div>
            </div>

            {/* Bước 4 */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-indigo-500/30">
              <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                4
              </span>
              <div className="space-y-1 flex-1">
                <strong className="text-white block text-xs">
                  Ghim tiện ích lên thanh công cụ (Mẹo tiện lợi)
                </strong>
                <p className="text-slate-300 text-[11.5px]">
                  Bấm biểu tượng <strong>Mảnh ghép Puzzle</strong> ở góc trên bên phải trình duyệt ➔ Bấm nút <strong>Ghim (Pin)</strong> tiện ích Gia Long - FB để biểu tượng luôn hiển thị sẵn sàng, mở đăng bài hàng ngày chỉ với 1 click!
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. BẢNG BÁO GIÁ CÁC GÓI BẢN QUYỀN (TỐI GIẢN, KHI KÍCH VÀO THÌ CHUYỂN XUỐNG KHU VỰC BẢN QUYỀN & HỖ TRỢ) */}
      <section id="bang-gia" className="space-y-3 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1 border-b border-slate-800/80 pb-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Bảng Báo Giá Gói Bản Quyền</span>
            </h2>
            <p className="text-[11.5px] text-slate-400 mt-0.5">
              Chi phí chỉ từ <strong>~70đ – 90đ/bài</strong> • Nhấp vào gói để xem quy trình đặt mua &amp; hỗ trợ bên dưới:
            </p>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Khóa theo phần cứng máy tính • An toàn 100%
          </span>
        </div>

        {/* Bảng Thẻ Báo Giá 5 Gói Sang Trọng, Cân Đối Trục Ngang */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-stretch">
          {PRICING_PLANS.map((plan) => {
            const isSelected = selectedPlan?.id === plan.id;
            const isTrial = plan.id === 'plan_trial';
            return (
              <div
                key={plan.id}
                onClick={() => {
                  setSelectedPlan(plan);
                  setPurchaseGuidePlan(plan);
                  setQuickOrderSuccess(null);
                  if (onSelectPlan) {
                    onSelectPlan({ name: plan.name, price: plan.price });
                  }
                }}
                className={`rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all cursor-pointer relative group border ${plan.theme.cardBorder} ${plan.theme.cardBg} ${isSelected ? 'ring-2 ring-emerald-400 border-emerald-500' : ''}`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 text-white text-[10px] sm:text-[11px] font-black px-3.5 py-0.5 rounded-full uppercase tracking-wider shadow-lg shadow-red-600/40 border-2 border-amber-300 whitespace-nowrap z-20 flex items-center gap-1">
                    🔥 BÁN CHẠY NHẤT
                  </div>
                )}

                <div className="space-y-2.5">
                  {/* Badge & Thời hạn */}
                  <div className="flex items-center justify-between gap-1.5 min-h-[22px]">
                    <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border leading-tight whitespace-nowrap shrink-0 ${plan.theme.badgeStyle}`}>
                      {plan.badge}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                      {plan.duration}
                    </span>
                  </div>

                  {/* Tên Gói to, rõ trên 1 dòng duy nhất */}
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {plan.name}
                  </h3>

                  {/* Khối Giá Tiền Chuẩn Hóa Chiều Cao (Không Bị Lệch Trục) */}
                  <div className="py-2 px-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col justify-center min-h-[84px]">
                    <div className="min-h-[14px] flex items-center">
                      {plan.oldPrice ? (
                        <span className="text-[10.5px] text-slate-400 line-through leading-none">{plan.oldPrice}</span>
                      ) : (
                        <span className="text-[10.5px] text-transparent select-none leading-none">-</span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 my-0.5">
                      <span className={`text-lg sm:text-xl font-black ${plan.theme.priceColor}`}>
                        {plan.price}
                      </span>
                    </div>
                    <div className="min-h-[18px] flex items-center">
                      {plan.discount ? (
                        <span className="text-[10px] text-emerald-400 font-semibold">{plan.discount}</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          {isTrial ? '1 ngày (20 bài đăng)' : '/ 1 máy tính sử dụng'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Danh Sách Tính Năng: Đầy Đủ, Không Cắt Chữ, Checkmark Màu Riêng */}
                  <ul className="space-y-1.5 text-[11px] text-slate-300 pt-1 border-t border-slate-800/80">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 leading-snug">
                        <Check className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${plan.theme.checkColor}`} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Nút Hành Động Màu Sắc Nổi Bật Tương Ứng Từng Gói */}
                <div className="pt-3 mt-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlan(plan);
                      setPurchaseGuidePlan(plan);
                      setQuickOrderSuccess(null);
                      if (onSelectPlan) {
                        onSelectPlan({ name: plan.name, price: plan.price });
                      }
                    }}
                    className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${plan.theme.btnClass}`}
                  >
                    <span>
                      {isTrial
                        ? 'Đăng Ký Dùng Thử'
                        : isSelected
                        ? '✓ Đang Xem Gói Này'
                        : 'Chọn Gói & Đặt Mua'}
                    </span>
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. KHU VỰC BẢN QUYỀN & QUY TRÌNH ĐẶT MUA TỰ ĐỘNG TRONG TIỆN ÍCH */}
      <section
        id="khu-vuc-ban-quyen-ho-tro"
        className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5 scroll-mt-16"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>Cơ Chế Bản Quyền Khóa Theo Máy Tính (Device ID)</span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Quy Trình Đặt Mua &amp; Tự Động Kích Hoạt (Thực Hiện Trực Tiếp Trong Tiện Ích)
            </h3>
          </div>
          <p className="text-[11px] text-slate-400">
            Mã thiết bị tự động cập nhật vào yêu cầu duyệt mua, không cần nhập thủ công
          </p>
        </div>

        {/* Banner thông báo gói đang chọn (nếu có nhấp từ bảng giá) */}
        {selectedPlan && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="text-base">🎁</span>
              <div className="text-xs">
                <span className="text-slate-400">Gói bạn đang chọn: </span>
                <strong className="text-white font-bold">{selectedPlan.name}</strong>
                <span className="text-amber-400 font-bold ml-1.5">({selectedPlan.price})</span>
                {selectedPlan.discount && (
                  <span className="ml-1.5 text-[10px] text-emerald-400 font-semibold">
                    • {selectedPlan.discount}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden lg:inline">
                {selectedPlan.id === 'plan_trial'
                  ? 'Gói dùng thử 1 ngày (20 bài), miễn phí 100% & không cần chuyển khoản'
                  : 'Mở tiện ích trên trình duyệt ➔ Chọn gói này để quét mã QR thanh toán'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (onSelectPlan) {
                    onSelectPlan({ name: selectedPlan.name, price: selectedPlan.price });
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow cursor-pointer ${
                  selectedPlan.id === 'plan_trial'
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <span>{selectedPlan.id === 'plan_trial' ? '🚀 Đăng Ký Dùng Thử Ngay (0đ)' : '🚀 Mở Hộp Thoại Đặt Mua'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 3 Bước Đặt Mua Trực Quan Dàn Ngang (Cực Kỳ Gọn Gàng & Đẹp Mắt) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Bước 1 */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[11px]">
                1
              </span>
              <strong className="text-white text-xs">Cài tiện ích lên trình duyệt</strong>
            </div>
            <p className="text-slate-400 text-[11.5px] leading-relaxed">
              Tải file ZIP ở trên ➔ Giải nén ➔ Tải vào Chrome/Edge/Cốc Cốc theo hướng dẫn.
            </p>
          </div>

          {/* Bước 2 */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-[11px]">
                2
              </span>
              <strong className="text-white text-xs">Chọn gói &amp; Quét QR thanh toán</strong>
            </div>
            <p className="text-slate-400 text-[11.5px] leading-relaxed">
              Mở tiện ích lên ➔ Kích vào gói muốn mua. Màn hình tiện ích sẽ hiển thị trực tiếp <strong>mã QR chuyển khoản</strong>.
            </p>
          </div>

          {/* Bước 3 */}
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px]">
                3
              </span>
              <strong className="text-emerald-400 text-xs">Kích "Xác nhận mua" ➔ Tự động duyệt</strong>
            </div>
            <p className="text-slate-400 text-[11.5px] leading-relaxed">
              Thanh toán xong, kích <strong>"Xác nhận mua"</strong>, hệ thống tự động gửi yêu cầu kèm Mã Thiết Bị lên Admin duyệt là xong!
            </p>
          </div>
        </div>

        {/* Nạp key nhanh dự phòng */}
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setShowQuickActivate(!showQuickActivate)}
            className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
          >
            <Key className="w-3 h-3" />
            <span>{showQuickActivate ? 'Ẩn ô nạp key nhanh' : 'Đã có mã key từ Admin? Bấm vào đây để nạp nhanh dự phòng'}</span>
          </button>

          {showQuickActivate && (
            <div className="mt-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customerActivationKey}
                  onChange={(e) => setCustomerActivationKey(e.target.value.toUpperCase())}
                  placeholder="Dán mã bản quyền (VD: GLFB-VIP-XXXXX)..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => handleActivateViaBridge(customerActivationKey)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold cursor-pointer"
                >
                  Kích Hoạt
                </button>
              </div>
              {activationStatus && (
                <p className="text-[11px] text-emerald-400 font-medium">{activationStatus}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* HỘP THOẠI HƯỚNG DẪN QUY TRÌNH ĐẶT MUA & TẢI FILE ZIP */}
      {purchaseGuidePlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
          onClick={() => {
            setPurchaseGuidePlan(null);
            setQuickOrderSuccess(null);
          }}
        >
          <div
            className="bg-slate-900 border-2 border-indigo-500/40 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                  <Package className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Quy Trình Đặt Mua &amp; Cài Đặt Bản Quyền</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Gói đang chọn: <strong className="text-sky-400 font-bold">{purchaseGuidePlan.name}</strong> • Chi phí: <strong className="text-emerald-400 font-bold">{purchaseGuidePlan.price}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPurchaseGuidePlan(null);
                  setQuickOrderSuccess(null);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg text-sm font-bold hover:bg-slate-800 transition cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* KHỐI 1: HIỆN FILE ZIP CẦN TẢI ĐỂ NGƯỜI DÙNG THAO TÁC TẢI VỀ LUÔN */}
            <div className="bg-gradient-to-r from-emerald-950/80 via-teal-950/70 to-slate-950 border-2 border-emerald-500/50 rounded-xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>File Cài Đặt Bản Quyền Chuẩn v{currentVersion}</span>
                </div>
                <p className="text-xs sm:text-[13px] text-white font-semibold">
                  Tải file ZIP về máy để cài đặt trực tiếp vào trình duyệt trong 1 phút!
                </p>
                <p className="text-[11px] text-slate-300">
                  Dung lượng: ~{fileSizeKb} KB • Trực tiếp từ máy chủ • Không qua Store trung gian • An toàn 100%
                </p>
              </div>
              <button
                type="button"
                onClick={onDownloadZip}
                disabled={isDownloadingZip}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer shrink-0 border border-emerald-400/40"
              >
                <Download className={`w-4 h-4 ${isDownloadingZip ? 'animate-bounce' : ''}`} />
                <span>{isDownloadingZip ? 'Đang Tải File ZIP...' : '📥 Tải File ZIP Tiện Ích'}</span>
              </button>
            </div>

            {/* KHỐI 2: 3 BƯỚC QUY TRÌNH ĐẶT MUA & CÀI ĐẶT TRỰC QUAN */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>3 Bước Hoàn Tất Đặt Mua &amp; Tự Động Kích Hoạt Key:</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                {/* Bước 1 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[11px]">
                      1
                    </span>
                    <strong className="text-white text-xs">Giải Nén File ZIP</strong>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Bấm nút <strong>"Tải File ZIP"</strong> ở trên. Nhấp chuột phải vào file vừa tải về ➔ Chọn <strong>"Extract All"</strong> ra một thư mục.
                  </p>
                </div>

                {/* Bước 2 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[11px]">
                      2
                    </span>
                    <strong className="text-white text-xs">Cài Vào Trình Duyệt</strong>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Vào <code className="text-sky-300 bg-slate-900 px-1 rounded font-mono text-[10.5px]">chrome://extensions</code> hoặc Edge ➔ Bật <strong>Developer mode</strong> ➔ Bấm <strong>"Load unpacked"</strong> ➔ Chọn thư mục vừa giải nén.
                  </p>
                </div>

                {/* Bước 3 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px]">
                      3
                    </span>
                    <strong className="text-emerald-400 text-xs">Mở Extension &amp; Xác Nhận</strong>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Mở tiện ích lên ➔ Chọn gói <strong>{purchaseGuidePlan.name}</strong> ➔ Quét mã QR ➔ Bấm <strong>"Xác Nhận Mua"</strong> để nhận key tự động theo máy!
                  </p>
                </div>
              </div>
            </div>

            {/* KHỐI 3: FORM ĐẶT MUA NHANH QUA WEB (NẾU KHÁCH MUỐN ADMIN DUYỆT TRƯỚC) */}
            {!quickOrderSuccess ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="font-bold text-slate-200">
                    💡 Hoặc gửi thông tin đặt mua nhanh qua Web (Quản trị viên liên hệ duyệt):
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Hỗ trợ 24/7
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={quickOrderPhone}
                    onChange={(e) => setQuickOrderPhone(e.target.value)}
                    placeholder="Số điện thoại / Zalo nhận key (*) "
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 font-mono text-xs focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={quickOrderName}
                    onChange={(e) => setQuickOrderName(e.target.value)}
                    placeholder="Tên bạn hoặc Đơn vị (tùy chọn)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white placeholder-slate-500 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleQuickWebOrder}
                    disabled={isSubmittingQuickOrder}
                    className="px-4 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-lg font-bold text-xs shadow transition cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingQuickOrder ? 'Đang gửi...' : 'Gửi Yêu Cầu Đặt Mua Qua Web'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-3.5 space-y-2 text-xs text-center animate-in fade-in">
                <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>ĐÃ GỬI YÊU CẦU ĐẶT MUA THÀNH CÔNG!</span>
                </div>
                <p className="text-slate-300 text-xs">
                  Mã đơn hàng: <strong className="text-sky-400 font-mono">#{quickOrderSuccess.id}</strong> • Gói: <strong className="text-white">{purchaseGuidePlan.name}</strong>
                </p>
                <p className="text-[11px] text-slate-400">
                  Quản trị viên đã ghi nhận yêu cầu và sẽ hỗ trợ kích hoạt key bản quyền cho bạn qua SĐT/Zalo <strong>{quickOrderPhone}</strong>!
                </p>
                <div className="flex justify-center pt-1">
                  <a
                    href={`https://zalo.me/0869029310?text=${encodeURIComponent(
                      `Chào Admin, tôi vừa gửi đơn mua ${purchaseGuidePlan.name} trên Web (SĐT: ${quickOrderPhone}, Mã đơn: #${quickOrderSuccess.id}). Nhờ Admin duyệt và cấp key giúp tôi nhé!`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs transition shadow flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Mở Zalo Nhận Key Ngay (0869.029.310)</span>
                  </a>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <a
                href={`https://zalo.me/0869029310?text=${encodeURIComponent(
                  `Chào Admin, tôi đang quan tâm ${purchaseGuidePlan.name} (${purchaseGuidePlan.price}). Nhờ Admin hướng dẫn và hỗ trợ cài đặt giúp tôi nhé!`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat Zalo Admin: 0869.029.310 (Hỗ trợ 24/7)</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setPurchaseGuidePlan(null);
                  setQuickOrderSuccess(null);
                }}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
