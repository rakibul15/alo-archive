import { describe, expect, it } from 'vitest';
import { findInvalidFilterParams } from './invalid-filter-params';

const params = (query: string) => new URLSearchParams(query);

describe('findInvalidFilterParams', () => {
  it('finds nothing wrong with an empty or all-valid query', () => {
    expect(findInvalidFilterParams(params(''))).toEqual([]);
    expect(
      findInvalidFilterParams(params('status=failed&sort=confidence&dir=asc')),
    ).toEqual([]);
  });

  it('flags a status that does not exist', () => {
    // The exact case QA found: ?status=garbage silently returned the whole
    // unfiltered archive with no sign the filter was ignored.
    expect(findInvalidFilterParams(params('status=garbage'))).toEqual([
      'status',
    ]);
  });

  it('is case-sensitive, catching the obvious capitalisation mistake', () => {
    expect(findInvalidFilterParams(params('status=Failed'))).toEqual([
      'status',
    ]);
  });

  it('flags a comma list if any one entry is bad, not just all-bad lists', () => {
    expect(
      findInvalidFilterParams(params('status=failed,not_a_status')),
    ).toEqual(['status']);
  });

  it('never flags q — free text has no invalid values', () => {
    expect(
      findInvalidFilterParams(params('q=<script>alert(1)</script>')),
    ).toEqual([]);
  });

  it('reports every bad key when several are wrong at once', () => {
    const result = findInvalidFilterParams(
      params('status=nope&sort=sideways&dir=up'),
    );
    expect(result).toEqual(['status', 'sort', 'dir']);
  });

  it('ignores a key that is simply absent', () => {
    expect(findInvalidFilterParams(params('q=kurigram'))).toEqual([]);
  });
});
