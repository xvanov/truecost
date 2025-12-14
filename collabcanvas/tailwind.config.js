/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        truecost: {
          // Backgrounds
          'bg-primary': '#050A14',
          'bg-secondary': '#0A1020',
          'bg-surface': '#0F1629',
          // Accents
          cyan: '#3BE3F5',
          teal: '#17C5D1',
          // Glass
          'glass-border': 'rgba(255, 255, 255, 0.16)',
          'glass-bg': 'rgba(255, 255, 255, 0.07)',
          // Text
          'text-primary': '#FFFFFF',
          'text-secondary': 'rgba(255, 255, 255, 0.75)',
          'text-muted': 'rgba(255, 255, 255, 0.55)',
          // Status
          danger: '#FF4A4A',
          warning: '#F5A623',
          success: '#4ADE80',
        },
      },
      fontFamily: {
        heading: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        body: ['SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        accent: ['IBM Plex Serif', 'Georgia', 'serif'],
      },
      fontSize: {
        h1: ['48px', { lineHeight: '1.1', fontWeight: '700' }],
        'h1-mobile': ['40px', { lineHeight: '1.1', fontWeight: '700' }],
        h2: ['32px', { lineHeight: '1.2', fontWeight: '600' }],
        'h2-mobile': ['28px', { lineHeight: '1.2', fontWeight: '600' }],
        h3: ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'h3-mobile': ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-meta': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        button: ['16px', { lineHeight: '1', fontWeight: '500' }],
        'button-sm': ['14px', { lineHeight: '1', fontWeight: '500' }],
      },
      spacing: {
        section: '32px',
        'section-mobile': '24px',
        card: '24px',
        'card-compact': '20px',
        'page-desktop': '80px',
        'page-tablet': '40px',
        'page-mobile': '20px',
      },
      borderRadius: {
        glass: '18px',
        'glass-lg': '20px',
        pill: '999px',
      },
      boxShadow: {
        'glow-cyan': '0 0 16px rgba(59, 227, 245, 0.5)',
        'glow-cyan-strong': '0 0 24px rgba(59, 227, 245, 0.7)',
        'glow-teal': '0 0 16px rgba(23, 197, 209, 0.5)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      backdropBlur: {
        glass: '14px',
      },
      maxWidth: {
        landing: '1400px',
        app: '1600px',
      },
      screens: {
        mobile: '320px',
        tablet: '768px',
        desktop: '1280px',
      },
    },
  },
  plugins: [],
}

