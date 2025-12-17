import { useState } from 'react';
import { AuthenticatedLayout } from '../components/layouts/AuthenticatedLayout';
import { useAuth } from '../hooks/useAuth';
import { Button, GlassPanel, Input, Select } from '../components/ui';

/**
 * Account Page - Glassmorphic account settings UI (UI-only).
 */
export function Account() {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    company: '',
    defaultRegion: 'US',
    currency: 'USD',
  });
  const [hasChanges, setHasChanges] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setHasChanges(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('Account settings saved (placeholder):', formData);
    alert('Settings saved successfully! (Backend integration coming soon)');
    setIsSaving(false);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      company: '',
      defaultRegion: 'US',
      currency: 'USD',
    });
    setHasChanges(false);
  };

  return (
    <AuthenticatedLayout>
      <div className="container-spacious py-section max-w-3xl px-4 md:px-6 pt-16 md:pt-20">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="font-heading text-xl md:text-h1 text-truecost-text-primary mb-1 md:mb-2">Account Settings</h1>
          <p className="font-body text-sm md:text-body text-truecost-text-secondary">
            Manage your personal information and preferences
          </p>
        </div>

        <form onSubmit={handleSave}>
          <GlassPanel className="p-4 md:p-8 space-y-6 md:space-y-8">
            {/* Personal Information */}
            <div className="space-y-4 md:space-y-6">
              <h2 className="font-heading text-lg md:text-h3 text-truecost-text-primary pb-2 md:pb-3 border-b border-truecost-glass-border">
                Personal Information
              </h2>

              {/* Name */}
              <Input
                label="Full Name"
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
              />

              {/* Email */}
              <Input
                label="Email Address"
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your.email@example.com"
                className="opacity-50 cursor-not-allowed"
                helperText="Email cannot be changed. Contact support if needed."
                disabled
              />

              {/* Company */}
              <Input
                label="Company (Optional)"
                id="company"
                name="company"
                type="text"
                value={formData.company}
                onChange={handleInputChange}
                placeholder="Your company name"
              />
            </div>

            {/* Regional Preferences */}
            <div className="space-y-4 md:space-y-6">
              <h2 className="font-heading text-lg md:text-h3 text-truecost-text-primary pb-2 md:pb-3 border-b border-truecost-glass-border">
                Regional Preferences
              </h2>

              {/* Default Region */}
              <Select
                label="Default Region"
                id="defaultRegion"
                name="defaultRegion"
                value={formData.defaultRegion}
                onChange={handleInputChange}
                helperText="Used for material pricing and labor rates by default"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="UK">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="EU">European Union</option>
              </Select>

              {/* Currency */}
              <Select
                label="Currency"
                id="currency"
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                helperText="Display format for all cost estimates"
              >
                <option value="USD">USD ($) - US Dollar</option>
                <option value="CAD">CAD ($) - Canadian Dollar</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="AUD">AUD ($) - Australian Dollar</option>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-truecost-glass-border">
              <Button
                type="submit"
                variant="primary"
                disabled={!hasChanges || isSaving}
                loading={isSaving}
                fullWidth={false}
              >
                Save Changes
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={!hasChanges || isSaving}
              >
                Cancel
              </Button>
            </div>
          </GlassPanel>
        </form>
      </div>
    </AuthenticatedLayout>
  );
}

