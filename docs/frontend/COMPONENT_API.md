# Component API Reference

UI primitives in `src/components/ui/`. All components are TypeScript + forwardRef and support `className`/native props.

## Table of Contents
- Button
- GlassPanel
- Input
- Select
- Textarea
- Card
- TableRow

---

## Button
Import: `import { Button } from '@/components/ui';`

Props:
```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'utility';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  as?: ElementType; // optional polymorphic
}
```

Examples:
```tsx
<Button variant="primary">Continue</Button>
<Button variant="secondary" onClick={onCancel}>Cancel</Button>
<Button variant="primary" loading>Saving...</Button>
<Button variant="utility" aria-label="Delete"><TrashIcon /></Button>
<Button variant="primary" fullWidth icon={<PlusIcon />}>New</Button>
<Button as={Link} to="/estimate/new" variant="primary">New Estimate</Button>
```

Variants: primary (CTA gradient), secondary (outline), utility (minimal square). Hover: glow, Active: scale 0.98, Focus: cyan ring, Disabled: opacity 50%.

---

## GlassPanel
Import: `import { GlassPanel } from '@/components/ui';`

Props:
```ts
interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'subtle';
  children: ReactNode;
}
```
Examples:
```tsx
<GlassPanel className="p-6">Content</GlassPanel>
<GlassPanel variant="elevated" className="p-8">Important</GlassPanel>
```

---

## Input
Import: `import { Input } from '@/components/ui';`

Props:
```ts
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}
```
Examples:
```tsx
<Input label="Name" value={name} onChange={...} required />
<Input label="Email" type="email" error="Invalid email" />
<Input label="Location" helperText="City or ZIP" />
```
Features: auto ID, label htmlFor, helper/error text, uses `glass-input`.

---

## Select
Import: `import { Select } from '@/components/ui';`

Props:
```ts
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  children: ReactNode; // option elements
}
```
Examples:
```tsx
<Select label="Currency" value={currency} onChange={...}>
  <option value="USD">USD</option>
  <option value="EUR">EUR</option>
</Select>
```
Features: custom arrow, helper/error, auto ID, `glass-input` styling.

---

## Textarea
Import: `import { Textarea } from '@/components/ui';`

Props:
```ts
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}
```
Examples:
```tsx
<Textarea label="Description" rows={4} />
<Textarea label="Notes" helperText="Constraints, preferences" />
```
Features: resize-none, helper/error, auto ID, `glass-input`.

---

## Card
Import: `import { Card } from '@/components/ui';`

Props:
```ts
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}
```
Examples:
```tsx
<Card className="p-6">Content</Card>
<Card hoverable onClick={...} className="p-6">Clickable</Card>
```
Hoverable: glow + lift.

---

## TableRow
Import: `import { TableRow } from '@/components/ui';`

Props:
```ts
interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}
```
Examples:
```tsx
<table>
  <tbody>
    <TableRow>
      <td className="p-4">Item</td>
      <td className="p-4 text-right">$100</td>
    </TableRow>
  </tbody>
</table>
```
Features: glass-border separator, hover glass/bg + shadow glow, 200ms transition.

---

## Common Patterns
- Forms: combine Input/Select/Textarea + Button, wrap in GlassPanel.
- Lists: grid of Card (hoverable) or table with TableRow.
- Layouts: use `PublicLayout` or `AuthenticatedLayout` (see Routing Map).
- Spacing: `container-spacious`, `py-section`, `p-8`, `space-y-6`.
- Focus: use `focus-ring` or rely on default focus-visible styling.

