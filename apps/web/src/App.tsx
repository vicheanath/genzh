import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { LoadingPanel } from '@/components/Spinner'
import { AuthProvider, useAuth } from '@/lib/auth'

import { AppShell } from './routes/AppShell'
import { CommunityRoute } from './routes/CommunityRoute'
import { HomeRoute } from './routes/HomeRoute'
import { RoomRoute } from './routes/RoomRoute'
import { SignInRoute } from './routes/SignInRoute'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </AuthProvider>
  )
}

/**
 * Auth is a routing concern, not a per-screen one.
 *
 * Swapping the whole tree on `user` means a signed-out visitor cannot reach a
 * screen that assumes a session — there is no authenticated route mounted for
 * them to hit at all, so no screen needs its own guard.
 */
function Router() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingPanel />

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<SignInRoute />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/c/:communityId" element={<CommunityRoute />} />
        <Route path="/c/:communityId/r/:roomId" element={<RoomRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
