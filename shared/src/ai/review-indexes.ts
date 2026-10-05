// 合并计划无效时整栏保留已核验原条目，不猜引用、不应用部分改写。
export function invalidReviewIndexes(
  length: number,
  groups: { indexes: number[] }[],
) {
  const seen = new Set<number>();
  let duplicates = 0,
    invalid = 0;
  for (const group of groups)
    for (const index of group.indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= length) invalid++;
      else if (seen.has(index)) duplicates++;
      seen.add(index);
    }
  return { duplicates, invalid, rejected: duplicates > 0 || invalid > 0 };
}
