/**
 * Zustand store for contractor settings state management
 *
 * Manages contractor-specific data that persists across projects:
 * - Profile settings
 * - Crew templates
 * - Labor rate overrides
 * - Custom material pricing
 * - Supplier relationships
 */

import { create } from 'zustand';
import type {
  ContractorProfile,
  CrewTemplate,
  LaborRateOverride,
  ContractorMaterial,
  Supplier,
  ContractorSettings,
  TradeType,
} from '../types/contractor';
import * as contractorService from '../services/contractorService';
import type { Unsubscribe } from 'firebase/firestore';

interface ContractorState extends ContractorSettings {
  // Active tab for settings UI
  activeTab: 'crews' | 'materials' | 'suppliers';
  setActiveTab: (tab: 'crews' | 'materials' | 'suppliers') => void;

  // Loading states for individual operations
  savingProfile: boolean;
  savingCrew: boolean;
  savingMaterial: boolean;
  savingSupplier: boolean;
  savingLaborRate: boolean;

  // Basic setters
  setProfile: (profile: ContractorProfile | null) => void;
  setCrews: (crews: CrewTemplate[]) => void;
  setLaborRates: (rates: LaborRateOverride[]) => void;
  setMaterials: (materials: ContractorMaterial[]) => void;
  setSuppliers: (suppliers: Supplier[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Profile operations
  loadSettings: (userId: string) => Promise<void>;
  saveProfile: (userId: string, profile: Partial<ContractorProfile>) => Promise<void>;

  // Crew operations
  addCrew: (userId: string, crew: Omit<CrewTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateCrew: (userId: string, crewId: string, updates: Partial<CrewTemplate>) => Promise<void>;
  deleteCrew: (userId: string, crewId: string) => Promise<void>;

  // Labor rate operations
  saveLaborRate: (userId: string, rate: LaborRateOverride) => Promise<void>;
  deleteLaborRate: (userId: string, trade: TradeType) => Promise<void>;

  // Material operations
  addMaterial: (userId: string, material: Omit<ContractorMaterial, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateMaterial: (userId: string, materialId: string, updates: Partial<ContractorMaterial>) => Promise<void>;
  deleteMaterial: (userId: string, materialId: string) => Promise<void>;

  // Supplier operations
  addSupplier: (userId: string, supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateSupplier: (userId: string, supplierId: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (userId: string, supplierId: string) => Promise<void>;

  // Real-time subscriptions
  subscriptions: Unsubscribe[];
  subscribeToAll: (userId: string) => void;
  unsubscribeAll: () => void;

  // Helpers
  getCrewById: (crewId: string) => CrewTemplate | undefined;
  getMaterialById: (materialId: string) => ContractorMaterial | undefined;
  getSupplierById: (supplierId: string) => Supplier | undefined;
  getLaborRateByTrade: (trade: TradeType) => LaborRateOverride | undefined;
}

export const useContractorStore = create<ContractorState>((set, get) => ({
  // Initial state
  profile: null,
  crews: [],
  laborRates: [],
  materials: [],
  suppliers: [],
  isLoading: false,
  error: null,
  activeTab: 'crews',
  savingProfile: false,
  savingCrew: false,
  savingMaterial: false,
  savingSupplier: false,
  savingLaborRate: false,
  subscriptions: [],

  // Tab management
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Basic setters
  setProfile: (profile) => set({ profile }),
  setCrews: (crews) => set({ crews }),
  setLaborRates: (laborRates) => set({ laborRates }),
  setMaterials: (materials) => set({ materials }),
  setSuppliers: (suppliers) => set({ suppliers }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // ==========================================================================
  // PROFILE OPERATIONS
  // ==========================================================================

  loadSettings: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await contractorService.loadAllContractorSettings(userId);
      set({
        profile: data.profile,
        crews: data.crews,
        laborRates: data.laborRates,
        materials: data.materials,
        suppliers: data.suppliers,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load settings';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  saveProfile: async (userId: string, profile: Partial<ContractorProfile>) => {
    set({ savingProfile: true, error: null });
    try {
      await contractorService.saveContractorProfile(userId, profile);
      // Reload profile after save
      const updated = await contractorService.getContractorProfile(userId);
      set({ profile: updated, savingProfile: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save profile';
      set({ error: message, savingProfile: false });
      throw error;
    }
  },

  // ==========================================================================
  // CREW OPERATIONS
  // ==========================================================================

  addCrew: async (userId, crew) => {
    set({ savingCrew: true, error: null });
    try {
      const crewId = await contractorService.createCrewTemplate(userId, crew);
      const newCrew = await contractorService.getCrewTemplate(userId, crewId);
      if (newCrew) {
        set((state) => ({
          crews: [...state.crews, newCrew],
          savingCrew: false,
        }));
      }
      return crewId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add crew';
      set({ error: message, savingCrew: false });
      throw error;
    }
  },

  updateCrew: async (userId, crewId, updates) => {
    set({ savingCrew: true, error: null });
    try {
      await contractorService.updateCrewTemplate(userId, crewId, updates);
      set((state) => ({
        crews: state.crews.map((c) =>
          c.id === crewId ? { ...c, ...updates, updatedAt: Date.now() } : c
        ),
        savingCrew: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update crew';
      set({ error: message, savingCrew: false });
      throw error;
    }
  },

  deleteCrew: async (userId, crewId) => {
    set({ savingCrew: true, error: null });
    try {
      await contractorService.deleteCrewTemplate(userId, crewId);
      set((state) => ({
        crews: state.crews.filter((c) => c.id !== crewId),
        savingCrew: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete crew';
      set({ error: message, savingCrew: false });
      throw error;
    }
  },

  // ==========================================================================
  // LABOR RATE OPERATIONS
  // ==========================================================================

  saveLaborRate: async (userId, rate) => {
    set({ savingLaborRate: true, error: null });
    try {
      await contractorService.saveLaborRateOverride(userId, rate);
      set((state) => {
        const existing = state.laborRates.find((r) => r.trade === rate.trade);
        if (existing) {
          return {
            laborRates: state.laborRates.map((r) =>
              r.trade === rate.trade ? rate : r
            ),
            savingLaborRate: false,
          };
        } else {
          return {
            laborRates: [...state.laborRates, rate],
            savingLaborRate: false,
          };
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save labor rate';
      set({ error: message, savingLaborRate: false });
      throw error;
    }
  },

  deleteLaborRate: async (userId, trade) => {
    set({ savingLaborRate: true, error: null });
    try {
      await contractorService.deleteLaborRateOverride(userId, trade);
      set((state) => ({
        laborRates: state.laborRates.filter((r) => r.trade !== trade),
        savingLaborRate: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete labor rate';
      set({ error: message, savingLaborRate: false });
      throw error;
    }
  },

  // ==========================================================================
  // MATERIAL OPERATIONS
  // ==========================================================================

  addMaterial: async (userId, material) => {
    set({ savingMaterial: true, error: null });
    try {
      const materialId = await contractorService.createContractorMaterial(userId, material);
      const newMaterial = await contractorService.getContractorMaterial(userId, materialId);
      if (newMaterial) {
        set((state) => ({
          materials: [...state.materials, newMaterial],
          savingMaterial: false,
        }));
      }
      return materialId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add material';
      set({ error: message, savingMaterial: false });
      throw error;
    }
  },

  updateMaterial: async (userId, materialId, updates) => {
    set({ savingMaterial: true, error: null });
    try {
      await contractorService.updateContractorMaterial(userId, materialId, updates);
      set((state) => ({
        materials: state.materials.map((m) =>
          m.id === materialId ? { ...m, ...updates, updatedAt: Date.now() } : m
        ),
        savingMaterial: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update material';
      set({ error: message, savingMaterial: false });
      throw error;
    }
  },

  deleteMaterial: async (userId, materialId) => {
    set({ savingMaterial: true, error: null });
    try {
      await contractorService.deleteContractorMaterial(userId, materialId);
      set((state) => ({
        materials: state.materials.filter((m) => m.id !== materialId),
        savingMaterial: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete material';
      set({ error: message, savingMaterial: false });
      throw error;
    }
  },

  // ==========================================================================
  // SUPPLIER OPERATIONS
  // ==========================================================================

  addSupplier: async (userId, supplier) => {
    set({ savingSupplier: true, error: null });
    try {
      const supplierId = await contractorService.createSupplier(userId, supplier);
      const newSupplier = await contractorService.getSupplier(userId, supplierId);
      if (newSupplier) {
        set((state) => ({
          suppliers: [...state.suppliers, newSupplier],
          savingSupplier: false,
        }));
      }
      return supplierId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add supplier';
      set({ error: message, savingSupplier: false });
      throw error;
    }
  },

  updateSupplier: async (userId, supplierId, updates) => {
    set({ savingSupplier: true, error: null });
    try {
      await contractorService.updateSupplier(userId, supplierId, updates);
      set((state) => ({
        suppliers: state.suppliers.map((s) =>
          s.id === supplierId ? { ...s, ...updates, updatedAt: Date.now() } : s
        ),
        savingSupplier: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update supplier';
      set({ error: message, savingSupplier: false });
      throw error;
    }
  },

  deleteSupplier: async (userId, supplierId) => {
    set({ savingSupplier: true, error: null });
    try {
      await contractorService.deleteSupplier(userId, supplierId);
      set((state) => ({
        suppliers: state.suppliers.filter((s) => s.id !== supplierId),
        savingSupplier: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete supplier';
      set({ error: message, savingSupplier: false });
      throw error;
    }
  },

  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================

  subscribeToAll: (userId: string) => {
    const unsubs: Unsubscribe[] = [];

    // Profile subscription
    unsubs.push(
      contractorService.subscribeToContractorProfile(userId, (profile) => {
        set({ profile });
      })
    );

    // Crews subscription
    unsubs.push(
      contractorService.subscribeToCrewTemplates(userId, (crews) => {
        set({ crews });
      })
    );

    // Labor rates subscription
    unsubs.push(
      contractorService.subscribeToLaborRateOverrides(userId, (laborRates) => {
        set({ laborRates });
      })
    );

    // Materials subscription
    unsubs.push(
      contractorService.subscribeToContractorMaterials(userId, (materials) => {
        set({ materials });
      })
    );

    // Suppliers subscription
    unsubs.push(
      contractorService.subscribeToSuppliers(userId, (suppliers) => {
        set({ suppliers });
      })
    );

    set({ subscriptions: unsubs });
  },

  unsubscribeAll: () => {
    const { subscriptions } = get();
    subscriptions.forEach((unsub) => unsub());
    set({ subscriptions: [] });
  },

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  getCrewById: (crewId) => {
    return get().crews.find((c) => c.id === crewId);
  },

  getMaterialById: (materialId) => {
    return get().materials.find((m) => m.id === materialId);
  },

  getSupplierById: (supplierId) => {
    return get().suppliers.find((s) => s.id === supplierId);
  },

  getLaborRateByTrade: (trade) => {
    return get().laborRates.find((r) => r.trade === trade);
  },
}));
