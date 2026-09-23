import React, { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { Routes, Route, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom'
import { setStoredUser, parseStoredUser } from './utils/userStorage.js'
import Header from './components/Header.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import BgmiCursor from './components/BgmiCursor.jsx'
import { fetchJsonWithRetry } from './utils/api.js'
import { useUser } from './UserContext.jsx'
import { hasOrganizerRights, hasRole, getUserRoles, ROLES } from './utils/iamRoles.js'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useLockdown } from './hooks/useLockdown.js'
import './App.css'

// Code-split secondary pages — only downloaded when first visited
const Homepage        = lazy(() => import('./pages/Homepage.jsx'))
const Tournaments     = lazy(() => import('./pages/Tournaments.jsx'))
const TournamentDetail = lazy(() => import('./pages/TournamentDetail.jsx'))
const TournamentRegistrations = lazy(() => import('./pages/TournamentRegistrations.jsx'))
const About           = lazy(() => import('./pages/About.jsx'))
const HelpSupport     = lazy(() => import('./pages/HelpSupport.jsx'))
const PrivacyPolicy   = lazy(() => import('./pages/PrivacyPolicy.jsx'))
const TermsService    = lazy(() => import('./pages/TermsService.jsx'))
const Profile         = lazy(() => import('./pages/Profile.jsx'))
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard.jsx'))
const AdminPayments   = lazy(() => import('./pages/AdminPayments.jsx'))
const AdminSponsorships = lazy(() => import('./pages/AdminSponsorships.jsx'))
const AdminSystemHealth = lazy(() => import('./pages/AdminSystemHealth.jsx'))
const Auth            = lazy(() => import('./pages/Auth.jsx'))
const BecomeOrganizer = lazy(() => import('./pages/BecomeOrganizer.jsx'))
const ExploreOrganisers = lazy(() => import('./pages/ExploreOrganisers.jsx'))
const OrganizationManagement = lazy(() => import('./pages/OrganizationManagement.jsx'))
const SubscriptionPayment  = lazy(() => import('./pages/SubscriptionPayment.jsx'))
const PaymentHistory       = lazy(() => import('./pages/PaymentHistory.jsx'))
const OrgPage              = lazy(() => import('./pages/OrgPage.jsx'))
const TournamentManagement = lazy(() => import('./pages/TournamentManagement.jsx'))

import CreateTournament from './components/tournament-creation/CreationWizard.jsx'
const MyTournaments        = lazy(() => import('./pages/MyTournaments.jsx'))
const OrganizerForm        = lazy(() => import('./pages/OrganizerForm.jsx'))
const RegistrationPage     = lazy(() => import('./pages/RegistrationPage.jsx'))
const AdminAuthenticatorSetup = lazy(() => import('./pages/AdminAuthenticatorSetup.jsx'))
const AdminProfile            = lazy(() => import('./pages/AdminProfile.jsx'))
const AdminOrganizers         = lazy(() => import('./pages/AdminOrganizers.jsx'))
const Archive                 = lazy(() => import('./pages/Archive.jsx'))
const TournamentInvite        = lazy(() => import('./pages/TournamentInvite.jsx'))

// -------------------------------------------------------------------
// URL map: page-key => path (used by the handleNavigate shim)
// -------------------------------------------------------------------
const PAGE_URL_MAP = {
  'home':             '/',
  'tournaments':      '/tournaments',
  'tournament-detail':'/tournaments/',   // + id appended
  'about':            '/about',
  'help-support':     '/help',
  'privacy-policy':   '/privacypolicy',
  'terms-service':    '/terms',
  'login':            '/login',
  'register':         '/register',
  'auth':             '/login', // fallback for any existing key uses
  'profile':          '/profile',
  'admin':            '/admin',
  'become-organizer': '/become-organizer',
  'organizer-form':   '/organizer-form',
  'create-tournament':'/create-tournament',
  'manage-tournaments': '/manage/tournaments',
  'my-tournaments':     '/my-tournaments',
  'explore-organisers':'/organisers',
  'org-management':    '/org-management',
  'subscription':      '/subscription/payment',
  'register-for-tournament': '/tournaments/', // + id + '/register'
  'archive':           '/archive',
}

// Pages that share the persistent top Header
const HEADER_PAGES = new Set(['/', '/tournaments', '/about', '/help', '/privacypolicy', '/terms', '/archive'])

const getRouteLoadingMessage = (pathname = '') => {
  if (pathname.includes('/register')) return 'Loading registration page...'
  if (pathname.startsWith('/tournaments/')) return 'Loading tournament...'
  if (pathname === '/tournaments') return 'Loading tournaments...'
  if (pathname === '/profile') return 'Loading profile...'
  if (pathname === '/my-tournaments') return 'Loading your tournaments...'
  if (pathname === '/create-tournament') return 'Loading tournament creator...'
  if (pathname === '/manage/tournaments') return 'Loading tournament manager...'
  if (pathname.startsWith('/admin')) return 'Loading dashboard...'
  if (pathname === '/organisers') return 'Loading organizers...'
  if (pathname.startsWith('/org/')) return 'Loading organization...'
  if (pathname === '/become-organizer' || pathname === '/organizer-form') return 'Loading organizer portal...'
  if (pathname === '/about') return 'Loading about page...'
  if (pathname === '/help') return 'Loading help & support...'
  if (pathname === '/privacypolicy') return 'Loading privacy policy...'
  if (pathname === '/terms') return 'Loading terms of service...'
  if (pathname === '/archive') return 'Loading archive...'
  return 'Loading District...'
}

const LoadingArena = ({ message }) => {
  const location = useLocation()
  const msg = message || getRouteLoadingMessage(location?.pathname)
  return <LoadingScreen message={msg} />
}

// -------------------------------------------------------------------
// Page Transition Wrapper Component — Subtle & responsive
// -------------------------------------------------------------------
const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 }
}

const pageTransition = {
  type: 'tween',
  ease: 'easeOut',
  duration: 0.22
}

function PageTransition({ children }) {
  const shouldReduceMotion = useReducedMotion()
  const variants = shouldReduceMotion ? {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  } : pageVariants

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={pageTransition}
      className="w-full flex-grow flex flex-col relative z-10"
      style={{ originY: 0 }}
    >
      {children}
    </motion.div>
  )
}

// -------------------------------------------------------------------
// Inner app — has access to useNavigate
// -------------------------------------------------------------------
function AppInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const [creationTemplate, setCreationTemplate] = useState(null)

  // Backwards-compat shim: all pages call onNavigate('page-key', param)
  const handleNavigate = useCallback((page, param = null) => {
    window.scrollTo({ top: 0, behavior: 'auto' })

    if (page === 'tournament-detail') {
      if (param) {
        navigate(`/tournaments/${param}`)
      } else {
        navigate('/tournaments')
      }
      return
    }

    if (page === 'profile') {
      // selectedUserProfile is stored in state then consumed by the route
      navigate('/profile', { state: { selectedUserProfile: param } })
      return
    }

    if (page === 'register-for-tournament') {
      navigate(`/tournaments/${param}/register`)
      return
    }

    if (page === 'create-tournament') {
      setCreationTemplate(param)
      navigate(param ? `/create-tournament?edit=${param}` : '/create-tournament')
      return
    }

    const url = PAGE_URL_MAP[page]
    if (url) {
      navigate(url)
    } else {
      console.warn(`[App] Unknown page key: "${page}"`)
    }
  }, [navigate])

  // Determine current pathname for Header active state
  const getActivePage = (pathname) => {
    if (pathname === '/') return 'home'
    if (pathname.startsWith('/tournaments/')) return 'tournament-detail'
    if (pathname === '/tournaments') return 'tournaments'
    if (pathname === '/about') return 'about'
    if (pathname === '/archive') return 'archive'
    if (pathname === '/help') return 'help-support'
    if (pathname === '/privacypolicy') return 'privacy-policy'
    if (pathname === '/terms') return 'terms-service'
    return pathname.replace(/^\//, '')
  }

  // TournamentDetail adapter — pulls :id from URL
  const TournamentDetailRoute = () => {
    const { id } = useParams()
    return (
      <PageTransition>
        <TournamentDetail onNavigate={handleNavigate} tournamentId={id} />
      </PageTransition>
    )
  }

  // MyTournaments adapter with auth guard
  const MyTournamentsRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login?redirect=/my-tournaments" replace />
    }

    return (
      <>
        <Header activePage="my-tournaments" onNavigate={handleNavigate} />
        <PageTransition>
          <MyTournaments onNavigate={handleNavigate} />
        </PageTransition>
      </>
    )
  }

  // Profile adapter — reads selectedUserProfile from router location state
  const ProfileRoute = () => {
    const { currentUser, loading } = useUser()
    const location = useLocation()
    const selectedUserProfile = location.state?.selectedUserProfile ?? null

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    return (
      <PageTransition>
        <Profile onNavigate={handleNavigate} selectedUserProfile={selectedUserProfile} />
      </PageTransition>
    )
  }

  // Organization Management adapter with frontend route guard
  const OrganizationManagementRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    if (!hasOrganizerRights(currentUser)) {
      return <Navigate to="/profile" replace />
    }

    return (
      <PageTransition>
        <OrganizationManagement onNavigate={handleNavigate} />
      </PageTransition>
    )
  }

  // Registration adapter with auth guard
  const RegistrationRoute = () => {
    const { id } = useParams()
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to={`/login?redirect=/tournaments/${id}/register`} replace />
    }

    return (
      <PageTransition>
        <RegistrationPage onNavigate={handleNavigate} />
      </PageTransition>
    )
  }

  // CreateTournament adapter with frontend route guard
  const CreateTournamentRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    if (!hasOrganizerRights(currentUser)) {
      return <Navigate to="/profile" replace />
    }

    return (
      <PageTransition>
        <CreateTournament />
      </PageTransition>
    )
  }

  // AdminAuthenticator adapter with frontend route guard
  const AdminAuthenticatorRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    if (!hasRole(getUserRoles(currentUser), ROLES.ADMIN)) {
      return <Navigate to="/admin" replace />
    }

    return (
      <PageTransition>
        <AdminAuthenticatorSetup />
      </PageTransition>
    )
  }

  const AdminProfileRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    if (!hasRole(getUserRoles(currentUser), ROLES.ADMIN)) {
      return <Navigate to="/admin" replace />
    }

    return (
      <PageTransition>
        <AdminProfile />
      </PageTransition>
    )
  }

  const AdminOrganizersRoute = () => {
    const { currentUser, loading } = useUser()

    if (loading) {
      return <LoadingArena />
    }

    if (!currentUser) {
      return <Navigate to="/login" replace />
    }

    if (!hasRole(getUserRoles(currentUser), ROLES.ADMIN)) {
      return <Navigate to="/admin" replace />
    }

    return (
      <PageTransition>
        <AdminOrganizers />
      </PageTransition>
    )
  }



  // Shared persistent header — shown on public-facing pages
  const SharedHeader = ({ activePage }) => (
    HEADER_PAGES.has(window.location.pathname) ? (
      <Header activePage={activePage} onNavigate={handleNavigate} />
    ) : null
  )

  return (
    <div className="min-h-screen bg-background text-on-background font-body-lg relative overflow-x-clip">
      {/* Universal Background Grid */}
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <RouteErrorBoundary key={location.pathname}>
          <Suspense fallback={<LoadingArena />}>
            <AnimatePresence mode="wait" onExitComplete={() => window.scrollTo(0, 0)}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={
                  <>
                    <Header activePage="home" onNavigate={handleNavigate} />
                    <PageTransition>
                      <Homepage onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/tournaments" element={
                  <>
                    <Header activePage="tournaments" onNavigate={handleNavigate} />
                    <PageTransition>
                      <Tournaments onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/my-tournaments" element={
                  <MyTournamentsRoute />
                } />

                <Route path="/tournament/invite/:token" element={
                  <PageTransition>
                    <TournamentInvite />
                  </PageTransition>
                } />

                <Route path="/tournaments/:id" element={
                  <TournamentDetailRoute />
                } />

                <Route path="/about" element={
                  <>
                    <Header activePage="about" onNavigate={handleNavigate} />
                    <PageTransition>
                      <About onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/help" element={
                  <>
                    <Header activePage="help-support" onNavigate={handleNavigate} />
                    <PageTransition>
                      <HelpSupport onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/privacypolicy" element={
                  <>
                    <Header activePage="privacy-policy" onNavigate={handleNavigate} />
                    <PageTransition>
                      <PrivacyPolicy onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/terms" element={
                  <>
                    <Header activePage="terms-service" onNavigate={handleNavigate} />
                    <PageTransition>
                      <TermsService onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />

                <Route path="/auth" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={
                  <PageTransition>
                    <Auth onNavigate={handleNavigate} initialMode="login" />
                  </PageTransition>
                } />
                <Route path="/register" element={
                  <PageTransition>
                    <Auth onNavigate={handleNavigate} initialMode="register" />
                  </PageTransition>
                } />
                <Route path="/reset-password" element={
                  <PageTransition>
                    <Auth onNavigate={handleNavigate} initialMode="reset-password" />
                  </PageTransition>
                } />

                <Route path="/profile" element={<ProfileRoute />} />

                <Route path="/org-management" element={<OrganizationManagementRoute />} />

                <Route path="/admin" element={
                  <PageTransition>
                    <AdminDashboard onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/admin/payments" element={
                  <PageTransition>
                    <AdminPayments />
                  </PageTransition>
                } />

                <Route path="/admin/sponsorships" element={
                  <PageTransition>
                    <AdminSponsorships />
                  </PageTransition>
                } />

                <Route path="/admin/system-health" element={
                  <PageTransition>
                    <AdminSystemHealth />
                  </PageTransition>
                } />

                <Route path="/admin/security/authenticator" element={
                  <AdminAuthenticatorRoute />
                } />

                <Route path="/admin/profile" element={
                  <AdminProfileRoute />
                } />

                <Route path="/admin/organizers" element={
                  <AdminOrganizersRoute />
                } />

                <Route path="/become-organizer" element={
                  <PageTransition>
                    <BecomeOrganizer onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/organizer-form" element={
                  <PageTransition>
                    <OrganizerForm onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/create-tournament" element={<CreateTournamentRoute />} />

                <Route path="/manage/tournaments" element={
                  <PageTransition>
                    <TournamentManagement onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/organisers" element={
                  <PageTransition>
                    <ExploreOrganisers onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/subscription/payment" element={
                  <PageTransition>
                    <SubscriptionPayment />
                  </PageTransition>
                } />
                <Route path="/subscription/history" element={
                  <PageTransition>
                    <PaymentHistory />
                  </PageTransition>
                } />

                <Route path="/org/:slug" element={
                  <PageTransition>
                    <OrgPage onNavigate={handleNavigate} />
                  </PageTransition>
                } />

                <Route path="/archive" element={
                  <>
                    <Header activePage="archive" onNavigate={handleNavigate} />
                    <PageTransition>
                      <Archive onNavigate={handleNavigate} />
                    </PageTransition>
                  </>
                } />



                <Route path="/tournaments/:id/register" element={
                  <RegistrationRoute />
                } />

                <Route path="/tournaments/:id/registrations" element={
                  <PageTransition>
                    <TournamentRegistrations />
                  </PageTransition>
                } />

                {/* Catch-all — redirect unknown URLs to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        </RouteErrorBoundary>
      </div>

      <BgmiCursor />
    </div>
  )
}

function App() {
  useLockdown()
  return <AppInner />
}

export default App
