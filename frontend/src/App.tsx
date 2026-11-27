import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import PatientForm from './pages/PatientForm'
import PatientProfile from './pages/PatientProfile'
import PatientSearch from './pages/PatientSearch'
import RegistrationCard from './pages/RegistrationCard'
import type { RoleCode } from './api/types'

function RequireAuth({ roles }: { roles?: RoleCode[] }) {
  const { user, ready, can } = useAuth()
  const loc = useLocation()
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  if (roles && !can(...roles)) return <Navigate to="/patients" replace />
  return <Outlet />
}

function LoginRoute() {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return null
  const from = (loc.state as { from?: string } | null)?.from
  return user ? <Navigate to={from && from !== '/login' ? from : '/patients'} replace /> : <Login />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginRoute /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Navigate to="/patients" replace /> },
          { path: 'patients', element: <PatientSearch /> },
          { path: 'patients/:id', element: <PatientProfile /> },
          {
            element: <RequireAuth roles={['reception', 'admin']} />,
            children: [
              { path: 'patients/new', element: <PatientForm /> },
              { path: 'patients/:id/edit', element: <PatientForm /> },
            ],
          },
        ],
      },
      {
        element: <RequireAuth roles={['reception', 'admin']} />,
        children: [{ path: 'patients/:id/card', element: <RegistrationCard /> }],
      },
      { path: '*', element: <Navigate to="/patients" replace /> },
    ],
  },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
