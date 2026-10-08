export default function ClientStatusBadge({ active }) {
  return active ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
      Active
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
      Inactive
    </span>
  );
}
