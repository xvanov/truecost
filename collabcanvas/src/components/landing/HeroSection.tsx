import { Link } from "react-router-dom";
import heroVideo from "../../assets/animated_hero.mp4";
import logo from "../../assets/logo.png";
import "../../styles/hero.css";

/**
 * HeroSection - Uses static hero.jpg background with reveal + shimmer,
 * and a centered glass hero card.
 */
export function HeroSection() {
  return (
    <section className="hero">
      <div className="hero__background">
        {/* Video background */}
        <video
          className="hero__bg-image"
          src={heroVideo}
          autoPlay
          muted
          playsInline
        />
        <div className="hero__overlay" />
      </div>

      <div className="hero__content container-spacious">
        <div className="hero__card">
          <div className="hero__logo">
            <img src={logo} alt="TrueCost logo" className="hero__logo-img" />
            <span className="hero__logo-text">TRUECOST</span>
          </div>

          <h1 className="hero__title">AI-Powered Construction Estimating</h1>
          <p className="hero__subtitle">
            Generate detailed cost estimates for your construction projects
            quickly and accurately.
          </p>

          <div className="hero__actions">
            <Link to="/signup" className="hero__btn hero__btn--primary">
              Get Started
            </Link>
            <Link to="/demo" className="hero__btn hero__btn--secondary">
              <span className="hero__btn-icon">▶</span> Watch Demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
