/** Normalize explicit business intent. Missing discount data never becomes a default promotion. */
export function normalizeMarketingIntent<T extends Record<string, any>>(args: T): T {
  if (!['create_campaign', 'create_discount_rule'].includes(args.action)) return args;
  if (!['percent', 'fixed', 'bogo', 'second_half'].includes(args.discountType))
    throw Error('MARKETING_EXPLICIT_RULE_REQUIRED');
  if (
    ['percent', 'fixed'].includes(args.discountType) &&
    (!Number.isFinite(args.discountValue) ||
      args.discountValue <= 0 ||
      (args.discountType === 'percent' && args.discountValue > 100))
  )
    throw Error('MARKETING_EXPLICIT_VALUE_REQUIRED');
  return { ...args, action: 'create_discount_rule' };
}
export function structuredAssessment(args: any) {
  return (
    args?.action === 'record_result' &&
    Number.isInteger(args.evidenceMessageSeq) &&
    typeof args.trainingId === 'string' &&
    !args.notes
  );
}
/** The runtime supplies already admitted, freshly revalidated native conversation facts.
 * A model assertion is never a training assessment. Preserve the human's exact score/verdict.
 */
export function verifyTrainingAssessment(args: any, training: any, scope: any, sources: any[]) {
  if (!structuredAssessment(args)) throw Error('TRAINING_ASSESSMENT_SOURCE_REQUIRED');
  const fact = sources.find(
    (x) =>
      x.source?.kind === 'conversation' &&
      x.source.channelId === scope.channelId &&
      x.source.seq === args.evidenceMessageSeq &&
      x.value?.authorStaffId === scope.requesterStaffId,
  );
  const text = String(fact?.value?.text || ''),
    name = String(training.staff?.name || '');
  if (!fact || !name || !text.toLocaleLowerCase().includes(name.toLocaleLowerCase()))
    throw Error('TRAINING_ASSESSMENT_TARGET_NOT_CONFIRMED');

  const title = String(training.title || '');
  const day = new Date(training.startDate).toISOString().slice(0, 10);
  const [year, month, date] = day.split('-');
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  const dates = [
    day,
    `${Number(date)}/${Number(month)}/${year}`,
    `${date}/${month}/${year}`,
    `${Number(date)} ${months[Number(month) - 1]} ${year}`,
  ];
  const removeLiteral = (value: string, literal: string) => {
    const i = value.toLocaleLowerCase().indexOf(literal.toLocaleLowerCase());
    return i < 0 ? value : value.slice(0, i) + value.slice(i + literal.length);
  };
  const withoutCourse = removeLiteral(text, title);
  if (!withoutCourse.toLocaleLowerCase().includes(name.toLocaleLowerCase()))
    throw Error('TRAINING_ASSESSMENT_TARGET_NOT_CONFIRMED');
  const withoutName = removeLiteral(withoutCourse, name);
  const statedDate = dates.find((d) =>
    withoutName.toLocaleLowerCase().includes(d.toLocaleLowerCase()),
  );
  if (!title || !text.toLocaleLowerCase().includes(title.toLocaleLowerCase()) || !statedDate)
    throw Error('TRAINING_ASSESSMENT_COURSE_AND_DATE_REQUIRED');
  if (
    !fact.value.createdAt ||
    !training.createdAt ||
    Date.parse(fact.value.createdAt) < new Date(training.createdAt).getTime() ||
    !Number.isFinite(Date.parse(fact.value.createdAt))
  )
    throw Error('TRAINING_ASSESSMENT_OLD_SOURCE');
  const numericText = removeLiteral(withoutName, statedDate);
  if (
    /[?？]/.test(numericText) ||
    /\b(apakah|berapa|bagaimana|mungkin|jika|kalau|if)\b|是否|多少|猜测|假设|如果/i.test(
      numericText,
    )
  )
    throw Error('TRAINING_ASSESSMENT_STATEMENT_REQUIRED');
  const numbers = numericText.match(/\d+(?:\.\d+)?/g) || [];
  if (
    args.score !== undefined &&
    (!Number.isFinite(args.score) ||
      args.score < 0 ||
      args.score > 100 ||
      numbers.length !== 1 ||
      Number(numbers[0]) !== args.score)
  )
    throw Error('TRAINING_ASSESSMENT_SCORE_NOT_CONFIRMED');
  if (typeof args.passed !== 'boolean') throw Error('TRAINING_ASSESSMENT_VERDICT_NOT_CONFIRMED');
  const negativePattern =
    /(tidak\s+(?:lulus|lolos)|belum\s+lulus|未(?:合格|通过)|不合格|not\s+pass(?:ed)?|fail(?:ed)?)/gi;
  const positivePattern = /(\blulus\b|\blolos\b|考核合格|考核通过|\bpassed\b)/i;
  const negative = negativePattern.test(numericText);
  negativePattern.lastIndex = 0;
  const positive = positivePattern.test(numericText.replace(negativePattern, ''));
  if (
    (negative && positive) ||
    (args.passed === true && !positive) ||
    (args.passed === false && !negative) ||
    (args.status === 'completed' && args.passed !== true)
  )
    throw Error('TRAINING_ASSESSMENT_VERDICT_NOT_CONFIRMED');
  return {
    kind: 'native_human_assessment',
    channelId: scope.channelId,
    messageId: fact.source.messageId,
    seq: fact.source.seq,
    assessorStaffId: scope.requesterStaffId,
    trainingId: training.id,
    trainingDate: day,
  };
}
