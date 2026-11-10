// src/components/salaries/EmployeeCalendarModal.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  monthly_wage: number;
  daily_wage: number;
  phone: string | null;
  is_active: number;
  created_at: string;
  total_days_worked: number;
  total_earned: number;
  total_paid: number;
  balance_due: number;
}

interface Account {
  id: number;
  name: string;
  balance: number;
}

interface CalendarRecord {
  attendance_id: number;
  employee_id: number;
  date: string;
  status: 'Geldi' | 'Yarım Gün' | 'Mesai' | 'Gelmedi';
  work_hours?: number;
  daily_wage: number;
  is_paid: number;
  paid_amount?: number;
  account_id: number | null;
  account_name: string | null;
  note: string | null;
}

interface EmployeeCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  accounts?: Account[];
  onSelectDateForAttendance?: (date: string) => void;
  onOpenPayDue?: (employee: Employee) => void;
  onAttendanceUpdated?: () => void;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function EmployeeCalendarModal({
  isOpen,
  onClose,
  employee,
  accounts = [],
  onOpenPayDue,
  onAttendanceUpdated,
}: EmployeeCalendarModalProps) {
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [records, setRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Selected day for inline editing
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [savingDay, setSavingDay] = useState(false);
  const [daySuccessMessage, setDaySuccessMessage] = useState('');

  // Multi-select state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<'Geldi' | 'Mesai' | 'Gelmedi' | 'Boş'>('Geldi');
  const [bulkWorkHours, setBulkWorkHours] = useState<number>(11);
  const [bulkPaymentMode, setBulkPaymentMode] = useState<'unpaid' | 'full'>('unpaid');
  const [bulkAccountId, setBulkAccountId] = useState<string>('');
  const [savingBulk, setSavingBulk] = useState(false);

  // Inline day edit form state
  const [dayForm, setDayForm] = useState<{
    status: 'Geldi' | 'Mesai' | 'Gelmedi' | 'Boş';
    work_hours: number;
    daily_wage: number;
    payment_mode: 'full' | 'partial' | 'unpaid';
    paid_amount: number;
    account_id: string;
    note: string;
  }>({
    status: 'Boş',
    work_hours: 11,
    daily_wage: 0,
    payment_mode: 'unpaid',
    paid_amount: 0,
    account_id: '',
    note: '',
  });

  const fetchCalendar = useCallback(async (empId: number, month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/salaries/attendance?employee_id=${empId}&month=${month}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      console.error('Fetch employee calendar error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && employee) {
      fetchCalendar(employee.id, selectedMonth);
      setSelectedDayDate(null);
    }
  }, [isOpen, employee, selectedMonth, fetchCalendar]);

  if (!employee) return null;

  // Month navigation handlers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const newMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
    setSelectedDayDate(null);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const newMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
    setSelectedDayDate(null);
  };

  // Parse Year and Month
  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const monthTitle = `${MONTH_NAMES[monthNum - 1]} ${yearNum}`;

  // Build calendar matrix
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const firstDayOfWeek = (new Date(yearNum, monthNum - 1, 1).getDay() + 6) % 7; // 0 = Monday, 6 = Sunday

  // Map records by date (YYYY-MM-DD)
  const recordMap = new Map<string, CalendarRecord>();
  records.forEach((r) => recordMap.set(r.date, r));

  // Monthly stats
  const workingDays = records.filter(
    (r) => r.status === 'Geldi' || r.status === 'Yarım Gün' || r.status === 'Mesai'
  );
  const fullDays = records.filter((r) => r.status === 'Geldi');
  const halfDays = records.filter((r) => r.status === 'Yarım Gün');
  const mesaiDays = records.filter((r) => r.status === 'Mesai');
  const absentDays = records.filter((r) => r.status === 'Gelmedi');

    // Count weekends without explicit Gelmedi as earned days
    let weekendEarned = 0;
    let weekendHours = 0;
    let weekendAttendedCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(yearNum, monthNum - 1, day);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      if (isWeekend) {
        const rec = recordMap.get(dateIso);
        if (!rec) {
          // No record: automatically earned (HS)
          weekendEarned += employee.daily_wage;
          weekendHours += 11;
          weekendAttendedCount += 1;
        }
      }
    }

    const totalEarned = workingDays.reduce((s, r) => s + r.daily_wage, 0) + weekendEarned;
    const totalPaid = workingDays.reduce(
      (s, r) =>
        s +
        (r.paid_amount !== undefined
          ? r.paid_amount
          : r.is_paid === 1
          ? r.daily_wage
          : 0),
      0
    );
  const fullPaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p >= r.daily_wage && p > 0;
  });
  const partialPaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p > 0 && p < r.daily_wage;
  });
  const unpaidDays = workingDays.filter((r) => {
    const p =
      r.paid_amount !== undefined
        ? r.paid_amount
        : r.is_paid === 1
        ? r.daily_wage
        : 0;
    return p === 0;
  });
  const totalDue = totalEarned - totalPaid;

  const todayIso = new Date().toISOString().split('T')[0];

  // Open day editor when clicking a day
  const handleSelectDay = (dateIso: string) => {
    setSelectedDayDate(dateIso);
    setDaySuccessMessage('');
    const rec = recordMap.get(dateIso);

    if (rec) {
      const isPaidFull = (rec.paid_amount || 0) >= rec.daily_wage && rec.daily_wage > 0;
      const isPaidPartial = (rec.paid_amount || 0) > 0 && (rec.paid_amount || 0) < rec.daily_wage;
      const hours = rec.work_hours !== undefined ? rec.work_hours : (rec.status === 'Gelmedi' ? 0 : 11);
      const cleanStatus = (rec.status === 'Yarım Gün' ? 'Geldi' : rec.status) as 'Geldi' | 'Mesai' | 'Gelmedi' | 'Boş';
      setDayForm({
        status: cleanStatus,
        work_hours: hours,
        daily_wage: rec.daily_wage,
        payment_mode: isPaidFull ? 'full' : isPaidPartial ? 'partial' : 'unpaid',
        paid_amount: rec.paid_amount || 0,
        account_id: rec.account_id ? String(rec.account_id) : '',
        note: rec.note || '',
      });
    } else {
      // Default new record for this day
      setDayForm({
        status: 'Geldi',
        work_hours: 11,
        daily_wage: employee.daily_wage,
        payment_mode: 'unpaid',
        paid_amount: 0,
        account_id: accounts.length > 0 ? String(accounts[0].id) : '',
        note: '',
      });
    }
  };

  // Quick 1-click update status for a day directly
  const handleQuickStatusChange = async (
    dateIso: string,
    newStatus: 'Geldi' | 'Mesai' | 'Gelmedi' | 'Boş'
  ) => {
    setSavingDay(true);
    try {
      const rec = recordMap.get(dateIso);
      let wage = employee.daily_wage;
      let hours = 11;
      if (newStatus === 'Mesai') {
        hours = 11;
        wage = Math.round(employee.daily_wage * 1.5 * 100) / 100;
      } else if (newStatus === 'Gelmedi' || newStatus === 'Boş') {
        hours = 0;
        wage = 0;
      }

      let paidAmt = rec?.paid_amount || 0;
      if (newStatus === 'Boş' || newStatus === 'Gelmedi') {
        paidAmt = 0;
      } else if (paidAmt > wage) {
        paidAmt = wage;
      }

      const res = await fetch('/api/salaries/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateIso,
          records: [
            {
              employee_id: employee.id,
              status: newStatus === 'Boş' ? null : newStatus,
              work_hours: hours,
              daily_wage: wage,
              paid_amount: paidAmt,
              account_id: rec?.account_id || null,
              note: rec?.note || null,
            },
          ],
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Kaydedilemedi.');
      }

      await fetchCalendar(employee.id, selectedMonth);
      if (onAttendanceUpdated) onAttendanceUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kaydedilirken hata oluştu.');
    } finally {
      setSavingDay(false);
    }
  };

  // Save detailed day form
  const handleSaveDayForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDayDate) return;
    setSavingDay(true);
    setDaySuccessMessage('');

    try {
      let paidAmt = 0;
      if (dayForm.status === 'Geldi' || dayForm.status === 'Mesai') {
        if (dayForm.payment_mode === 'full') {
          paidAmt = dayForm.daily_wage;
        } else if (dayForm.payment_mode === 'partial') {
          paidAmt = dayForm.paid_amount;
        }
      }

      const res = await fetch('/api/salaries/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDayDate,
          records: [
            {
              employee_id: employee.id,
              status: dayForm.status === 'Boş' ? null : dayForm.status,
              work_hours: dayForm.status === 'Gelmedi' ? 0 : dayForm.work_hours,
              daily_wage: dayForm.status === 'Gelmedi' || dayForm.status === 'Boş' ? 0 : dayForm.daily_wage,
              paid_amount: paidAmt,
              account_id: paidAmt > 0 && dayForm.account_id ? Number(dayForm.account_id) : null,
              note: dayForm.note || null,
            },
          ],
        }),
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Güncellenemedi.');

      setDaySuccessMessage('Kayıt başarıyla güncellendi.');
      await fetchCalendar(employee.id, selectedMonth);
      if (onAttendanceUpdated) onAttendanceUpdated();

      setTimeout(() => {
        setDaySuccessMessage('');
      }, 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hata oluştu.');
    } finally {
      setSavingDay(false);
    }
  };

  // Bulk Save Handler
  const handleSaveBulk = async () => {
    if (selectedDates.length === 0) return;
    setSavingBulk(true);
    try {
      const hourlyRate = employee.daily_wage > 0 ? employee.daily_wage / 11 : 0;
      let hrs = bulkWorkHours;
      let wage = 0;
      if (bulkStatus === 'Geldi') {
        wage = Math.round(hrs * hourlyRate * 100) / 100;
      } else if (bulkStatus === 'Mesai') {
        wage = Math.round(hrs * (hourlyRate * 1.5) * 100) / 100;
      } else if (bulkStatus === 'Gelmedi' || bulkStatus === 'Boş') {
        hrs = 0;
        wage = 0;
      }

      let paidAmt = 0;
      if (bulkPaymentMode === 'full' && (bulkStatus === 'Geldi' || bulkStatus === 'Mesai')) {
        paidAmt = wage;
      }

      for (const d of selectedDates) {
        await fetch('/api/salaries/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: d,
            records: [
              {
                employee_id: employee.id,
                status: bulkStatus === 'Boş' ? null : bulkStatus,
                work_hours: hrs,
                daily_wage: wage,
                paid_amount: paidAmt,
                account_id: paidAmt > 0 && bulkAccountId ? Number(bulkAccountId) : null,
              },
            ],
          }),
        });
      }

      await fetchCalendar(employee.id, selectedMonth);
      if (onAttendanceUpdated) onAttendanceUpdated();
      setSelectedDates([]);
      setIsMultiSelectMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Toplu güncelleme hatası.');
    } finally {
      setSavingBulk(false);
    }
  };

  const handleToggleDateSelection = (dateIso: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateIso) ? prev.filter((d) => d !== dateIso) : [...prev, dateIso]
    );
  };

  const handleSelectAllWorkingDays = () => {
    const list: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(yearNum, monthNum - 1, day).getDay(); // 0 is Sunday
      if (dayOfWeek !== 0) list.push(dateIso);
    }
    setSelectedDates(list);
  };

  const handleSelectAllDays = () => {
    const list: string[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      list.push(`${yearNum}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    setSelectedDates(list);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${employee.first_name} ${employee.last_name} — Çalışma & Yoklama Takvimi`}
      size="lg"
    >
      <div className="space-y-5">
        {/* Employee Header & Month Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gray-50/80 rounded-2xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white font-bold flex items-center justify-center text-sm shadow-md shadow-primary-500/20">
              {employee.first_name.charAt(0)}
              {employee.last_name.charAt(0)}
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight">
                {employee.first_name} {employee.last_name}
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span title="Aylık Standart Maaş (30 gün)">Aylık Maaş: <strong className="text-indigo-700">{formatCurrency(employee.monthly_wage || employee.daily_wage * 30)}</strong></span>
                <span>·</span>
                <span title="Günlük Hakediş (Maaş ÷ 30)">Günlük: <strong className="text-gray-900">{formatCurrency(employee.daily_wage)}</strong></span>
                <span>·</span>
                <span title="Günlük ÷ 11 Saat">Saatlik (11s): <strong className="text-primary-700">{formatCurrency(employee.daily_wage / 11)}</strong></span>
                <span>·</span>
                <span>Mesai Saatlik (1.5x): <strong className="text-purple-600">{formatCurrency((employee.daily_wage / 11) * 1.5)}</strong></span>
              </p>
            </div>
          </div>

          {/* Actions & Month Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextMode = !isMultiSelectMode;
                setIsMultiSelectMode(nextMode);
                setSelectedDates([]);
                setSelectedDayDate(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isMultiSelectMode
                  ? 'bg-amber-500 text-white shadow-amber-500/25 ring-2 ring-amber-400'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
              title="Birden çok gün seçerek toplu yoklama düzenle"
            >
              <span>☑️</span> {isMultiSelectMode ? 'Çoklu Seçimi Kapat' : 'Çoklu Seçim (Multi-Select)'}
            </button>

            {onOpenPayDue && (
              <button
                onClick={() => {
                  onOpenPayDue(employee);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/25 transition-all"
                title="Geçmişten başlayarak borç ödemesi yap"
              >
                <span>⚡</span> Borç Öde / Kapat
              </button>
            )}

            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors shadow-sm"
                title="Önceki Ay"
              >
                ◀
              </button>
              <div className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 font-bold text-xs sm:text-sm text-gray-900 shadow-sm text-center min-w-[130px]">
                {monthTitle}
              </div>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors shadow-sm"
                title="Sonraki Ay"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {/* Monthly Mini Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {/* Tam Gün (Yeşil) */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Çalışılan Gün
            </div>
            <p className="text-lg font-extrabold text-emerald-700">{fullDays.length} Gün</p>
          </div>

          {/* Mesai (Mor - 1.5x) */}
          <div className="bg-purple-50 border border-purple-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-purple-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              ⚡ Mesai
            </div>
            <p className="text-lg font-extrabold text-purple-700">{mesaiDays.length} Gün</p>
          </div>

          {/* Tam Ödenen */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-800 text-[11px] font-bold mb-0.5">
              ✓ Ödenen
            </div>
            <p className="text-lg font-extrabold text-emerald-700">{fullPaidDays.length} Gün</p>
          </div>

          {/* Bekleyen Borç (Sarı) */}
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Bekleyen
            </div>
            <p className="text-lg font-extrabold text-amber-700">{unpaidDays.length + partialPaidDays.length} Gün</p>
            <p className="text-[10px] font-semibold text-amber-600 mt-0.5 truncate">
              {formatCurrency(totalDue)}
            </p>
          </div>

          {/* Gelmedi (Kırmızı) */}
          <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-rose-800 text-[11px] font-bold mb-0.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Gelmedi
            </div>
            <p className="text-lg font-extrabold text-rose-700">{absentDays.length} Gün</p>
          </div>

          {/* Toplam Ödenen */}
          <div className="bg-primary-50 border border-primary-200/80 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
            <p className="text-[11px] font-bold text-primary-800 mb-0.5">Ödenen</p>
            <p className="text-base font-extrabold text-primary-700">
              {formatCurrency(totalPaid)}
            </p>
            <p className="text-[10px] text-primary-600 mt-0.5 font-medium truncate">
              Hak: {formatCurrency(totalEarned)}
            </p>
          </div>
        </div>

        {/* Interactive Calendar Grid */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm relative">
          {loading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-20 rounded-2xl">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          )}

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {DAY_NAMES.map((dayName, idx) => (
              <div
                key={dayName}
                className={`text-xs font-bold py-1.5 rounded-lg ${
                  idx >= 5 ? 'text-rose-500 bg-rose-50/50' : 'text-gray-600 bg-gray-50'
                }`}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Matrix */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Blank leading cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="h-16 sm:h-20 rounded-xl bg-gray-50/30 border border-transparent"
              />
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const dateIso = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const record = recordMap.get(dateIso);
              const isToday = dateIso === todayIso;
              const isSelected = selectedDayDate === dateIso;

              const isPresent = record?.status === 'Geldi';
              const isMesai = record?.status === 'Mesai';
              const isWorking = isPresent || isMesai;
              const workHrs = record?.work_hours !== undefined ? record.work_hours : (isPresent || isMesai ? 11 : 0);
              const paidAmt = record
                ? record.paid_amount !== undefined
                  ? record.paid_amount
                  : record.is_paid === 1
                  ? record.daily_wage
                  : 0
                : 0;

              const isFullPaid = isWorking && paidAmt >= (record?.daily_wage || 0) && paidAmt > 0;
              const isPartialPaid = isWorking && paidAmt > 0 && paidAmt < (record?.daily_wage || 0);
              const isUnpaid = isWorking && paidAmt === 0;
              const isAbsent = record?.status === 'Gelmedi';
              const hasRecord = !!record;
              const isMultiSelected = selectedDates.includes(dateIso);

              const dayOfWeek = new Date(yearNum, monthNum - 1, dayNum).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 Paz, 6 Cmt
              const isSaturday = dayOfWeek === 6;
              const isSunday = dayOfWeek === 0;

              return (
                <div
                  key={dateIso}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      handleToggleDateSelection(dateIso);
                    } else {
                      handleSelectDay(dateIso);
                    }
                  }}
                  className={`
                    relative h-16 sm:h-20 p-1.5 rounded-xl border transition-all duration-200 flex flex-col justify-between cursor-pointer group
                    ${
                      isMultiSelectMode && isMultiSelected
                        ? 'ring-4 ring-amber-400 ring-offset-2 scale-[1.04] z-10 shadow-lg'
                        : isSelected
                        ? 'ring-3 ring-primary-600 ring-offset-2 scale-[1.03] z-10'
                        : ''
                    }
                    ${
                      isMesai && isFullPaid
                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm shadow-purple-600/20 hover:scale-[1.02]'
                        : isMesai && isUnpaid
                        ? 'bg-purple-500 text-white border-purple-600 shadow-sm shadow-purple-500/20 hover:scale-[1.02]'
                        : isMesai && isPartialPaid
                        ? 'bg-purple-700 text-white border-purple-800 shadow-sm shadow-purple-700/20 hover:scale-[1.02]'
                        : isFullPaid
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm shadow-emerald-500/20 hover:scale-[1.02]'
                        : isPartialPaid
                        ? 'bg-blue-600 text-white border-blue-700 shadow-sm shadow-blue-500/20 hover:scale-[1.02]'
                        : isUnpaid
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/25 hover:scale-[1.02]'
                        : isAbsent
                        ? 'bg-rose-500 text-white border-rose-600 shadow-sm shadow-rose-500/20 hover:scale-[1.02]'
                        : isWeekend
                        ? 'bg-amber-100/70 border-amber-300/80 text-amber-950 hover:bg-amber-100 hover:border-amber-400 shadow-xs'
                        : 'bg-gray-50/80 border-gray-100 text-gray-700 hover:bg-gray-100/90 hover:border-gray-200'
                    }
                    ${isToday ? 'border-2 border-primary-500' : ''}
                  `}
                  title={`${dayNum} ${monthTitle} ${isWeekend ? '(Hafta Sonu)' : ''} - Tıklayarak yoklamasını düzenleyin`}
                >
                  {/* Top: Day Number & Indicator */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {isMultiSelectMode && (
                        <input
                          type="checkbox"
                          checked={isMultiSelected}
                          onChange={() => {}} // handled by tile click
                          className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400 cursor-pointer pointer-events-none"
                        />
                      )}
                      <span
                        className={`text-xs sm:text-sm font-extrabold ${
                          hasRecord ? 'text-white' : isWeekend ? 'text-amber-900' : 'text-gray-700'
                        }`}
                      >
                        {dayNum}
                      </span>
                    </div>
                    {isWorking ? (
                      <span className="text-[10px] font-black px-1 rounded bg-black/20 text-white">
                        {workHrs}s
                      </span>
                    ) : isWeekend && !isAbsent ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-900 border border-amber-300">
                        HS (11s)
                      </span>
                    ) : null}
                    {isToday && !isWorking && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
                    )}
                  </div>

                  {/* Middle / Bottom: Status badge */}
                  <div className="text-center overflow-hidden">
                    {isMesai ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white/25 text-white backdrop-blur-xs">
                          ⚡ {isSaturday ? 'Cmt Mesai' : 'Mesai'}
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-purple-100 truncate">
                          ₺{record?.daily_wage} {isFullPaid ? '(Ödendi)' : ''}
                        </div>
                      </div>
                    ) : isFullPaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                          ✓ Geldi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-emerald-100 truncate">
                          ₺ Ödendi
                        </div>
                      </div>
                    ) : isPartialPaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/25 text-white backdrop-blur-xs">
                          ⚡ Kısmi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-blue-100 truncate">
                          ₺{paidAmt}
                        </div>
                      </div>
                    ) : isUnpaid ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                          ✓ Geldi
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-amber-100 truncate">
                          ⏳ Bekliyor
                        </div>
                      </div>
                    ) : isAbsent ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-white/20 text-white backdrop-blur-xs">
                        ✗ Gelmedi
                      </span>
                    ) : isWeekend ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-white">
                          HS Tatil
                        </span>
                        <div className="hidden sm:block text-[9px] font-bold text-amber-800">
                          {isSaturday ? '+ Mesai Yaz' : 'Hafta Tatili'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-400 group-hover:text-primary-600 font-medium">
                        + Yoklama Gir
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Multi-Select Bulk Edit Panel */}
        {isMultiSelectMode && (
          <div className="p-4 sm:p-5 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 rounded-2xl border-2 border-amber-300 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-xs shadow-xs">
                  ☑️ Çoklu Seçim Modu
                </span>
                <span className="text-xs font-bold text-gray-800">
                  {selectedDates.length > 0
                    ? `${selectedDates.length} gün seçildi`
                    : 'Takvimden düzenlemek istediğiniz günlere tıklayın'}
                </span>
              </div>

              {/* Quick Select Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllWorkingDays}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-gray-700 hover:bg-amber-100/70 border border-amber-200 transition-colors"
                >
                  Pazar Hariç Tümünü Seç
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllDays}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-gray-700 hover:bg-amber-100/70 border border-amber-200 transition-colors"
                >
                  Tüm Ayı Seç ({daysInMonth})
                </button>
                {selectedDates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDates([])}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                  >
                    Seçimi Temizle
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMultiSelectMode(false);
                    setSelectedDates([]);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
                >
                  ✕ Kapat
                </button>
              </div>
            </div>

            {/* Bulk Form Options */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Seçili Günlere Uygulanacak Durum:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkStatus('Geldi')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bulkStatus === 'Geldi'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-400'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ✓ Geldi
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkStatus('Mesai')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bulkStatus === 'Mesai'
                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm ring-2 ring-purple-400'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ⚡ Mesai (1.5x)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkStatus('Gelmedi')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bulkStatus === 'Gelmedi'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-400'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ✗ Gelmedi (0 Saat)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkStatus('Boş')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bulkStatus === 'Boş'
                        ? 'bg-gray-800 text-white border-gray-900 shadow-sm ring-2 ring-gray-400'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    🗑️ Yoklama Yok (Boş)
                  </button>
                </div>
              </div>

              {/* Hours & Payment for bulk */}
              {(bulkStatus === 'Geldi' || bulkStatus === 'Mesai') && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-xl border border-gray-200">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Gün Başına Çalışma Saati
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={bulkWorkHours}
                      onChange={(e) => setBulkWorkHours(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 rounded-lg border border-primary-300 font-black text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Ödeme Durumu
                    </label>
                    <select
                      value={bulkPaymentMode}
                      onChange={(e) => setBulkPaymentMode(e.target.value as 'unpaid' | 'full')}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50"
                    >
                      <option value="unpaid">✗ Ödenmedi (Borç Yaz)</option>
                      <option value="full">✓ Tam Ödendi Olarak İşaretle</option>
                    </select>
                  </div>

                  {bulkPaymentMode === 'full' && (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Ödenecek Kasa
                      </label>
                      <select
                        value={bulkAccountId}
                        onChange={(e) => setBulkAccountId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50"
                      >
                        <option value="">— Harici / Elden —</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({formatCurrency(acc.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Action */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-500">
                  {selectedDates.length > 0 ? (
                    <span>
                      Toplam <strong>{selectedDates.length}</strong> gün için <strong>{bulkStatus}</strong> kaydedilecek.
                    </span>
                  ) : (
                    <span className="italic text-amber-700">Lütfen yukarıdaki takvimden günleri tıklayarak seçin.</span>
                  )}
                </span>

                <button
                  type="button"
                  onClick={handleSaveBulk}
                  disabled={savingBulk || selectedDates.length === 0}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-600/25 disabled:opacity-50 transition-all"
                >
                  {savingBulk ? 'Toplu Kaydediliyor...' : `Seçili ${selectedDates.length} Günü Kaydet`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selected Day Control Panel (Inline Editor) */}
        {!isMultiSelectMode && selectedDayDate && (
          <div className="p-4 sm:p-5 bg-gradient-to-br from-primary-50/50 via-white to-gray-50 rounded-2xl border-2 border-primary-300 shadow-md animate-in fade-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-primary-100">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-primary-600 text-white font-black text-xs">
                  📅 {new Date(selectedDayDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                </span>
                <h4 className="font-bold text-gray-900 text-sm">
                  Günün Yoklama ve Ödeme Bilgisini Düzenle
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDayDate(null)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-700"
              >
                ✕ Kapat
              </button>
            </div>

            {daySuccessMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                ✓ {daySuccessMessage}
              </div>
            )}

            <form onSubmit={handleSaveDayForm} className="space-y-4">
              {/* Status Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Yoklama Durumu:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const hourlyRate = employee.daily_wage > 0 ? employee.daily_wage / 11 : 0;
                      const hrs = dayForm.work_hours > 0 ? dayForm.work_hours : 11;
                      const wage = Math.round(hrs * hourlyRate * 100) / 100;
                      setDayForm({
                        ...dayForm,
                        status: 'Geldi',
                        work_hours: hrs,
                        daily_wage: wage,
                        paid_amount: dayForm.payment_mode === 'full' ? wage : Math.min(dayForm.paid_amount, wage),
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      dayForm.status === 'Geldi'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ✓ Geldi
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const hourlyRate = employee.daily_wage > 0 ? employee.daily_wage / 11 : 0;
                      const hrs = dayForm.work_hours > 0 ? dayForm.work_hours : 11;
                      const dObj = selectedDayDate ? new Date(selectedDayDate) : null;
                      const isSat = dObj?.getDay() === 6;

                      // Cumartesi mesaisi: 11 saatlik standart ücretin üzerine ek mesai bedeli
                      let mesaiWage = 0;
                      if (isSat) {
                        mesaiWage = Math.round((employee.daily_wage + (hrs * hourlyRate * 1.5)) * 100) / 100;
                      } else {
                        mesaiWage = Math.round(hrs * (hourlyRate * 1.5) * 100) / 100;
                      }

                      setDayForm({
                        ...dayForm,
                        status: 'Mesai',
                        work_hours: hrs,
                        daily_wage: mesaiWage,
                        paid_amount: dayForm.payment_mode === 'full' ? mesaiWage : Math.min(dayForm.paid_amount, mesaiWage),
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      dayForm.status === 'Mesai'
                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ⚡ Mesai (1.5x)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDayForm({
                        ...dayForm,
                        status: 'Gelmedi',
                        work_hours: 0,
                        daily_wage: 0,
                        paid_amount: 0,
                        payment_mode: 'unpaid',
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      dayForm.status === 'Gelmedi'
                        ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    ✗ Gelmedi (Devamsız)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDayForm({
                        ...dayForm,
                        status: 'Boş',
                        work_hours: 0,
                        daily_wage: 0,
                        paid_amount: 0,
                        payment_mode: 'unpaid',
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      dayForm.status === 'Boş'
                        ? 'bg-gray-800 text-white border-gray-900 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                    title="Bu gün için kaydı tamamen sil / boş bırak"
                  >
                    🗑️ Yoklama Yok (Boş)
                  </button>
                </div>
              </div>

              {/* Work Hours and Wage, Payment & Account Details if not Boş and not Gelmedi */}
              {(dayForm.status === 'Geldi' || dayForm.status === 'Mesai') && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 bg-white rounded-xl border border-gray-200">
                  {/* Work hours input */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Çalışma Saati (Saat)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      required
                      value={dayForm.work_hours}
                      onChange={(e) => {
                        const hrs = Math.max(0, parseFloat(e.target.value) || 0);
                        const hourlyRate = employee.daily_wage > 0 ? employee.daily_wage / 11 : 0;
                        const dObj = selectedDayDate ? new Date(selectedDayDate) : null;
                        const isSat = dObj?.getDay() === 6;

                        let w = 0;
                        if (dayForm.status === 'Mesai') {
                          if (isSat) {
                            // Cumartesi mesaisi: standart günlük ücret + ek mesai saatleri bedeli
                            w = Math.round((employee.daily_wage + (hrs * hourlyRate * 1.5)) * 100) / 100;
                          } else {
                            w = Math.round(hrs * (hourlyRate * 1.5) * 100) / 100;
                          }
                        } else {
                          w = Math.round(hrs * hourlyRate * 100) / 100;
                        }

                        setDayForm({
                          ...dayForm,
                          work_hours: hrs,
                          daily_wage: w,
                          paid_amount: dayForm.payment_mode === 'full' ? w : Math.min(dayForm.paid_amount, w),
                        });
                      }}
                      placeholder="11"
                      className="w-full px-3 py-1.5 rounded-lg border border-primary-300 font-black text-xs text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    />
                  </div>

                  {/* Daily wage */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Günlük Ücret Tutarı (₺)
                      <span className="text-[10px] text-gray-500 font-normal ml-1.5">
                        (Saatlik: {formatCurrency(employee.daily_wage / 11)})
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={dayForm.daily_wage}
                      onChange={(e) => {
                        const w = parseFloat(e.target.value) || 0;
                        setDayForm({
                          ...dayForm,
                          daily_wage: w,
                          paid_amount: dayForm.payment_mode === 'full' ? w : dayForm.paid_amount,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-900 bg-gray-50"
                    />
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">
                      Ödeme Durumu
                    </label>
                    <select
                      value={dayForm.payment_mode}
                      onChange={(e) => {
                        const m = e.target.value as 'full' | 'partial' | 'unpaid';
                        setDayForm({
                          ...dayForm,
                          payment_mode: m,
                          paid_amount: m === 'full' ? dayForm.daily_wage : m === 'partial' ? Math.round(dayForm.daily_wage / 2) : 0,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50"
                    >
                      <option value="unpaid">✗ Ödenmedi (Borç Yaz)</option>
                      <option value="full">✓ Tam Ödendi ({formatCurrency(dayForm.daily_wage)})</option>
                      <option value="partial">⚡ Kısmi Ödeme</option>
                    </select>
                  </div>

                  {/* Paid amount & Kasa */}
                  {dayForm.payment_mode !== 'unpaid' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">
                        Ödenecek Kasa
                      </label>
                      <select
                        value={dayForm.account_id}
                        onChange={(e) => setDayForm({ ...dayForm, account_id: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50"
                      >
                        <option value="">— Harici / Elden —</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({formatCurrency(acc.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 mb-1">
                        Personele Kalan Borç
                      </label>
                      <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-extrabold text-xs">
                        +{formatCurrency(dayForm.daily_wage)} (Borç)
                      </div>
                    </div>
                  )}

                  {/* Partial amount custom input */}
                  {dayForm.payment_mode === 'partial' && (
                    <div className="col-span-full flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-xs font-bold text-blue-900">Ödenen Tutar:</span>
                      <input
                        type="number"
                        min="0"
                        max={dayForm.daily_wage}
                        step="any"
                        value={dayForm.paid_amount}
                        onChange={(e) => setDayForm({ ...dayForm, paid_amount: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 text-xs font-bold text-gray-900 bg-white border border-blue-300 rounded-lg"
                      />
                      <span className="text-xs text-amber-800 font-bold">
                        (Kalan Borç: {formatCurrency(Math.max(0, dayForm.daily_wage - dayForm.paid_amount))})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Note and Submit button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <input
                  type="text"
                  placeholder="İsteğe bağlı not ekle..."
                  value={dayForm.note}
                  onChange={(e) => setDayForm({ ...dayForm, note: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDayDate(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={savingDay}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-600/25 disabled:opacity-50"
                  >
                    {savingDay ? 'Kaydediliyor...' : 'Günü Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Legend & Instructions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 shadow-sm" />
              <span className="text-gray-700">Yeşil: Geldi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-purple-600 shadow-sm" />
              <span className="text-gray-700">Mor: Mesai (1.5x)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-blue-600 shadow-sm" />
              <span className="text-gray-700">Mavi: Kısmi Ödendi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-amber-500 shadow-sm" />
              <span className="text-gray-700">Sarı: Ödenmedi (Bekliyor)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-rose-500 shadow-sm" />
              <span className="text-gray-700">Kırmızı: Gelmedi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-md bg-gray-100 border border-gray-300" />
              <span className="text-gray-400">Gri: Yoklama Yok (Boş)</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 italic">
            * Takvimdeki herhangi bir güne tıklayarak o günün yoklamasını anında girebilir veya silebilirsiniz.
          </p>
        </div>
      </div>
    </Modal>
  );
}
