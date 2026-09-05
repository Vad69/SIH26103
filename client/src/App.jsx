import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Projects from "./pages/Projects.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import Reports from "./pages/Reports.jsx";
import Users from "./pages/Users.jsx";
import Briefing from "./pages/Briefing.jsx";
import ImportPage from "./pages/Import.jsx";
import ExecutiveReports from "./pages/ExecutiveReports.jsx";
import Alerts from "./pages/Alerts.jsx";

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-navy">
        Loading workspace…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="reports" element={<Reports />} />
        <Route path="briefing" element={<Briefing />} />
        <Route path="flash" element={<ExecutiveReports kind="flash" />} />
        <Route path="qpisr" element={<ExecutiveReports kind="qpisr" />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
