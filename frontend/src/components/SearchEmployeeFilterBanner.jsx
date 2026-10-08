export default function SearchEmployeeFilterBanner({ employeeName, found = true, onClear }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <p className="text-sm text-indigo-900">
        {found ? (
          <>
            Showing search result
            {employeeName ? (
              <>
                : <span className="font-semibold">{employeeName}</span>
              </>
            ) : null}
          </>
        ) : (
          'The employee from your search is not in this list.'
        )}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
      >
        Clear filter
      </button>
    </div>
  );
}
