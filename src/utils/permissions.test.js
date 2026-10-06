import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PERMISSION_GROUPS,
  PERMISSION_PRESETS,
  countGranted,
} from './permissionCatalog';

describe('hasPermission', () => {
  const employee = (permissions) => ({ uid: 'e1', role: 'employee', permissions });

  it('admin passes every key, including ones not in the catalog', () => {
    const admin = { uid: 'a1', role: 'admin' };
    for (const key of PERMISSION_KEYS) expect(hasPermission(admin, key)).toBe(true);
    expect(hasPermission(admin, 'not.a.key')).toBe(true);
  });

  it('no profile fails', () => {
    expect(hasPermission(null, 'hrms.directory')).toBe(false);
    expect(hasPermission(undefined, 'hrms.directory')).toBe(false);
  });

  it('employee with no permissions map fails', () => {
    expect(hasPermission(employee(undefined), 'hrms.directory')).toBe(false);
  });

  it('missing key fails', () => {
    expect(hasPermission(employee({ 'kpi.edit': true }), 'hrms.directory')).toBe(false);
  });

  it('false fails', () => {
    expect(hasPermission(employee({ 'hrms.directory': false }), 'hrms.directory')).toBe(false);
  });

  it('true passes', () => {
    expect(hasPermission(employee({ 'hrms.directory': true }), 'hrms.directory')).toBe(true);
  });

  it('only literal true passes — truthy strings do not', () => {
    expect(hasPermission(employee({ 'hrms.directory': 'true' }), 'hrms.directory')).toBe(false);
    expect(hasPermission(employee({ 'hrms.directory': 1 }), 'hrms.directory')).toBe(false);
  });

  it('unknown key fails for an employee', () => {
    expect(hasPermission(employee({ 'hrms.directory': true }), 'not.a.key')).toBe(false);
  });
});

describe('permissionCatalog', () => {
  it('keys are unique', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });

  it('every entry has a known group, a label and a description', () => {
    for (const p of PERMISSION_CATALOG) {
      expect(PERMISSION_GROUPS).toContain(p.group);
      expect(p.label).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it('keys are flat dotted strings firestore.rules can test with .get()', () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });

  it('no key grants the admin role itself', () => {
    expect(PERMISSION_KEYS).not.toContain('admin');
    expect(PERMISSION_KEYS.some((k) => /role/i.test(k))).toBe(false);
  });

  it('every preset only uses catalog keys', () => {
    for (const keys of Object.values(PERMISSION_PRESETS)) {
      for (const key of keys) expect(PERMISSION_KEYS).toContain(key);
    }
  });

  it('countGranted counts only true values for catalog keys', () => {
    expect(countGranted(undefined)).toBe(0);
    expect(countGranted({ 'hrms.directory': true, 'kpi.edit': false, 'old.key': true })).toBe(1);
  });
});
