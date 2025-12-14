/**
 * Contractor Settings Page
 *
 * Allows contractors to configure:
 * - Crew templates and labor rates
 * - Custom material pricing catalog
 * - Supplier relationships
 *
 * This data persists across all projects.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useContractorStore } from '../store/contractorStore';
import { AuthenticatedLayout } from '../components/layouts/AuthenticatedLayout';
import { GlassPanel } from '../components/ui';

// Tab components
import { CrewsTab } from '../components/contractor/CrewsTab';
import { MaterialsTab } from '../components/contractor/MaterialsTab';
import { SuppliersTab } from '../components/contractor/SuppliersTab';

type TabType = 'crews' | 'materials' | 'suppliers';

const TABS: { id: TabType; label: string; icon: string }[] = [
  { id: 'crews', label: 'My Crews', icon: '👷' },
  { id: 'materials', label: 'Materials Catalog', icon: '📦' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏪' },
];

export function ContractorSettings() {
  const { user } = useAuth();
  const {
    isLoading,
    error,
    activeTab,
    setActiveTab,
    loadSettings,
    subscribeToAll,
    unsubscribeAll,
    crews,
    materials,
    suppliers,
  } = useContractorStore();

  const [initialized, setInitialized] = useState(false);

  // Load settings on mount
  useEffect(() => {
    if (!user) return;

    loadSettings(user.uid)
      .then(() => setInitialized(true))
      .catch((err) => console.error('Failed to load contractor settings:', err));

    // Subscribe to real-time updates
    subscribeToAll(user.uid);

    return () => {
      unsubscribeAll();
    };
  }, [user, loadSettings, subscribeToAll, unsubscribeAll]);

  if (!user) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center h-64 pt-14">
          <p className="font-body text-body text-truecost-text-secondary">
            Please log in to access contractor settings.
          </p>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="container-spacious max-w-7xl pt-24 pb-16 md:pt-28">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-h1 text-truecost-text-primary mb-2">
            Contractor Settings
          </h1>
          <p className="font-body text-body text-truecost-text-secondary">
            Configure your crews, material pricing, and supplier relationships. These settings
            apply across all your projects.
          </p>
        </div>

        {/* Error display */}
        {error && (
          <GlassPanel className="bg-truecost-danger/10 border-truecost-danger/30 p-4 mb-6">
            <p className="font-body text-body text-truecost-danger">{error}</p>
          </GlassPanel>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            icon="👷"
            label="Crew Templates"
            count={crews.length}
            onClick={() => setActiveTab('crews')}
            isActive={activeTab === 'crews'}
          />
          <SummaryCard
            icon="📦"
            label="Custom Materials"
            count={materials.length}
            onClick={() => setActiveTab('materials')}
            isActive={activeTab === 'materials'}
          />
          <SummaryCard
            icon="🏪"
            label="Suppliers"
            count={suppliers.length}
            onClick={() => setActiveTab('suppliers')}
            isActive={activeTab === 'suppliers'}
          />
        </div>

        {/* Tab navigation */}
        <div className="border-b border-truecost-glass-border mb-6">
          <nav className="-mb-px flex space-x-8">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-heading text-body font-medium transition-all duration-120
                  ${
                    activeTab === tab.id
                      ? 'border-truecost-cyan text-truecost-cyan'
                      : 'border-transparent text-truecost-text-secondary hover:text-truecost-text-primary hover:border-truecost-glass-border'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Loading state */}
        {isLoading && !initialized && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-truecost-cyan border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 font-body text-body text-truecost-text-secondary">
              Loading settings...
            </span>
          </div>
        )}

        {/* Tab content */}
        {initialized && (
          <GlassPanel className="p-6">
            {activeTab === 'crews' && <CrewsTab userId={user.uid} />}
            {activeTab === 'materials' && <MaterialsTab userId={user.uid} />}
            {activeTab === 'suppliers' && <SuppliersTab userId={user.uid} />}
          </GlassPanel>
        )}
      </div>
    </AuthenticatedLayout>
  );
}

// Summary card component with glass styling
interface SummaryCardProps {
  icon: string;
  label: string;
  count: number;
  onClick: () => void;
  isActive: boolean;
}

function SummaryCard({ icon, label, count, onClick, isActive }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        glass-panel-hover p-6 text-left w-full transition-all duration-120
        ${
          isActive
            ? 'border-truecost-cyan shadow-[0_0_16px_rgba(59,227,245,0.3)]'
            : ''
        }
      `}
    >
      <div className="flex items-center">
        <span className="text-3xl mr-4">{icon}</span>
        <div>
          <p className="font-heading text-h2 text-truecost-text-primary">{count}</p>
          <p className="font-body text-body-meta text-truecost-text-secondary">{label}</p>
        </div>
      </div>
    </button>
  );
}

export default ContractorSettings;
