import { Spin } from "antd";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import RequireRole from "./components/RequireRole";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PatientDetailPage from "./pages/PatientDetailPage";
import PatientFormPage from "./pages/PatientFormPage";
import PatientsPage from "./pages/PatientsPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Spin fullscreen />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route
          path="patients/new"
          element={
            <RequireRole roles={["reception"]}>
              <PatientFormPage />
            </RequireRole>
          }
        />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route
          path="patients/:id/edit"
          element={
            <RequireRole roles={["reception"]}>
              <PatientFormPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
