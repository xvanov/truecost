# Code Examples

Practical snippets for common patterns.

## Forms
### Basic Form with Validation
```tsx
import { useState } from 'react';
import { Button, Input, GlassPanel } from '@/components/ui';

export function BasicForm() {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const next: Record<string, string> = {};
    if (!formData.name.trim()) next.name = 'Name is required';
    if (!formData.email.includes('@')) next.email = 'Invalid email';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) console.log(formData);
  };

  return (
    <GlassPanel className="p-8 max-w-md space-y-6">
      <Input
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        required
      />
      <Input
        label="Email"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        error={errors.email}
        required
      />
      <Button variant="primary" type="submit" onClick={handleSubmit} fullWidth>
        Submit
      </Button>
    </GlassPanel>
  );
}
```

### Loading State
```tsx
const [loading, setLoading] = useState(false);
<Button variant="primary" loading={loading} disabled={loading}>
  {loading ? 'Saving...' : 'Save'}
```

## Lists
### Grid of Cards
```tsx
import { Card } from '@/components/ui';

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map((item) => (
    <Card key={item.id} hoverable onClick={() => onSelect(item.id)} className="p-6">
      <h3 className="font-heading text-h3 text-truecost-text-primary mb-2">{item.title}</h3>
      <p className="font-body text-body text-truecost-text-secondary">{item.desc}</p>
    </Card>
  ))}
</div>
```

### Table with TableRow
```tsx
import { TableRow } from '@/components/ui';

<div className="glass-panel overflow-hidden">
  <table className="w-full">
    <thead>
      <tr className="border-b border-truecost-glass-border">
        <th className="text-left p-4 text-body-meta text-truecost-text-secondary">Item</th>
        <th className="text-right p-4 text-body-meta text-truecost-text-secondary">Total</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <TableRow key={r.id}>
          <td className="p-4 text-body text-truecost-text-primary">{r.item}</td>
          <td className="p-4 text-right text-body text-truecost-cyan">${r.total.toLocaleString()}</td>
        </TableRow>
      ))}
    </tbody>
  </table>
</div>
```

## Modals
```tsx
import { GlassPanel, Button } from '@/components/ui';

function Modal({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overlay-enter">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative z-10 p-6 max-w-md w-full mx-4 modal-enter" role="dialog" aria-modal="true">
        <h2 className="font-heading text-h2 text-truecost-text-primary mb-4">{title}</h2>
        {children}
        <div className="mt-6 flex gap-4">
          <Button variant="secondary" onClick={onClose} fullWidth>Close</Button>
        </div>
      </GlassPanel>
    </div>
  );
}
```

## Navigation
```tsx
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui';

const navigate = useNavigate();
<Button onClick={() => navigate('/dashboard')}>Go Dashboard</Button>
<Link to="/account" className="text-truecost-cyan hover:underline">Account</Link>
```

## State (Zustand)
```ts
import { create } from 'zustand';

type Store = { count: number; inc: () => void };
export const useStore = create<Store>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}));
```

## Responsive Patterns
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">...</div>
<h1 class="text-h1-mobile md:text-h1">Responsive H1</h1>
<div class="hidden lg:block">Desktop only</div>
<div class="block lg:hidden">Mobile only</div>
```

## Loading & Error
```tsx
{loading ? (
  <div className="flex justify-center py-12">
    <div className="w-8 h-8 border-2 border-truecost-cyan border-t-transparent rounded-full animate-spin" />
  </div>
) : error ? (
  <div className="glass-panel p-4 text-truecost-danger">Failed to load</div>
) : (
  content
)}
```

## Auth Patterns
```tsx
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

