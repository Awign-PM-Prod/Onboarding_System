import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './pages/Login';
import ClientForm from './pages/ClientForm';
import PmLayout from './components/PmLayout';
import PayrollLeadLayout from './components/PayrollLeadLayout';
import PayrollHeadLayout from './components/PayrollHeadLayout';
import PmDashboardHome from './pages/PmDashboardHome';
import PmClientDetail from './pages/PmClientDetail';
import PayrollLeadDashboardHome from './pages/PayrollLeadDashboardHome';
import PayrollLeadClientsPage from './pages/PayrollLeadClientsPage';
import PayrollLeadProgramManagersPage from './pages/PayrollLeadProgramManagersPage';
import ProgramManagerForm from './pages/ProgramManagerForm';
import PayrollClientDashboardHome from './pages/PayrollClientDashboardHome';
import PayrollClientApprovedEmployeesPage from './pages/PayrollClientApprovedEmployeesPage';
import PayrollClientFinalApprovedEmployeesPage from './pages/PayrollClientFinalApprovedEmployeesPage';
import PayrollClientRejectedEmployeesPage from './pages/PayrollClientRejectedEmployeesPage';
import PayrollClientIdentityNumbersPage from './pages/PayrollClientIdentityNumbersPage';
import PayrollClientAttendancePage from './pages/PayrollClientAttendancePage';
import PayrollClientPolicyPage from './pages/PayrollClientPolicyPage';
import PayrollClientAssignPmPage from './pages/PayrollClientAssignPmPage';
import PayrollClientSalaryChangesPage from './pages/PayrollClientSalaryChangesPage';
import PayrollHeadDashboardHome from './pages/PayrollHeadDashboardHome';
import PayrollHeadClientsPage from './pages/PayrollHeadClientsPage';
import SuperAdminLayout from './components/SuperAdminLayout';
import SuperAdminDashboardHome from './pages/SuperAdminDashboardHome';
import SuperAdminClientsPage from './pages/SuperAdminClientsPage';
import SuperAdminActivityPage from './pages/SuperAdminActivityPage';
import SuperAdminSalaryConfigPage from './pages/SuperAdminSalaryConfigPage';
import SuperAdminHolidayCalendarPage from './pages/SuperAdminHolidayCalendarPage';
import SuperAdminRegionZonesPage from './pages/SuperAdminRegionZonesPage';
import SuperAdminTaskRemindersPage from './pages/SuperAdminTaskRemindersPage';
import SuperAdminStaffAccountsPage from './pages/SuperAdminStaffAccountsPage';
import SetPasswordPage from './pages/SetPasswordPage';
import PmClientsPage from './pages/PmClientsPage';
import PmBulkAlertsPage from './pages/PmBulkAlertsPage';
import OnboardingForm from './pages/OnboardingForm';
import OnboardingStatusPage from './pages/OnboardingStatusPage';
import ProtectedRoute from './components/ProtectedRoute';

function PmClientDefaultRedirect() {
  const { id } = useParams();
  return <Navigate to={`/pm-dashboard/client/${id}/dashboard`} replace />;
}

function PayrollClientDefaultRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dashboard/client/${id}/dashboard`} replace />;
}

function SuperAdminClientDefaultRedirect() {
  const { id } = useParams();
  return <Navigate to={`/super-admin/client/${id}/dashboard`} replace />;
}

function SuperAdminClientLegacyRedirect() {
  const { id } = useParams();
  return <Navigate to={`/super-admin/client/${id}/dashboard`} replace />;
}

function SuperAdminOnboardingRedirect() {
  const { id } = useParams();
  return <Navigate to={`/super-admin/client/${id}/onboarding/dashboard`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute role="PAYROLL_LEAD">
            <PayrollLeadLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Navigate to="/dashboard/dashboard" replace />} />
        <Route path="/dashboard/dashboard" element={<PayrollLeadDashboardHome />} />
        <Route path="/dashboard/clients" element={<PayrollLeadClientsPage />} />
        <Route path="/dashboard/program-managers" element={<PayrollLeadProgramManagersPage />} />
        <Route path="/dashboard/program-managers/new" element={<ProgramManagerForm />} />
        <Route path="/clients/new" element={<ClientForm />} />
        <Route path="/clients/:id/edit" element={<ClientForm />} />
        <Route path="/dashboard/client/:id">
          <Route index element={<PayrollClientDefaultRedirect />} />
          <Route path="dashboard" element={<PayrollClientDashboardHome />} />
          <Route path="approved-employees" element={<PayrollClientApprovedEmployeesPage />} />
          <Route path="pl-approved-employees" element={<PayrollClientFinalApprovedEmployeesPage />} />
          <Route path="rejected-employees" element={<PayrollClientRejectedEmployeesPage />} />
          <Route path="identity-numbers" element={<PayrollClientIdentityNumbersPage />} />
          <Route path="attendance" element={<PayrollClientAttendancePage />} />
          <Route path="policy" element={<PayrollClientPolicyPage />} />
          <Route path="assign-pm" element={<PayrollClientAssignPmPage />} />
          <Route path="salary-changes" element={<PayrollClientSalaryChangesPage />} />
        </Route>
      </Route>

      <Route
        path="/pm-dashboard"
        element={
          <ProtectedRoute role="PROGRAM_MANAGER">
            <PmLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PmDashboardHome />} />
        <Route path="clients" element={<PmClientsPage />} />
        <Route path="bulk-alerts" element={<PmBulkAlertsPage />} />
        <Route path="client/:id" element={<PmClientDefaultRedirect />} />
        <Route path="client/:id/:tab" element={<PmClientDetail />} />
      </Route>
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute role="PAYROLL_HEAD">
            <PayrollHeadLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PayrollHeadDashboardHome />} />
        <Route path="clients" element={<PayrollHeadClientsPage />} />
      </Route>

      <Route
        path="/super-admin"
        element={
          <ProtectedRoute role="SUPER_ADMIN">
            <SuperAdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SuperAdminDashboardHome />} />
        <Route path="clients" element={<SuperAdminClientsPage />} />
        <Route path="clients/new" element={<ClientForm />} />
        <Route path="clients/:id/edit" element={<ClientForm />} />
        <Route path="clients/:id" element={<SuperAdminClientLegacyRedirect />} />
        <Route path="program-managers" element={<Navigate to="/super-admin/staff-accounts" replace />} />
        <Route
          path="program-managers/new"
          element={<Navigate to="/super-admin/staff-accounts/new" replace />}
        />
        <Route path="client/:id">
          <Route index element={<SuperAdminClientDefaultRedirect />} />
          <Route path="dashboard" element={<PayrollClientDashboardHome />} />
          <Route path="onboarding" element={<SuperAdminOnboardingRedirect />} />
          <Route path="onboarding/:tab" element={<PmClientDetail />} />
          <Route path="approved-employees" element={<PayrollClientApprovedEmployeesPage />} />
          <Route path="pl-approved-employees" element={<PayrollClientFinalApprovedEmployeesPage />} />
          <Route path="rejected-employees" element={<PayrollClientRejectedEmployeesPage />} />
          <Route path="identity-numbers" element={<PayrollClientIdentityNumbersPage />} />
          <Route path="attendance" element={<PayrollClientAttendancePage />} />
          <Route path="policy" element={<PayrollClientPolicyPage />} />
          <Route path="assign-pm" element={<PayrollClientAssignPmPage />} />
          <Route path="salary-changes" element={<PayrollClientSalaryChangesPage />} />
        </Route>
        <Route path="activity" element={<SuperAdminActivityPage />} />
        <Route path="salary-config" element={<SuperAdminSalaryConfigPage />} />
        <Route path="holiday-calendar" element={<SuperAdminHolidayCalendarPage />} />
        <Route path="region-zones" element={<SuperAdminRegionZonesPage />} />
        <Route path="task-reminders" element={<SuperAdminTaskRemindersPage />} />
        <Route path="bulk-alerts" element={<PmBulkAlertsPage />} />
        <Route path="staff-accounts" element={<SuperAdminStaffAccountsPage />} />
        <Route path="staff-accounts/new" element={<ProgramManagerForm />} />
        <Route path="staff-accounts/new-payroll-lead" element={<ProgramManagerForm />} />
      </Route>

      <Route path="/onboardingform" element={<OnboardingForm />} />
      <Route path="/onboarding-status" element={<OnboardingStatusPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
