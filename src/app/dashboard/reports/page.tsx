// src/app/dashboard/reports/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import DonutChart from '@/components/charts/DonutChart';
import BarChart, { type BarChartPoint } from '@/components/charts/BarChart';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import {
  exportReportToExcel,
  exportTransactionsToCSV,
  exportTransactionsToExcel,
  type ExportTransaction,
} from '@/lib/exportUtils';

interface CategoryItem {
  id: number;
  name: string;
  type: string;
  total: number;
  count: number;
  percentage: number;
}

interface AccountItem {
  id: number;
  name: string;
  balance: number;
  inflow: number;
  outflow: number;
  net: number;
}

interface ReportData {
  period: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  prevDateFrom?: string;
  prevDateTo?: string;
  summary: {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    transactionCount: number;
    prevIncome: number;
    prevExpense: number;
    incomeGrowthRate: number | null;
    expenseGrowthRate: number | null;
  };
  expenseCategories: CategoryItem[];
  incomeCategories: CategoryItem[];
  accounts: AccountItem[];
  chartPoints: BarChartPoint[];
  transactions: ExportTransaction[];
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<string>('this_month');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'Gider' | 'Gelir'>('Gider');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom') {
        if (customFrom) params.set('date_from', customFrom);
        if (customTo) params.set('date_to', customTo);
      }

      const res = await fetch(`/api/reports?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rapor verisi alınamadı.');
      setData(json);
    } catch (err) {
      console.error('Fetch reports error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Real-time SSE updates
  useRealtimeEvents({
    onTransactionCreated: () => fetchReport(),
    onTransactionUpdated: () => fetchReport(),
    onTransactionDeleted: () => fetchReport(),
    onAccountUpdated: () => fetchReport(),
  });

  const handleExportExcel = () => {
    if (!data) return;
    setExporting(true);
    try {
      exportReportToExcel(
        {
          periodLabel: data.periodLabel,
          dateRange: `${data.dateFrom} - ${data.dateTo}`,
          totalIncome: data.summary.totalIncome,
          totalExpense: data.summary.totalExpense,
          netProfit: data.summary.netProfit,
          transactionCount: data.summary.transactionCount,
          prevIncome: data.summary.prevIncome,
          prevExpense: data.summary.prevExpense,
          incomeGrowthRate: data.summary.incomeGrowthRate,
          expenseGrowthRate: data.summary.expenseGrowthRate,
          categories: [
            ...data.expenseCategories.map((c) => ({ ...c, type: 'Gider' })),
            ...data.incomeCategories.map((c) => ({ ...c, type: 'Gelir' })),
          ],
          accounts: data.accounts.map((a) => ({
            name: a.name,
            balance: a.balance,
            inflow: a.inflow,
            outflow: a.outflow,
            net: a.net,
          })),
          transactions: data.transactions,
        },
        `Muhasebe_Rapor_${data.period}_${data.dateFrom}_${data.dateTo}.xlsx`
      );
    } catch (err) {
      console.error('Export excel error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (!data || !data.transactions) return;
    exportTransactionsToCSV(
      data.transactions,
      `Muhasebe_Islemler_${data.period}_${data.dateFrom}_${data.dateTo}.csv`
    );
  };

  const periodButtons = [
    { key: 'this_week', label: 'Bu Hafta' },
    { key: 'last_week', label: 'Geçen Hafta' },
    { key: 'this_month', label: 'Bu Ay' },
    { key: 'last_month', label: 'Geçen Ay' },
    { key: 'this_year', label: 'Bu Yıl' },
    { key: 'custom', label: 'Özel Aralık' },
  ];

  return (
    <div className="space-y-7">
      {/* Top Header & Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dönemsel Özet & Analiz</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Haftalık, aylık ve dönemsel gelir-gider karşılaştırmaları ve detaylı raporlar
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            disabled={loading || exporting || !data}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-emerald-700
              bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm transition-all duration-200 disabled:opacity-50"
            title="Dönem raporunu çok sayfalı Excel (.xlsx) olarak indir"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Excel Raporu İndir (.xlsx)
          </button>

          <button
            onClick={handleExportCSV}
            disabled={loading || !data}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-gray-700
              bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-all duration-200 disabled:opacity-50"
            title="Dönem işlemlerini UTF-8 CSV olarak indir"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            CSV İndir (.csv)
          </button>
        </div>
      </div>

      {/* Period Selector Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {periodButtons.map((btn) => {
            const isActive = period === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setPeriod(btn.key)}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/25'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {btn.label}
              </button>
            );
          })}

          {data && (
            <div className="ml-auto text-xs font-semibold text-gray-500 flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
              <svg className="w-3.5 h-3.5 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 9v7.5" />
              </svg>
              <span>{data.dateFrom} ➔ {data.dateTo}</span>
            </div>
          )}
        </div>

        {/* Custom date range inputs */}
        {period === 'custom' && (
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Başlangıç:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Bitiş:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              onClick={fetchReport}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 shadow-sm"
            >
              Filtrele
            </button>
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Comparative Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Toplam Gelir */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Dönem Geliri</span>
                <span className="w-8 h-8 rounded-xl bg-success-50 text-success-600 flex items-center justify-center">
                  ↑
                </span>
              </div>
              <p className="text-2xl font-bold text-success-600 mt-2">
                +{formatCurrency(data.summary.totalIncome)}
              </p>
              {data.summary.incomeGrowthRate !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      data.summary.incomeGrowthRate >= 0
                        ? 'bg-success-50 text-success-700'
                        : 'bg-danger-50 text-danger-700'
                    }`}
                  >
                    {data.summary.incomeGrowthRate >= 0 ? '+' : ''}
                    %{data.summary.incomeGrowthRate.toFixed(1)}
                  </span>
                  <span className="text-gray-400">önceki döneme göre</span>
                </div>
              )}
            </div>

            {/* Toplam Gider */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Dönem Gideri</span>
                <span className="w-8 h-8 rounded-xl bg-danger-50 text-danger-600 flex items-center justify-center">
                  ↓
                </span>
              </div>
              <p className="text-2xl font-bold text-danger-600 mt-2">
                -{formatCurrency(data.summary.totalExpense)}
              </p>
              {data.summary.expenseGrowthRate !== null && (
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      data.summary.expenseGrowthRate <= 0
                        ? 'bg-success-50 text-success-700'
                        : 'bg-danger-50 text-danger-700'
                    }`}
                  >
                    {data.summary.expenseGrowthRate >= 0 ? '+' : ''}
                    %{data.summary.expenseGrowthRate.toFixed(1)}
                  </span>
                  <span className="text-gray-400">önceki döneme göre</span>
                </div>
              )}
            </div>

            {/* Net Kar / Zarar */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Net Durum (Kar/Zarar)</span>
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                    data.summary.netProfit >= 0
                      ? 'bg-primary-50 text-primary-600'
                      : 'bg-danger-50 text-danger-600'
                  }`}
                >
                  ₺
                </span>
              </div>
              <p
                className={`text-2xl font-bold mt-2 ${
                  data.summary.netProfit >= 0 ? 'text-gray-900' : 'text-danger-600'
                }`}
              >
                {data.summary.netProfit >= 0 ? '+' : '-'}
                {formatCurrency(data.summary.netProfit)}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <span>Gelir - Gider farkı</span>
              </div>
            </div>

            {/* Toplam İşlem Sayısı */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Kayıtlı İşlem</span>
                <span className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  #
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {data.summary.transactionCount}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                <span>{data.periodLabel} içindeki hareketler</span>
              </div>
            </div>
          </div>

          {/* Visual Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar Chart (Comparative Timeline) */}
            <div className="lg:col-span-2">
              <BarChart
                title="Gelir ve Gider Akışı"
                subtitle={`${data.periodLabel} günlük / dönemsel hareket grafiği`}
                points={data.chartPoints}
              />
            </div>

            {/* Donut Chart (Category Breakdown) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveCategoryTab('Gider')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeCategoryTab === 'Gider'
                      ? 'bg-white text-danger-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Gider Dağılımı ({data.expenseCategories.length})
                </button>
                <button
                  onClick={() => setActiveCategoryTab('Gelir')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeCategoryTab === 'Gelir'
                      ? 'bg-white text-success-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Gelir Dağılımı ({data.incomeCategories.length})
                </button>
              </div>

              {activeCategoryTab === 'Gider' ? (
                <DonutChart
                  title="Gider Kategorileri Dağılımı"
                  subtitle="Harcamalarınızın kategorilere göre yüzdesi"
                  data={data.expenseCategories}
                  type="Gider"
                />
              ) : (
                <DonutChart
                  title="Gelir Kaynakları Dağılımı"
                  subtitle="Gelirlerinizin kategorilere göre yüzdesi"
                  data={data.incomeCategories}
                  type="Gelir"
                />
              )}
            </div>
          </div>

          {/* Category Detailed Table & Account Snapshot Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Percentages Table */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Kategori Bazlı Harcama & Gelir</h3>
                  <p className="text-xs text-gray-500">Tutar ve yüzdelik dağılım tablosu</p>
                </div>
                <span className="text-xs font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg">
                  {data.expenseCategories.length + data.incomeCategories.length} Kategori
                </span>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                <h4 className="text-xs font-bold text-danger-600 uppercase tracking-wider">
                  Gider Kategorileri ({data.expenseCategories.length})
                </h4>
                {data.expenseCategories.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Bu dönemde gider kaydı yok.</p>
                ) : (
                  data.expenseCategories.map((cat) => (
                    <div key={`exp-${cat.id}`} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-gray-800">{cat.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900">{formatCurrency(cat.total)}</span>
                          <span className="text-danger-600 font-bold w-12 text-right">
                            %{cat.percentage.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-danger-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}

                <div className="pt-3 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-success-600 uppercase tracking-wider mb-3">
                    Gelir Kategorileri ({data.incomeCategories.length})
                  </h4>
                  {data.incomeCategories.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Bu dönemde gelir kaydı yok.</p>
                  ) : (
                    data.incomeCategories.map((cat) => (
                      <div key={`inc-${cat.id}`} className="space-y-1.5 mb-3">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-gray-800">{cat.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900">{formatCurrency(cat.total)}</span>
                            <span className="text-success-600 font-bold w-12 text-right">
                              %{cat.percentage.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-success-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Accounts Snapshot Table */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Kasa Durumları</h3>
                    <p className="text-xs text-gray-500">Dönem içi kasa hareketleri ve güncel bakiyeler</p>
                  </div>
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-lg">
                    {data.accounts.length} Kasa
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 font-semibold uppercase text-left">
                        <th className="pb-2.5">Kasa</th>
                        <th className="pb-2.5 text-right">Giriş</th>
                        <th className="pb-2.5 text-right">Çıkış</th>
                        <th className="pb-2.5 text-right">Net Değişim</th>
                        <th className="pb-2.5 text-right">Güncel Bakiye</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium">
                      {data.accounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3 text-gray-900 font-bold">{acc.name}</td>
                          <td className="py-3 text-right text-success-600">
                            +{formatCurrency(acc.inflow)}
                          </td>
                          <td className="py-3 text-right text-danger-600">
                            -{formatCurrency(acc.outflow)}
                          </td>
                          <td
                            className={`py-3 text-right font-bold ${
                              acc.net >= 0 ? 'text-primary-700' : 'text-danger-600'
                            }`}
                          >
                            {acc.net >= 0 ? '+' : '-'}
                            {formatCurrency(acc.net)}
                          </td>
                          <td className="py-3 text-right text-gray-900 font-extrabold">
                            {formatCurrency(acc.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs font-semibold">
                <span className="text-gray-500">Tüm Kasalar Toplamı</span>
                <span className="text-base font-bold text-gray-900">
                  {formatCurrency(data.accounts.reduce((sum, a) => sum + a.balance, 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Period Transactions List */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {data.periodLabel} İşlemleri ({data.transactions.length})
                </h3>
                <p className="text-xs text-gray-500">Seçili dönem içerisinde kaydedilen tüm hareketler</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    exportTransactionsToExcel(
                      data.transactions,
                      `Islemler_${data.period}_${data.dateFrom}.xlsx`
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  Excel (.xlsx)
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  CSV (.csv)
                </button>
              </div>
            </div>

            {data.transactions.length === 0 ? (
              <div className="text-center py-12 bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                Bu dönem için kayıtlı işlem bulunmuyor.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold uppercase text-left">
                      <th className="px-4 py-3">Tür</th>
                      <th className="px-4 py-3">Kategori</th>
                      <th className="px-4 py-3">Kasa</th>
                      <th className="px-4 py-3 text-right">Tutar</th>
                      <th className="px-4 py-3">Tarih</th>
                      <th className="px-4 py-3">Açıklama</th>
                      <th className="px-4 py-3">Kaydeden</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-semibold ${
                              tx.type === 'Gelir'
                                ? 'bg-success-50 text-success-700'
                                : 'bg-danger-50 text-danger-700'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{tx.category_name}</td>
                        <td className="px-4 py-3 text-gray-600">{tx.account_name}</td>
                        <td className="px-4 py-3 text-right font-bold">
                          <span className={tx.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'}>
                            {tx.type === 'Gelir' ? '+' : '-'}
                            {formatCurrency(tx.amount, tx.currency)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(tx.transaction_date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                          {tx.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{tx.created_by || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
