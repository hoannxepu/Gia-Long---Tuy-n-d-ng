import React, { useState } from 'react';
import { getApiUrl } from './apiConfig.ts';
import {
  X,
  Send,
  CheckCircle2,
  PhoneCall,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Zap,
  Gift,
  Laptop,
  Copy,
  Check
} from 'lucide-react';

export interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  adminZaloUrl: string;
  onOrderSuccess?: (order: any) => void;
}

// Cấu trúc thông tin chuyển khoản: Tên, SĐT, gói cước (1TH 3TH 6TH 1N..), mã máy
export function getPackageCodeSymbol(pkgName: string): string {
  if (!pkgName) return '1TH';
  const lower = pkgName.toLowerCase();
  if (lower.includes('dùng thử') || lower.includes('trial') || lower.includes('1 ngày')) {
    return 'TRIAL';
  }
  if (lower.includes('12 tháng') || lower.includes('12m') || lower.includes('360 ngày') || lower.includes('390 ngày') || lower.includes('1 năm') || lower.includes('1 nam') || lower.includes('13 tháng')) {
    return '1N';
  }
  if (lower.includes('6 tháng') || lower.includes('6m') || lower.includes('180 ngày') || lower.includes('195 ngày')) {
    return '6TH';
  }
  if (lower.includes('3 tháng') || lower.includes('3m') || lower.includes('90 ngày') || lower.includes('100 ngày')) {
    return '3TH';
  }
  if (lower.includes('1 tháng') || lower.includes('1m') || lower.includes('30 ngày')) {
    return '1TH';
  }
  return '1TH';
}

export function removeAccentsUpper(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase();
}

export function generateTransferMemo(customerName: string, phone: string, pkgName: string, deviceId: string): string {
  const cleanName = removeAccentsUpper(customerName);
  const cleanPhone = (phone || '').replace(/\D/g, '').trim();
  const pkgCode = getPackageCodeSymbol(pkgName);
  const cleanDevId = (deviceId || 'WEB-CLIENT').trim();
  const parts = [];
  if (cleanName) parts.push(cleanName);
  if (cleanPhone) parts.push(cleanPhone);
  parts.push(pkgCode);
  parts.push(cleanDevId);
  return parts.join(' ');
}

const PLAN_OPTIONS = [
  {
    id: 'plan_trial',
    name: 'Gói Dùng Thử (1 ngày)',
    fullName: 'Gói Dùng Thử (1 ngày) - 0đ (Giới hạn 20 bài)',
    price: '0đ',
    originalPrice: null,
    badge: 'DÙNG THỬ 1 NGÀY',
    highlight: false,
    saving: 'Miễn phí 100% • Không cần chuyển khoản',
    desc: 'Đăng tối đa 20 bài tự động trong 24h, trải nghiệm toàn diện trước khi mua',
  },
  {
    id: 'plan_3m',
    name: 'Gói 3 Tháng (100 ngày)',
    fullName: 'Gói 3 Tháng (100 ngày) - 2.700.000đ (Bán chạy nhất)',
    price: '2.700.000đ',
    originalPrice: '3.000.000đ',
    badge: '🔥 BÁN CHẠY NHẤT • TẶNG 10 NGÀY',
    highlight: true,
    saving: 'Tiết kiệm 800.000đ (-10%)',
    desc: 'Đăng ~30.000 bài tự động, 100 ngày sử dụng, hỗ trợ đổi máy miễn phí',
  },
  {
    id: 'plan_1m',
    name: 'Gói 1 Tháng (30 ngày)',
    fullName: 'Gói 1 Tháng (30 ngày) - 1.000.000đ',
    price: '1.000.000đ',
    originalPrice: null,
    badge: '30 NGÀY',
    highlight: false,
    saving: null,
    desc: 'Đăng ~9.000 - 10.500 bài/tháng, 1 máy tính sử dụng, đầy đủ tính năng',
  },
  {
    id: 'plan_6m',
    name: 'Gói 6 Tháng (195 ngày)',
    fullName: 'Gói 6 Tháng (195 ngày) - 5.400.000đ',
    price: '5.400.000đ',
    originalPrice: '6.000.000đ',
    badge: '💎 TẶNG 15 NGÀY',
    highlight: false,
    saving: 'Tiết kiệm 1.600.000đ + VIP 1-1',
    desc: 'Đăng ~60.000 bài tự động, hỗ trợ kỹ thuật ưu tiên qua Zalo',
  },
  {
    id: 'plan_12m',
    name: 'Gói 12 Tháng (390 ngày)',
    fullName: 'Gói 12 Tháng (390 ngày) - 10.800.000đ',
    price: '10.800.000đ',
    originalPrice: '12.000.000đ',
    badge: '👑 TẶNG 30 NGÀY',
    highlight: false,
    saving: 'Tiết kiệm 3.200.000đ',
    desc: 'Đăng ~120.000 bài tự động, 390 ngày sử dụng, đặc quyền bảo trì ưu tiên',
  },
];

export function OrderModal({
  isOpen,
  onClose,
  initialPlan,
  adminZaloUrl,
  onOrderSuccess,
}: OrderModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>(() => {
    if (initialPlan) {
      const match = PLAN_OPTIONS.find(p => p.name.includes(initialPlan) || initialPlan.includes(p.name));
      if (match) return match.fullName;
      return initialPlan;
    }
    return PLAN_OPTIONS[0].fullName;
  });

  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [deviceId, setDeviceId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedOrder, setSubmittedOrder] = useState<any | null>(null);
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);

  // Sync initialPlan when modal opens with new selection
  React.useEffect(() => {
    if (isOpen) {
      if (initialPlan) {
        const match = PLAN_OPTIONS.find(p => p.name.includes(initialPlan) || initialPlan.includes(p.name));
        if (match) {
          setSelectedPlan(match.fullName);
        } else {
          setSelectedPlan(initialPlan);
        }
      }
      setSubmittedOrder(null);
    }
  }, [isOpen, initialPlan]);

  if (!isOpen) return null;

  const currentPlanObj = PLAN_OPTIONS.find(p => p.fullName === selectedPlan) || PLAN_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone.trim()) {
      alert('Vui lòng nhập Số điện thoại hoặc Zalo để Admin liên hệ cấp key!');
      return;
    }

    setIsSubmitting(true);
    try {
      const parts = selectedPlan.split(' - ');
      const pkgName = parts[0] || selectedPlan;
      const price = parts[1] ? parts[1].split(' ')[0] : currentPlanObj.price;
      const memo = generateTransferMemo(customerName, customerPhone, pkgName, deviceId);
      const note = `Đăng ký từ Hộp Thoại Web • Gói: ${selectedPlan} • Nội dung CK: ${memo}`;

      const res = await fetch(getApiUrl('/api/orders/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pkgName,
          price,
          clientName: customerName || 'Khách Đăng Ký Web',
          phone: customerPhone,
          deviceId: deviceId || 'Chưa gắn mã',
          note,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmittedOrder(data.order || { id: `ord_${Date.now()}`, pkgName, price, phone: customerPhone, clientName: customerName, deviceId });
        if (onOrderSuccess) onOrderSuccess(data.order);
      } else {
        alert(data.message || 'Lỗi gửi yêu cầu!');
      }
    } catch (err: any) {
      // Fallback offline confirmation
      const fallbackOrder = {
        id: `ord_${Date.now()}`,
        pkgName: currentPlanObj.name,
        price: currentPlanObj.price,
        phone: customerPhone,
        clientName: customerName || 'Khách Web',
        deviceId: deviceId || 'WEB-CLIENT',
      };
      setSubmittedOrder(fallbackOrder);
      if (onOrderSuccess) onOrderSuccess(fallbackOrder);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNewOrder = () => {
    setSubmittedOrder(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeviceId('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full my-auto overflow-hidden text-slate-100 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Đăng Ký Bản Quyền Gia Long - FB
                </h3>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Tự Động Kích Hoạt
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Gửi thông tin nhận mã bản quyền VIP • Kỹ thuật viên hỗ trợ Zalo 24/7
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {!submittedOrder ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Chọn gói cước trực quan */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-bold text-xs flex items-center justify-between">
                  <span>1. Chọn gói bản quyền mong muốn: <span className="text-rose-400">*</span></span>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    Đang chọn: <strong>{currentPlanObj.price}</strong>
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PLAN_OPTIONS.map((plan) => {
                    const isSelected = selectedPlan === plan.fullName || selectedPlan.includes(plan.name);
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlan(plan.fullName)}
                        className={`text-left p-3 rounded-xl border transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-gradient-to-br from-emerald-950/60 to-slate-900 border-emerald-500 shadow-md shadow-emerald-600/20 text-white'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-white">{plan.name}</span>
                          <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${
                            plan.highlight
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            {plan.badge}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-base font-black text-emerald-400">{plan.price}</span>
                          {plan.originalPrice && (
                            <span className="text-[10px] text-slate-500 line-through">{plan.originalPrice}</span>
                          )}
                        </div>
                        {plan.saving && (
                          <span className="text-[10px] text-amber-300 font-semibold block mt-0.5">
                            {plan.saving}
                          </span>
                        )}
                        <p className="text-[10.5px] text-slate-400 mt-1 line-clamp-1">{plan.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thông tin khách hàng */}
              <div className="space-y-3 pt-1 border-t border-slate-800/80">
                <span className="block text-slate-300 font-bold text-xs">
                  2. Thông tin người nhận bản quyền:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">
                      Họ tên hoặc Tên đơn vị:
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="VD: Anh Tuấn (Công ty Hoa Phượng)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1 font-medium">
                      Số điện thoại / Zalo nhận key: <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="VD: 0869029310"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-400 text-[11px] font-medium">
                      Mã thiết bị (Device ID) - Nếu đã cài tiện ích:
                    </label>
                    <span className="text-slate-500 text-[10px]">Tùy chọn (có thể bổ sung sau)</span>
                  </div>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="VD: dev_ab12cd... (Mở popup Extension để copy)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                  />
                </div>
              </div>

              {/* Thông tin hỗ trợ & Quét QR Zalo */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="space-y-1 text-center sm:text-left flex-1">
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
                    <span className="font-bold text-white">Hotline / Zalo Hỗ Trợ:</span>
                    <a
                      href={adminZaloUrl || 'https://zalo.me/0869029310'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 font-mono font-bold hover:underline"
                    >
                      0869.029.310
                    </a>
                  </div>
                  <p className="text-[10.5px] text-slate-400">
                    Hỗ trợ giải đáp chi tiết qua tin nhắn Zalo 1-1 • Cấp mã bản quyền trong 1 phút sau khi nhận đơn!
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <img
                    src="/zalo_card.svg"
                    alt="Zalo QR"
                    className="w-10 h-10 object-contain rounded bg-white p-0.5"
                    onError={(e) => {
                      (e.target as any).src = '/zalo_qr.png';
                    }}
                  />
                  <div className="text-[10px] text-left text-slate-300">
                    <div className="font-semibold text-white">Quét Zalo</div>
                    <div className="text-slate-400">Chat Admin</div>
                  </div>
                </div>
              </div>

              {/* Nút hành động Form */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Đang gửi thông tin...'
                      : (currentPlanObj.price === '0đ' || currentPlanObj.name.includes('Dùng Thử'))
                      ? '🚀 Gửi Yêu Cầu Kích Hoạt Dùng Thử (0đ)'
                      : '🚀 Gửi Yêu Cầu Cấp Key Bản Quyền'}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            /* TRẠNG THÁI GỬI ĐƠN THÀNH CÔNG */
            <div className="py-4 space-y-4 text-center">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base sm:text-lg font-bold text-white">
                  {(submittedOrder.price === '0đ' || submittedOrder.pkgName?.includes('Dùng Thử'))
                    ? 'Đã Gửi Yêu Cầu Kích Hoạt Dùng Thử Thành Công!'
                    : 'Đã Gửi Đơn Đăng Ký Bản Quyền Thành Công!'}
                </h4>
                <p className="text-xs text-slate-300">
                  {(submittedOrder.price === '0đ' || submittedOrder.pkgName?.includes('Dùng Thử'))
                    ? 'Yêu cầu dùng thử 1 ngày (20 bài đăng) đã được chuyển tới Quản trị viên Gia Long - FB.'
                    : 'Yêu cầu của bạn đã được chuyển tới máy chủ Quản trị viên Gia Long - FB.'}
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left text-xs space-y-2 max-w-md mx-auto">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Mã đơn hàng:</span>
                  <span className="font-mono font-bold text-sky-400">#{submittedOrder.id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Gói đã chọn:</span>
                  <span className="font-bold text-emerald-400">{submittedOrder.pkgName} ({submittedOrder.price})</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Số điện thoại / Zalo:</span>
                  <span className="font-mono font-bold text-white">{submittedOrder.phone}</span>
                </div>
                {submittedOrder.deviceId && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Mã thiết bị:</span>
                    <span className="font-mono text-[11px] text-purple-300 font-semibold">{submittedOrder.deviceId}</span>
                  </div>
                )}
              </div>

              {/* KHỐI HIỂN THỊ: GÓI DÙNG THỬ (0Đ - KHÔNG CẦN CHUYỂN KHOẢN) HOẶC VIETQR THANH TOÁN */}
              {(() => {
                const isTrial = submittedOrder.price === '0đ' || submittedOrder.pkgName?.includes('Dùng Thử');

                if (isTrial) {
                  return (
                    <div className="bg-gradient-to-br from-purple-950/40 via-slate-950 to-emerald-950/40 p-4 rounded-xl border border-purple-500/40 text-left text-xs space-y-3 max-w-md mx-auto shadow-lg">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center justify-center font-bold text-base shrink-0">
                          🎁
                        </div>
                        <div>
                          <div className="text-[12px] text-purple-300 font-bold uppercase tracking-wide">
                            GÓI DÙNG THỬ 1 NGÀY (MIỄN PHÍ 0Đ)
                          </div>
                          <div className="text-[11px] text-emerald-400 font-semibold">
                            ✓ Không mất tiền &amp; KHÔNG cần chuyển khoản ngân hàng
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1.5 text-[11.5px] text-slate-300">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Thời hạn sử dụng:</span>
                          <strong className="text-white">1 Ngày (24 giờ)</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Giới hạn số bài đăng:</span>
                          <strong className="text-amber-400 font-bold">Tối đa 20 bài đăng tự động</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Chi phí:</span>
                          <strong className="text-emerald-400 font-bold">0 VNĐ (Miễn phí 100%)</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Trạng thái:</span>
                          <span className="text-sky-400 font-semibold">Chờ Admin cấp key GLFB-TRIAL-...</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-purple-500/20">
                        💡 Bạn chỉ cần nhắn Zalo cho Admin hoặc đợi trong giây lát. Admin sẽ gửi mã Key dùng thử kích hoạt ngay trên máy tính của bạn mà không mất bất kỳ chi phí nào!
                      </div>
                    </div>
                  );
                }

                const memo = generateTransferMemo(
                  submittedOrder.clientName || customerName,
                  submittedOrder.phone || customerPhone,
                  submittedOrder.pkgName,
                  submittedOrder.deviceId || deviceId
                );
                const rawPrice = parseInt((submittedOrder.price || '1.000.000đ').replace(/\D/g, ''), 10) || 1000000;
                const qrUrl = `https://img.vietqr.io/image/970422-0869029310-compact2.png?amount=${rawPrice}&addInfo=${encodeURIComponent(memo)}&accountName=GIA%20LONG%20FB`;

                return (
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-sky-500/30 text-left text-xs space-y-2.5 max-w-md mx-auto">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="bg-white p-1 rounded-lg shrink-0 shadow-md">
                        <img
                          src={qrUrl}
                          alt="VietQR MBBank"
                          className="w-28 h-28 object-contain block"
                        />
                      </div>
                      <div className="space-y-1 text-slate-300 flex-1">
                        <div className="text-[11px] text-sky-400 font-bold">📲 Quét QR Thanh Toán (MBBank):</div>
                        <div className="text-[11.5px]">• STK: <strong className="text-white font-mono font-bold">0869.029.310</strong></div>
                        <div className="text-[11.5px]">• Chủ TK: <strong className="text-white">GIA LONG - FB</strong></div>
                        <div className="text-[11.5px]">• Số tiền: <strong className="text-emerald-400 font-bold">{submittedOrder.price}</strong></div>
                      </div>
                    </div>

                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-slate-400">
                          Cấu trúc CK: <strong>Tên, SĐT, Gói, Mã máy</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(memo);
                            setCopiedMemo(true);
                            setTimeout(() => setCopiedMemo(false), 2000);
                          }}
                          className="px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          {copiedMemo ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedMemo ? 'Đã chép!' : 'Sao chép'}</span>
                        </button>
                      </div>
                      <div className="font-mono text-xs font-bold text-emerald-400 break-all select-all">
                        {memo}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 max-w-md mx-auto flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {(submittedOrder.price === '0đ' || submittedOrder.pkgName?.includes('Dùng Thử'))
                    ? 'Admin đang trực tuyến và sẽ hỗ trợ cấp key dùng thử 1 ngày (20 bài) ngay qua Zalo!'
                    : 'Admin đang trực tuyến và sẽ liên hệ cấp key kích hoạt cho bạn ngay qua Zalo!'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 max-w-md mx-auto">
                {(() => {
                  const isTrial = submittedOrder.price === '0đ' || submittedOrder.pkgName?.includes('Dùng Thử');
                  const zaloMsg = isTrial
                    ? `Chào Admin, tôi vừa gửi yêu cầu Gói Dùng Thử 1 Ngày (20 bài đăng, SĐT: ${submittedOrder.phone}, Mã đơn: #${submittedOrder.id}). Nhờ Admin duyệt và cấp key dùng thử giúp tôi nhé!`
                    : `Chào Admin, tôi vừa gửi đơn mua ${submittedOrder.pkgName} (SĐT: ${submittedOrder.phone}, Mã đơn: #${submittedOrder.id}). Nhờ Admin duyệt và cấp key giúp tôi nhé!`;
                  return (
                    <a
                      href={`${adminZaloUrl || 'https://zalo.me/0869029310'}?text=${encodeURIComponent(zaloMsg)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{isTrial ? 'Nhắn Zalo Nhận Key Dùng Thử Ngay' : 'Nhắn Zalo Admin Cấp Key Ngay'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                })()}
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Đóng
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleResetForNewOrder}
                  className="text-[11px] text-slate-500 hover:text-slate-400 underline"
                >
                  Tạo đơn đăng ký khác
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
