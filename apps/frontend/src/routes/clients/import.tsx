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
      'data:text/csv;charset=utf-8,fullName,whatsappNumber,email,categoryTier,preferredLanguage,dateOfBirth\n' +
      'Sunil Mittal,+919811122233,sunil@bharti.com,CORPORATE,en,1968-10-23\n' +
      'Kavita Reddy,+919848011223,kavita.reddy@gmail.com,HNI,te,1984-06-14\n' +
      'Deepak Mehta,+919825099887,deepak.mehta@fin.in,RETAIL,gu,1992-01-30\n';
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
      <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-8 text-center transition-colors">
          <input
            type="file"
            id="fileInput"
            accept=".csv, .xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="fileInput" className="cursor-pointer">
            <UploadCloud className="w-12 h-12 text-blue-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {selectedFile ? selectedFile.name : 'Click to select CSV or Excel file'}
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
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
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
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleStartImport}
                disabled={isUploading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {isUploading ? 'Importing...' : 'Start Batch Import'}
              </button>
            </div>
          </div>
        )}

        {/* Results Card */}
        {importResult && (
          <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Batch Import Summary</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] uppercase font-semibold text-slate-400 dark:text-slate-500">Total Rows</span>
                <p className="text-xl font-bold text-slate-800 dark:text-white">{importResult.total}</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <span className="text-[11px] uppercase font-semibold text-emerald-700 dark:text-emerald-300">Imported</span>
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{importResult.imported}</p>
              </div>
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800">
                <span className="text-[11px] uppercase font-semibold text-rose-700 dark:text-rose-300">Failed / Rejected</span>
                <p className="text-xl font-bold text-rose-800 dark:text-rose-200">{importResult.failed}</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 block">Row-level Validation Diagnostics:</span>
                {importResult.errors.map((err, i) => (
                  <div
                    key={i}
                    className="p-2 bg-rose-50/60 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded text-xs text-rose-700 dark:text-rose-300 font-mono"
                  >
                    {err}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => navigate('/clients')}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                View in Client Directory
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Template Guide */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Need the Standard CSV Template?</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Includes pre-configured headers: fullName, whatsappNumber, email, categoryTier, preferredLanguage, dateOfBirth
            </p>
          </div>
        </div>
        <button
          onClick={downloadSampleCsv}
          className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs transition-colors"
        >
          <Download className="w-4 h-4" /> Download Sample Template
        </button>
      </div>
    </div>
  );
};
