import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { PublicLayout } from '../components/layouts/PublicLayout';

/**
 * Signup Page - TrueCost dark glassmorphic redesign.
 * UI-only placeholders for email/password signup; Google is primary entry for now.
 */
export function Signup() {
  const { user, loading, error, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder only
    console.log('Signup form submitted (placeholder)', formData);
  };

  return (
    <PublicLayout>
      <div className="flex min-h-screen items-center justify-center pt-24 pb-24 md:pt-28">
        <div className="w-full max-w-md mx-4">
          <div className="glass-panel p-8 md:p-10 space-y-8">
            {/* Header */}
            <div className="text-center space-y-2">
              <h1 className="font-heading text-h2 text-truecost-text-primary">
                Create Your TrueCost Account
              </h1>
              <p className="font-body text-body text-truecost-text-secondary">
                Start creating accurate estimates today
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="block font-body text-body-meta text-truecost-text-secondary"
                >
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled
                  className="glass-input w-full opacity-50 cursor-not-allowed"
                  title="Email/password signup coming soon - use Google Sign-In for now"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block font-body text-body-meta text-truecost-text-secondary"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled
                  className="glass-input w-full opacity-50 cursor-not-allowed"
                  title="Email/password signup coming soon - use Google Sign-In for now"
                />
              </div>

              {/* Password with visibility toggle */}
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="block font-body text-body-meta text-truecost-text-secondary"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={handleInputChange}
                    disabled
                    className="glass-input w-full pr-12 opacity-50 cursor-not-allowed"
                    title="Email/password signup coming soon - use Google Sign-In for now"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-truecost-text-muted hover:text-truecost-text-secondary transition-colors opacity-50 cursor-not-allowed"
                    disabled
                    title="Password visibility toggle (UI-only)"
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Company (Optional) */}
              <div className="space-y-2">
                <label
                  htmlFor="company"
                  className="block font-body text-body-meta text-truecost-text-secondary"
                >
                  Company <span className="text-truecost-text-muted">(Optional)</span>
                </label>
                <input
                  id="company"
                  name="company"
                  type="text"
                  placeholder="Your company name"
                  value={formData.company}
                  onChange={handleInputChange}
                  disabled
                  className="glass-input w-full opacity-50 cursor-not-allowed"
                  title="Email/password signup coming soon - use Google Sign-In for now"
                />
              </div>

              {/* Primary action (disabled placeholder) */}
              <button
                type="submit"
                disabled
                className="w-full btn-pill-primary opacity-50 cursor-not-allowed"
                title="Email/password signup coming soon - use Google Sign-In below"
              >
                Create Account
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex-1 border-t border-truecost-glass-border/80" />
              <span className="px-3 rounded-full font-body text-body-meta text-truecost-text-muted bg-truecost-bg-primary/90">
                Or continue with
              </span>
              <div className="flex-1 border-t border-truecost-glass-border/80" />
            </div>

            {/* Google Sign-In (functional) */}
            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full btn-pill-secondary flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-truecost-cyan border-t-transparent rounded-full animate-spin" />
                  <span>Signing up...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign up with Google
                </>
              )}
            </button>

            {/* Error display */}
            {error && (
              <div className="glass-panel bg-truecost-danger/10 border-truecost-danger/30 p-4">
                <div className="flex items-start space-x-3">
                  <svg
                    className="w-5 h-5 text-truecost-danger flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="font-body text-body-meta text-truecost-danger">{error}</p>
                </div>
              </div>
            )}

            {/* Login link */}
            <div className="text-center">
              <p className="font-body text-body-meta text-truecost-text-secondary">
                Already have an account?{' '}
                <Link to="/login" className="text-truecost-cyan hover:underline font-medium">
                  Log in
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center font-body text-body-meta text-truecost-text-muted">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}

