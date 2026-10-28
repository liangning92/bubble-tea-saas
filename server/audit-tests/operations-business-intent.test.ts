import { test, expect } from '@jest/globals';
import {
  normalizeMarketingIntent,
  verifyTrainingAssessment,
} from '../src/services/teamAgentBridge/employeeOperationalEvidence';
test('a vague campaign cannot silently become a 10 or 20 percent promotion', () => {
  expect(() => normalizeMarketingIntent({ action: 'create_campaign', name: 'Weekend' })).toThrow(
    'EXPLICIT_RULE',
  );
  expect(() =>
    normalizeMarketingIntent({ action: 'create_campaign', discountType: 'percent' }),
  ).toThrow('EXPLICIT_VALUE');
  expect(
    normalizeMarketingIntent({
      action: 'create_campaign',
      discountType: 'percent',
      discountValue: 15,
    }),
  ).toEqual({ action: 'create_discount_rule', discountType: 'percent', discountValue: 15 });
  expect(() =>
    normalizeMarketingIntent({
      action: 'create_discount_rule',
      discountType: 'percent',
      discountValue: 120,
    }),
  ).toThrow('EXPLICIT_VALUE');
});
const scope = { channelId: 'owner-room', requesterStaffId: 'owner' },
  training = {
    id: 'training',
    title: 'Bar hygiene',
    startDate: new Date('2026-10-28'),
    createdAt: new Date('2026-10-27'),
    staff: { name: 'Najwa' },
  },
  args = {
    action: 'record_result',
    trainingId: 'training',
    evidenceMessageSeq: 3,
    score: 85,
    passed: true,
    status: 'completed',
  };
const fact = (text: string, authorStaffId = 'owner', channelId = 'owner-room') => [
  {
    source: { kind: 'conversation', channelId, seq: 3, messageId: 'native-message' },
    value: {
      authorStaffId,
      text: 'Bar hygiene 2026-10-28: ' + text,
      createdAt: '2026-10-28T12:00:00+07:00',
    },
  },
];
test('training completion binds an actual human assessment, target, exact score and explicit verdict', () => {
  expect(
    verifyTrainingAssessment(args, training, scope, fact('Najwa: nilai 85, lulus.')),
  ).toMatchObject({ kind: 'native_human_assessment', messageId: 'native-message', seq: 3 });
  for (const facts of [
    [],
    fact('Najwa nilai 85, lulus', 'agent:hermes'),
    fact('Najwa nilai 85, lulus', 'owner', 'another-room'),
    fact('Rangga nilai 85, lulus'),
    fact('Najwa nilai 80, lulus'),
    fact('Najwa nilai 85, belum lulus'),
    fact('Najwa nilai 85'),
  ])
    expect(() => verifyTrainingAssessment(args, training, scope, facts)).toThrow('ASSESSMENT');
  expect(() =>
    verifyTrainingAssessment(
      { ...args, notes: 'privileged internal prose' },
      training,
      scope,
      fact('Najwa nilai 85 lulus'),
    ),
  ).toThrow('SOURCE_REQUIRED');
});

test('another employee score and an absent explicit verdict are not assessment evidence', () => {
  const r = { ...training, staff: { name: 'Rangga' } };
  expect(() =>
    verifyTrainingAssessment(
      { ...args, score: 90, passed: false },
      r,
      scope,
      fact('Rangga 40 tidak lulus. Najwa 90 lulus.'),
    ),
  ).toThrow('SCORE_NOT_CONFIRMED');
  expect(() =>
    verifyTrainingAssessment(
      { ...args, score: 80, passed: undefined },
      r,
      scope,
      fact('Rangga 80'),
    ),
  ).toThrow('VERDICT_NOT_CONFIRMED');
});

test('another course, another training date or a pre-training message cannot close this training', () => {
  const base = fact('Najwa nilai 85 lulus');
  for (const modified of [
    base.map((x) => ({
      ...x,
      value: { ...x.value, text: 'Another course 2026-10-28 Najwa 85 lulus' },
    })),
    base.map((x) => ({
      ...x,
      value: { ...x.value, text: 'Bar hygiene 2026-10-27 Najwa 85 lulus' },
    })),
    base.map((x) => ({ ...x, value: { ...x.value, createdAt: '2026-10-20T00:00:00Z' } })),
  ])
    expect(() => verifyTrainingAssessment(args, training, scope, modified)).toThrow('ASSESSMENT');
});

test('course title words are not assessment verdicts and Indonesian date casing is harmless', () => {
  const r = { ...training, staff: { name: 'Rangga' }, title: 'Cara Lulus Pelayanan' },
    f = fact('ignored');
  f[0].value.text = 'Rangga Cara Lulus Pelayanan 2026-10-28 nilai 85';
  expect(() => verifyTrainingAssessment(args, r, scope, f)).toThrow('VERDICT_NOT_CONFIRMED');
  const valid = { ...r, title: 'SOP Pelayanan' };
  f[0].value.text = 'Rangga SOP Pelayanan 28 oktober 2026 nilai 85, lulus';
  expect(verifyTrainingAssessment(args, valid, scope, f)).toMatchObject({
    trainingId: 'training',
    trainingDate: '2026-10-28',
  });
});
test('an assessment question or hypothetical is not a confirmed human grading statement', () => {
  for (const suffix of ['Apakah Najwa nilai 85 lulus?', 'Jika Najwa nilai 85 lulus'])
    expect(() => verifyTrainingAssessment(args, training, scope, fact(suffix))).toThrow(
      'STATEMENT_REQUIRED',
    );
});
