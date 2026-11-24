import { useState } from "react";
import { Plus } from "lucide-react";

import { useMe } from "../../hooks/queries";
import { LEAVE_APPLICANT_ROLES, useLeaveRequests } from "../../hooks/leave";
import { Page, btnPrimary } from "../../components/ui";
import ApplyLeaveModal from "./ApplyLeaveModal";
import Approvals from "./Approvals";
import AttendanceToday from "./AttendanceToday";
import LeaveCalendar from "./LeaveCalendar";
import LeaveMonitor from "./LeaveMonitor";
import LeaveSettings from "./LeaveSettings";
import MyLeaves from "./MyLeaves";

// One Leave Management page for every role. Tabs depend on the role.
//   everyone: My Leave, Calendar
//   approvers (Team Lead, Project Manager, HR, Admin): Pending Approvals (only requests routed to them)
//   HR / Admin: Monitoring, Attendance, Policies & Rules
export default function LeaveCenter() {
  const { data: me } = useMe();
  const reqs = useLeaveRequests().data || [];
  const [tab, setTab] = useState("mine");
  const [applying, setApplying] = useState(false);

  const monitor = ["hr", "admin"].includes(me.role);
  const waiting = reqs.filter((r) => r.status === "pending" && r.current_approver_id === me.id).length;
  const tabs = [
    ["mine", "My Leave"],
    ...(me.role !== "employee" ? [["approvals", `Pending Approvals${waiting ? ` (${waiting})` : ""}`]] : []),
    ["calendar", "Leave Calendar"],
    ...(monitor ? [["monitor", "Monitoring"], ["attendance", "Today's Attendance"], ["settings", "Policies & Rules"]] : []),
  ];

  return (
    <Page
      eyebrow="Workspace"
      title="Leave Management"
      subtitle="Apply for leave, approve requests from your reports and see team availability."
      actions={LEAVE_APPLICANT_ROLES.includes(me.role) && <button className={btnPrimary} onClick={() => setApplying(true)}><Plus size={16} /> Apply Leave</button>}
    >
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-700/70">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? "border-blue-500 text-blue-300" : "border-transparent text-slate-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" && <MyLeaves me={me} />}
      {tab === "approvals" && <Approvals me={me} />}
      {tab === "calendar" && <LeaveCalendar />}
      {tab === "monitor" && <LeaveMonitor />}
      {tab === "attendance" && <AttendanceToday />}
      {tab === "settings" && <LeaveSettings me={me} />}
      {applying && <ApplyLeaveModal me={me} onClose={() => setApplying(false)} />}
    </Page>
  );
}
