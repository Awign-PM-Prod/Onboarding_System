import Papa from 'papaparse';

/** Form fields aligned with PM response modal (EmployeeFormResponseModal ORDERED_FIELDS) plus related columns. */
export const JOB_APP_FORM_EXPORT_FIELDS = [
  'name',
  'mobile',
  'email',
  'aadhaar_number',
  'aad_profile_photo',
  'aad_name',
  'aad_care_of',
  'aad_dob',
  'aad_gender',
  'aad_address',
  'aad_state',
  'aad_district',
  'aad_pincode',
  'pd_father_name',
  'pd_mother_name',
  'pd_spouse_name',
  'pd_emergency_contact_name',
  'pd_emergency_contact_relation',
  'pd_alternate_number',
  'pd_current_address_same_as_aadhaar',
  'pd_current_address',
  'pd_current_state',
  'pd_current_city',
  'pd_current_pincode',
  'pd_marital_status',
  'pd_driving_license',
  'pd_driving_license_url',
  'pd_city',
  'pd_age',
  'qual_highest_qualification',
  'qual_highest_qualification_doc_url',
  'qual_education_certificate_url',
  'qual_additional_certificates_url',
  'kyc_aadhar_front_url',
  'kyc_aadhar_back_url',
  'kyc_pan_number',
  'kyc_pan_card_url',
  'kyc_account_holder_name',
  'kyc_account_number',
  'kyc_ifsc_code',
  'kyc_bank_ifsc_details',
  'kyc_bank_passbook_url',
  'bp_passport_photo_url',
  'bp_esic_number',
  'bp_pf_uan_number',
  'bp_police_verification_url',
];

const DOWNLOAD_FILENAME_BY_FIELD = {
  aad_profile_photo: 'profile-photo',
  pd_driving_license_url: 'driving-license',
  qual_highest_qualification_doc_url: 'highest-qualification',
  qual_education_certificate_url: 'education-certificate',
  qual_additional_certificates_url: 'additional-certificate',
  kyc_aadhar_front_url: 'aadhaar-front',
  kyc_aadhar_back_url: 'aadhaar-back',
  kyc_pan_card_url: 'pan-card',
  kyc_bank_passbook_url: 'bank-passbook',
  bp_passport_photo_url: 'passport-photo',
  bp_police_verification_url: 'police-verification',
};

function columnLabel(key) {
  if (key === 'pd_emergency_contact_name') return 'Emergency Contact Name';
  if (key === 'pd_emergency_contact_relation') return 'Emergency Contact Relation';
  if (key === 'pd_alternate_number') return 'Emergency Contact Number';
  if (key === 'pd_current_address_same_as_aadhaar') return 'Same As Aadhaar Address';
  if (key === 'pd_current_address') return 'Current Address';
  if (key === 'kyc_bank_ifsc_details') return 'Bank Branch (IFSC)';
  const stripped = String(key)
    .replace(/^(aad_|pd_|qual_|kyc_|bp_)/, '')
    .replace(/_/g, ' ');
  return stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function storageDownloadUrl(url, filename) {
  const s = String(url ?? '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return s;
  try {
    const u = new URL(s);
    if (!u.searchParams.has('download')) {
      u.searchParams.set('download', filename || 'document');
    }
    return u.toString();
  } catch {
    const sep = s.includes('?') ? '&' : '?';
    return `${s}${sep}download=${encodeURIComponent(filename || 'document')}`;
  }
}

function downloadFilenameForField(key, index = 0) {
  const base = DOWNLOAD_FILENAME_BY_FIELD[key] || String(key).replace(/_url$/, '').replace(/_/g, '-');
  if (index > 0) return `${base}-${index + 1}`;
  return base;
}

function inferExtFromUrl(url) {
  const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(String(url));
  return m ? m[1].toLowerCase() : 'jpg';
}

function formatUrlCell(key, val, index = 0) {
  const url = String(val ?? '').trim();
  if (!url) return '';
  const ext = inferExtFromUrl(url);
  const name = `${downloadFilenameForField(key, index)}.${ext}`;
  return storageDownloadUrl(url, name);
}

export function formatExportCellValue(key, val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) {
    const urls = val.filter((x) => typeof x === 'string' && x.trim());
    if (urls.length === 0) return '';
    return urls.map((u, i) => formatUrlCell(key, u, i)).join('; ');
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  const s = String(val);
  if (/_url$/i.test(key) && /^https?:\/\//i.test(s.trim())) {
    return formatUrlCell(key, s, 0);
  }
  return s;
}

export function buildJobAppFormExportRow(employee, form) {
  const row = {
    'Employee Id': employee?.id ?? '',
    Name: employee?.name ?? form?.name ?? '',
    'Employee Mobile': employee?.mobile ?? '',
    'Employee Email': employee?.email ?? '',
    Designation: employee?.designation ?? '',
    'Date Of Joining': employee?.date_of_joining ?? '',
    'CTC Type': employee?.ctc_type ?? '',
    'CTC Value': employee?.ctc_value ?? '',
    'Submission Status': form?.submission_status ?? '',
    'Review Status': form?.review_status ?? '',
    'Submission Attempt': form?.submission_attempt_count ?? '',
  };

  for (const field of JOB_APP_FORM_EXPORT_FIELDS) {
    row[columnLabel(field)] = formatExportCellValue(field, form?.[field]);
  }

  return row;
}

export function buildJobAppFormExportCsv(employeesById, formsByEmployeeId, employeeIdOrder) {
  const rows = [];
  for (const empId of employeeIdOrder) {
    const employee = employeesById.get(empId);
    if (!employee) continue;
    rows.push(buildJobAppFormExportRow(employee, formsByEmployeeId.get(empId)));
  }
  return Papa.unparse(rows);
}
