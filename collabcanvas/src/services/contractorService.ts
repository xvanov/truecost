/**
 * Contractor Settings Service
 *
 * Firestore CRUD operations for contractor-specific data:
 * - Profile settings
 * - Crew templates
 * - Labor rate overrides
 * - Custom material pricing
 * - Supplier relationships
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './firebase';
import type {
  ContractorProfile,
  CrewTemplate,
  LaborRateOverride,
  ContractorMaterial,
  Supplier,
  TradeType,
} from '../types/contractor';

// =============================================================================
// COLLECTION REFERENCES
// =============================================================================

function getContractorDoc(userId: string) {
  return doc(firestore, 'contractors', userId);
}

function getCrewsCollection(userId: string) {
  return collection(firestore, 'contractors', userId, 'crews');
}

function getLaborRatesCollection(userId: string) {
  return collection(firestore, 'contractors', userId, 'laborRates');
}

function getMaterialsCollection(userId: string) {
  return collection(firestore, 'contractors', userId, 'materials');
}

function getSuppliersCollection(userId: string) {
  return collection(firestore, 'contractors', userId, 'suppliers');
}

// =============================================================================
// PROFILE OPERATIONS
// =============================================================================

/**
 * Get contractor profile
 */
export async function getContractorProfile(
  userId: string
): Promise<ContractorProfile | null> {
  const docRef = getContractorDoc(userId);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    return docSnap.data() as ContractorProfile;
  }
  return null;
}

/**
 * Create or update contractor profile
 */
export async function saveContractorProfile(
  userId: string,
  profile: Partial<ContractorProfile>
): Promise<void> {
  const docRef = getContractorDoc(userId);
  const existing = await getDoc(docRef);

  if (existing.exists()) {
    await updateDoc(docRef, {
      ...profile,
      updatedAt: serverTimestamp(),
    });
  } else {
    const newProfile: ContractorProfile = {
      userId,
      defaults: {
        overheadPercent: 10,
        profitPercent: 10,
        contingencyPercent: 5,
        wasteFactorPercent: 10,
        useUnionLabor: false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...profile,
    };
    await setDoc(docRef, newProfile);
  }
}

/**
 * Subscribe to profile changes
 */
export function subscribeToContractorProfile(
  userId: string,
  callback: (profile: ContractorProfile | null) => void
): Unsubscribe {
  const docRef = getContractorDoc(userId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as ContractorProfile);
    } else {
      callback(null);
    }
  });
}

// =============================================================================
// CREW OPERATIONS
// =============================================================================

/**
 * Get all crew templates
 */
export async function getCrewTemplates(userId: string): Promise<CrewTemplate[]> {
  const colRef = getCrewsCollection(userId);
  const q = query(colRef, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as CrewTemplate));
}

/**
 * Get a single crew template
 */
export async function getCrewTemplate(
  userId: string,
  crewId: string
): Promise<CrewTemplate | null> {
  const docRef = doc(getCrewsCollection(userId), crewId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as CrewTemplate;
  }
  return null;
}

/**
 * Create a new crew template
 */
export async function createCrewTemplate(
  userId: string,
  crew: Omit<CrewTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const colRef = getCrewsCollection(userId);
  const newDocRef = doc(colRef);
  const now = Date.now();

  await setDoc(newDocRef, {
    ...crew,
    createdAt: now,
    updatedAt: now,
  });

  return newDocRef.id;
}

/**
 * Update a crew template
 */
export async function updateCrewTemplate(
  userId: string,
  crewId: string,
  updates: Partial<CrewTemplate>
): Promise<void> {
  const docRef = doc(getCrewsCollection(userId), crewId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a crew template
 */
export async function deleteCrewTemplate(
  userId: string,
  crewId: string
): Promise<void> {
  const docRef = doc(getCrewsCollection(userId), crewId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to crew templates
 */
export function subscribeToCrewTemplates(
  userId: string,
  callback: (crews: CrewTemplate[]) => void
): Unsubscribe {
  const colRef = getCrewsCollection(userId);
  const q = query(colRef, orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const crews = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as CrewTemplate)
    );
    callback(crews);
  });
}

// =============================================================================
// LABOR RATE OPERATIONS
// =============================================================================

/**
 * Get all labor rate overrides
 */
export async function getLaborRateOverrides(
  userId: string
): Promise<LaborRateOverride[]> {
  const colRef = getLaborRatesCollection(userId);
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map((doc) => doc.data() as LaborRateOverride);
}

/**
 * Get labor rate for a specific trade
 */
export async function getLaborRateOverride(
  userId: string,
  trade: TradeType
): Promise<LaborRateOverride | null> {
  const docRef = doc(getLaborRatesCollection(userId), trade);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as LaborRateOverride;
  }
  return null;
}

/**
 * Save labor rate override (uses trade as document ID)
 */
export async function saveLaborRateOverride(
  userId: string,
  laborRate: LaborRateOverride
): Promise<void> {
  const docRef = doc(getLaborRatesCollection(userId), laborRate.trade);
  await setDoc(docRef, laborRate);
}

/**
 * Delete labor rate override
 */
export async function deleteLaborRateOverride(
  userId: string,
  trade: TradeType
): Promise<void> {
  const docRef = doc(getLaborRatesCollection(userId), trade);
  await deleteDoc(docRef);
}

/**
 * Subscribe to labor rate overrides
 */
export function subscribeToLaborRateOverrides(
  userId: string,
  callback: (rates: LaborRateOverride[]) => void
): Unsubscribe {
  const colRef = getLaborRatesCollection(userId);
  return onSnapshot(colRef, (snapshot) => {
    const rates = snapshot.docs.map((doc) => doc.data() as LaborRateOverride);
    callback(rates);
  });
}

// =============================================================================
// MATERIAL OPERATIONS
// =============================================================================

/**
 * Get all contractor materials
 */
export async function getContractorMaterials(
  userId: string
): Promise<ContractorMaterial[]> {
  const colRef = getMaterialsCollection(userId);
  const q = query(colRef, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as ContractorMaterial)
  );
}

/**
 * Get materials by category
 */
export async function getContractorMaterialsByCategory(
  userId: string,
  category: string
): Promise<ContractorMaterial[]> {
  const colRef = getMaterialsCollection(userId);
  const q = query(colRef, where('category', '==', category), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as ContractorMaterial)
  );
}

/**
 * Get a single material
 */
export async function getContractorMaterial(
  userId: string,
  materialId: string
): Promise<ContractorMaterial | null> {
  const docRef = doc(getMaterialsCollection(userId), materialId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as ContractorMaterial;
  }
  return null;
}

/**
 * Create a new material
 */
export async function createContractorMaterial(
  userId: string,
  material: Omit<ContractorMaterial, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const colRef = getMaterialsCollection(userId);
  const newDocRef = doc(colRef);
  const now = Date.now();

  await setDoc(newDocRef, {
    ...material,
    createdAt: now,
    updatedAt: now,
  });

  return newDocRef.id;
}

/**
 * Update a material
 */
export async function updateContractorMaterial(
  userId: string,
  materialId: string,
  updates: Partial<ContractorMaterial>
): Promise<void> {
  const docRef = doc(getMaterialsCollection(userId), materialId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a material
 */
export async function deleteContractorMaterial(
  userId: string,
  materialId: string
): Promise<void> {
  const docRef = doc(getMaterialsCollection(userId), materialId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to contractor materials
 */
export function subscribeToContractorMaterials(
  userId: string,
  callback: (materials: ContractorMaterial[]) => void
): Unsubscribe {
  const colRef = getMaterialsCollection(userId);
  const q = query(colRef, orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const materials = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as ContractorMaterial)
    );
    callback(materials);
  });
}

// =============================================================================
// SUPPLIER OPERATIONS
// =============================================================================

/**
 * Get all suppliers
 */
export async function getSuppliers(userId: string): Promise<Supplier[]> {
  const colRef = getSuppliersCollection(userId);
  const q = query(colRef, orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Supplier));
}

/**
 * Get a single supplier
 */
export async function getSupplier(
  userId: string,
  supplierId: string
): Promise<Supplier | null> {
  const docRef = doc(getSuppliersCollection(userId), supplierId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Supplier;
  }
  return null;
}

/**
 * Create a new supplier
 */
export async function createSupplier(
  userId: string,
  supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const colRef = getSuppliersCollection(userId);
  const newDocRef = doc(colRef);
  const now = Date.now();

  await setDoc(newDocRef, {
    ...supplier,
    createdAt: now,
    updatedAt: now,
  });

  return newDocRef.id;
}

/**
 * Update a supplier
 */
export async function updateSupplier(
  userId: string,
  supplierId: string,
  updates: Partial<Supplier>
): Promise<void> {
  const docRef = doc(getSuppliersCollection(userId), supplierId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Date.now(),
  });
}

/**
 * Delete a supplier
 */
export async function deleteSupplier(
  userId: string,
  supplierId: string
): Promise<void> {
  const docRef = doc(getSuppliersCollection(userId), supplierId);
  await deleteDoc(docRef);
}

/**
 * Subscribe to suppliers
 */
export function subscribeToSuppliers(
  userId: string,
  callback: (suppliers: Supplier[]) => void
): Unsubscribe {
  const colRef = getSuppliersCollection(userId);
  const q = query(colRef, orderBy('name'));
  return onSnapshot(q, (snapshot) => {
    const suppliers = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as Supplier)
    );
    callback(suppliers);
  });
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/**
 * Load all contractor settings at once
 */
export async function loadAllContractorSettings(userId: string): Promise<{
  profile: ContractorProfile | null;
  crews: CrewTemplate[];
  laborRates: LaborRateOverride[];
  materials: ContractorMaterial[];
  suppliers: Supplier[];
}> {
  const [profile, crews, laborRates, materials, suppliers] = await Promise.all([
    getContractorProfile(userId),
    getCrewTemplates(userId),
    getLaborRateOverrides(userId),
    getContractorMaterials(userId),
    getSuppliers(userId),
  ]);

  return { profile, crews, laborRates, materials, suppliers };
}
