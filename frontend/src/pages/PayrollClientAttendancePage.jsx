import { useParams } from 'react-router-dom';
import AttendancePanel from '../components/AttendancePanel';

export default function PayrollClientAttendancePage() {
  const { id: clientId } = useParams();

  if (!clientId) {
    return <div className="p-6 text-sm text-red-600">Missing client id</div>;
  }

  return (
    <div className="px-6 pb-8">
      <AttendancePanel clientId={clientId} role="PAYROLL_LEAD" />
    </div>
  );
}
