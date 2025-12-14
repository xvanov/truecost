# Routing Map

## Routes
### Public
| Path | Component | Layout | Notes |
| --- | --- | --- | --- |
| `/` | Landing | PublicLayout | Marketing |
| `/login` | Login | PublicLayout | Google OAuth |
| `/signup` | Signup | PublicLayout | UI-only email/password |

### Authenticated (ProtectedRoute)
| Path | Component | Layout | Notes |
| --- | --- | --- | --- |
| `/dashboard` | Dashboard | AuthenticatedLayout | Projects list |
| `/account` | Account | AuthenticatedLayout | Account settings |
| `/estimate/new` | NewEstimate | AuthenticatedLayout | Start estimate |
| `/estimate/:id/plan` | PlanView | AuthenticatedLayout | Upload/chat |
| `/estimate/:id/final` | FinalView | AuthenticatedLayout | Summary |
| `/projects/:projectId/*` | Project | AuthenticatedLayout | Legacy |

### Fallback
| Path | Behavior |
| --- | --- |
| `*` | Redirect to `/` |

## Layouts
### PublicLayout
- Navbar (public), footer
- Dark BG, glass navbar

### AuthenticatedLayout
- Navbar (authenticated)
- `pt-14` content offset, dark BG

## Navigation Patterns
- Landing: Get Started → `/signup`, Sign In → `/login`
- Login success → `/dashboard`; Signup link → `/signup`
- Dashboard: New Estimate → `/estimate/new`; Account → `/account`; Project → `/projects/:id/space` (legacy) or estimate routes
- Estimate flow: New → Plan → Final (`/estimate/:id/plan` → `/estimate/:id/final`)
- Unknown → `/`

## Auth Flow
- ProtectedRoute: if loading → spinner; if !user → `/login`; else render children.
- Login page: redirects to `/dashboard` when user exists.

## URL Params
- `:id` in estimate routes (currently mock IDs; future Firestore IDs)
- `:projectId` legacy project routes

## Deep Linking
- All routes support direct access; auth-guarded routes require login.

## Future Enhancements (when backend ready)
- Replace mock estimate IDs with real Firestore IDs.
- Add 404 page instead of redirect.
- Add estimate history route (`/estimates`).

