/**
 * @jest-environment node
 */
import { it, expect, rs } from 'rstack/test';
import createFetchMock from '../src/index.js';

it('rejects with a dom exception', () => {
  const mock = createFetchMock(rs);
  mock.enableMocks();
  mock.mockAbort();
  expect(fetch('/')).rejects.toThrow(expect.any(DOMException));
  mock.disableMocks();
});
