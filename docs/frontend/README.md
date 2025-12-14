# TrueCost Frontend UI System

Entry point for frontend documentation.

## Docs Index
- [Getting Started](./GETTING_STARTED.md)
- [Component API](./COMPONENT_API.md)
- [Theme Guide](./THEME_GUIDE.md)
- [Routing Map](./ROUTING_MAP.md)
- [Mock Data & Integration](./MOCK_DATA.md)
- [Examples](./EXAMPLES.md)

## Design System
- Theme: Dark Industrial Neon, glassmorphism
- Primary: `#3BE3F5`, Secondary: `#17C5D1`, BG: `#050A14`
- Fonts: IBM Plex Sans (headings), SF Pro Text (body), IBM Plex Serif (accent)

## Tech Stack
- React 19, TypeScript, Vite
- Tailwind CSS (custom tokens), Zustand
- React Router v6
- Firebase Auth/Firestore/Storage (integration ready)

## Project Structure (frontend)
```
src/
├─ components/
│  ├─ ui/              # Reusable UI primitives
│  ├─ layouts/         # Public/Authenticated layouts
│  ├─ navigation/      # Navbars, menus
│  ├─ landing/         # Marketing sections
│  ├─ dashboard/       # Dashboard widgets
│  ├─ estimate/        # Estimate flow components
│  └─ project/         # Project mgmt components
├─ pages/              # Route pages
├─ hooks/              # Custom hooks (auth, etc.)
├─ store/              # Zustand stores
├─ services/           # API/Firebase services
├─ types/              # Shared TS types
├─ utils/              # Utilities
└─ index.css           # Global styles & tokens
```

## Quick Start
```bash
npm install
npm run dev
npm run build
npm run lint
npm run type-check
```

## Key References
- [Product Brief](../product-brief-truecost-2025-12-09.md)
- [PRD](../prd.md)
- [Architecture](../architecture.md)
- [Design Spec](../yahav-docs/truecost_design_spec.md)

