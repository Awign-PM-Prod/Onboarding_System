export function employeeOnboardingFormPath(employee) {
  const params = new URLSearchParams();
  params.set('employee_id', employee.id);
  return `/onboardingform?${params.toString()}`;
}
