import { useMemo, useState } from 'react';
import { formatDesignationLabel } from '../lib/formatLabels';
import { formatContractPeriod } from '../lib/clientCsv';

const DESIGNATION_PREVIEW_COUNT = 4;

function MetaItem({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-semibold text-indigo-950">{children}</div>
    </div>
  );
}

/**
 * Shared project meta header for PL / PM client views.
 * Matches: title → contract / duration / designation / PL counts → optional month picker / tabs.
 */
export default function ClientProjectMetaHeader({
  title,
  contractCode,
  contractStartDate,
  contractEndDate,
  openEndedContract = false,
  entity,
  state,
  designations = [],
  plApprovedCount = 0,
  plRejectedCount = 0,
  insuranceApplicable = false,
  month,
  onMonthChange,
  children,
  className = '',
}) {
  const [designationsExpanded, setDesignationsExpanded] = useState(false);

  const designationLabels = useMemo(
    () => (Array.isArray(designations) ? designations : []).map((d) => formatDesignationLabel(d)).filter(Boolean),
    [designations]
  );

  const hiddenDesignationCount = Math.max(0, designationLabels.length - DESIGNATION_PREVIEW_COUNT);
  const visibleDesignations =
    designationsExpanded || hiddenDesignationCount === 0
      ? designationLabels
      : designationLabels.slice(0, DESIGNATION_PREVIEW_COUNT);

  const duration =
    contractStartDate || contractEndDate || openEndedContract
      ? formatContractPeriod(contractStartDate, contractEndDate, openEndedContract)
          .replace(' – ', ' - ')
      : '—';

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-indigo-950 sm:text-2xl">
          {title || 'Client Dashboard'}
        </h1>
        {insuranceApplicable && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
            Insured
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-start xl:gap-x-8">
        <MetaItem label="Contract Code">
          <span className="font-mono">{contractCode || '—'}</span>
        </MetaItem>

        {(entity || state) && (
          <MetaItem label="Entity / State">
            {[entity, state].filter(Boolean).join(' · ') || '—'}
          </MetaItem>
        )}

        <MetaItem label="Duration">{duration}</MetaItem>

        <MetaItem label="Designation">
          {designationLabels.length === 0 ? (
            '—'
          ) : (
            <p className="leading-snug">
              {visibleDesignations.join(', ')}
              {hiddenDesignationCount > 0 && !designationsExpanded && (
                <>
                  {', '}
                  <button
                    type="button"
                    onClick={() => setDesignationsExpanded(true)}
                    className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                  >
                    + {hiddenDesignationCount} more
                  </button>
                </>
              )}
              {designationsExpanded && hiddenDesignationCount > 0 && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => setDesignationsExpanded(false)}
                    className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                  >
                    Show less
                  </button>
                </>
              )}
            </p>
          )}
        </MetaItem>

        <MetaItem label="PL Approved">
          <span className="tabular-nums text-emerald-600">{plApprovedCount}</span>
        </MetaItem>

        <MetaItem label="PL Rejected">
          <span className="tabular-nums text-rose-600">{plRejectedCount}</span>
        </MetaItem>
      </div>

      {typeof onMonthChange === 'function' && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 text-sm font-medium text-indigo-950">
            Attendance Month
            <input
              type="month"
              value={month || ''}
              onChange={(e) => e.target.value && onMonthChange(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 shadow-sm"
            />
          </label>
        </div>
      )}

      {children}
    </div>
  );
}
