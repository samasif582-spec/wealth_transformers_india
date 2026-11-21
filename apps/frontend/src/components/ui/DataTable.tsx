import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  page?: number;
  limit?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  page = 1,
  limit = 10,
  total = 0,
  onPageChange,
  emptyTitle = 'No data available',
  emptySubtitle = 'Get started by creating a new record.',
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="w-full bg-white/75 dark:bg-[#181A20]/75 backdrop-blur-2xl rounded-[22px] border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-slate-400 dark:text-slate-400 uppercase text-[10.5px] font-semibold tracking-wider border-b border-black/[0.04] dark:border-white/[0.06]">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-6 py-3.5 ${col.className ?? ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {loading ? (
              // Skeleton loading states with animated pulse
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-6 py-4">
                      <div className="h-4 bg-slate-200/70 dark:bg-slate-800/70 rounded-full w-3/4"></div>
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-14 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] flex items-center justify-center mb-3 text-slate-400 dark:text-slate-500">
                      <Inbox className="w-6 h-6 stroke-[1.5]" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {emptyTitle}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{emptySubtitle}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <motion.tr
                  key={row.id ?? idx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: idx * 0.02 }}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-6 py-4 text-slate-700 dark:text-slate-300 whitespace-nowrap ${
                        col.className ?? ''
                      }`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {total > 0 && onPageChange && (
        <div className="flex items-center justify-between px-6 py-3.5 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/[0.04] dark:border-white/[0.06] text-xs text-slate-500 dark:text-slate-400">
          <div>
            Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(page - 1) * limit + 1}</span> to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(page * limit, total)}</span> of{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span> entries
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-medium px-2">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
