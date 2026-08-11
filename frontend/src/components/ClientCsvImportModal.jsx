import { useState } from 'react';
import { api } from '../lib/api';
import ModalOverlay from './ModalOverlay';
import { ACTION_BTN_PRIMARY, ACTION_BTN_SECONDARY } from '../lib/actionButtonStyles';
import {
  buildClientTemplateCsv,
  parseClientCsvText,
  triggerCsvDownload
} from '../lib/clientCsv';

const PREVIEW_LIMIT = 8;

export default function ClientCsvImportModal({ onClose, onDone }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const resetResults = () => {
    setResult(null);
    setError(null);
  };

  const onChooseFile = async (e) => {
    const selected = e.target.files?.[0] ?? null;
    setFileName('');
    setRows([]);
    setParseError(null);
    resetResults();
    if (!selected) return;

    const name = (selected.name || '').toLowerCase();
    if (!name.endsWith('.csv') && selected.type !== 'text/csv') {
      setParseError('Only .csv files are supported.');
      return;
    }

    setParsing(true);
    try {
      const text = await selected.text();
      const parsed = parseClientCsvText(text);
      setFileName(selected.name || 'file.csv');
      setRows(parsed);
      if (!parsed.length) setParseError('The file has no data rows.');
    } catch (err) {
      setParseError(err.message || 'Could not read the CSV file.');
    } finally {
      setParsing(false);
    }
  };

  const onDownloadTemplate = async () => {
    try {
      const blob = await api.downloadClientCsvTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'client-creation-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      triggerCsvDownload('client-creation-template.csv', buildClientTemplateCsv());
    }
  };

  const onImport = async (e) => {
    e.preventDefault();
    if (!rows.length) {
      setError('No rows to import. Choose a CSV file first.');
      return;
    }
    resetResults();
    setSubmitting(true);
    try {
      const fileInput = document.getElementById('client-csv-import-input');
      const file = fileInput?.files?.[0];
      if (!file) {
        setError('Choose a CSV file first.');
        return;
      }
      const res = await api.importClientsCsv(file);
      setResult(res);
      if ((res.created ?? 0) > 0) onDone?.(res);
    } catch (err) {
      setError(err.message || 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewRows = rows.slice(0, PREVIEW_LIMIT);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-[min(92vw,40rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import Clients from CSV</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload the client creation template filled with client and project configuration details.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={onImport} className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onDownloadTemplate}
              className={ACTION_BTN_SECONDARY}
            >
              Download CSV Template
            </button>
            <label className={`cursor-pointer ${ACTION_BTN_SECONDARY}`}>
              Choose CSV
              <input
                id="client-csv-import-input"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onChooseFile}
              />
            </label>
            {fileName && (
              <span className="text-sm text-slate-600">{fileName} · {rows.length} row{rows.length === 1 ? '' : 's'}</span>
            )}
            {parsing && <span className="text-sm text-slate-500">Parsing…</span>}
          </div>

          {parseError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {parseError}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Client</th>
                    <th className="px-3 py-2 text-left font-medium">Contract</th>
                    <th className="px-3 py-2 text-left font-medium">Entity</th>
                    <th className="px-3 py-2 text-left font-medium">State</th>
                    <th className="px-3 py-2 text-left font-medium">PM Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row, i) => (
                    <tr key={`${row.contract_code}-${i}`}>
                      <td className="px-3 py-2 text-slate-800">{row.client_name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-700">{row.contract_code || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.entity || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.state || '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{row.program_manager_email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > PREVIEW_LIMIT && (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Showing first {PREVIEW_LIMIT} of {rows.length} rows.
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <p className="font-medium">
                Created {result.created ?? 0} client{(result.created ?? 0) === 1 ? '' : 's'}
                {(result.skipped ?? 0) > 0 ? `, skipped ${result.skipped}` : ''}.
              </p>
              {Array.isArray(result.errors) && result.errors.length > 0 && (
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-emerald-950">
                  {result.errors.map((err, idx) => (
                    <li key={`${err.row}-${idx}`}>
                      Row {err.row}: {err.error}
                      {err.details ? ` (${Object.keys(err.details).join(', ')})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={ACTION_BTN_SECONDARY}
            >
              {result ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting || !rows.length || Boolean(parseError)}
              className={ACTION_BTN_PRIMARY}
            >
              {submitting ? 'Importing…' : 'Import Clients'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}
