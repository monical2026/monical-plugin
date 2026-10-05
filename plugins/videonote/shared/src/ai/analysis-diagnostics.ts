import { z } from 'zod';
export type AnalysisTrace = (
  stage: string,
  detail?: { count?: number; status?: number; characters?: number },
) => void;
const fields = new Set([
  'summary',
  'topics',
  'startId',
  'endId',
  'title',
  'introduction',
  'problem',
  'application',
  'keyPoints',
  'clipVerdict',
  'clipReason',
  'knowledge',
  'methods',
  'indexes',
  'understanding',
  'role',
  'applicability',
  'steps',
  'limitations',
  'prerequisites',
  'quotes',
  'index',
  'excerpt',
  'chinese',
  'description',
  'origin',
]);
function valueType(value: unknown, nested = false): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && !nested) {
    const entries = Object.entries(value);
    const known = entries
      .filter(([key]) => fields.has(key))
      .slice(0, 8)
      .map(([key, child]) => `${key}:${valueType(child, true)}`);
    const unknownCount = entries.filter(([key]) => !fields.has(key)).length;
    return `object{${known.join(',')}${unknownCount ? `; unknownFields=${unknownCount}` : ''}}`;
  }
  return typeof value;
}
export class AnalysisReviewError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
  }
}
export class AnalysisPlanFormatError extends Error {
  constructor(
    public readonly issues: string[],
    stage: string,
  ) {
    super(
      `${stage}格式不完整：${issues.join('；')}。已有结果未覆盖，请复制诊断。`,
    );
  }
}
export function parseReviewPlan<T>(
  schema: z.ZodType<T>,
  input: unknown,
  stage: string,
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 8).map((issue) => {
    let value: unknown = input;
    for (const part of issue.path) {
      value =
        value && typeof value === 'object'
          ? Reflect.get(value, part)
          : undefined;
    }
    const path = issue.path
      .map((part) =>
        typeof part === 'number'
          ? `[${part}]`
          : fields.has(String(part))
            ? String(part)
            : '?',
      )
      .join('.');
    const expected = 'expected' in issue ? String(issue.expected) : issue.code;
    // 不记录 Zod message/input，避免模型正文或凭据进入诊断。
    return `${path || '(root)'}: expected=${expected}, actual=${valueType(value)}`;
  });
  throw new AnalysisPlanFormatError(issues, stage);
}
