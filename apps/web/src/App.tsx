import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { LoadingPanel } from '@/components/Spinner'
import { AuthProvider, useAuth } from '@/lib/auth'
import { VoiceProvider } from '@/lib/media'
import { queryClient } from '@/lib/queryClient'
import { useIsMobile } from '@/lib/useMediaQuery'
import { NotificationsProvider } from '@/lib/useNotifications'
import { PresenceProvider } from '@/lib/usePresence'

import { AccountRoute } from './routes/AccountRoute'
import { AppShell } from './routes/AppShell'
import { CommunityRoute } from './routes/CommunityRoute'
import { CommunitySettingsRoute } from './routes/CommunitySettingsRoute'
import { ExploreRoute } from './routes/ExploreRoute'
import { FriendsRoute } from './routes/FriendsRoute'
import { HomeRoute } from './routes/HomeRoute'
import { NotificationsRoute } from './routes/NotificationsRoute'
import { RoomRoute } from './routes/RoomRoute'
import { InfoPage } from './routes/InfoPages'
import { SignInRoute } from './routes/SignInRoute'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PresenceProvider>
          <NotificationsProvider>
            <VoiceProvider>
              <BrowserRouter>
                <Router />
              </BrowserRouter>
            </VoiceProvider>
          </NotificationsProvider>
        </PresenceProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

/**
 * Renders its children on a phone, and redirects on a desktop.
 *
 * Some screens exist only in the mobile layout. Rather than letting a desktop
 * user land on a page built for one column, the route sends them where the same
 * thing lives in the wider frame.
 */
function MobileOnly({ to, children }: { to: string; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  if (!isMobile) return <Navigate to={to} replace />
  return <>{children}</>
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
        {/* Phone destinations. Desktop shows both as chrome — a popover off the
            user bar, and the user bar itself — so visiting the URL there is
            redirected rather than rendering a second, worse version of it. */}
        <Route path="/notifications" element={<MobileOnly to="/"><NotificationsRoute /></MobileOnly>} />
        <Route path="/me" element={<MobileOnly to="/"><AccountRoute /></MobileOnly>} />
        <Route path="/c/:communityId" element={<CommunityRoute />} />
        {/* Settings is a screen on a phone and a dialog on a desktop, where the
            route redirects onto the server it belongs to and opens the dialog
            there — it does its own redirect rather than using `MobileOnly`,
            which cannot know the community in the URL. */}
        <Route path="/c/:communityId/settings" element={<CommunitySettingsRoute />} />
        <Route path="/c/:communityId/r/:roomId" element={<RoomRoute />} />
        <Route path="/rooms/:roomId" element={<RoomRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
