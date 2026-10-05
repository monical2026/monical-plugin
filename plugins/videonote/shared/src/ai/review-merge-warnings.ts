export const reviewMergeWarnings = {
  knowledgeIndexes:
    '关键点复核引用重复或越界，本次未应用关键点合并与筛选，已保留全部原条目及出处。',
  methodIndexes:
    '方法复核引用重复或越界，本次未应用方法合并与筛选，已保留全部原条目及出处。',
  knowledge: '部分关键点的合并说明不完整，已保留原始独立条目及出处。',
  methods: '部分方法的合并说明不完整，已保留原始独立条目及出处。',
};
export const isReviewMergeWarning = (warning: string) =>
  Object.values(reviewMergeWarnings).includes(warning);
