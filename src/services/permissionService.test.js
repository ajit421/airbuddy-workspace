import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}` })),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('./firebase', () => ({ db: {} }));

const { updateDoc } = await import('firebase/firestore');
const { updateUserPermissions, normalizePermissions } = await import('./permissionService');
const { PERMISSION_KEYS } = await import('../utils/permissionCatalog');

describe('normalizePermissions', () => {
  it('returns every catalog key, false by default', () => {
    const out = normalizePermissions(undefined);
    expect(Object.keys(out).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(Object.values(out).every((v) => v === false)).toBe(true);
  });

  it('keeps literal true, drops unknown keys and truthy non-booleans', () => {
    const out = normalizePermissions({ 'hrms.directory': true, 'kpi.edit': 'yes', 'old.key': true });
    expect(out['hrms.directory']).toBe(true);
    expect(out['kpi.edit']).toBe(false);
    expect('old.key' in out).toBe(false);
  });
});

describe('updateUserPermissions', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('writes the complete map plus who changed it and when', async () => {
    await updateUserPermissions('u1', { 'hrms.directory': true }, 'admin1');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = updateDoc.mock.calls[0];
    expect(ref.path).toBe('users/u1');
    expect(Object.keys(payload).sort()).toEqual(['permissions', 'permissionsUpdatedAt', 'permissionsUpdatedBy']);
    expect(payload.permissionsUpdatedBy).toBe('admin1');
    expect(payload.permissionsUpdatedAt).toBe('SERVER_TS');
    expect(Object.keys(payload.permissions)).toHaveLength(PERMISSION_KEYS.length);
    expect(payload.permissions['hrms.directory']).toBe(true);
  });

  it('never writes role or any other profile field', async () => {
    await updateUserPermissions('u1', { role: 'admin', 'hrms.directory': true }, 'admin1');
    const [, payload] = updateDoc.mock.calls[0];
    expect('role' in payload).toBe(false);
    expect('role' in payload.permissions).toBe(false);
  });

  it('rejects a missing uid or adminUid without writing', async () => {
    await expect(updateUserPermissions('', {}, 'admin1')).rejects.toThrow();
    await expect(updateUserPermissions('u1', {}, '')).rejects.toThrow();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
