// 仅把能唯一指回原条目的对象还原为索引；不采纳模型改写的正文。
type Prerequisite = { title: string; description: string; origin: string };
function reference(value: unknown, items: Prerequisite[]): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const row = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(row).some(
      (key) => !['index', 'title', 'description', 'origin'].includes(key),
    )
  )
    return value;
  const same = (item: Prerequisite) =>
    (['title', 'description', 'origin'] as const).every(
      (key) => row[key] === undefined || row[key] === item[key],
    );
  if ('index' in row) {
    const index = row.index;
    return typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      items[index] &&
      same(items[index])
      ? index
      : value;
  }
  if (
    !['title', 'description', 'origin'].every(
      (key) => typeof row[key] === 'string',
    )
  )
    return value;
  const matches = items.flatMap((item, index) => (same(item) ? [index] : []));
  return matches.length === 1 ? matches[0] : value;
}
export function normalizeReviewPrerequisites(
  input: unknown,
  items: Prerequisite[],
): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const row = Object.fromEntries(Object.entries(input));
  if (!Array.isArray(row.prerequisites)) return input;
  return {
    ...row,
    prerequisites: row.prerequisites.map((value) => reference(value, items)),
  };
}
