import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import StudentManagementPage from './features/admin/pages/StudentManagementPage.jsx';
import StudentDetailPage from './features/students/pages/StudentDetailPage.jsx';
import Settings from './pages/Settings.jsx';
import { RuntimeConfigProvider } from './runtime/RuntimeConfigContext.jsx';
import { SupabaseProvider } from './context/SupabaseContext.jsx';
import { isAuthClientInitialized } from './lib/supabase-manager.js';
import Diagnostics from './runtime/Diagnostics.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import UpdatePassword from './pages/UpdatePassword.jsx';
import CompleteRegistrationPage from './components/pages/CompleteRegistrationPage.jsx';
import AcceptInvitePage from './components/pages/AcceptInvitePage.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import AuthGuard from './auth/AuthGuard.jsx';
import { OrgProvider } from './org/OrgContext.jsx';
import OrgSelection from './pages/OrgSelection.jsx';
import MyStudentsPage from './features/instructor/pages/MyStudentsPage.jsx';

function App({ config = null }) {
  console.log('[DEBUG 4] App component rendering.');
  return (
    <RuntimeConfigProvider config={config}>
      <SupabaseProvider>
        <AuthProvider>
          <OrgProvider>
            <HashRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route element={<AuthGuard />}>
                  <Route path="/select-org" element={<OrgSelection />} />
                  <Route element={<AppShell />}>
                    {/* הגדרת כל העמודים */}
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/Dashboard" element={<Navigate to="/" replace />} />
                    <Route path="/Employees" element={<Navigate to="/admin/students" replace />} />
                    <Route path="/admin/students" element={<StudentManagementPage />} />
                    <Route path="/students/:id" element={<StudentDetailPage />} />
                    <Route path="/my-students" element={<MyStudentsPage />} />
                    <Route path="/Settings" element={<Settings />} />
                    <Route path="/diagnostics" element={<Diagnostics />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </HashRouter>
          </OrgProvider>
        </AuthProvider>
      </SupabaseProvider>
    </RuntimeConfigProvider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function renderApp(config = null) {
  console.log('[DEBUG 1] Bootstrap: startApp() called.');
  if (!isAuthClientInitialized()) {
    throw new Error(
      'renderApp was invoked before initializeAuthClient completed. Ensure bootstrap initializes Supabase first.'
    );
  }

  console.log('[DEBUG 2] Bootstrap: Config fetched. Initializing auth client...');

  const root = ReactDOM.createRoot(document.getElementById('root'));

  console.log('[DEBUG 3] Bootstrap: Auth client initialized. Rendering App...');

  root.render(
    <React.StrictMode>
      <App config={config} />
    </React.StrictMode>,
  );
}

export default App;
