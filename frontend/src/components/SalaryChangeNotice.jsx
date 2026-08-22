export default function SalaryChangeNotice({ count, onOpen, onDismiss }) {
  if (!count) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] w-[min(22rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-xl border border-amber-200 bg-white shadow-xl">
        <button
          type="button"
          onClick={onOpen}
          className="w-full px-4 py-3 text-left hover:bg-amber-50"
        >
          <p className="text-sm font-semibold text-amber-900">
            {count === 1 ? '1 salary change request' : `${count} salary change requests`}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            Program Manager sent a salary change for review. Click to open Salary Changes.
          </p>
        </button>
        <div className="flex items-center justify-between border-t border-amber-100 bg-amber-50/70 px-3 py-2">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-medium text-amber-900 hover:underline"
          >
            Review now
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-slate-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
