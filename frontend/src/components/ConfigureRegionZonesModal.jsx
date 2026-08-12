import ModalOverlay from './ModalOverlay';
import RegionZonesEditor from './RegionZonesEditor';

export default function ConfigureRegionZonesModal({
  onClose,
  onSaved,
  initialState = ''
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-lg bg-white shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Configure Region Zones</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          <RegionZonesEditor
            variant="modal"
            initialState={initialState}
            onCancel={onClose}
            onSaved={(rows) => {
              onSaved?.(rows);
            }}
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </ModalOverlay>
  );
}
