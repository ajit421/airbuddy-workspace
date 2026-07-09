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
  'Drafting':        30,
  'Internal Review': 50,
  'Filed':           70,
  'Under Review':    85,
  'Granted':        100,
  'Rejected':         0,
};

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

  /** Returns the progress percentage (0–100) for a given filing stage string. */
  const getPatentProgress = (filingStage) =>
    FILING_STAGE_PROGRESS[filingStage] ?? 0;

  // ── Computed / derived values (memoised) ───────────────────────────────────
  const totalIndustries = useMemo(() => industries.length, [industries]);
  const totalClients    = useMemo(() => clients.length,    [clients]);
  const totalProducts   = useMemo(() => products.length,   [products]);

  const totalLaunched  = useMemo(
    () => sales.filter((s) => s.launched === true).length,
    [sales]
  );
  const totalUnitsSold = useMemo(
    () => sales.reduce((sum, s) => sum + (Number(s.unitsSold) || 0), 0),
    [sales]
  );

  const totalPatentsFiled = useMemo(
    () => patents.filter((p) => p.filingStage === 'Filed' || p.filingStage === 'Granted').length,
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
    getPatentProgress,

    // Computed values
    totalIndustries,
    totalClients,
    totalProducts,
    totalLaunched,
    totalUnitsSold,
    totalPatentsFiled,
    totalPatentsInFiling,
  };

  return <KpiContext.Provider value={value}>{children}</KpiContext.Provider>;
};

// ─── Consumer hook ────────────────────────────────────────────────────────────
export const useKpi = () => {
  const ctx = useContext(KpiContext);
  if (!ctx) throw new Error('useKpi must be used within KpiProvider');
  return ctx;
};
