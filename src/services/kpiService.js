/**
 * kpiService.js
 * Data access layer for the KPI (Key Performance Indicators) module.
 * All reads/writes go through the shared `db` instance from firebase.js.
 *
 * Rules:
 *  - No `orderBy()` in any Firestore query — sort client-side in subscribe callbacks.
 *  - Every write includes serverTimestamp() for createdAt / updatedAt.
 *  - All async bodies are wrapped in try/catch; errors are logged and re-thrown.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Collection name constants ────────────────────────────────────────────────
const KPI_INDUSTRIES = 'kpi_industries';
const KPI_CLIENTS    = 'kpi_clients';
const KPI_PRODUCTS   = 'kpi_products';
const KPI_SALES      = 'kpi_sales';
const KPI_PATENTS    = 'kpi_patents';

// ─── Helper ───────────────────────────────────────────────────────────────────
/** Map a Firestore QuerySnapshot to a plain-JS array with `id` injected. */
const snapToArray = (snap) =>
  snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ══════════════════════════════════════════════════════════════════════════════
// INDUSTRIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Real-time listener for `kpi_industries`.
 * Sorts client-side by `name` (ascending) before invoking `onData`.
 * @returns {function} Firestore unsubscribe function.
 */
export function subscribeToKpiIndustries(onData, onError) {
  return onSnapshot(
    collection(db, KPI_INDUSTRIES),
    (snap) => {
      const list = snapToArray(snap).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      onData(list);
    },
    (err) => {
      console.error('[kpiService] subscribeToKpiIndustries failed:', err);
      onError?.(err);
    }
  );
}

/**
 * Add a new industry document.
 * @param {Object} data  { name, status, growthPercent }
 * @returns {Promise<string>} Auto-generated Firestore document ID.
 */
export async function addKpiIndustry(data) {
  try {
    const ref = await addDoc(collection(db, KPI_INDUSTRIES), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[kpiService] addKpiIndustry failed:', err);
    throw err;
  }
}

/**
 * Partially update an existing industry document.
 * @param {string} id   Firestore document ID.
 * @param {Object} data Partial fields to merge.
 */
export async function updateKpiIndustry(id, data) {
  try {
    await updateDoc(doc(db, KPI_INDUSTRIES, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[kpiService] updateKpiIndustry failed:', err);
    throw err;
  }
}

/**
 * Delete an industry document.
 * @param {string} id Firestore document ID.
 */
export async function deleteKpiIndustry(id) {
  try {
    await deleteDoc(doc(db, KPI_INDUSTRIES, id));
  } catch (err) {
    console.error('[kpiService] deleteKpiIndustry failed:', err);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Real-time listener for `kpi_clients`.
 * Sorts client-side by `name` (ascending).
 * @returns {function} Firestore unsubscribe function.
 */
export function subscribeToKpiClients(onData, onError) {
  return onSnapshot(
    collection(db, KPI_CLIENTS),
    (snap) => {
      const list = snapToArray(snap).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      onData(list);
    },
    (err) => {
      console.error('[kpiService] subscribeToKpiClients failed:', err);
      onError?.(err);
    }
  );
}

/**
 * Add a new client document.
 * @param {Object} data  { name, industryId, currentStatus, progressPercent }
 * @returns {Promise<string>} Auto-generated Firestore document ID.
 */
export async function addKpiClient(data) {
  try {
    const ref = await addDoc(collection(db, KPI_CLIENTS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[kpiService] addKpiClient failed:', err);
    throw err;
  }
}

/**
 * Partially update an existing client document.
 * @param {string} id   Firestore document ID.
 * @param {Object} data Partial fields to merge.
 */
export async function updateKpiClient(id, data) {
  try {
    await updateDoc(doc(db, KPI_CLIENTS, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[kpiService] updateKpiClient failed:', err);
    throw err;
  }
}

/**
 * Delete a client document.
 * @param {string} id Firestore document ID.
 */
export async function deleteKpiClient(id) {
  try {
    await deleteDoc(doc(db, KPI_CLIENTS, id));
  } catch (err) {
    console.error('[kpiService] deleteKpiClient failed:', err);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Real-time listener for `kpi_products`.
 * Sorts client-side by `name` (ascending).
 * @returns {function} Firestore unsubscribe function.
 */
export function subscribeToKpiProducts(onData, onError) {
  return onSnapshot(
    collection(db, KPI_PRODUCTS),
    (snap) => {
      const list = snapToArray(snap).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      onData(list);
    },
    (err) => {
      console.error('[kpiService] subscribeToKpiProducts failed:', err);
      onError?.(err);
    }
  );
}

/**
 * Add a new product document.
 * @param {Object} data  { name, type, devProgressPercent, devCompleted }
 * @returns {Promise<string>} Auto-generated Firestore document ID.
 */
export async function addKpiProduct(data) {
  try {
    const ref = await addDoc(collection(db, KPI_PRODUCTS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[kpiService] addKpiProduct failed:', err);
    throw err;
  }
}

/**
 * Partially update an existing product document.
 * @param {string} id   Firestore document ID.
 * @param {Object} data Partial fields to merge.
 */
export async function updateKpiProduct(id, data) {
  try {
    await updateDoc(doc(db, KPI_PRODUCTS, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[kpiService] updateKpiProduct failed:', err);
    throw err;
  }
}

/**
 * Delete a product document.
 * @param {string} id Firestore document ID.
 */
export async function deleteKpiProduct(id) {
  try {
    await deleteDoc(doc(db, KPI_PRODUCTS, id));
  } catch (err) {
    console.error('[kpiService] deleteKpiProduct failed:', err);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SALES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Real-time listener for `kpi_sales`.
 * Sorts client-side by `unitsSold` descending.
 * @returns {function} Firestore unsubscribe function.
 */
export function subscribeToKpiSales(onData, onError) {
  return onSnapshot(
    collection(db, KPI_SALES),
    (snap) => {
      const list = snapToArray(snap).sort(
        (a, b) => (b.unitsSold || 0) - (a.unitsSold || 0)
      );
      onData(list);
    },
    (err) => {
      console.error('[kpiService] subscribeToKpiSales failed:', err);
      onError?.(err);
    }
  );
}

/**
 * Add a new sales document.
 * @param {Object} data  { productId, unitsSold, salesProgressPercent, launched }
 * @returns {Promise<string>} Auto-generated Firestore document ID.
 */
export async function addKpiSale(data) {
  try {
    const ref = await addDoc(collection(db, KPI_SALES), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[kpiService] addKpiSale failed:', err);
    throw err;
  }
}

/**
 * Partially update an existing sales document.
 * @param {string} id   Firestore document ID.
 * @param {Object} data Partial fields to merge.
 */
export async function updateKpiSale(id, data) {
  try {
    await updateDoc(doc(db, KPI_SALES, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[kpiService] updateKpiSale failed:', err);
    throw err;
  }
}

/**
 * Delete a sales document.
 * @param {string} id Firestore document ID.
 */
export async function deleteKpiSale(id) {
  try {
    await deleteDoc(doc(db, KPI_SALES, id));
  } catch (err) {
    console.error('[kpiService] deleteKpiSale failed:', err);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PATENTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Real-time listener for `kpi_patents`.
 * Sorts client-side by `title` (ascending).
 * @returns {function} Firestore unsubscribe function.
 */
export function subscribeToKpiPatents(onData, onError) {
  return onSnapshot(
    collection(db, KPI_PATENTS),
    (snap) => {
      const list = snapToArray(snap).sort((a, b) =>
        (a.title || '').localeCompare(b.title || '')
      );
      onData(list);
    },
    (err) => {
      console.error('[kpiService] subscribeToKpiPatents failed:', err);
      onError?.(err);
    }
  );
}

/**
 * Add a new patent document.
 * @param {Object} data  { title, filingStage }
 * @returns {Promise<string>} Auto-generated Firestore document ID.
 */
export async function addKpiPatent(data) {
  try {
    const ref = await addDoc(collection(db, KPI_PATENTS), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[kpiService] addKpiPatent failed:', err);
    throw err;
  }
}

/**
 * Partially update an existing patent document.
 * @param {string} id   Firestore document ID.
 * @param {Object} data Partial fields to merge.
 */
export async function updateKpiPatent(id, data) {
  try {
    await updateDoc(doc(db, KPI_PATENTS, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[kpiService] updateKpiPatent failed:', err);
    throw err;
  }
}

/**
 * Delete a patent document.
 * @param {string} id Firestore document ID.
 */
export async function deleteKpiPatent(id) {
  try {
    await deleteDoc(doc(db, KPI_PATENTS, id));
  } catch (err) {
    console.error('[kpiService] deleteKpiPatent failed:', err);
    throw err;
  }
}
