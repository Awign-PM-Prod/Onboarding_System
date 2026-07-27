import { WEEK_OFF_PRESETS, WEEKDAY_OPTIONS } from '../../lib/clientPolicy';

function toggleInList(list, item) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function WeekOffPicker({ value, onChange }) {
  const config = value ?? { presets: [], weekdays: [] };
  const presets = config.presets ?? [];
  const weekdays = config.weekdays ?? [];

  const setPresets = (next) => onChange({ ...config, presets: next });
  const setWeekdays = (next) => onChange({ ...config, weekdays: next });

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        Attendance Rules — Week Off Days
      </label>
      <div className="flex flex-wrap gap-2">
        {WEEK_OFF_PRESETS.map((p) => {
          const active = presets.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresets(toggleInList(presets, p.id))}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {WEEKDAY_OPTIONS.map((d) => {
          const active = weekdays.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setWeekdays(toggleInList(weekdays, d.id))}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                active
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
