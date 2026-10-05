export const reviewMergeWarnings = {
  knowledge: '部分关键点的合并说明不完整，已保留原始独立条目及出处。',
  methods: '部分方法的合并说明不完整，已保留原始独立条目及出处。',
};
export const isReviewMergeWarning = (warning: string) =>
  Object.values(reviewMergeWarnings).includes(warning);
