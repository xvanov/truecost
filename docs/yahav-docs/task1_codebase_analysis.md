# Task 1 — Frontend Codebase Analysis (TrueCost UI Readiness)
Date: 2025-12-10  
Scope: Frontend-only assessment of the existing CollabCanvas React/Vite app (`collabcanvas/src`) against the TrueCost PRD, design spec, product brief, epics, and UI task list. No backend changes were made.

---

## Current Frontend Snapshot
- **Routes in code:** `/login` (Google-only), `/` (protected Dashboard), `/projects/:projectId/*` (project with Scope/Time/Space/Money tabs). No public landing or signup route.  
  ```40:57:collabcanvas/src/App.tsx
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/projects/:projectId/*" element={<ProtectedRoute><Project /></ProtectedRoute>} />
  ```
- **Brand/theme:** Light, neutral Tailwind defaults; default Vite `App.css`; system font; no neon/dark glassmorphic theme or IBM Plex/SF typography tokens.  
  ```1:11:collabcanvas/src/index.css
  body { font-family: system-ui, -apple-system, ... }
  ```
  ```1:10:collabcanvas/tailwind.config.js
  theme: { extend: {} }
  ```
- **Feature set:** Legacy CollabCanvas experience (real-time canvas, BOM/pricing, four-view Project tab). Dashboard lists projects with create modal; Login branded “Projective” with Google sign-in only. No landing page, estimate wizard, or TrueCost-specific flows/components.
- **Structure:** Components revolve around canvas/tools (`Canvas`, `Toolbar`, `ScopeView`, `MoneyView`, etc.), Zustand stores (`canvasStore`, `projectStore`), and Firebase services. There is no `src/components/estimate/**`, `useEstimateStore`, pipeline UI, or landing/auth nav bars as defined in the architecture/design spec.

---

## Gaps vs. TrueCost Requirements
**Routing & Access**
- `/` must be public landing; today it is auth-gated Dashboard.
- `/dashboard` route is absent; existing Dashboard would need to move there.
- Missing routes: `/signup`, `/estimate/new`, `/estimate/:id`, `/estimate/:id/plan`, `/estimate/:id/final`, `/account`, `/estimate/:id/plan|final|feedback` placeholders (per design spec + task list).
- Legacy `/projects/:projectId/*` conflicts with required estimate routes and embeds the old four-tab canvas experience.

**Pages & Flows**
- No Landing page (hero, features, how-it-works, comparison, footer).
- No redesigned Login/Signup pages (glass panels, pill CTA). Login currently Google-only and branded “Projective.”
- No Dashboard UI per spec (Your Projects header, card/list toggle, glass filters, empty state illustration).
- No Estimate flows: Input (text/voice + upload), Plan (extracted data + BoQ edits + location override), Final Estimate (summary, cost breakdown, risk, PDF download), pipeline visibility, feedback/actuals.
- No Account page UI.

**Design System & Components**
- Missing global theme tokens (colors, typography, spacing, glows, blur), font imports, and CSS reset per design spec Task 2.
- No public/auth navbars, pill/secondary/utility buttons, glass cards/panels, chat bubbles, tables/list rows, tabs/accordions, upload box, timeline/risk visuals, or glass containers.
- No responsive rules or dark industrial neon aesthetic; current styling is light/default Tailwind.

**State & Data (UI level)**
- Required estimate-oriented stores/hooks/types (`useEstimateStore`, `usePipelineStatus`, `useCadUpload`, `useVoiceInput`, etc.) are absent. Existing stores are canvas/project-centric and cannot power new flows without new scaffolding (can be mocked on the frontend per epics).
- PDF/download and pricing flows in MoneyView are tied to legacy BOM/pricing services; no UI to trigger TrueCost PDF export contract (`get_estimate_pdf`) or to show P50/P80/P90 risk outputs.

---

## Route Conflicts / Required Updates
- Repoint `/` to the public Landing page; move current Dashboard behind `/dashboard` with auth guard.
- Add placeholders for all new estimate routes to avoid 404s during incremental delivery.
- Decide on treatment of legacy `/projects/:projectId/*`; either retire it, map it to a future `/estimate/:id/plan` view, or isolate it to avoid conflicting nav/UX.
- ProtectedRoute currently redirects unauthenticated users away from `/`; it must allow public pages while still protecting `/dashboard` and internal estimate routes.

---

## Missing UI Components & Refactors
- **Navbars:** Public + authenticated glassmorphic nav bars with correct links/CTA.
- **Buttons & tokens:** Pill primary, secondary outline, utility buttons; global shadows/glow/blur radii; spacing scale; typography (IBM Plex Sans / SF Pro).
- **Cards/Panels:** Glass cards for dashboard/list items, estimate summary, breakdown panels; glass containers for chat/upload.
- **Landing sections:** Hero with skyline animation, Features (3-up), How It Works (3-step), Comparison, Footer.
- **Dashboard:** Header, card/list toggle, search/filter/sort glass controls, empty state illustration.
- **Estimate pages:** Input (chat + voice + upload), Plan (CAD data table, BoQ editor, chat, location overrides), Final (summary, tabs/accordion, risk chart, timeline, notes/margins controls, PDF CTA), Pipeline progress component with agent cards, Feedback/Actuals form.
- **Account page:** Glass form layout.
- **Component library:** Shared glass wrappers, chat bubbles, table rows, cards, inputs to enforce consistency.

---

## Frontend-Breaking Risks (UI)
- Route changes will break existing deep links/bookmarks to `/` and `/projects/:projectId/*` unless redirects are added.
- Legacy canvas/BOM UI is tightly coupled to Firebase services; removing or repointing without feature flags could disrupt current users while TrueCost UI is still in development.
- Auth flow is Google-only; the design spec shows email/password fields. Supporting that would require backend/auth config changes—must be coordinated and is out of scope for UI-only work.
- Theme overhaul (global fonts/colors) will affect every component; needs a staged rollout or feature flag to avoid regressions.

---

## Recommended UI Tasks to Add/Clarify (beyond existing UI Task List)
1. **Auth guard & routing refactor:** Introduce a public route layout, move Dashboard to `/dashboard`, add redirects for legacy `/projects/:id` (temporary or feature-flagged), and ensure ProtectedRoute only wraps authenticated paths.
2. **Legacy isolation plan:** Decide whether to deprecate or sandbox the canvas-based `/projects/:id` experience while building TrueCost pages to avoid conflicting UX.
3. **Mocked estimate state layer:** Add `useEstimateStore`, `usePipelineStatus`, `useCadUpload`, `useVoiceInput`, and mock services/types to unblock UI without backend changes (aligns with epics’ “UI with mock data” guidance).
4. **Global theme bootstrap:** Implement design tokens (colors/typography/spacing/glow/blur), font imports, and a layout wrapper before building pages to avoid per-page restyling churn.
5. **PDF/download & risk UI stubs:** Add UI hooks/buttons for PDF export and P50/P80/P90 risk display (with mock data) so Final Estimate pages match PRD even before backend wiring.

Existing tasks 1–17 in `truecost_ui_tasklist.md` still apply; the above items clarify prerequisites and legacy-isolation work not explicitly called out.

---

## Design Spec Adherence (current state)
- **Not aligned.** The live UI is a light, canvas-centric CollabCanvas app with no TrueCost branding, theme, routes, or flows. All major sections from the design spec (landing, new dashboards, Input/Plan/Final estimate flows, pipeline visibility, account, glass components) are absent and must be built.

---

## Conclusion
The current frontend does not implement the TrueCost experience. It requires a routing overhaul, new pages/components, a global theme system, and estimate-focused state scaffolding (mocked) to satisfy the PRD/design spec. No backend changes were made; any auth or data model shifts should be flagged for coordination before implementation.

