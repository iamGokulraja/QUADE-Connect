import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";

// Admin
import AdminDashboard from "./pages/admin/Dashboard";
import ProjectsAllocation from "./pages/admin/ProjectsAllocation";
import ClientSubmissions from "./pages/admin/ClientSubmissions";

// HR
import HRDashboard from "./pages/hr/Dashboard";
import HRPeople from "./pages/hr/People";
import PeopleDirectory from "./pages/hr/PeopleDirectory";
import CreateUser from "./pages/hr/CreateUser";
import HRTeams from "./pages/hr/Teams";
import HrReports from "./pages/hr/Reports";

// Project Manager
import PmProjects from "./pages/project-manager/Projects";
import Documents from "./pages/shared/Documents";

// Client
import ClientProjects from "./pages/client/Projects";

// Shared work-management pages (Project Manager / Team Lead / Employee)
import WorkDashboard from "./pages/shared/WorkDashboard";
import ProjectWorkspace from "./pages/shared/ProjectWorkspace";
import ProjectList from "./pages/shared/ProjectList";
import MyTeam from "./pages/shared/MyTeam";
import Attendance from "./pages/shared/Attendance";
import LeaveCenter from "./pages/leave/LeaveCenter";
import Spotlight from "./pages/spotlight/Spotlight";
import Portfolio from "./pages/shared/Portfolio";
import ReportingHierarchy from "./pages/shared/ReportingHierarchy";
import QcDashboard from "./pages/qc/Dashboard";
import QcGrade from "./pages/qc/QcGrade";
import TeamChat from "./pages/chat/TeamChat";
import MyProfile from "./pages/profile/MyProfile";
import MyMoments from "./pages/moments/MyMoments";
import { ChatRuntime } from "./components/chat/ChatRuntime";
import { GlobalCallProvider } from "./components/call/GlobalCallProvider";

// One protected area per role, all rendered inside the single AppLayout.
const area = (role, children) => (
  <Route
    element={
      <ProtectedRoute roles={[role]}>
        <AppLayout />
      </ProtectedRoute>
    }
  >
    {children}
  </Route>
);

function Landing() {
  const navigate = useNavigate();
  return <LandingPage onLogin={() => navigate("/login")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ChatRuntime>
      <GlobalCallProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {area("admin", <>
          <Route path="/admin/profile" element={<MyProfile />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/projects" element={<ProjectsAllocation />} />
          <Route path="/admin/team-management" element={<ClientSubmissions />} />
          <Route path="/admin/documents" element={<Documents />} />
          <Route path="/admin/portfolio" element={<Portfolio />} />
          <Route path="/admin/projects/:projectId" element={<ProjectWorkspace />} />
          <Route path="/admin/hierarchy" element={<ReportingHierarchy />} />
          <Route path="/admin/people" element={<PeopleDirectory />} />
          <Route path="/admin/leave" element={<LeaveCenter />} />
          <Route path="/admin/spotlight" element={<Spotlight />} />
          <Route path="/admin/moments" element={<MyMoments />} />
          <Route path="/admin/chat" element={<TeamChat />} />
          <Route path="/admin/qc-grades" element={<QcGrade />} />
        </>)}

        {area("hr", <>
          <Route path="/hr/profile" element={<MyProfile />} />
          <Route path="/hr" element={<HRDashboard />} />
          <Route path="/hr/people" element={<PeopleDirectory />} />
          {/* the three old lists are now tabs of People; old links and bookmarks still work */}
          <Route path="/hr/employees" element={<Navigate to="/hr/people?tab=emp" replace />} />
          <Route path="/hr/project-managers" element={<Navigate to="/hr/people?tab=pm" replace />} />
          <Route path="/hr/team-leads" element={<Navigate to="/hr/people?tab=tl" replace />} />
          <Route path="/hr/create-user" element={<CreateUser />} />
          <Route path="/hr/teams" element={<HRTeams />} />
          <Route path="/hr/hierarchy" element={<ReportingHierarchy />} />
          <Route path="/hr/attendance" element={<Attendance />} />
          <Route path="/hr/leave" element={<LeaveCenter />} />
          <Route path="/hr/reports" element={<HrReports />} />
          <Route path="/hr/spotlight" element={<Spotlight />} />
          <Route path="/hr/moments" element={<MyMoments />} />
          <Route path="/hr/chat" element={<TeamChat />} />
          <Route path="/hr/documents" element={<Documents />} />
          <Route path="/hr/qc-grades" element={<QcGrade />} />
          <Route path="/hr/qc-users" element={<HRPeople role="qc" title="QC Users" description="View and monitor Quality Control accounts. Add a new QC user from Create User." />} />
        </>)}

        {area("project_manager", <>
          <Route path="/project-manager/profile" element={<MyProfile />} />
          <Route path="/project-manager" element={<WorkDashboard />} />
          <Route path="/project-manager/projects" element={<PmProjects />} />
          <Route path="/project-manager/projects/:projectId" element={<ProjectWorkspace />} />
          <Route path="/project-manager/team-leads" element={<Navigate to="/project-manager/projects" replace />} />
          <Route path="/project-manager/documents" element={<Documents />} />
          <Route path="/project-manager/attendance" element={<Attendance />} />
          <Route path="/project-manager/leave" element={<LeaveCenter />} />
          <Route path="/project-manager/spotlight" element={<Spotlight />} />
          <Route path="/project-manager/moments" element={<MyMoments />} />
          <Route path="/project-manager/chat" element={<TeamChat />} />
        </>)}

        {area("team_lead", <>
          <Route path="/team-lead/profile" element={<MyProfile />} />
          <Route path="/team-lead" element={<WorkDashboard />} />
          <Route path="/team-lead/projects" element={<ProjectList />} />
          <Route path="/team-lead/projects/:projectId" element={<ProjectWorkspace />} />
          <Route path="/team-lead/team" element={<MyTeam />} />
          <Route path="/team-lead/board" element={<Navigate to="/team-lead/projects" replace />} />
          <Route path="/team-lead/attendance" element={<Attendance />} />
          <Route path="/team-lead/leave" element={<LeaveCenter />} />
          <Route path="/team-lead/documents" element={<Documents />} />
          <Route path="/team-lead/spotlight" element={<Spotlight />} />
          <Route path="/team-lead/moments" element={<MyMoments />} />
          <Route path="/team-lead/chat" element={<TeamChat />} />
        </>)}

        {area("employee", <>
          <Route path="/employee/profile" element={<MyProfile />} />
          <Route path="/employee" element={<WorkDashboard />} />
          <Route path="/employee/work" element={<ProjectList />} />
          <Route path="/employee/tasks" element={<Navigate to="/employee/work" replace />} />
          <Route path="/employee/projects" element={<Navigate to="/employee/work" replace />} />
          <Route path="/employee/board" element={<Navigate to="/employee/work" replace />} />
          <Route path="/employee/projects/:projectId" element={<ProjectWorkspace />} />
          <Route path="/employee/attendance" element={<Attendance />} />
          <Route path="/employee/leave" element={<LeaveCenter />} />
          <Route path="/employee/documents" element={<Documents />} />
          <Route path="/employee/spotlight" element={<Spotlight />} />
          <Route path="/employee/moments" element={<MyMoments />} />
          <Route path="/employee/chat" element={<TeamChat />} />
        </>)}

        {area("client", <>
          <Route path="/client/profile" element={<MyProfile />} />
          <Route path="/client" element={<Navigate to="/client/projects" replace />} />
          <Route path="/client/projects" element={<ClientProjects />} />
        </>)}

        {area("qc", <>
          <Route path="/qc/profile" element={<MyProfile />} />
          <Route path="/qc" element={<QcDashboard />} />
          <Route path="/qc/documents" element={<Documents />} />
          <Route path="/qc/attendance" element={<Attendance />} />
          <Route path="/qc/grades" element={<QcGrade />} />
          <Route path="/qc/spotlight" element={<Spotlight />} />
          <Route path="/qc/moments" element={<MyMoments />} />
          <Route path="/qc/chat" element={<TeamChat />} />
        </>)}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </GlobalCallProvider>
      </ChatRuntime>
    </BrowserRouter>
  );
}
