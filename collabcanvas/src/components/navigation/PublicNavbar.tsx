import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NavLink } from './NavLink';
import { MobileMenu } from './MobileMenu';
import logo from '../../assets/logo.png';

/**
 * PublicNavbar - Glassmorphic navigation for public pages.
 * - Sticky with scroll opacity adjustment
 * - Desktop: links + Sign In button
 * - Mobile: hamburger menu
 * - Glass background with neon underline
 */
export function PublicNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 left-0 right-0 z-50
        transition-all duration-300
        neon-underline
        border-b border-truecost-glass-border/70
        ${scrolled ? 'bg-truecost-bg-primary/85 backdrop-blur-md' : 'bg-truecost-bg-primary/65 backdrop-blur-md'}
      `}
    >
      <nav className="container-spacious">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
          >
            <img src={logo} alt="TrueCost" className="w-9 h-9 object-contain drop-shadow-sm" />
            <span className="font-heading text-xl font-bold text-truecost-text-primary">
              TrueCost
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            <NavLink to="/how-it-works">How It Works</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/about">About Us</NavLink>
            <NavLink to="/contact">Contact Us</NavLink>
            <Link to="/login" className="btn-pill-primary">
              Sign In
            </Link>
          </div>

          {/* Mobile Menu */}
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}

