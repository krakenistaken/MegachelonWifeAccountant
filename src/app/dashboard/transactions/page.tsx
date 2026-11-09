// src/app/dashboard/transactions/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import TransactionForm, { type TransactionFormData } from '@/components/forms/TransactionForm';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { exportTransactionsToExcel, exportTransactionsToCSV } from '@/lib/exportUtils';

interface Transaction {
  id: number;
  type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string;
  category_id?: number;
  account_id?: number;
  category_name: string;
  account_name: string;
  created_by: string;
  created_at: string;
}

function formatCurrency(amount: number, currency: string = 'TRY') {
  const symbols: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || currency;
  return `${symbol}${Math.abs(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error('Fetch transactions error:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Real-time updates
  useRealtimeEvents({
    onTransactionCreated: () => fetchTransactions(),
    onTransactionUpdated: () => fetchTransactions(),
    onTransactionDeleted: () => fetchTransactions(),
  });

  const handleExportExcel = () => {
    exportTransactionsToExcel(
      transactions,
      `Muhasebe_Islemler_${filterType || 'Tumu'}_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const handleExportCSV = () => {
    exportTransactionsToCSV(
      transactions,
      `Muhasebe_Islemler_${filterType || 'Tumu'}_${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const openNewModal = () => {
    setEditingTransaction(null);
    setModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setModalOpen(true);
  };

  const handleSave = async (formData: TransactionFormData) => {
    setSubmitting(true);
    try {
      const url = editingTransaction ? `/api/transactions/${editingTransaction.id}` : '/api/transactions';
      const method = editingTransaction ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'İşlem kaydedilemedi.');
      }
      setModalOpen(false);
      setEditingTransaction(null);
      fetchTransactions();
    } catch (err) {
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        console.error('Delete error:', data.error);
      } else {
        fetchTransactions();
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">İşlemler</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Tüm gelir ve gider işlemlerinizi yönetin, düzenleyin ve dışa aktarın
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openNewModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
              bg-gradient-to-r from-primary-500 to-primary-600
              hover:from-primary-600 hover:to-primary-700
              shadow-md shadow-primary-500/25
              transition-all duration-200 transform hover:scale-[1.02]"
            id="add-transaction-btn"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Yeni İşlem
          </button>
        </div>
      </div>

      {/* Filters & Export toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-2">
          {['', 'Gelir', 'Gider'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                filterType === t
                  ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t || 'Tümü'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium mr-2 hidden md:inline">
            {transactions.length} işlem listelendi
          </span>

          <button
            onClick={handleExportExcel}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
            title="Mevcut listeyi Excel (.xlsx) formatında indir"
          >
            <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Excel İndir (.xlsx)
          </button>

          <button
            onClick={handleExportCSV}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-all disabled:opacity-50"
            title="Mevcut listeyi UTF-8 CSV formatında indir"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            CSV İndir (.csv)
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">Henüz işlem bulunmuyor</p>
            <p className="text-sm text-gray-400 mt-1">İlk işleminizi eklemek için &quot;Yeni İşlem&quot; butonuna tıklayın.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tür</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategori</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kasa</th>
                    <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tutar</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarih</th>
                    <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Açıklama</th>
                    <th className="text-right px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            tx.type === 'Gelir'
                              ? 'bg-success-50 text-success-700'
                              : 'bg-danger-50 text-danger-700'
                          }`}
                        >
                          {tx.type === 'Gelir' ? '↑' : '↓'} {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-900 font-medium">{tx.category_name}</td>
                      <td className="px-6 py-3.5 text-sm text-gray-500">{tx.account_name}</td>
                      <td className="px-6 py-3.5 text-right">
                        <span className={`text-sm font-bold ${
                          tx.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {tx.type === 'Gelir' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-500">
                        {new Date(tx.transaction_date).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-500 max-w-[200px] truncate">
                        {tx.description || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {deleteConfirm === tx.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => handleDelete(tx.id)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-danger-500 text-white hover:bg-danger-600 transition-colors"
                            >
                              Sil
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(tx)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-all"
                              title="İşlemi Düzenle"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(tx.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-danger-500 hover:bg-danger-50 transition-all"
                              title="İşlemi Sil"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                          tx.type === 'Gelir'
                            ? 'bg-success-50 text-success-700'
                            : 'bg-danger-50 text-danger-700'
                        }`}
                      >
                        {tx.type}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{tx.category_name}</span>
                    </div>
                    <span className={`text-sm font-bold ${
                      tx.type === 'Gelir' ? 'text-success-600' : 'text-danger-600'
                    }`}>
                      {tx.type === 'Gelir' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {tx.account_name} · {new Date(tx.transaction_date).toLocaleDateString('tr-TR')}
                    </p>
                    {deleteConfirm === tx.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(tx.id)}
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(tx)}
                          className="p-1 text-gray-400 hover:text-primary-600"
                          title="Düzenle"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(tx.id)}
                          className="p-1 text-gray-400 hover:text-danger-500"
                          title="Sil"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {tx.description && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{tx.description}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit transaction modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTransaction(null);
        }}
        title={editingTransaction ? 'İşlemi Düzenle' : 'Yeni İşlem Ekle'}
      >
        <TransactionForm
          key={editingTransaction ? `edit-${editingTransaction.id}` : 'new'}
          initialData={
            editingTransaction
              ? {
                  type: editingTransaction.type as 'Gelir' | 'Gider',
                  category_id: editingTransaction.category_id,
                  account_id: editingTransaction.account_id,
                  currency: editingTransaction.currency,
                  amount: editingTransaction.amount,
                  transaction_date: editingTransaction.transaction_date,
                  description: editingTransaction.description || '',
                }
              : null
          }
          onSubmit={handleSave}
          onCancel={() => {
            setModalOpen(false);
            setEditingTransaction(null);
          }}
          loading={submitting}
        />
      </Modal>
    </div>
  );
}
