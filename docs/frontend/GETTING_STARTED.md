# Getting Started

## Prerequisites
- Node.js 18+, npm
- Git
- Firebase project (for auth/storage/firestore when integrating)

## Setup
```bash
git clone <repo>
cd truecost/collabcanvas
npm install
```

Create `.env`:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Run:
```bash
npm run dev     # local dev
npm run build   # production build
npm run preview # preview build
npm run lint
npm run type-check
```

## Workflow
- Use components from `src/components/ui/`
- Choose layout: `PublicLayout` (public) or `AuthenticatedLayout` (authed)
- Routes defined in `src/App.tsx`
- Mobile-first Tailwind classes; use theme tokens (no hardcoded colors)

## Common Tasks
- Add page: create in `src/pages/`, wrap with layout, add route.
- Add component: prefer `components/ui` for primitives; export via `index.ts`.
- State: use local state or Zustand stores in `src/store`.
- Styling: use glass utilities (`glass-panel`, `glass-input`, `btn-pill-*`), spacing utilities (`container-spacious`, `py-section`).

## Troubleshooting
- Auth issues: verify `.env`, Firebase settings, check console errors.
- Styling not applying: restart dev server, clear cache, verify Tailwind class names.
- Type errors: `npm run type-check`.

## Next Steps
- Read [Component API](./COMPONENT_API.md)
- Review [Theme Guide](./THEME_GUIDE.md)
- See [Routing Map](./ROUTING_MAP.md)
- Check [Mock Data & Integration](./MOCK_DATA.md)
- Browse [Examples](./EXAMPLES.md)

