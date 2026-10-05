import { describe, it, expect, vi } from 'vitest';
import {
  FirestoreClient, arrayUnion, buildWhere, createWrite, decodeDocument, decodeValue,
  encodeValue, serverTimestamp, updateWrite,
} from './firestore.js';

describe('value codec', () => {
  it('round-trips the shapes WorkSpace documents use', () => {
    const value = {
      title: 'Wing test',
      progress: 40,
      ratio: 0.5,
      done: false,
      note: null,
      dueDate: new Date('2026-10-20T00:00:00.000Z'),
      assignedTo: ['u1', 'u2'],
      workPartners: [{ uid: 'u3', name: 'Ajit', addedAt: '2026-10-05T10:00:00.000Z' }],
    };
    expect(decodeValue(encodeValue(value))).toEqual(value);
  });

  it('writes integers as integerValue so they compare equal to web-SDK writes', () => {
    expect(encodeValue(40)).toEqual({ integerValue: '40' });
    expect(encodeValue(0.5)).toEqual({ doubleValue: 0.5 });
  });

  it('drops undefined keys rather than writing null (they would count in affectedKeys)', () => {
    expect(encodeValue({ a: 1, b: undefined })).toEqual({ mapValue: { fields: { a: { integerValue: '1' } } } });
  });
});

describe('write builders', () => {
  it('updateWrite masks exactly the fields passed — what rules see as affectedKeys()', () => {
    const w = updateWrite('projects/p/databases/(default)/documents/roadmapNodes/n1',
      { progress: 50, status: 'in-progress', updatedBy: 'u1' },
      { transforms: [serverTimestamp('updatedAt')] });
    expect(w.updateMask.fieldPaths).toEqual(['progress', 'status', 'updatedBy']);
    expect(w.updateTransforms).toEqual([{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]);
    expect(w.currentDocument).toEqual({ exists: true });
  });

  it('a transform-only update has an empty mask, so only the transformed fields change', () => {
    const w = updateWrite('x/tasks/t1', {}, { transforms: [arrayUnion('workPartnerUids', 'u9')] });
    expect(w.updateMask.fieldPaths).toEqual([]);
    expect(w.updateTransforms[0].appendMissingElements.values).toEqual([{ stringValue: 'u9' }]);
  });

  it('uses updateTime as the precondition for read-modify-write', () => {
    expect(updateWrite('d', { todos: [] }, { updateTime: 'T' }).currentDocument).toEqual({ updateTime: 'T' });
  });

  it('createWrite refuses to overwrite an existing doc', () => {
    expect(createWrite('d', { a: 1 }).currentDocument).toEqual({ exists: false });
  });
});

describe('buildWhere', () => {
  it('builds single and composite filters', () => {
    expect(buildWhere([['assignedTo', 'array-contains', 'u1']])).toEqual({
      fieldFilter: { field: { fieldPath: 'assignedTo' }, op: 'ARRAY_CONTAINS', value: { stringValue: 'u1' } },
    });
    const composite = buildWhere([['parentId', '==', null], ['isArchived', '==', false]]).compositeFilter.filters;
    expect(composite).toHaveLength(2);
    // == null must be a unaryFilter; a fieldFilter with nullValue matches nothing.
    expect(composite[0]).toEqual({ unaryFilter: { field: { fieldPath: 'parentId' }, op: 'IS_NULL' } });
  });
});

describe('decodeDocument', () => {
  it('keeps id, path and updateTime', () => {
    const d = decodeDocument({
      name: 'projects/p/databases/(default)/documents/roadmapNodes/n1/comments/c1',
      updateTime: '2026-10-05T00:00:00Z',
      fields: { text: { stringValue: 'hi' } },
    });
    expect(d).toEqual({ id: 'c1', _path: 'roadmapNodes/n1/comments/c1', _updateTime: '2026-10-05T00:00:00Z', text: 'hi' });
  });
});

describe('FirestoreClient', () => {
  const client = (response) => {
    const fetch = vi.fn(async () => response);
    return { fetch, db: new FirestoreClient({ projectId: 'p', getIdToken: async () => 'TOKEN', fetch }) };
  };
  const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

  it('sends the user\'s ID token, never anything else', async () => {
    const { fetch, db } = client(res(200, { name: 'projects/p/databases/(default)/documents/tasks/t', fields: {} }));
    await db.get('tasks/t');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer TOKEN');
  });

  it('returns null for NOT_FOUND and throws PERMISSION_DENIED with its status', async () => {
    expect(await client(res(404, { error: { status: 'NOT_FOUND', message: 'x' } })).db.get('a/b')).toBeNull();
    await expect(client(res(403, { error: { status: 'PERMISSION_DENIED', message: 'no' } })).db.get('a/b'))
      .rejects.toMatchObject({ status: 'PERMISSION_DENIED' });
  });

  it('queries a subcollection under its parent document', async () => {
    const { fetch, db } = client(res(200, [{ readTime: 'x' }]));
    expect(await db.query({ parent: 'roadmapNodes/n1', collection: 'events', orderBy: [['createdAt', 'desc']], limit: 5 })).toEqual([]);
    expect(fetch.mock.calls[0][0]).toMatch(/documents\/roadmapNodes\/n1:runQuery$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body).structuredQuery.orderBy[0].direction).toBe('DESCENDING');
  });
});
