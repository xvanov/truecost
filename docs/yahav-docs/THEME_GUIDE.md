# Theme Guide

Dark Industrial Neon with glassmorphism. Use tokens; avoid hardcoded colors.

## Colors
```js
truecost-cyan:        #3BE3F5
truecost-teal:        #17C5D1
truecost-bg-primary:  #050A14
truecost-bg-secondary:#0F1629
truecost-text-primary:   rgba(255,255,255,0.95)
truecost-text-secondary: rgba(255,255,255,0.65)
truecost-text-muted:     rgba(255,255,255,0.55)
truecost-success:     #10B981
truecost-warning:     #F59E0B
truecost-danger:      #EF4444
truecost-glass-bg:    rgba(255,255,255,0.07)
truecost-glass-border:rgba(255,255,255,0.16)
```

## Typography
- Heading: `font-heading` (IBM Plex Sans)
- Body: `font-body` (SF Pro Text/system)
- Sizes: `text-h1` (48px), `text-h1-mobile` (32px), `text-h2` (32px), `text-h3` (24px), `text-body` (16px), `text-body-meta` (14px).

Usage:
```html
<h1 class="font-heading text-h1 md:text-h1-mobile text-truecost-text-primary">Title</h1>
<p class="font-body text-body text-truecost-text-secondary">Body</p>
<span class="font-body text-body-meta text-truecost-text-muted">Helper</span>
```

## Spacing
- Containers: `container-spacious` (16/32/64/80px per breakpoints).
- Sections: `py-section` (mobile 48px, desktop 80px).
- Cards: `p-6` / `p-8`, gaps `gap-6` / `gap-8`, `space-y-6`.

## Radius
- `rounded-pill` 9999px (buttons/pills)
- `rounded-lg` 18px (panels/cards)
- `rounded-md` 12px

## Shadows & Blur
- `glass-panel`: blur 14px, subtle border, shadow.
- `shadow-glow`: cyan glow hover.
- Backdrop blur for nav/modals: 12–14px.

## Utilities (index.css)
- `.glass-panel` — container base.
- `.glass-input` — form fields.
- `.btn-pill-primary` / `.btn-pill-secondary`.
- `.transition-micro` — 120ms transitions.
- `.focus-ring` — cyan outline.
- `.page-enter/exit` — page transitions.
- `.modal-enter` / `.overlay-enter` — modal animations.

## Breakpoints
```
sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
```
Patterns: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `text-h1-mobile md:text-h1`.

## Animation Guidance
- Hover/active: 120ms ease-out.
- Page enter: 300ms fade/slide; exit: 200ms fade.
- Modal scale: 200ms (0.96→1).
- Skyline: 6s loop.
- Reduced motion: disable animations, set durations to ~0.

## Accessibility
- Focus-visible cyan ring (2px, offset 2px).
- Contrast: primary/secondary/muted pass on dark BG; adjust muted to ≥0.60 opacity if needed.
- ARIA labels on custom controls; use semantic HTML.

## Best Practices
1. Use theme classes (`text-truecost-*`, `bg-truecost-*`).
2. Reuse `glass-panel` and `glass-input`; no ad-hoc glass styles.
3. Mobile-first; scale up with breakpoints.
4. Keep motion subtle; respect reduced-motion.
5. Maintain spacing rhythm (multiples of 4).

