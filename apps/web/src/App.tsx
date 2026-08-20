import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { LoadingPanel } from '@/components/Spinner'
import { AuthProvider, useAuth } from '@/lib/auth'
import { VoiceProvider } from '@/lib/media'
import { queryClient } from '@/lib/queryClient'

import { AppShell } from './routes/AppShell'
import { CommunityRoute } from './routes/CommunityRoute'
import { ExploreRoute } from './routes/ExploreRoute'
import { FriendsRoute } from './routes/FriendsRoute'
import { HomeRoute } from './routes/HomeRoute'
import { RoomRoute } from './routes/RoomRoute'
import { InfoPage } from './routes/InfoPages'
import { SignInRoute } from './routes/SignInRoute'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VoiceProvider>
          <BrowserRouter>
            <Router />
          </BrowserRouter>
        </VoiceProvider>
      </AuthProvider>
    </QueryClientProvider>
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
        <Route path="/about" element={<InfoPage page="about" />} />
        <Route path="/guidelines" element={<InfoPage page="guidelines" />} />
        <Route path="/community-guidelines" element={<InfoPage page="guidelines" />} />
        <Route path="/terms" element={<InfoPage page="terms" />} />
        <Route path="/terms-of-service" element={<InfoPage page="terms" />} />
        <Route path="/privacy" element={<InfoPage page="privacy" />} />
        <Route path="/privacy-policy" element={<InfoPage page="privacy" />} />
        <Route path="/contact" element={<InfoPage page="contact" />} />
        <Route path="/report" element={<InfoPage page="report" />} />
        <Route path="/report-abuse" element={<InfoPage page="report" />} />
        <Route path="*" element={<SignInRoute />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/about" element={<InfoPage page="about" />} />
      <Route path="/guidelines" element={<InfoPage page="guidelines" />} />
      <Route path="/community-guidelines" element={<InfoPage page="guidelines" />} />
      <Route path="/terms" element={<InfoPage page="terms" />} />
      <Route path="/terms-of-service" element={<InfoPage page="terms" />} />
      <Route path="/privacy" element={<InfoPage page="privacy" />} />
      <Route path="/privacy-policy" element={<InfoPage page="privacy" />} />
      <Route path="/contact" element={<InfoPage page="contact" />} />
      <Route path="/report" element={<InfoPage page="report" />} />
      <Route path="/report-abuse" element={<InfoPage page="report" />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/friends" element={<FriendsRoute />} />
        <Route path="/explore" element={<ExploreRoute />} />
        <Route path="/c/:communityId" element={<CommunityRoute />} />
        <Route path="/c/:communityId/r/:roomId" element={<RoomRoute />} />
        <Route path="/rooms/:roomId" element={<RoomRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
