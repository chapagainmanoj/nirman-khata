import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { LoginPage } from './features/auth/LoginPage'
import { RegisterPage } from './features/auth/RegisterPage'
import { CatalogPage } from './features/catalog/CatalogPage'
import { ProjectDetailPage } from './features/projects/ProjectDetailPage'
import { ProjectNewPage } from './features/projects/ProjectNewPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { StaffPage } from './features/staff/StaffPage'
import { AdminOnly, RedirectIfSignedIn, RequireCompany } from './routes/guards'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>} />
        <Route path="/register" element={<RedirectIfSignedIn><RegisterPage /></RedirectIfSignedIn>} />
        <Route element={<RequireCompany><Layout /></RequireCompany>}>
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<AdminOnly><ProjectNewPage /></AdminOnly>} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/staff" element={<AdminOnly><StaffPage /></AdminOnly>} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
