import { expect, it } from 'vitest';
import { invalidReviewIndexes } from '../../shared/src/ai/review-indexes';
it('区分同组重复、跨组重复和越界，不把字幕编号猜成候选索引', () => {
  expect(invalidReviewIndexes(2, [{ indexes: [0, 0] }])).toEqual({
    duplicates: 1,
    invalid: 0,
    rejected: true,
  });
  expect(
    invalidReviewIndexes(2, [{ indexes: [0, 1] }, { indexes: [1] }]),
  ).toEqual({ duplicates: 1, invalid: 0, rejected: true });
  expect(invalidReviewIndexes(2, [{ indexes: [0, 99] }])).toEqual({
    duplicates: 0,
    invalid: 1,
    rejected: true,
  });
  expect(
    invalidReviewIndexes(2, [{ indexes: [1] }, { indexes: [0] }]).rejected,
  ).toBe(false);
});
