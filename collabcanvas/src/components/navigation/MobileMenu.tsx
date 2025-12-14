import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NavLink } from './NavLink';

/**
 * MobileMenu - Hamburger menu for mobile navigation.
 * Preserves glass styling and neon aesthetic.
 */
export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <div className="md:hidden">
      <button
        onClick={toggleMenu}
        className="btn-utility p-2"
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 bg-black/50 z-40"
            onClick={closeMenu}
            aria-hidden="true"
          />

          {/* Menu Panel */}
          <div className="fixed top-16 left-0 right-0 z-50 glass-panel mx-4 mt-2 rounded-glass">
            <nav className="flex flex-col p-4 space-y-4">
              <NavLink to="/how-it-works" onClick={closeMenu}>
                How It Works
              </NavLink>
              <NavLink to="/about" onClick={closeMenu}>
                About Us
              </NavLink>
              <NavLink to="/contact" onClick={closeMenu}>
                Contact Us
              </NavLink>
              <Link
                to="/login"
                onClick={closeMenu}
                className="btn-pill-primary text-center"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

