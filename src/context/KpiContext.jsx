/**
 * KpiContext.jsx
 * Provides real-time KPI data to all KPI route panels.
 *
 * Usage:
 *   import { KpiProvider, useKpi } from './KpiContext';
 *
 * The Provider is mounted in App.jsx around the KPI route group, so the
 * five Firestore onSnapshot listeners are only active while the user is
 * on a KPI page — consistent with the project's existing scoping pattern.
 */

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  subscribeToKpiIndustries,
  subscribeToKpiClients,
  subscribeToKpiProducts,
  subscribeToKpiSales,
  subscribeToKpiPatents,
} from '../services/kpiService';

// ─── Filing stage → progress percent mapping (never stored in Firestore) ──────
export const FILING_STAGE_PROGRESS = {
  'Idea':            10,
  'Drafting':        25,
  'Internal Review': 40,
  'Filed':           55,
  'Published':       70,
  'RQ Filed':        80,
  'Under Examination': 90,
  'Granted':        100,
  'Rejected':         0,
};

// ─── Product development stage → progress percent mapping ────────────────────
export const DEV_STAGE_PROGRESS = {
  'Design':        25,
  'Testing':       50,
  'Iteration':     75,
  'Design Freeze': 100,
};

// ─── "Current" client statuses (anything not explicitly inactive/churned) ─────
const INACTIVE_STATUSES = new Set(['Inactive', 'Churned']);

// ─── Context ─────────────────────────────────────────────────────────────────
const KpiContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const KpiProvider = ({ children }) => {
  const [industries, setIndustries] = useState([]);
  const [clients,    setClients]    = useState([]);
  const [products,   setProducts]   = useState([]);
  const [sales,      setSales]      = useState([]);
  const [patents,    setPatents]    = useState([]);

  // Track how many of the 5 subscriptions have fired their first snapshot.
  // `loading` flips to false only once all 5 have delivered initial data.
  const [readyCount, setReadyCount] = useState(0);
  const loading = readyCount < 5;

  const markReady = () => setReadyCount((n) => n + 1);

  useEffect(() => {
    const unsubIndustries = subscribeToKpiIndustries(
      (data) => { setIndustries(data); markReady(); },
      (err)  => { console.error('[KpiContext] industries error:', err); markReady(); }
    );
    const unsubClients = subscribeToKpiClients(
      (data) => { setClients(data); markReady(); },
      (err)  => { console.error('[KpiContext] clients error:', err); markReady(); }
    );
    const unsubProducts = subscribeToKpiProducts(
      (data) => { setProducts(data); markReady(); },
      (err)  => { console.error('[KpiContext] products error:', err); markReady(); }
    );
    const unsubSales = subscribeToKpiSales(
      (data) => { setSales(data); markReady(); },
      (err)  => { console.error('[KpiContext] sales error:', err); markReady(); }
    );
    const unsubPatents = subscribeToKpiPatents(
      (data) => { setPatents(data); markReady(); },
      (err)  => { console.error('[KpiContext] patents error:', err); markReady(); }
    );

    return () => {
      unsubIndustries();
      unsubClients();
      unsubProducts();
      unsubSales();
      unsubPatents();
    };
  }, []); // mount once — subscriptions remain active for the lifetime of the Provider

  // ── Pure helper functions (zero Firestore calls) ───────────────────────────

  /** Returns all clients whose industryId matches the given industry doc ID. */
  const getClientsForIndustry = (industryId) =>
    clients.filter((c) => c.industryId === industryId);

  /** Returns the industry object for a given industryId, or null if not found. */
  const getIndustryForClient = (industryId) =>
    industries.find((i) => i.id === industryId) ?? null;

  /** Returns the product object for a given productId, or null if not found. */
  const getProductForSale = (productId) =>
    products.find((p) => p.id === productId) ?? null;

  /** Returns the client object for a given clientId, or null if not found. */
  const getClientForSale = (clientId) =>
    clients.find((c) => c.id === clientId) ?? null;

  /** Returns the progress percentage (0–100) for a given filing stage string. */
  const getPatentProgress = (filingStage) =>
    FILING_STAGE_PROGRESS[filingStage] ?? 0;

  /** Returns all products whose industryIds array includes the given industry id. */
  const getProductsForIndustry = (industryId) =>
    products.filter((p) => (p.industryIds || []).includes(industryId));

  /** Returns the count of sales entries linked to the given clientId. */
  const getSalesCountForClient = (clientId) =>
    sales.filter((s) => s.clientId === clientId).length;

  /** Returns the count of sales entries where type === "Paid Pilot" for the given clientId. */
  const getPaidPilotsCountForClient = (clientId) =>
    sales.filter((s) => s.clientId === clientId && s.type === 'Paid Pilot').length;

  // ── Computed / derived values (memoised) ───────────────────────────────────
  const totalIndustries = useMemo(() => industries.length, [industries]);
  const totalClients    = useMemo(() => clients.length,    [clients]);
  const totalProducts   = useMemo(() => products.length,   [products]);

  /** Clients whose status is not explicitly Inactive or Churned. */
  const currentClients = useMemo(
    () => clients.filter((c) => !INACTIVE_STATUSES.has(c.currentStatus)),
    [clients]
  );
  const totalCurrentClients = useMemo(() => currentClients.length, [currentClients]);

  const totalLaunched  = useMemo(
    () => sales.filter((s) => s.launched === true).length,
    [sales]
  );
  const totalUnitsSold = useMemo(
    () => sales.reduce((sum, s) => sum + (Number(s.unitsSold) || 0), 0),
    [sales]
  );

  /** Count of sale entries with type "B2B Sale". */
  const totalB2BSales = useMemo(
    () => sales.filter((s) => s.type === 'B2B Sale').length,
    [sales]
  );

  /** Count of sale entries with type "Paid Pilot". */
  const totalPaidPilots = useMemo(
    () => sales.filter((s) => s.type === 'Paid Pilot').length,
    [sales]
  );

  /** Count of products whose development stage is "Design Freeze" (fully finalized). */
  const totalDesignFreezeProducts = useMemo(
    () => products.filter((p) => p.stage === 'Design Freeze').length,
    [products]
  );

  const totalPatentsFiled = useMemo(
    () => patents.filter((p) =>
      p.filingStage === 'Filed' ||
      p.filingStage === 'Published' ||
      p.filingStage === 'RQ Filed' ||
      p.filingStage === 'Under Examination' ||
      p.filingStage === 'Granted' ||
      p.filingStage === 'Rejected'
    ).length,
    [patents]
  );
  const totalPatentsInFiling = useMemo(
    () => patents.filter((p) =>
      p.filingStage === 'Idea' ||
      p.filingStage === 'Drafting' ||
      p.filingStage === 'Internal Review'
    ).length,
    [patents]
  );

  // ── IP type breakdown counts ───────────────────────────────────────────────
  /** Count of IP entries with ipType "Patent" (or no ipType for legacy docs). */
  const totalIPPatents = useMemo(
    () => patents.filter((p) => !p.ipType || p.ipType === 'Patent').length,
    [patents]
  );
  /** Count of IP entries with ipType "Trademark". */
  const totalIPTrademarks = useMemo(
    () => patents.filter((p) => p.ipType === 'Trademark').length,
    [patents]
  );
  /** Count of IP entries with ipType "Software/Calculator". */
  const totalIPSoftware = useMemo(
    () => patents.filter((p) => p.ipType === 'Software/Calculator').length,
    [patents]
  );

  const value = {
    // Raw state
    industries,
    clients,
    products,
    sales,
    patents,
    loading,

    // Helper functions
    getClientsForIndustry,
    getIndustryForClient,
    getProductForSale,
    getClientForSale,
    getPatentProgress,
    getProductsForIndustry,
    getSalesCountForClient,
    getPaidPilotsCountForClient,

    // Computed values — Industries / Clients
    totalIndustries,
    totalClients,
    currentClients,
    totalCurrentClients,

    // Computed values — Products
    totalProducts,
    totalDesignFreezeProducts,

    // Computed values — Sales
    totalLaunched,
    totalUnitsSold,
    totalB2BSales,
    totalPaidPilots,

    // Computed values — IP / Patents
    totalPatentsFiled,
    totalPatentsInFiling,
    totalIPPatents,
    totalIPTrademarks,
    totalIPSoftware,
  };

  return <KpiContext.Provider value={value}>{children}</KpiContext.Provider>;
};

// ─── Consumer hook ────────────────────────────────────────────────────────────
export const useKpi = () => {
  const ctx = useContext(KpiContext);
  if (!ctx) throw new Error('useKpi must be used within KpiProvider');
  return ctx;
};
