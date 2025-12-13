# Mock Data & Integration Guide

The frontend is UI-complete with mock data. This guide lists mock/stub areas and how to integrate with backend (Firebase/Cloud Functions).

## 1) Auth (Login/Signup)
- **Current:** Google OAuth works. Email/password UI disabled.
- **Files:** `src/pages/Login.tsx`, `src/pages/Signup.tsx`
- **Integrate:** Use `createUserWithEmailAndPassword`, `updateProfile`, then navigate to `/dashboard`.

## 2) Account Settings
- **Current:** Save shows alert; no persistence.
- **File:** `src/pages/Account.tsx`
- **Integrate:** Update Firebase Auth displayName + Firestore `users/{uid}` doc (name, company, region, currency). Load doc on mount; save with `setDoc(..., { merge: true })`.

## 3) New Estimate
- **Current:** Creates mock ID `est-${Date.now()}` and navigates.
- **File:** `src/pages/estimate/NewEstimate.tsx`
- **Integrate:** `addDoc(collection(db, 'estimates'), {...})`, then navigate to `/estimate/{id}/plan`.

## 4) File Upload (Plan)
- **Current:** Stores file in component state only.
- **Files:** `src/pages/estimate/PlanView.tsx`, `src/components/estimate/FileUploadZone.tsx`
- **Integrate:** Upload to Firebase Storage via `uploadBytesResumable`; save download URL + metadata to Firestore `estimates/{id}.planFile`.

## 5) Chat Panel
- **Current:** Mock agent reply after 1.5s.
- **File:** `src/components/estimate/ChatPanel.tsx`
- **Integrate:** Call Cloud Function `/api/chat` with `{ estimateId, message, conversationHistory }`; push agent reply into state.

## 6) CAD Data Table
- **Current:** Static mock rows.
- **File:** `src/components/estimate/CADDataTable.tsx`
- **Integrate:** Store `extractedQuantities` in Firestore. Subscribe with `onSnapshot(doc(db, 'estimates', id))`. Add edit action to update array in Firestore.

## 7) Final Estimate Data
- **Current:** Mock base cost, margin/overhead client-calculated; PDF stub.
- **File:** `src/pages/estimate/FinalView.tsx`
- **Integrate:** Load estimate doc (total, breakdown, confidence). Persist margin/overhead to Firestore. Call Cloud Function `/api/generate-pdf/{id}`; download blob.

## 8) Signup/Login Redirects
- **Current:** Works with mock flow; ensure real auth still redirects to `/dashboard`.

## Backend APIs (Cloud Functions)
- `POST /api/chat` → `{ response: string }`
- `POST /api/extract-cad` → `{ quantities: CADItem[] }`
- `POST /api/generate-estimate` → `{ estimate: EstimateData }`
- `POST /api/generate-pdf/:id` → PDF blob (auth required)

## Firestore Schema (proposed)
```
users/{uid}:
  name, email, company, defaultRegion, currency, createdAt, updatedAt

estimates/{estimateId}:
  name, location, type, size, ownerId, status
  planFile { name, size, type, url, uploadedAt }
  extractedQuantities: CADItem[]
  chatHistory: Message[]
  breakdown: { materials, labor, equipment }
  margin, overhead, totalCost, confidenceRanges { p50,p80,p90 }
  createdAt, updatedAt
```

## Migration Checklist
- [ ] Cloud Functions deployed for chat, CAD extract, estimate, PDF.
- [ ] Storage upload wired; progress handled.
- [ ] Firestore security rules for `estimates` & `users`.
- [ ] Account page reads/writes Firestore.
- [ ] NewEstimate creates Firestore doc.
- [ ] Plan upload saves file + URL.
- [ ] Chat calls backend.
- [ ] CAD table reads from Firestore.
- [ ] FinalView loads Firestore data, persists margin/overhead.
- [ ] PDF download calls backend.
- [ ] Remove mock IDs and alerts; handle real errors.

## Testing (UI-first)
```bash
npm run dev
# Flows work with mock data:
# - Login (Google)
# - New estimate (mock ID)
# - Upload (UI)
# - Chat (mock)
# - Final estimate (mock)
# - PDF button (alert stub)
```

