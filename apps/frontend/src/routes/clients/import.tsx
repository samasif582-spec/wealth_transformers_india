import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
} from 'lucide-react';
import { toast } from '../../components/ui/useToast';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../lib/api-client';

export const ClientImportPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    total: number;
    imported: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
        toast.error('Invalid Format', 'Please upload a standard CSV or XLSX spreadsheet.');
        return;
      }
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const handleStartImport = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadProgress(25);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      setUploadProgress(60);
      const res = await apiClient.post('/clients/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadProgress(100);

      const result = res.data;
      const importedCount = result.imported || 0;
      const rawErrors: Array<{ line: number; field: string; error: string }> = result.errors || [];
      const formattedErrors = rawErrors.map(
        (err) => `Row ${err.line}: [${err.field}] ${err.error}`,
      );

      setImportResult({
        total: importedCount + formattedErrors.length,
        imported: importedCount,
        failed: formattedErrors.length,
        errors: formattedErrors,
      });

      toast.success(
        'Batch Import Complete',
        `${importedCount} clients successfully imported into database`,
      );
    } catch (err: any) {
      toast.error('Import Failed', err.response?.data?.message || err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,mobileNumber,fullName,dateOfBirth\n' +
      '+919811122233,Sunil Mittal,23-10-1968\n' +
      '+919848011223,Kavita Reddy,14-06-1984\n' +
      '+919825099887,Deepak Mehta,30-01-1992\n' +
      '+919820123456,Vikramaditya Singhania,12-04-1985\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'wealthtrade_client_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.info('Template Downloaded', 'wealthtrade_client_import_template.csv ready to use');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Client Directory
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Import Clients via CSV / Excel</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Bulk onboard client registries with automatic E.164 phone normalization and consent recording
        </p>
      </div>

      {/* Upload Box */}
      <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-8 rounded-[28px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark space-y-6">
        <div className="border-2 border-dashed border-black/10 dark:border-white/10 hover:border-blue-500/50 dark:hover:border-blue-400/50 rounded-[22px] p-10 text-center transition-all bg-black/[0.01] dark:bg-white/[0.02]">
          <input
            type="file"
            id="fileInput"
            accept=".csv, .xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="fileInput" className="cursor-pointer group">
            <div className="w-14 h-14 rounded-full bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center mx-auto mb-3 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
              <UploadCloud className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {selectedFile ? selectedFile.name : 'Choose CSV or Excel file'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                : 'Accepts standard UTF-8 encoded .csv or .xlsx up to 25MB'}
            </p>
          </label>
        </div>

        {selectedFile && !importResult && (
          <div className="space-y-4">
            {isUploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  <span>Uploading to server & normalizing E.164 numbers...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="apple-btn-secondary"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleStartImport}
                disabled={isUploading}
                className="apple-btn-primary"
              >
                {isUploading ? 'Importing...' : 'Start Batch Import'}
              </button>
            </div>
          </div>
        )}

        {/* Results Card */}
        {importResult && (
          <div className="p-6 bg-black/[0.02] dark:bg-white/[0.03] rounded-[22px] border border-black/5 dark:border-white/10 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Batch Import Summary</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-4 bg-white/70 dark:bg-white/[0.04] rounded-[18px] border border-black/5 dark:border-white/10">
                <span className="text-[11px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider">Total Rows</span>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{importResult.total}</p>
              </div>
              <div className="p-4 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-[18px] border border-emerald-500/20">
                <span className="text-[11px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 tracking-wider">Imported</span>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{importResult.imported}</p>
              </div>
              <div className="p-4 bg-rose-500/10 dark:bg-rose-500/15 rounded-[18px] border border-rose-500/20">
                <span className="text-[11px] uppercase font-semibold text-rose-600 dark:text-rose-400 tracking-wider">Failed</span>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">{importResult.failed}</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 block">Row-level Validation Diagnostics:</span>
                {importResult.errors.map((err, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-[12px] text-xs text-rose-700 dark:text-rose-300 font-mono"
                  >
                    {err}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-black/5 dark:border-white/5">
              <button
                onClick={() => navigate('/clients')}
                className="apple-btn-primary"
              >
                View in Client Directory
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Template Guide */}
      <div className="p-5 bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl rounded-[22px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Need the Standard CSV Template?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Requires: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">mobileNumber</span>, <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">fullName</span>, and <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">dateOfBirth</span> (DD-MM-YYYY).
            </p>
          </div>
        </div>
        <button
          onClick={downloadSampleCsv}
          className="apple-btn-secondary"
        >
          <Download className="w-4 h-4" /> Download Sample
        </button>
      </div>
    </div>
  );
};
