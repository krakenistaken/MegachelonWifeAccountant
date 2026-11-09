// src/app/dashboard/salaries/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import EmployeeCalendarModal from '@/components/salaries/EmployeeCalendarModal';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import * as XLSX from 'xlsx';

interface Account {
  id: number;
  name: string;
  balance: number;
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  role?: string;
  monthly_wage: number;
  daily_wage: number;
  phone: string | null;
  is_active: number;
  created_at: string;
  total_hours_worked?: number;
  total_days_worked: number;
  total_earned: number;
  total_paid: number;
  balance_due: number;
}

interface AttendanceRecord {
  employee_id: number;
  first_name: string;
  last_name: string;
  default_monthly_wage: number;
  default_daily_wage: number;
  is_active: number;
  attendance_id: number | null;
  date: string | null;
  status: 'Geldi' | 'Yarım Gün' | 'Mesai' | 'Gelmedi' | null;
  work_hours?: number;
  daily_wage: number;
  is_paid: number; // 0 or 1
  paid_amount: number;
  account_id: number | null;
  account_name: string | null;
  transaction_id: number | null;
  note: string | null;
}

interface MonthlyDayAttendance {
  employee_id: number;
  date: string;
  status: string;
  work_hours: number;
  daily_wage: number;
  paid_amount: number;
}

interface MonthlyEmployeeStat {
  employee_id: number;
  first_name: string;
  last_name: string;
  role?: string;
  default_monthly_wage: number;
  default_daily_wage: number;
  is_active: number;
  total_hours_worked?: number;
  days_attended: number;
  days_absent: number;
  total_earned: number;
  total_paid: number;
  balance_due: number;
}

interface MonthlySummaryResponse {
  month: string;
  startDate: string;
  endDate: string;
  summary: {
    totalEmployees: number;
    totalDaysAttended: number;
    totalEarned: number;
    totalPaid: number;
    totalDue: number;
  };
  employees: MonthlyEmployeeStat[];
  attendances?: MonthlyDayAttendance[];
}

interface SalaryHistoryItem {
  attendance_id: number;
  employee_id: number;
  first_name: string;
  last_name: string;
  employee_phone: string | null;
  attendance_date: string;
  attendance_status: string;
  daily_wage: number;
  is_paid: number;
  paid_amount: number;
  remaining_due: number;
  payment_category: 'full' | 'partial' | 'unpaid' | 'absent';
  account_id: number | null;
  account_name: string | null;
  transaction_id: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  transaction_amount: number | null;
  transaction_date: string | null;
  transaction_description: string | null;
  created_by_username: string | null;
}

interface SalaryHistoryResponse {
  history: SalaryHistoryItem[];
  summary: {
    totalRecords: number;
    totalWageEarned: number;
    totalPaidAmount: number;
    totalRemainingDue: number;
    paidFromAccounts: number;
    paidExternally: number;
  };
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function getDaysInMonthFromStr(monthStr: string): number {
  if (!monthStr) return 30;
  const parts = monthStr.split('-').map(Number);
  if (parts.length < 2 || !parts[0] || !parts[1]) return 30;
  return new Date(parts[0], parts[1], 0).getDate();
}

function calcHourlyWage(dailyWage: number): number {
  return dailyWage > 0 ? dailyWage / 11 : 0;
}

function calcMonthlyWage(dailyWage: number, daysInMonth: number = 30): number {
  return dailyWage > 0 ? dailyWage * daysInMonth : 0;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalariesPage() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'employees' | 'summary' | 'history'>('attendance');

  // Today's date string & current month helpers
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const currentDaysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const currentMonthName = MONTH_NAMES[todayDate.getMonth()];

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Accounts list for payment selection
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Attendance state
  const [localRecords, setLocalRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  // Calendar modal state
  const [calendarEmployee, setCalendarEmployee] = useState<Employee | null>(null);

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    first_name: '',
    last_name: '',
    role: '',
    daily_wage: '',
    hourly_wage: '',
    monthly_wage: '',
    phone: '',
  });
  const [empSubmitting, setEmpSubmitting] = useState(false);
  const [empError, setEmpError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Synchronized wage change handlers for employee modal (Aylık Maaş bazlı: 1 Ay = 30 Gün, 1 Gün = 11 Saat)
  const handleMonthlyWageChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const daily = num / 30;
      const hourly = daily / 11;
      setEmpForm((prev) => ({
        ...prev,
        monthly_wage: val,
        daily_wage: Number.isInteger(daily) ? daily.toString() : parseFloat(daily.toFixed(2)).toString(),
        hourly_wage: parseFloat(hourly.toFixed(2)).toString(),
      }));
    } else {
      setEmpForm((prev) => ({
        ...prev,
        monthly_wage: val,
        daily_wage: '',
        hourly_wage: '',
      }));
    }
  };

  const handleDailyWageChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const monthly = num * 30;
      const hourly = num / 11;
      setEmpForm((prev) => ({
        ...prev,
        daily_wage: val,
        monthly_wage: Number.isInteger(monthly) ? monthly.toString() : parseFloat(monthly.toFixed(2)).toString(),
        hourly_wage: parseFloat(hourly.toFixed(2)).toString(),
      }));
    } else {
      setEmpForm((prev) => ({
        ...prev,
        daily_wage: val,
        monthly_wage: '',
        hourly_wage: '',
      }));
    }
  };

  const handleHourlyWageChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      const daily = num * 11;
      const monthly = daily * 30;
      setEmpForm((prev) => ({
        ...prev,
        hourly_wage: val,
        daily_wage: parseFloat(daily.toFixed(2)).toString(),
        monthly_wage: parseFloat(monthly.toFixed(2)).toString(),
      }));
    } else {
      setEmpForm((prev) => ({
        ...prev,
        hourly_wage: val,
        daily_wage: '',
        monthly_wage: '',
      }));
    }
  };

  // Pay Due Modal state (borç kapatma)
  const [payDueModalOpen, setPayDueModalOpen] = useState(false);
  const [payDueEmployee, setPayDueEmployee] = useState<Employee | null>(null);
  const [payDueForm, setPayDueForm] = useState({
    amount: '',
    account_id: '',
    date: todayStr,
    note: '',
  });
  const [payDueSubmitting, setPayDueSubmitting] = useState(false);
  const [payDueError, setPayDueError] = useState('');
  const [payDueSuccess, setPayDueSuccess] = useState('');

  // Monthly summary state
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [monthlyData, setMonthlyData] = useState<MonthlySummaryResponse | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Salary Activity History state (TAB 4)
  const [historyData, setHistoryData] = useState<SalaryHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilterEmployee, setHistoryFilterEmployee] = useState<string>('');
  const [historyFilterPayment, setHistoryFilterPayment] = useState<string>('');
  const [historyFilterMonth, setHistoryFilterMonth] = useState<string>('');
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      console.error('Fetch accounts error:', err);
    }
  }, []);

  // Fetch attendance for selected date
  const fetchAttendance = useCallback(async (date: string) => {
    setLoadingAttendance(true);
    try {
      const res = await fetch(`/api/salaries/attendance?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const formattedRecords = (data.records || []).map((r: AttendanceRecord) => ({
        ...r,
        status: (r.status as 'Geldi' | 'Yarım Gün' | 'Mesai' | 'Gelmedi' | null) || null,
        work_hours: r.work_hours !== undefined && r.work_hours !== null ? r.work_hours : (r.status === 'Gelmedi' ? 0 : r.status === 'Mesai' ? 16.5 : r.status === 'Yarım Gün' ? 5.5 : 11),
        paid_amount:
          r.paid_amount !== undefined && r.paid_amount !== null
            ? r.paid_amount
            : r.is_paid === 1
            ? r.daily_wage
            : 0,
      }));
      setLocalRecords(formattedRecords);
    } catch (err) {
      console.error('Fetch attendance error:', err);
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmployees(data.employees || []);
    } catch (err) {
      console.error('Fetch employees error:', err);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Fetch monthly summary
  const fetchMonthlySummary = useCallback(async (month: string) => {
    setLoadingMonthly(true);
    try {
      const res = await fetch(`/api/salaries/summary?month=${month}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMonthlyData(data);
    } catch (err) {
      console.error('Fetch monthly summary error:', err);
    } finally {
      setLoadingMonthly(false);
    }
  }, []);

  // Fetch Salary & Attendance History (Tab 4)
  const fetchSalaryHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (historyFilterEmployee) params.set('employee_id', historyFilterEmployee);
      if (historyFilterPayment) params.set('payment_status', historyFilterPayment);

      if (historyFilterMonth) {
        params.set('start_date', `${historyFilterMonth}-01`);
        const [y, m] = historyFilterMonth.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        params.set('end_date', `${historyFilterMonth}-${String(lastDay).padStart(2, '0')}`);
      }

      const res = await fetch(`/api/salaries/history?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistoryData(data);
    } catch (err) {
      console.error('Fetch salary history error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilterEmployee, historyFilterPayment, historyFilterMonth]);

  useEffect(() => {
    fetchAccounts();
    fetchEmployees();
  }, [fetchAccounts, fetchEmployees]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendance(selectedDate);
    } else if (activeTab === 'employees') {
      fetchEmployees();
    } else if (activeTab === 'summary') {
      fetchMonthlySummary(selectedMonth);
    } else if (activeTab === 'history') {
      fetchSalaryHistory();
    }
  }, [activeTab, selectedDate, selectedMonth, fetchAttendance, fetchEmployees, fetchMonthlySummary, fetchSalaryHistory]);

  // Real-time SSE listener
  useRealtimeEvents({
    onAccountUpdated: () => fetchAccounts(),
    onTransactionCreated: () => {
      fetchAccounts();
      fetchEmployees();
      if (activeTab === 'summary') fetchMonthlySummary(selectedMonth);
      if (activeTab === 'history') fetchSalaryHistory();
    },
    onTransactionDeleted: () => {
      fetchAccounts();
      fetchEmployees();
      if (activeTab === 'summary') fetchMonthlySummary(selectedMonth);
      if (activeTab === 'history') fetchSalaryHistory();
    },
  });

  // Date navigation handlers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(todayStr);
  };

  const handleYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Local record changes
  const handleStatusChange = (
    employeeId: number,
    newStatus: 'Geldi' | 'Yarım Gün' | 'Mesai' | 'Gelmedi' | null
  ) => {
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          const targetStatus = rec.status === newStatus ? null : newStatus;

          let updatedWage = rec.daily_wage;
          let updatedPaidAmount = rec.paid_amount;
          let updatedIsPaid = rec.is_paid;
          let updatedHours = rec.work_hours ?? 11;

          if (targetStatus === 'Mesai') {
            updatedHours = 11;
            updatedWage = Math.round(rec.default_daily_wage * 1.5 * 100) / 100;
          } else if (targetStatus === 'Geldi') {
            updatedHours = 11;
            updatedWage = rec.default_daily_wage;
          } else if (targetStatus === 'Yarım Gün') {
            updatedHours = 5.5;
            updatedWage = Math.round((rec.default_daily_wage / 2) * 100) / 100;
            if (updatedPaidAmount > updatedWage) {
              updatedPaidAmount = updatedWage;
            }
          } else if (targetStatus === 'Gelmedi' || targetStatus === null) {
            updatedHours = 0;
            updatedWage = 0;
            updatedPaidAmount = 0;
            updatedIsPaid = 0;
          }

          return {
            ...rec,
            status: targetStatus,
            work_hours: updatedHours,
            daily_wage: updatedWage,
            is_paid: updatedIsPaid,
            paid_amount: updatedPaidAmount,
          };
        }
        return rec;
      })
    );
  };

  const handlePaymentModeChange = (
    employeeId: number,
    mode: 'full' | 'partial' | 'unpaid'
  ) => {
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          if (mode === 'full') {
            return {
              ...rec,
              is_paid: 1,
              paid_amount: rec.daily_wage,
            };
          } else if (mode === 'partial') {
            const defaultPartial =
              rec.paid_amount > 0 && rec.paid_amount < rec.daily_wage
                ? rec.paid_amount
                : Math.round(rec.daily_wage / 2) || 100;
            return {
              ...rec,
              is_paid: 1,
              paid_amount: defaultPartial,
            };
          } else {
            return {
              ...rec,
              is_paid: 0,
              paid_amount: 0,
            };
          }
        }
        return rec;
      })
    );
  };

  const handlePaidAmountChange = (employeeId: number, amountStr: string) => {
    const val = parseFloat(amountStr) || 0;
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          return {
            ...rec,
            paid_amount: val,
            is_paid: val > 0 ? 1 : 0,
          };
        }
        return rec;
      })
    );
  };

  const handleAccountChange = (employeeId: number, accountIdVal: string) => {
    const accId = accountIdVal ? Number(accountIdVal) : null;
    const accObj = accounts.find((a) => a.id === accId);
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          return {
            ...rec,
            account_id: accId,
            account_name: accObj ? accObj.name : null,
          };
        }
        return rec;
      })
    );
  };

  const handleWorkHoursChange = (employeeId: number, hoursStr: string) => {
    const hours = Math.max(0, parseFloat(hoursStr) || 0);
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          const hourlyRate = rec.default_daily_wage > 0 ? rec.default_daily_wage / 11 : 0;
          let calculatedWage = 0;
          let newStatus = rec.status;

          if (hours === 0) {
            newStatus = 'Gelmedi';
            calculatedWage = 0;
          } else if (rec.status === 'Mesai') {
            // Mesai seçiliyken saat bedeli 1.5 katı ile çarpılır
            calculatedWage = Math.round(hours * (hourlyRate * 1.5) * 100) / 100;
          } else if (hours > 11) {
            newStatus = 'Mesai';
            calculatedWage = Math.round(hours * (hourlyRate * 1.5) * 100) / 100;
          } else if (hours <= 6 && hours > 0) {
            newStatus = 'Yarım Gün';
            calculatedWage = Math.round(hours * hourlyRate * 100) / 100;
          } else {
            newStatus = 'Geldi';
            calculatedWage = Math.round(hours * hourlyRate * 100) / 100;
          }

          const newPaidAmount =
            rec.is_paid === 1 && (rec.paid_amount === rec.daily_wage || rec.paid_amount > calculatedWage)
              ? calculatedWage
              : rec.paid_amount;

          return {
            ...rec,
            status: newStatus,
            work_hours: hours,
            daily_wage: calculatedWage,
            paid_amount: newPaidAmount,
          };
        }
        return rec;
      })
    );
  };

  const handleMonthlyWageInputChange = (employeeId: number, monthlyStr: string) => {
    const monthlyVal = parseFloat(monthlyStr) || 0;
    const dailyVal = Math.round((monthlyVal / 30) * 100) / 100;
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          const newPaidAmount =
            rec.is_paid === 1 && (rec.paid_amount === rec.daily_wage || rec.paid_amount > dailyVal)
              ? dailyVal
              : rec.paid_amount;
          return {
            ...rec,
            default_monthly_wage: monthlyVal,
            daily_wage: dailyVal,
            paid_amount: newPaidAmount,
          };
        }
        return rec;
      })
    );
  };

  const handleWageChange = (employeeId: number, wageStr: string) => {
    const val = parseFloat(wageStr) || 0;
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          const newPaidAmount =
            rec.is_paid === 1 && (rec.paid_amount === rec.daily_wage || rec.paid_amount > val)
              ? val
              : rec.paid_amount;
          return {
            ...rec,
            daily_wage: val,
            paid_amount: newPaidAmount,
          };
        }
        return rec;
      })
    );
  };

  const handleNoteChange = (employeeId: number, note: string) => {
    setLocalRecords((prev) =>
      prev.map((rec) => {
        if (rec.employee_id === employeeId) {
          return {
            ...rec,
            note,
          };
        }
        return rec;
      })
    );
  };

  // Bulk actions
  const handleMarkAllPresent = () => {
    setLocalRecords((prev) =>
      prev.map((rec) => ({
        ...rec,
        status: 'Geldi',
        work_hours: 11,
        daily_wage: rec.default_daily_wage,
      }))
    );
  };

  const handleMarkAllPaid = () => {
    setLocalRecords((prev) =>
      prev.map((rec) => ({
        ...rec,
        is_paid:
          rec.status === 'Geldi' || rec.status === 'Yarım Gün' || rec.status === 'Mesai'
            ? 1
            : 0,
        paid_amount:
          rec.status === 'Geldi' || rec.status === 'Yarım Gün' || rec.status === 'Mesai'
            ? rec.daily_wage
            : 0,
      }))
    );
  };

  const handleClearAll = () => {
    setLocalRecords((prev) =>
      prev.map((rec) => ({
        ...rec,
        status: null,
        work_hours: 0,
        is_paid: 0,
        paid_amount: 0,
      }))
    );
  };

  // Save attendance to backend
  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    setSaveSuccessMessage('');
    try {
      const recordsToSave = localRecords.map((r) => ({
        employee_id: r.employee_id,
        status: r.status,
        work_hours: r.work_hours ?? (r.status === 'Gelmedi' ? 0 : r.status === 'Mesai' ? 16.5 : r.status === 'Yarım Gün' ? 5.5 : 11),
        daily_wage: r.daily_wage,
        is_paid:
          (r.status === 'Geldi' || r.status === 'Yarım Gün' || r.status === 'Mesai') &&
          (r.paid_amount || 0) > 0,
        paid_amount:
          r.status === 'Geldi' || r.status === 'Yarım Gün' || r.status === 'Mesai'
            ? r.paid_amount || 0
            : 0,
        account_id: r.account_id,
        note: r.note,
      }));

      const res = await fetch('/api/salaries/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          records: recordsToSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSaveSuccessMessage('Yoklama ve ödeme kayıtları başarıyla kaydedildi.');
      fetchAttendance(selectedDate);
      fetchAccounts();
      fetchEmployees();

      setTimeout(() => {
        setSaveSuccessMessage('');
      }, 3500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kaydedilirken hata oluştu.');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Employee CRUD handlers
  const openNewEmployeeModal = () => {
    setEditingEmployee(null);
    setEmpForm({
      first_name: '',
      last_name: '',
      role: '',
      monthly_wage: '',
      daily_wage: '',
      hourly_wage: '',
      phone: '',
    });
    setEmpError('');
    setEmpModalOpen(true);
  };

  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmployee(emp);
    const monthly = Number(emp.monthly_wage) || 0;
    const daily = Number(emp.daily_wage) || 0;
    const hourly = daily > 0 ? daily / 11 : 0;
    setEmpForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      role: emp.role || '',
      monthly_wage: monthly > 0 ? (Number.isInteger(monthly) ? monthly.toString() : parseFloat(monthly.toFixed(2)).toString()) : '',
      daily_wage: daily > 0 ? (Number.isInteger(daily) ? daily.toString() : parseFloat(daily.toFixed(2)).toString()) : '',
      hourly_wage: hourly > 0 ? parseFloat(hourly.toFixed(2)).toString() : '',
      phone: emp.phone || '',
    });
    setEmpError('');
    setEmpModalOpen(true);
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpSubmitting(true);
    setEmpError('');

    try {
      const url = editingEmployee ? `/api/employees/${editingEmployee.id}` : '/api/employees';
      const method = editingEmployee ? 'PUT' : 'POST';

      const monthlyNum = parseFloat(empForm.monthly_wage) || 0;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: empForm.first_name,
          last_name: empForm.last_name,
          role: empForm.role,
          monthly_wage: monthlyNum,
          phone: empForm.phone || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');

      setEmpModalOpen(false);
      fetchEmployees();
      if (activeTab === 'attendance') fetchAttendance(selectedDate);
    } catch (err) {
      setEmpError(err instanceof Error ? err.message : 'Sunucu hatası.');
    } finally {
      setEmpSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (id: number) => {
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Silinemedi.');
      } else {
        fetchEmployees();
        if (activeTab === 'attendance') fetchAttendance(selectedDate);
      }
    } catch (err) {
      console.error('Delete employee error:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Pay Due Modal Open & Submit
  const openPayDueModal = (emp: Employee) => {
    setPayDueEmployee(emp);
    setPayDueForm({
      amount: emp.balance_due > 0 ? String(emp.balance_due) : '',
      account_id: accounts.length > 0 ? String(accounts[0].id) : '',
      date: todayStr,
      note: 'Maaş borç kapatma',
    });
    setPayDueError('');
    setPayDueSuccess('');
    setPayDueModalOpen(true);
  };

  const handlePayDueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDueEmployee) return;

    const amt = parseFloat(payDueForm.amount);
    if (!amt || amt <= 0) {
      setPayDueError('Geçerli bir ödeme tutarı giriniz.');
      return;
    }

    setPayDueSubmitting(true);
    setPayDueError('');
    setPayDueSuccess('');

    try {
      const res = await fetch('/api/salaries/pay-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: payDueEmployee.id,
          amount: amt,
          account_id: payDueForm.account_id ? Number(payDueForm.account_id) : null,
          date: payDueForm.date,
          note: payDueForm.note,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPayDueError(data.error || 'Ödeme gerçekleştirilemedi.');
        return;
      }

      setPayDueSuccess(data.message || 'Ödeme başarıyla kaydedildi.');
      fetchEmployees();
      fetchAccounts();
      if (activeTab === 'attendance') fetchAttendance(selectedDate);
      if (activeTab === 'summary') fetchMonthlySummary(selectedMonth);
      if (activeTab === 'history') fetchSalaryHistory();

      setTimeout(() => {
        setPayDueModalOpen(false);
        setPayDueEmployee(null);
        setPayDueSuccess('');
      }, 1800);
    } catch {
      setPayDueError('Sunucu hatası oluştu.');
    } finally {
      setPayDueSubmitting(false);
    }
  };

  // Export Monthly Summary to Excel (Puantaj Formatı - Kağıttaki Çizelge Düzeni)
  const handleExportMonthlyExcel = () => {
    if (!monthlyData || monthlyData.employees.length === 0) return;

    const [yearNum, monthNum] = monthlyData.month.split('-').map(Number);
    const selectedMonthDays = getDaysInMonthFromStr(monthlyData.month);

    const DAY_NAMES_TR = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT'];

    // Map attendances by employeeId and date
    const attMap = new Map<string, MonthlyDayAttendance>();
    (monthlyData.attendances || []).forEach((att) => {
      attMap.set(`${att.employee_id}_${att.date}`, att);
    });

    // 1. Satır: Başlıklar (1, 2, 3... günlerin üstünde gün isimleri PAZ, PZT...)
    // 2. Satır: Gün numaraları (1, 2, 3...)
    // Satırlar: AD SOYAD, GÖREV, [1..days], TOPLAM SAAT, MAAŞ, HAKEDİŞ

    const tableData: any[][] = [];

    // Title Row
    const titleMonthName = MONTH_NAMES[monthNum - 1]?.toLowerCase() || '';
    tableData.push([`${titleMonthName} ayı puantaj MAAŞ`]);

    // Row 1: Header names (AD SOYAD, GÖREV, PAZ, PZT..., TOPLAM SAAT, MAAŞ, HAKEDİŞ, ÖDENEN TUTAR, KALAN BORÇ)
    const headerRow1: any[] = ['AD SOYAD', 'GÖREV'];
    for (let day = 1; day <= selectedMonthDays; day++) {
      const dayDate = new Date(yearNum, monthNum - 1, day);
      const dayName = DAY_NAMES_TR[dayDate.getDay()];
      headerRow1.push(dayName);
    }
    headerRow1.push('TOPLAM SAAT', 'MAAŞ', 'HAKEDİŞ', 'ÖDENEN TUTAR', 'KALAN BORÇ');
    tableData.push(headerRow1);

    // Row 2: Day numbers (empty, empty, 1, 2, 3..., empty, empty, empty, empty, empty)
    const headerRow2: any[] = ['', ''];
    for (let day = 1; day <= selectedMonthDays; day++) {
      headerRow2.push(day);
    }
    headerRow2.push('', '', '', '', '');
    tableData.push(headerRow2);

    // Employee Rows
    monthlyData.employees.forEach((e) => {
      const row: any[] = [
        `${e.first_name} ${e.last_name}`,
        e.role || '—',
      ];

      let totalMonthHours = 0;
      for (let day = 1; day <= selectedMonthDays; day++) {
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${monthlyData.month}-${dayStr}`;
        const dayDate = new Date(yearNum, monthNum - 1, day);
        const isSunday = dayDate.getDay() === 0;

        const att = attMap.get(`${e.employee_id}_${dateStr}`);
        if (att) {
          const hours = Number(att.work_hours ?? (att.status === 'Gelmedi' ? 0 : 11));
          if (hours > 0) {
            row.push(hours);
            totalMonthHours += hours;
          } else {
            row.push(isSunday ? 'HF' : 0);
          }
        } else {
          // No attendance recorded: if Sunday show 'HF' (Hafta Tatili), else empty
          row.push(isSunday ? 'HF' : '');
        }
      }

      const monthlyWage = e.default_monthly_wage || calcMonthlyWage(e.default_daily_wage);
      const remainingDue = Number(e.total_earned || 0) - Number(e.total_paid || 0);
      row.push(totalMonthHours, monthlyWage, e.total_earned, e.total_paid, remainingDue);
      tableData.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(tableData);

    // Set column widths
    const colWidths = [
      { wch: 22 }, // AD SOYAD
      { wch: 14 }, // GÖREV
    ];
    for (let day = 1; day <= selectedMonthDays; day++) {
      colWidths.push({ wch: 5.5 }); // Days
    }
    colWidths.push(
      { wch: 14 }, // TOPLAM SAAT
      { wch: 12 }, // MAAŞ
      { wch: 14 }, // HAKEDİŞ
      { wch: 16 }, // ÖDENEN TUTAR
      { wch: 16 }  // KALAN BORÇ
    );
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Puantaj_${monthlyData.month}`);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleMonthName}_ayi_puantaj_MAAS_${monthlyData.month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export Monthly Summary to CSV
  const handleExportMonthlyCSV = () => {
    if (!monthlyData || monthlyData.employees.length === 0) return;

    const [yearNum, monthNum] = monthlyData.month.split('-').map(Number);
    const selectedMonthDays = getDaysInMonthFromStr(monthlyData.month);
    const DAY_NAMES_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

    const attMap = new Map<string, MonthlyDayAttendance>();
    (monthlyData.attendances || []).forEach((att) => {
      attMap.set(`${att.employee_id}_${att.date}`, att);
    });

    const dayHeaders: string[] = [];
    for (let day = 1; day <= selectedMonthDays; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dayDate = new Date(yearNum, monthNum - 1, day);
      const dayName = DAY_NAMES_TR[dayDate.getDay()];
      dayHeaders.push(`${dayStr} ${dayName}`);
    }

    const headers = [
      'Çalışan',
      'Aylık Maaş (TL)',
      'Günlük Ücret (TL)',
      'Saatlik Ücret (11 Saat) (TL)',
      ...dayHeaders,
      'Toplam Çalışılan Saat',
      'Çalıştığı Gün',
      'Gelmediği Gün',
      'Toplam Hak Ediş (TL)',
      'Ödenen Tutar (TL)',
      'Kalan Bakiye (TL)',
      'Durum',
    ];

    const escapeCSV = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

    const lines = [
      headers.map(escapeCSV).join(';'),
      ...monthlyData.employees.map((e) => {
        let totalHours = 0;
        const dayValues = [];
        for (let day = 1; day <= selectedMonthDays; day++) {
          const dayStr = String(day).padStart(2, '0');
          const dateStr = `${monthlyData.month}-${dayStr}`;
          const att = attMap.get(`${e.employee_id}_${dateStr}`);
          if (att) {
            const h = Number(att.work_hours ?? (att.status === 'Gelmedi' ? 0 : att.status === 'Mesai' ? 16.5 : att.status === 'Yarım Gün' ? 5.5 : 11));
            dayValues.push(escapeCSV(h > 0 ? `${h}s` : '0s'));
            totalHours += h;
          } else {
            dayValues.push(escapeCSV('—'));
          }
        }

        return [
          escapeCSV(`${e.first_name} ${e.last_name}`),
          escapeCSV(e.default_monthly_wage || calcMonthlyWage(e.default_daily_wage)),
          escapeCSV(e.default_daily_wage),
          escapeCSV((e.default_daily_wage / 11).toFixed(2)),
          ...dayValues,
          escapeCSV(totalHours),
          escapeCSV(e.days_attended),
          escapeCSV(e.days_absent),
          escapeCSV(e.total_earned),
          escapeCSV(e.total_paid),
          escapeCSV(e.balance_due),
          escapeCSV(e.is_active ? 'Aktif' : 'Pasif'),
        ].join(';');
      }),
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Maas_Bordrosu_Saatli_${monthlyData.month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export Salary History to Excel (Tab 4)
  const handleExportHistoryExcel = () => {
    if (!historyData || historyData.history.length === 0) return;

    const filtered = historyData.history.filter((h) => {
      if (!historySearchQuery) return true;
      const q = historySearchQuery.toLowerCase();
      return (
        `${h.first_name} ${h.last_name}`.toLowerCase().includes(q) ||
        (h.note && h.note.toLowerCase().includes(q)) ||
        (h.transaction_description && h.transaction_description.toLowerCase().includes(q))
      );
    });

    const rows = filtered.map((h) => ({
      'Tarih': h.attendance_date,
      'Çalışan': `${h.first_name} ${h.last_name}`,
      'Yoklama Durumu': h.attendance_status,
      'Günlük Hak Ediş (₺)': h.daily_wage,
      'Ödenen Tutar (₺)': h.paid_amount,
      'Kalan Borç (₺)': h.remaining_due,
      'Ödenen Kasa': h.account_name || 'Harici / Elden',
      'İşlem Açıklaması': h.transaction_description || h.note || '—',
      'Kayıt Zamanı': h.created_at ? new Date(h.created_at).toLocaleString('tr-TR') : '—',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 25 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 20 },
      { wch: 35 },
      { wch: 22 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Maas_Hareket_Gecmisi');

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Maas_Hareket_Gecmisi_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Local attendance stats calculation
  const currentPresentCount = localRecords.filter((r) => r.status === 'Geldi').length;
  const currentHalfDayCount = localRecords.filter((r) => r.status === 'Yarım Gün').length;
  const currentMesaiCount = localRecords.filter((r) => r.status === 'Mesai').length;
  const currentAbsentCount = localRecords.filter((r) => r.status === 'Gelmedi').length;
  const currentUnmarkedCount = localRecords.filter((r) => !r.status).length;
  const currentTotalWage = localRecords
    .filter((r) => r.status === 'Geldi' || r.status === 'Yarım Gün' || r.status === 'Mesai')
    .reduce((sum, r) => sum + r.daily_wage, 0);
  const currentPaidAmount = localRecords
    .filter((r) => r.status === 'Geldi' || r.status === 'Yarım Gün' || r.status === 'Mesai')
    .reduce((sum, r) => sum + (r.paid_amount || 0), 0);
  const currentUnpaidAmount = currentTotalWage - currentPaidAmount;

  // Filtered History list
  const filteredHistoryItems = (historyData?.history || []).filter((h) => {
    if (!historySearchQuery) return true;
    const q = historySearchQuery.toLowerCase();
    return (
      `${h.first_name} ${h.last_name}`.toLowerCase().includes(q) ||
      (h.note && h.note.toLowerCase().includes(q)) ||
      (h.transaction_description && h.transaction_description.toLowerCase().includes(q)) ||
      (h.account_name && h.account_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Maaş & Yoklama Takibi</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Personel maaş ve yoklama takibi, hakediş ve kasa ödeme yönetimi
          </p>
        </div>

        {/* Action Button depending on tab */}
        {activeTab === 'employees' && (
          <button
            onClick={openNewEmployeeModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
              bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
              shadow-md shadow-primary-500/25 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Yeni Çalışan Ekle
          </button>
        )}

        {activeTab === 'attendance' && (
          <button
            onClick={handleSaveAttendance}
            disabled={savingAttendance || localRecords.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
              bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700
              shadow-md shadow-emerald-500/25 transition-all disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {savingAttendance ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
          </button>
        )}
      </div>

      {/* Main Tab Navigation (4 Tabs) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all duration-200 ${
            activeTab === 'attendance'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          📅 Günlük Yoklama
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all duration-200 ${
            activeTab === 'employees'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          👥 Personel Listesi & Takvim ({employees.length})
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all duration-200 ${
            activeTab === 'summary'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          📊 Aylık Hakediş & Bordro
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all duration-200 ${
            activeTab === 'history'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          📜 Maaş & Ödeme Hareketleri
        </button>
      </div>

      {/* TAB 1: GÜNLÜK YOKLAMA */}
      {activeTab === 'attendance' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Success Banner */}
          {saveSuccessMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {saveSuccessMessage}
            </div>
          )}

          {/* Date Selector and Bulk Actions Bar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Date Pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handlePrevDay}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                title="Önceki Gün"
              >
                ◀
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 font-bold text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <button
                onClick={handleNextDay}
                className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                title="Sonraki Gün"
              >
                ▶
              </button>

              <button
                onClick={handleToday}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedDate === todayStr
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Bugün
              </button>
              <button
                onClick={handleYesterday}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Dün
              </button>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleMarkAllPresent}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
              >
                ✓ Tümünü Geldi Yap
              </button>
              <button
                onClick={handleMarkAllPaid}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 transition-colors"
              >
                ₺ Tümünü Ödendi Yap
              </button>
              <button
                onClick={handleClearAll}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-colors"
                title="Tüm personelin yoklamasını temizle (boş bırak)"
              >
                🗑️ Tümünü Boş Yap
              </button>
            </div>
          </div>

          {/* Daily Quick Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3.5 text-center">
              <p className="text-xs font-medium text-gray-500">Kayıtlı Çalışan</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{localRecords.length}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3.5 text-center">
              <p className="text-xs font-medium text-emerald-700">Tam Gün</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">{currentPresentCount}</p>
            </div>
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3.5 text-center">
              <p className="text-xs font-medium text-indigo-700">Yarım Gün</p>
              <p className="text-xl font-bold text-indigo-700 mt-1">{currentHalfDayCount}</p>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-100 p-3.5 text-center">
              <p className="text-xs font-medium text-purple-700">⚡ Mesai</p>
              <p className="text-xl font-bold text-purple-700 mt-1">{currentMesaiCount}</p>
            </div>
            <div className="bg-rose-50 rounded-xl border border-rose-100 p-3.5 text-center">
              <p className="text-xs font-medium text-rose-700">Gelmedi</p>
              <p className="text-xl font-bold text-rose-700 mt-1">{currentAbsentCount}</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-3.5 text-center">
              <p className="text-xs font-medium text-gray-500">Boş / Yoklama</p>
              <p className="text-xl font-bold text-gray-500 mt-1">{currentUnmarkedCount}</p>
            </div>
            <div className="bg-emerald-50/70 rounded-xl border border-emerald-100 p-3.5 text-center">
              <p className="text-xs font-medium text-emerald-700">Ödenen</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrency(currentPaidAmount)}</p>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-3.5 text-center">
              <p className="text-xs font-medium text-amber-700">Bekleyen Borç</p>
              <p className="text-lg font-bold text-amber-700 mt-1">{formatCurrency(currentUnpaidAmount)}</p>
            </div>
          </div>

          {/* Attendance Table */}
          {loadingAttendance ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : localRecords.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <p className="text-sm font-bold text-gray-700">Kayıtlı Çalışan Bulunamadı</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">
                Yoklama alabilmek için önce Personel Listesi sekmesinden çalışan ekleyin.
              </p>
              <button
                onClick={openNewEmployeeModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700"
              >
                Yeni Çalışan Ekle
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-bold uppercase text-left">
                      <th className="px-5 py-3.5">Çalışan</th>
                      <th className="px-4 py-3.5">Aylık Maaş (₺)</th>
                      <th className="px-4 py-3.5 text-center">Yoklama Durumu</th>
                      <th className="px-4 py-3.5 text-center">Ödeme Durumu</th>
                      <th className="px-4 py-3.5">Kasa Seçimi</th>
                      <th className="px-4 py-3.5">Açıklama / Not</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-medium">
                    {localRecords.map((rec) => {
                      const isPresent = rec.status === 'Geldi';
                      const isHalfDay = rec.status === 'Yarım Gün';
                      const isMesai = rec.status === 'Mesai';
                      const isWorkingDay = isPresent || isHalfDay || isMesai;
                      const currentPaid = rec.paid_amount !== undefined ? rec.paid_amount : (rec.is_paid === 1 ? rec.daily_wage : 0);
                      const isFullPaid = isWorkingDay && rec.is_paid === 1 && currentPaid >= rec.daily_wage;
                      const isPartialPaid = isWorkingDay && rec.is_paid === 1 && currentPaid > 0 && currentPaid < rec.daily_wage;
                      const isUnpaid = isWorkingDay && (!rec.is_paid || currentPaid === 0);

                      return (
                        <tr
                          key={rec.employee_id}
                          className={`transition-colors ${
                            isPresent
                              ? 'bg-white hover:bg-emerald-50/20'
                              : isHalfDay
                              ? 'bg-indigo-50/30 hover:bg-indigo-50/50'
                              : isMesai
                              ? 'bg-purple-50/30 hover:bg-purple-50/50'
                              : rec.status === 'Gelmedi'
                              ? 'bg-rose-50/30 hover:bg-rose-50/50'
                              : 'bg-gray-50/30 hover:bg-gray-50'
                          }`}
                        >
                          {/* Employee Name */}
                          <td className="px-5 py-4">
                            <div
                              onClick={() => {
                                const emp = employees.find((e) => e.id === rec.employee_id);
                                if (emp) setCalendarEmployee(emp);
                              }}
                              className="flex items-center gap-3 cursor-pointer group"
                              title="Yoklama Takvimini Aç & Gün Gün Düzenle"
                            >
                              <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs transition-colors ${
                                isMesai
                                  ? 'bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white'
                                  : isHalfDay
                                  ? 'bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white'
                                  : 'bg-primary-100 text-primary-700 group-hover:bg-primary-600 group-hover:text-white'
                              }`}>
                                {rec.first_name.charAt(0)}
                                {rec.last_name.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 text-sm group-hover:text-primary-600 transition-colors flex items-center gap-1.5">
                                  {rec.first_name} {rec.last_name}
                                  <span className="text-gray-400 group-hover:text-primary-500 text-xs">📅</span>
                                </p>
                                <p className="text-[11px] text-gray-500 leading-tight">
                                  Maaş: <span className="font-semibold text-indigo-700">{formatCurrency(rec.default_monthly_wage)}</span> · Günlük: <span className="font-semibold text-gray-800">{formatCurrency(rec.default_daily_wage)}</span> · Saatlik (11s): <span className="font-semibold text-primary-700">{formatCurrency(calcHourlyWage(rec.default_daily_wage))}</span>
                                  {isHalfDay
                                    ? ` · (Yarım: ${formatCurrency(rec.default_daily_wage / 2)})`
                                    : isMesai
                                    ? ` · (Mesai: ${formatCurrency(rec.default_daily_wage * 1.5)})`
                                    : ''}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Monthly wage input with auto-calculated daily & hourly indicator */}
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-indigo-600 font-extrabold text-xs">₺</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={rec.default_monthly_wage || (rec.daily_wage ? Math.round(rec.daily_wage * 30) : '')}
                                  onChange={(e) => handleMonthlyWageInputChange(rec.employee_id, e.target.value)}
                                  placeholder="Aylık Maaş"
                                  className="w-28 px-2.5 py-1.5 rounded-lg border border-indigo-200 font-extrabold text-indigo-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-xs shadow-2xs"
                                />
                              </div>
                              <div className="text-[10px] text-gray-500 flex items-center gap-1.5 font-medium">
                                <span>Günlük: <strong className="text-gray-800">{formatCurrency(rec.daily_wage)}</strong></span>
                                <span>·</span>
                                <span>Saatlik: <strong className="text-primary-700">{formatCurrency(calcHourlyWage(rec.daily_wage))}</strong></span>
                              </div>
                            </div>
                          </td>

                          {/* Attendance Status Toggle Buttons with Daily Hours Input */}
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="inline-flex rounded-xl p-1 bg-gray-100 border border-gray-200 gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(rec.employee_id, 'Geldi')}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    rec.status === 'Geldi'
                                      ? 'bg-emerald-500 text-white shadow-sm'
                                      : 'text-gray-500 hover:text-gray-800'
                                  }`}
                                  title="Tam gün çalışma (11 saat)"
                                >
                                  ✓ Geldi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(rec.employee_id, 'Mesai')}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    rec.status === 'Mesai'
                                      ? 'bg-purple-600 text-white shadow-sm'
                                      : 'text-gray-500 hover:text-gray-800'
                                  }`}
                                  title={`Mesai (1.5 katı ücret: ${formatCurrency(rec.default_daily_wage * 1.5)})`}
                                >
                                  ⚡ Mesai
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(rec.employee_id, 'Gelmedi')}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    rec.status === 'Gelmedi'
                                      ? 'bg-rose-500 text-white shadow-sm'
                                      : 'text-gray-500 hover:text-gray-800'
                                  }`}
                                  title="Gelmedi (0 saat - kutucuk kilitlenir)"
                                >
                                  ✗ Gelmedi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(rec.employee_id, null)}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    !rec.status
                                      ? 'bg-gray-700 text-white shadow-sm'
                                      : 'text-gray-400 hover:text-gray-700'
                                  }`}
                                  title="Yoklama kaydını temizle / boş bırak"
                                >
                                  — Boş
                                </button>
                              </div>

                              {/* ÇALIŞMA SAATİ KUTUCUĞU */}
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <label className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                                  <span>⏱️</span> Saat:
                                </label>
                                <div className="relative flex items-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    disabled={rec.status === 'Gelmedi'}
                                    value={
                                      rec.status === 'Gelmedi'
                                        ? 0
                                        : rec.work_hours !== undefined
                                        ? rec.work_hours
                                        : rec.status === 'Mesai'
                                        ? 16.5
                                        : rec.status === 'Yarım Gün'
                                        ? 5.5
                                        : rec.status === 'Geldi'
                                        ? 11
                                        : ''
                                    }
                                    onChange={(e) => handleWorkHoursChange(rec.employee_id, e.target.value)}
                                    placeholder="Saat"
                                    title={rec.status === 'Gelmedi' ? 'Gelmedi seçiliyken saat girilemez (0 saat)' : 'Günlük çalışılan saat'}
                                    className={`w-16 px-2 py-1 rounded-lg border text-center font-black text-xs transition-all ${
                                      rec.status === 'Gelmedi'
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                        : 'bg-white text-gray-900 border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 shadow-2xs'
                                    }`}
                                  />
                                  <span className="text-[10px] text-gray-400 font-bold ml-1">saat</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Payment Status Toggle */}
                          <td className="px-4 py-4 text-center">
                            {isWorkingDay ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <div className="inline-flex rounded-xl p-1 bg-gray-100 border border-gray-200 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handlePaymentModeChange(rec.employee_id, 'full')}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      isFullPaid
                                        ? 'bg-emerald-600 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                    title="Günün hak edişini tam ödendi yap"
                                  >
                                    ✓ Tam Ödendi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePaymentModeChange(rec.employee_id, 'partial')}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      isPartialPaid
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                    title="Maaşın bir kısmını ödendi olarak gir"
                                  >
                                    ⚡ Kısmi Ödendi
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePaymentModeChange(rec.employee_id, 'unpaid')}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                      isUnpaid
                                        ? 'bg-amber-500 text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                    title="Ödeme yapılmadı olarak işaretle"
                                  >
                                    ✗ Ödenmedi
                                  </button>
                                </div>

                                {/* Custom Partial Payment Input */}
                                {isPartialPaid && (
                                  <div className="flex items-center justify-center gap-1.5 bg-blue-50/90 px-3 py-1.5 rounded-xl border border-blue-200 animate-in fade-in duration-150">
                                    <span className="text-[11px] font-bold text-blue-900">Ödenen:</span>
                                    <div className="flex items-center gap-0.5">
                                      <span className="text-xs text-blue-600 font-bold">₺</span>
                                      <input
                                        type="number"
                                        min="0"
                                        max={rec.daily_wage}
                                        step="any"
                                        value={rec.paid_amount ?? 0}
                                        onChange={(e) =>
                                          handlePaidAmountChange(rec.employee_id, e.target.value)
                                        }
                                        className="w-20 px-2 py-0.5 text-xs font-bold text-gray-900 bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-center"
                                      />
                                    </div>
                                    <span className="text-[10px] text-amber-800 font-bold">
                                      (Kalan: {formatCurrency(Math.max(0, rec.daily_wage - (rec.paid_amount || 0)))})
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs italic">
                                {rec.status === 'Gelmedi' ? '— Gelmedi —' : '— Yoklama Yok —'}
                              </span>
                            )}
                          </td>

                          {/* Account Selection */}
                          <td className="px-4 py-4">
                            {isWorkingDay && (rec.paid_amount || 0) > 0 ? (
                              <div className="space-y-1">
                                <select
                                  value={rec.account_id || ''}
                                  onChange={(e) => handleAccountChange(rec.employee_id, e.target.value)}
                                  className="w-full min-w-[170px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                                >
                                  <option value="">— Kasa Seçilmedi (Harici/Elden) —</option>
                                  {accounts.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.name} ({formatCurrency(acc.balance)})
                                    </option>
                                  ))}
                                </select>
                                {rec.account_id && (
                                  <p className="text-[10px] text-emerald-600 font-semibold">
                                    ✓ Bu kasadan {formatCurrency(rec.paid_amount || 0)} otomatik düşülecektir
                                  </p>
                                )}
                                {!rec.account_id && (
                                  <p className="text-[10px] text-gray-400">
                                    Kasa bakiyesine dokunulmaz (harici/elden)
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>

                          {/* Note */}
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              placeholder="Not ekle..."
                              value={rec.note || ''}
                              onChange={(e) => handleNoteChange(rec.employee_id, e.target.value)}
                              className="w-full min-w-[140px] px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom save bar */}
              <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Değişiklikleri geçerli kılmak için &quot;Yoklamayı Kaydet&quot; butonuna basınız. Boş bırakılanlar sisteme kaydedilmez.
                </p>
                <button
                  onClick={handleSaveAttendance}
                  disabled={savingAttendance}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/25 transition-all disabled:opacity-50"
                >
                  {savingAttendance ? 'Kaydediliyor...' : 'Yoklamayı Kaydet'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PERSONEL LİSTESİ */}
      {activeTab === 'employees' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {loadingEmployees ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <p className="text-sm font-bold text-gray-700">Henüz personel kaydı yok</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">
                Yoklama ve maaş takibi yapabilmek için ilk çalışanınızı ekleyin.
              </p>
              <button
                onClick={openNewEmployeeModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700"
              >
                Yeni Çalışan Ekle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map((emp) => (
                <div
                  key={emp.id}
                  className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:border-primary-300 hover:shadow-md transition-all space-y-4"
                >
                  <div
                    onClick={() => setCalendarEmployee(emp)}
                    className="flex items-start justify-between cursor-pointer group"
                    title="Yoklama Takvimini Aç & Gün Gün İşaretle"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-sm shadow-sm group-hover:bg-primary-600 group-hover:text-white transition-colors">
                        {emp.first_name.charAt(0)}
                        {emp.last_name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900 group-hover:text-primary-600 transition-colors flex items-center gap-1.5">
                          {emp.first_name} {emp.last_name}
                          <span className="text-xs text-primary-500 font-normal">📅</span>
                        </h3>
                        <p className="text-xs text-gray-400">{emp.phone || 'Telefon belirtilmedi'}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        emp.is_active ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {emp.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>

                  {/* Wage Breakdown Box (Aylık Maaş, Günlük, Saatlik) */}
                  <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-primary-50/70 border border-primary-100 rounded-xl p-2.5 text-xs grid grid-cols-3 gap-1.5 text-center shadow-xs">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-700 block">Aylık Maaş</span>
                      <span className="font-extrabold text-indigo-900 text-xs sm:text-sm">{formatCurrency(emp.monthly_wage)}</span>
                    </div>
                    <div className="border-x border-primary-100">
                      <span className="text-[10px] font-bold text-gray-500 block" title="Maaş ÷ 30">Günlük</span>
                      <span className="font-extrabold text-gray-900 text-xs sm:text-sm">{formatCurrency(emp.daily_wage)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-primary-700 block" title="Günlük ÷ 11 Saat">Saatlik (11s)</span>
                      <span className="font-extrabold text-primary-800 text-xs sm:text-sm">{formatCurrency(calcHourlyWage(emp.daily_wage))}</span>
                    </div>
                  </div>

                  {/* Stats (clickable to open calendar) */}
                  <div
                    onClick={() => setCalendarEmployee(emp)}
                    className="grid grid-cols-3 gap-2 bg-gray-50 hover:bg-primary-50/40 p-3 rounded-xl text-xs cursor-pointer transition-colors"
                    title="Aylık takvim dökümünü aç ve günleri düzenle"
                  >
                    <div>
                      <span className="text-gray-400 text-[11px]">Toplam Çalışma</span>
                      <p className="font-bold text-gray-900 text-sm">
                        {emp.total_hours_worked !== undefined ? emp.total_hours_worked : emp.total_days_worked} Saat
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[11px]">Toplam Hak Ediş</span>
                      <p className="font-semibold text-gray-800 text-sm">{formatCurrency(emp.total_earned)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[11px]">Kalan Borç</span>
                      <p className={`font-bold text-sm ${emp.balance_due > 0 ? 'text-danger-600' : 'text-success-600'}`}>
                        {formatCurrency(emp.balance_due)}
                      </p>
                    </div>
                  </div>

                  {/* Card Actions (Borç Öde, Takvim & Yoklama Düzenle, Düzenle, Sil) */}
                  <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => openPayDueModal(emp)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          emp.balance_due > 0
                            ? 'text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-sm shadow-emerald-500/20'
                            : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                        }`}
                        title="En geçmiş borçtan başlayarak takvimden düş"
                      >
                        <span>⚡</span> Borç Öde
                      </button>

                      <button
                        onClick={() => setCalendarEmployee(emp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
                        title="Bu çalışanın takviminde günlere tıklayarak yoklama girin"
                      >
                        📅 Yoklama Takvimi
                      </button>

                      <button
                        onClick={() => openEditEmployeeModal(emp)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Düzenle
                      </button>
                    </div>

                    {deleteConfirm === emp.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteEmployee(emp.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-danger-500 text-white"
                        >
                          Sil
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600"
                        >
                          İptal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(emp.id)}
                        className="p-1.5 text-gray-400 hover:text-danger-500 hover:bg-danger-50 rounded-lg transition-colors"
                        title="Çalışanı Sil"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AYLIK HAKEDİŞ & BORDRO ÖZETİ */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Month Selector & Export Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-gray-700">Bordro Ayı:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 font-bold text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportMonthlyExcel}
                disabled={!monthlyData || monthlyData.employees.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Excel İndir (.xlsx)
              </button>

              <button
                onClick={handleExportMonthlyCSV}
                disabled={!monthlyData || monthlyData.employees.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-all disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                CSV İndir (.csv)
              </button>
            </div>
          </div>

          {/* Monthly KPI Stats */}
          {monthlyData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Toplam Hakediş</span>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(monthlyData.summary.totalEarned)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {monthlyData.summary.totalDaysAttended} gün çalışma
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <span className="text-xs font-semibold text-emerald-700">Ödenen Maaşlar</span>
                <p className="text-2xl font-bold text-emerald-600 mt-1">
                  {formatCurrency(monthlyData.summary.totalPaid)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Kasadan / elden tamamlanan</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <span className="text-xs font-semibold text-rose-700">Kalan Borç / Bekleyen</span>
                <p className="text-2xl font-bold text-rose-600 mt-1">
                  {formatCurrency(monthlyData.summary.totalDue)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Personele ödenecek bakiye</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <span className="text-xs font-semibold text-primary-700">Aktif Personel</span>
                <p className="text-2xl font-bold text-primary-600 mt-1">
                  {monthlyData.summary.totalEmployees} Kişi
                </p>
                <p className="text-xs text-gray-400 mt-1">{monthlyData.month} dönemi</p>
              </div>
            </div>
          )}

          {/* Monthly Table */}
          {loadingMonthly ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : !monthlyData || monthlyData.employees.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 text-xs text-gray-400">
              Bu ay için kayıt bulunamadı.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-left">
                      <th className="px-5 py-3.5">Çalışan</th>
                      <th className="px-4 py-3.5 text-right">Maaş Bilgisi (Aylık / Günlük / Saatlik)</th>
                      <th className="px-4 py-3.5 text-center">Toplam Çalışma</th>
                      <th className="px-4 py-3.5 text-center">Gelmeyen Gün</th>
                      <th className="px-4 py-3.5 text-right">Toplam Hak Ediş</th>
                      <th className="px-4 py-3.5 text-right">Ödenen Tutar</th>
                      <th className="px-4 py-3.5 text-right">Kalan Alacak / Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-medium">
                    {monthlyData.employees.map((emp) => {
                      const selectedMonthDays = getDaysInMonthFromStr(monthlyData.month);
                      return (
                      <tr key={emp.employee_id} className="hover:bg-gray-50/60 transition-colors">
                        <td
                          onClick={() => {
                            const fullEmp = employees.find((e) => e.id === emp.employee_id);
                            if (fullEmp) setCalendarEmployee(fullEmp);
                          }}
                          className="px-5 py-4 font-bold text-gray-900 cursor-pointer hover:text-primary-600 transition-colors"
                          title="Yoklama Takvimini Gör"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{emp.first_name} {emp.last_name}</span>
                            <span className="text-xs text-primary-500">📅</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="font-bold text-gray-900">
                            {formatCurrency(emp.default_monthly_wage || calcMonthlyWage(emp.default_daily_wage))}
                            <span className="text-[10px] text-gray-400 font-normal"> /ay</span>
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center justify-end gap-1.5 mt-0.5">
                            <span title="Günlük Ücret (Maaş ÷ 30)">Günlük: {formatCurrency(emp.default_daily_wage)}</span>
                            <span>·</span>
                            <span title="Günlük ÷ 11 Saat">Saat: {formatCurrency(calcHourlyWage(emp.default_daily_wage))}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold">
                            {emp.total_hours_worked !== undefined ? emp.total_hours_worked : emp.days_attended * 11} Saat
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center text-gray-400">
                          {emp.days_absent > 0 ? `${emp.days_absent} Gün` : '—'}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-gray-900">
                          {formatCurrency(emp.total_earned)}
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-emerald-600">
                          {formatCurrency(emp.total_paid)}
                        </td>
                        <td className="px-4 py-4 text-right font-extrabold">
                          <span className={emp.balance_due > 0 ? 'text-rose-600' : 'text-gray-400'}>
                            {formatCurrency(emp.balance_due)}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MAAŞ & ÖDEME HAREKET GEÇMİŞİ (YENİ) */}
      {activeTab === 'history' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Summary KPI Cards for History */}
          {historyData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <span className="text-xs font-semibold text-gray-500">Toplam Hakediş</span>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {formatCurrency(historyData.summary.totalWageEarned)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{historyData.summary.totalRecords} işlem kaydı</p>
              </div>

              <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 shadow-sm">
                <span className="text-xs font-semibold text-emerald-800">Toplam Ödenen Maaş</span>
                <p className="text-xl font-bold text-emerald-700 mt-1">
                  {formatCurrency(historyData.summary.totalPaidAmount)}
                </p>
                <p className="text-[11px] text-emerald-600 mt-0.5">Tamamlanan ödemeler</p>
              </div>

              <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4 shadow-sm">
                <span className="text-xs font-semibold text-blue-800">Kasalardan Çıkan</span>
                <p className="text-xl font-bold text-blue-700 mt-1">
                  {formatCurrency(historyData.summary.paidFromAccounts)}
                </p>
                <p className="text-[11px] text-blue-600 mt-0.5">Kasa bakiyesinden düşülen</p>
              </div>

              <div className="bg-purple-50 rounded-2xl border border-purple-100 p-4 shadow-sm">
                <span className="text-xs font-semibold text-purple-800">Harici / Elden Ödenen</span>
                <p className="text-xl font-bold text-purple-700 mt-1">
                  {formatCurrency(historyData.summary.paidExternally)}
                </p>
                <p className="text-[11px] text-purple-600 mt-0.5">Kasaya dokunulmadan</p>
              </div>

              <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-xs font-semibold text-amber-800">Kalan Borç / Bekleyen</span>
                <p className="text-xl font-bold text-amber-700 mt-1">
                  {formatCurrency(historyData.summary.totalRemainingDue)}
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">Personele ödenecek</p>
              </div>
            </div>
          )}

          {/* Filters & Export Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  placeholder="Çalışan adı, not veya açıklama ile ara..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-xs font-medium bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              {/* Employee Filter */}
              <select
                value={historyFilterEmployee}
                onChange={(e) => setHistoryFilterEmployee(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">— Tüm Çalışanlar ({employees.length}) —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>

              {/* Month Filter */}
              <input
                type="month"
                value={historyFilterMonth}
                onChange={(e) => setHistoryFilterMonth(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold bg-gray-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                title="Aya göre filtrele"
              />

              {/* Export Button */}
              <button
                onClick={handleExportHistoryExcel}
                disabled={!historyData || filteredHistoryItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Excel İndir (.xlsx)
              </button>
            </div>

            {/* Quick Payment Status Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: '', label: 'Tüm Hareketler' },
                  { key: 'paid', label: '✓ Tam Ödenenler' },
                  { key: 'partial', label: '⚡ Kısmi Ödenenler' },
                  { key: 'unpaid', label: '⏳ Bekleyen / Borç Yazılanlar' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setHistoryFilterPayment(tab.key)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      historyFilterPayment === tab.key
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-gray-400 font-medium">
                {filteredHistoryItems.length} kayıt gösteriliyor
              </span>
            </div>
          </div>

          {/* History Data Table */}
          {loadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : filteredHistoryItems.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3 text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-gray-700">Filtreye Uygun İşlem Hareketi Bulunamadı</p>
              <p className="text-xs text-gray-400 mt-1">
                Filtreleri temizleyerek veya farklı bir çalışan seçerek tekrar deneyebilirsiniz.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-bold uppercase text-left">
                      <th className="px-5 py-3.5">İşlem Tarihi</th>
                      <th className="px-5 py-3.5">Çalışan</th>
                      <th className="px-4 py-3.5">Yoklama Durumu</th>
                      <th className="px-4 py-3.5 text-right">Günlük Hakediş</th>
                      <th className="px-4 py-3.5 text-right">Ödenen Tutar</th>
                      <th className="px-4 py-3.5 text-right">Kalan Borç</th>
                      <th className="px-4 py-3.5">Ödeme Kanalı (Kasa)</th>
                      <th className="px-5 py-3.5">Açıklama / Detay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-medium">
                    {filteredHistoryItems.map((h) => {
                      const isFull = h.payment_category === 'full';
                      const isPartial = h.payment_category === 'partial';
                      const isUnpaid = h.payment_category === 'unpaid';
                      const isAbsent = h.payment_category === 'absent';

                      return (
                        <tr key={h.attendance_id} className="hover:bg-gray-50/60 transition-colors">
                          {/* Date */}
                          <td className="px-5 py-3.5 text-gray-900 font-bold whitespace-nowrap">
                            {new Date(h.attendance_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>

                          {/* Employee */}
                          <td className="px-5 py-3.5">
                            <div
                              onClick={() => {
                                const emp = employees.find((e) => e.id === h.employee_id);
                                if (emp) setCalendarEmployee(emp);
                              }}
                              className="font-bold text-gray-900 hover:text-primary-600 cursor-pointer flex items-center gap-1.5"
                              title="Takvimini Aç"
                            >
                              <span>{h.first_name} {h.last_name}</span>
                              <span className="text-gray-400 hover:text-primary-500 text-xs">📅</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                h.attendance_status === 'Geldi'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : h.attendance_status === 'Yarım Gün'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : h.attendance_status === 'Mesai'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {h.attendance_status === 'Geldi'
                                ? '✓ Tam Gün'
                                : h.attendance_status === 'Yarım Gün'
                                ? '½ Yarım Gün'
                                : h.attendance_status === 'Mesai'
                                ? '⚡ Mesai (1.5x)'
                                : '✗ Gelmedi'}
                            </span>
                          </td>

                          {/* Wage */}
                          <td className="px-4 py-3.5 text-right text-gray-700 font-bold">
                            {formatCurrency(h.daily_wage)}
                          </td>

                          {/* Paid Amount */}
                          <td className="px-4 py-3.5 text-right font-black">
                            <span
                              className={
                                isFull
                                  ? 'text-emerald-600'
                                  : isPartial
                                  ? 'text-blue-600'
                                  : 'text-gray-400'
                              }
                            >
                              {h.paid_amount > 0 ? `+${formatCurrency(h.paid_amount)}` : '₺0,00'}
                            </span>
                          </td>

                          {/* Remaining Due */}
                          <td className="px-4 py-3.5 text-right font-extrabold">
                            <span className={h.remaining_due > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                              {h.remaining_due > 0 ? formatCurrency(h.remaining_due) : '—'}
                            </span>
                          </td>

                          {/* Account */}
                          <td className="px-4 py-3.5">
                            {h.account_name ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                🏦 {h.account_name}
                              </span>
                            ) : h.paid_amount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                                💵 Elden / Harici
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs italic">— Ödenmedi —</span>
                            )}
                          </td>

                          {/* Note / Description */}
                          <td className="px-5 py-3.5 text-gray-600 max-w-[260px] truncate">
                            {h.transaction_description || h.note || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Employee Add/Edit Modal */}
      <Modal
        isOpen={empModalOpen}
        onClose={() => setEmpModalOpen(false)}
        title={editingEmployee ? 'Çalışan Bilgilerini Düzenle' : 'Yeni Çalışan Ekle'}
        size="md"
      >
        <form onSubmit={handleEmployeeSubmit} className="space-y-4">
          {empError && (
            <div className="p-3 rounded-xl bg-danger-50 text-danger-700 text-xs font-semibold">
              {empError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">İsim *</label>
              <input
                type="text"
                required
                value={empForm.first_name}
                onChange={(e) => setEmpForm({ ...empForm, first_name: e.target.value })}
                placeholder="Örn: Ahmet"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Soyisim *</label>
              <input
                type="text"
                required
                value={empForm.last_name}
                onChange={(e) => setEmpForm({ ...empForm, last_name: e.target.value })}
                placeholder="Örn: Yılmaz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Görev / Pozisyon</label>
              <input
                type="text"
                value={empForm.role}
                onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                placeholder="Örn: KONTROL, REÇME, OVERLOK"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
          </div>

          {/* 3-way synchronized salary & wage fields */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-blue-50/50 to-purple-50/40 border border-indigo-100/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <span>💰</span> Maaş ve Ücret Tanımlama
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                Otomatik Hesaplanır
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Aylık Maaş (Ana Giriş) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1" title="Aylık Standart Maaş (30 gün)">
                  Aylık Maaş (₺) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={empForm.monthly_wage}
                  onChange={(e) => handleMonthlyWageChange(e.target.value)}
                  placeholder="Örn: 30000"
                  className="w-full px-3 py-2 rounded-xl border border-indigo-300 text-sm font-extrabold text-indigo-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                />
              </div>

              {/* Günlük Ücret */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1" title="Günlük Hakediş (Aylık Maaş ÷ 30)">
                  Günlük Ücret (₺) <span className="text-[10px] text-gray-500 font-normal">(Maaş ÷ 30)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={empForm.daily_wage}
                  onChange={(e) => handleDailyWageChange(e.target.value)}
                  placeholder="Maaş ÷ 30"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 shadow-xs"
                />
              </div>

              {/* Saatlik Ücret */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1" title="1 gün = 11 çalışma saati (Günlük ÷ 11)">
                  Saatlik Ücret (₺) <span className="text-[10px] text-primary-600 font-normal">(11s)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={empForm.hourly_wage}
                  onChange={(e) => handleHourlyWageChange(e.target.value)}
                  placeholder="Günlük ÷ 11"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 shadow-xs"
                />
              </div>
            </div>

            <p className="text-[11px] text-gray-500 leading-tight">
              💡 <strong>Kural:</strong> Aylık maaşı girdiğinizde, günlük ücret <span className="text-gray-700 font-semibold">Maaş ÷ 30</span> ve saatlik ücret <span className="text-gray-700 font-semibold">Günlük ÷ 11</span> olarak otomatik hesaplanır. İster aylık maaş, ister günlük, ister saatlik yazın; sistem diğerlerini anında senkronize eder.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Telefon (İsteğe Bağlı)</label>
            <input
              type="tel"
              value={empForm.phone}
              onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
              placeholder="Örn: 0555 123 45 67"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div className="pt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEmpModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={empSubmitting}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {empSubmitting ? 'Kaydediliyor...' : editingEmployee ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pay Due (Borç Kapatma) Modal */}
      <Modal
        isOpen={payDueModalOpen}
        onClose={() => {
          setPayDueModalOpen(false);
          setPayDueEmployee(null);
          setPayDueError('');
          setPayDueSuccess('');
        }}
        title={`Borç Kapat / Toplu Ödeme — ${payDueEmployee?.first_name} ${payDueEmployee?.last_name}`}
        size="sm"
      >
        <form onSubmit={handlePayDueSubmit} className="space-y-4">
          {payDueError && (
            <div className="p-3 rounded-xl bg-danger-50 text-danger-700 text-xs font-semibold">
              {payDueError}
            </div>
          )}
          {payDueSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold">
              ✓ {payDueSuccess}
            </div>
          )}

          {/* Employee Due Info Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-600">Toplam Kalan Borç:</p>
              <p className="text-xl font-black text-rose-600 mt-0.5">
                {formatCurrency(payDueEmployee?.balance_due || 0)}
              </p>
            </div>
            <div className="text-right text-[11px] text-amber-800 font-medium max-w-[150px]">
              * Ödeme en eski tarihteki borçtan başlanarak takvimden düşülecektir.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Ödenecek Tutar (₺) *</label>
            <input
              type="number"
              min="0.01"
              step="any"
              required
              value={payDueForm.amount}
              onChange={(e) => setPayDueForm({ ...payDueForm, amount: e.target.value })}
              placeholder="Örn: 2500"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-base font-bold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Ödemenin Yapılacağı Kasa</label>
            <select
              value={payDueForm.account_id}
              onChange={(e) => setPayDueForm({ ...payDueForm, account_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="">— Kasa Seçilmedi (Harici / Elden) —</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              Kasa seçilirse tutar kasadan otomatik gider olarak düşülür.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">İşlem Tarihi</label>
            <input
              type="date"
              value={payDueForm.date}
              onChange={(e) => setPayDueForm({ ...payDueForm, date: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Açıklama (İsteğe Bağlı)</label>
            <input
              type="text"
              value={payDueForm.note}
              onChange={(e) => setPayDueForm({ ...payDueForm, note: e.target.value })}
              placeholder="Örn: Haftalık avans ödemesi"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-xs text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div className="pt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setPayDueModalOpen(false);
                setPayDueEmployee(null);
                setPayDueError('');
                setPayDueSuccess('');
              }}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={payDueSubmitting}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/25 disabled:opacity-50"
            >
              {payDueSubmitting ? 'İşleniyor...' : 'Ödemeyi Yap'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Employee Attendance Calendar & Inline Day Editor Modal */}
      {calendarEmployee && (
        <EmployeeCalendarModal
          isOpen={!!calendarEmployee}
          onClose={() => setCalendarEmployee(null)}
          employee={calendarEmployee}
          accounts={accounts}
          onAttendanceUpdated={() => {
            fetchEmployees();
            fetchAccounts();
            if (activeTab === 'attendance') fetchAttendance(selectedDate);
            if (activeTab === 'summary') fetchMonthlySummary(selectedMonth);
            if (activeTab === 'history') fetchSalaryHistory();
          }}
          onSelectDateForAttendance={(date) => {
            setSelectedDate(date);
            setActiveTab('attendance');
          }}
          onOpenPayDue={(emp) => openPayDueModal(emp)}
        />
      )}
    </div>
  );
}
