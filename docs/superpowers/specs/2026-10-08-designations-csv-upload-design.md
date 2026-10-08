# Designations CSV upload — design

## Goal

Let users fill the Designations field (client form and client policy page) from a CSV file instead of picking each designation manually.

## CSV format

- Columns: `designation` (required), `skill_level` (optional).
- Header aliases: `designation` / `designation_name` / `name` / `role`; `skill_level` / `skill` / `skill level`.
- Skill level accepts `SKILLED`, `SEMI_SKILLED` (also `Semi-skilled`, `semi`), `UNSKILLED`, case-insensitive. Blank or unrecognised values default to Semi-skilled; unrecognised values are reported as warnings.
- Empty rows ignored. Duplicate names within the file (case-insensitive): last row wins.
- Downloadable template `designations-template.csv`:

```csv
designation,skill_level
Technician,SKILLED
Supervisor,SEMI_SKILLED
Helper,UNSKILLED
```

## Merge rule

Uploading merges into the current selection:

- Name matches an existing designation (case-insensitive): keep existing spelling, update skill level to the CSV value.
- New name: appended.
- Nothing is removed.

## Components

- `frontend/src/lib/designationCsv.js` — pure functions:
  - `parseDesignationCsvText(text)` → `{ designations, warnings }`; throws when there is no designation column or no data rows.
  - `mergeDesignations(existing, imported)` → `{ designations, added, updated }`.
  - `buildDesignationTemplateCsv()`.
- `DesignationsInput.jsx` — "Upload CSV" button (hidden `.csv` file input) and "Download template" link under the helper text. Shows a summary ("Imported N designations (X new, Y updated)"), warnings, or an error. Emits through the existing `onChange`, so leave allowances rebuild as today.

## Out of scope

No backend changes; designations are persisted through the existing client save endpoints.

## Testing

Vitest: `frontend/src/lib/designationCsv.test.js` covers header aliases, skill defaults and warnings, duplicates, merge behaviour, missing column / empty file errors.
