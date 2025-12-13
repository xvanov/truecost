# TRUECOST — Complete UI/UX DESIGN SPECIFICATION
*Frontend-Only Redesign • Based on Product Brief, PRD, and Architecture • Dark Futuristic Industrial Theme*

---

# 1. BRAND & VISUAL IDENTITY

## 1.1 Color Palette (Final)
**Primary Theme — Dark Industrial + Futuristic Neon**
- **Background Primary:** #050A14
- **Background Surface:** #0F1629
- **Primary Accent Cyan:** #3BE3F5
- **Teal Accent:** #17C5D1
- **Glass Border:** rgba(255, 255, 255, 0.16)
- **Glass Background:** rgba(255, 255, 255, 0.07)
- **Text Primary:** #FFFFFF
- **Text Secondary:** rgba(255, 255, 255, 0.75)
- **Muted Labels:** rgba(255, 255, 255, 0.55)
- **Danger:** #FF4A4A

**Theme Notes:**
- Heavy use of neon cyan glows.
- Dark background to emphasize holographic UI.
- Glassmorphism for panels, cards, and chat UI.

---

# 2. TYPOGRAPHY

## 2.1 Typeface System (Professional + Hybrid)
**Heading Font:** IBM Plex Sans (600–700 weight)  
**Body Font:** SF Pro Text (400–500 weight)  
**Optional Accent:** IBM Plex Serif for cost values/hero highlights.

## 2.2 Type Scale (Desktop)
- **H1:** 40–48px, line-height ~1.1
- **H2:** 28–32px
- **H3:** 22–24px
- **Body:** 16px (primary), 14px (meta)
- **Buttons:** 14–16px

## 2.3 Tone & Style
- Clean, professional, modern.
- Avoid all-caps; use sentence case.
- Ample spacing around headings for "spacious" layout.

---

# 3. SPACING & LAYOUT DENSITY

## 3.1 Global Layout
**Chosen Style: Spacious** (Apple-like breathing room)
- Section spacing: 24–32px
- Page padding: 80px sides (desktop), 32–40px tablet, 16–20px mobile.
- Component padding: 20–24px

## 3.2 Grid System
- Desktop: Flexible 12-column mental grid.
- Dashboard & hero: Two-column split.
- Mobile: Single column with stacked sections.

---

# 4. GLOBAL UI COMPONENTS

## 4.1 Navigation Bars

### **Public Navbar** (Landing, Login, Signup)
- Left: TrueCost logo + text
- Right Navigation:
  - Home
  - Features
  - Pricing
  - Contact
  - **Sign In** (pill button)
- Style:
  - Transparent glass background
  - Backdrop blur
  - Neon cyan bottom border (1px subtle)
  - Fixed on scroll

### **Authenticated Navbar** (Dashboard + App)
- TrueCost wordmark on left
- Right:
  - Dashboard
  - Estimates
  - New Estimate
  - Account
  - Logout
- Same styling as public navbar, more compact.

---

## 4.2 Buttons

### **Primary CTA (Pill Buttons)**
- Rounded pill (999px radius)
- Cyan → teal gradient
- Glow: `box-shadow: 0 0 16px rgba(59,227,245,0.5)`
- Used for: Signup, Get Started, New Estimate, Final actions.

### **Secondary CTA**
- Glass outline
- Rounded pill or soft rectangle
- Hover: glow + slight brighten.

### **Utility Buttons**
- Square / rounded rectangle (8–10px radius)
- Icon-only or small text
- Background: rgba(255,255,255,0.05)

---

## 4.3 Cards & Panels
**Glassmorphic Standard:**
- Background: rgba(255,255,255,0.07)
- Border: rgba(255,255,255,0.16)
- Blur: 14px
- Shadow: neon cyan outer glow
- Border radius: 18–20px
- Hover: elevate + stronger glow

Used for:
- Project cards
- Estimate breakdown panels
- Input/upload boxes
- Chat containers

---

# 5. ROUTE STRUCTURE (FINAL)
```
/
/login
/signup
/dashboard
/estimate/new
/estimate/:id
/estimate/:id/plan
/estimate/:id/final
/estimate/:id/feedback (future optional)
/account
```
- `/` is public landing page
- `/dashboard` is authenticated home
- Clear separation between public marketing pages and app shell

---

# 6. LANDING PAGE (`/`)

## 6.1 HERO SECTION (Full-width skyline background)
### Background
- Animated holographic wireframe skyline (CSS only)
- Buildings rise simultaneously (A2 motion)
- Faint glowing grid at bottom
- Fog gradient overlay for depth

### Navbar
- Logo left
- Links right
- Sign In pill button

### Left Column
- **H1:** "Accurate Estimates Made Easy"
- Subline: "Create detailed construction cost estimates effortlessly with AI-powered precision."
- **Primary CTA:** Get Started → `/signup`
- Secondary CTA: Watch Demo

### Right Column
- Glass UI Preview Panel (static)
- Shows project cost breakdown UI mock

---

## 6.2 Features Section (3 Columns)
### Titles:
- Accurate
- User-Friendly
- Comprehensive

Each feature uses:
- Neon line icon
- Heading
- 1–2 sentence description
- Glass tile background

---

## 6.3 How It Works
**3-step process visually shown in a horizontal layout:**
1. Upload or enter project details
2. AI analyzes material & labor needs
3. Get a detailed, shareable estimate

---

## 6.4 Why TrueCost / Comparison
- Glass panel comparing manual/spreadsheet workflows vs AI estimation
- Demonstrates speed, accuracy, standardization

---

## 6.5 Footer
Simple minimal footer with:
- Logo
- Links
- Copyright
- Dark gradient background

---

# 7. AUTH PAGES

## 7.1 Login (`/login`)
- Centered glass panel
- Title: "Welcome Back"
- Inputs: Email, Password
- CTA: Log In
- Secondary: "Don't have an account? Sign up"

## 7.2 Signup (`/signup`)
- Title: "Create Your TrueCost Account"
- Inputs: Name, Email, Password, (optional Company)
- CTA: Create Account
- Link to Login

---

# 8. DASHBOARD (`/dashboard`)

## 8.1 Header
- **Title:** "Your Projects"
- Right Actions:
  - **View Toggle:** Cards / List
  - **New Estimate** (primary pill)

## 8.2 Filters
- Search bar
- Status filter dropdown
- Sort dropdown (Newest, Oldest, Value)

## 8.3 Card View (Default)
Each project card shows:
- Project name
- Status pill
- Last updated date
- Optional: total estimate
- Button: View Estimate
- Utility icons: Share, Delete

## 8.4 List View (New Feature)
Table-like layout:
- Columns: Name, Status, Updated, Estimate, Actions
- Row hover glow
- Matches glass theme

## 8.5 Empty State
- Illustration: subtle wireframe buildings
- Message: "No projects yet"
- CTA: Create Your First Estimate

---

# 9. NEW ESTIMATE FLOW

## 9.1 Start New Estimate (`/estimate/new`)
Two-column spacious layout:
- **Left:** Form inputs (Name, Location, Type, Size)
- **Right:** Helpful tips / example inputs in glass panel

CTA: Continue → `/estimate/:id/plan`

---

## 9.2 Plan Stage (`/estimate/:id/plan`)

### Left Panel
- File upload (PDF/CAD/images)
- Drag & drop area
- File preview
- Additional fields: description, constraints

### Right Panel — Chat Clarification Agent
- Messages in glass bubbles
- Agent uses cyan accent bubbles
- User bubbles darker
- Input bar fixed bottom

Use-case: AI requests clarifying information before generating estimate.

CTA: "Generate Estimate" → `/estimate/:id/final`

---

# 10. FINAL ESTIMATE PAGE (`/estimate/:id/final`)

## 10.1 Summary Panel (Top)
- Large glass card
- Total cost (accent serif font optional)
- Confidence range
- Estimated timeline

## 10.2 Breakdown Sections
Tabbed or accordion:
- Overview
- By Trade
- Materials
- Labor
- Equipment

Each section:
- Glass table panels
- Hover glowing rows

## 10.3 Actions
- **Download PDF** (primary)
- Edit Inputs
- Duplicate Estimate

---

# 11. ACCOUNT PAGE (`/account`)
Simple spacious layout:
- Name
- Email
- Company
- Default region
- Currency preferences
Glass-card layout with subtle glow.

---

# 12. ANIMATION GUIDELINES

## 12.1 Skyline Animation (CSS-only)
- Buildings scaleY from 0 → 1
- Opacity fade-in/out
- Loop duration: 3.5–6s
- Slight delays per building optional

## 12.2 Global Motion
- Hover animations: 120ms glow
- Page transitions: fade/slide
- Modal scale-in: 0.96 → 1

---

# 13. COMPONENT INVENTORY (For Implementation)
- Navbar (public + authenticated)
- Button variations (pill, secondary, utility)
- Card base component
- Glass panel container
- Search bar + filters
- Project card
- Project list row
- Upload box
- Chat bubble (agent + user)
- Tabs / accordions
- Table component

---

# 14. RESPONSIVE RULES
**Mobile:**
- Navbar collapses to hamburger
- Hero becomes stacked (text → UI panel → skyline)
- Dashboard uses full-width list view by default

**Tablet:**
- 2-column card grid
- Steps/feature sections become 2-column

**Desktop:**
- Full layout as designed

---

# 15. CTA ROUTING
**Primary Landing CTA:**  
`Get Started` → `/signup`


---

# END OF SPEC

