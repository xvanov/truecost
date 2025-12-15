import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

// Public pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { HowItWorks } from './pages/HowItWorks';
import { Pricing } from './pages/Pricing';
import { AboutUs } from './pages/AboutUs';
import { ContactUs } from './pages/ContactUs';
import { DemoPage } from './pages/DemoPage';

// Authenticated pages
import { Dashboard } from './pages/Dashboard';
import { Account } from './pages/Account';
import { PriceComparisonPage } from './components/PriceComparisonPage';

// Project flow pages
import { ScopePage } from './pages/project/ScopePage';
import { AnnotatePage } from './pages/project/AnnotatePage';
import { EstimatePage } from './pages/project/EstimatePage';

/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-truecost-bg-primary">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-truecost-cyan border-t-transparent"></div>
          <p className="text-truecost-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * ScrollToTop - ensures each route change starts at the top of the page.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

/**
 * Main App component
 * Handles routing and authentication guards
 */
function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/demo" element={<DemoPage />} />

        {/* Authenticated app routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />

        {/* Project routes (new flow) */}
        <Route
          path="/project/new"
          element={
            <ProtectedRoute>
              <ScopePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/scope"
          element={
            <ProtectedRoute>
              <ScopePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/annotate"
          element={
            <ProtectedRoute>
              <AnnotatePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/estimate"
          element={
            <ProtectedRoute>
              <EstimatePage />
            </ProtectedRoute>
          }
        />

        {/* Legacy routes - redirect to new project flow */}
        <Route path="/estimate/new" element={<Navigate to="/project/new" replace />} />
        <Route path="/estimate/:id" element={<Navigate to="/project/new" replace />} />
        <Route path="/estimate/:id/plan" element={<Navigate to="/project/new" replace />} />
        <Route path="/estimate/:id/canvas" element={<Navigate to="/project/new" replace />} />
        <Route path="/estimate/:id/final" element={<Navigate to="/project/new" replace />} />
        <Route path="/projects/:projectId/*" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/compare-prices"
          element={
            <ProtectedRoute>
              <PriceComparisonPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
