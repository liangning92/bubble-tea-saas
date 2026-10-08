import { z } from 'zod'
import catalogue from '../data/training-library.json'

const text = z.object({ zh: z.string().min(1).max(20000), id: z.string().min(1).max(20000), en: z.string().max(20000).optional() }).strict()
const section = z.object({ key: z.string().max(128).optional(), videoId: z.string().uuid().optional(), documentId: z.string().uuid().optional(), title: text, points: z.array(text).max(200), tip: text.optional(), warning: text.optional(), errors: z.array(text).max(200).optional(), practice: text.optional(), checklist: z.array(text).max(200).optional() }).strict()
export const trainingCatalogueSchema = z.object({
  version: z.literal(1),
  modules: z.array(z.object({
    key: z.string().max(128).regex(/^[a-z0-9-]+$/), reviewed: z.boolean(),
    title: text, subtitle: text, minutes: z.number().int().positive(),
    sections: z.array(section).min(1).max(100),
    quiz: z.array(z.object({ key: z.string().max(128).optional(), q: text, options: z.array(text).min(2).max(20), answer: z.number().int().nonnegative(), explanation: text }).strict().refine(q => q.answer < q.options.length)).max(200),
    practical: z.array(text).max(200),
    sources: z.array(z.object({ title: z.string().max(20000), url: z.string().max(2048).url().startsWith('https://') }).strict()).max(200)
  }).strict().refine(m => [m.sections, m.quiz].every(items => { const keys = items.map(item => item.key).filter(Boolean); return new Set(keys).size === keys.length }), 'Duplicate item keys')).max(100),
  assessment: z.object({ reviewed: z.boolean(), title: text, instructions: z.array(text).max(200), rows: z.array(z.object({key: z.string().max(128), station: text, scenario: text, action: text, evidence: text, result: text, critical: text}).strict()).max(200) }).strict().optional(),
  standardsToConfirm: z.array(text).max(200).optional()
}).strict().refine(c => new Set(c.modules.map(m => m.key)).size === c.modules.length, 'Duplicate module keys').refine(c => !c.assessment || c.assessment.rows.every(row => c.modules.some(module => module.key === row.key)), 'Unknown assessment module')

export function getTrainingLibrary() {
  const parsed = trainingCatalogueSchema.parse(catalogue)
  const preview = ['development', 'test'].includes(process.env.NODE_ENV || '') && process.env.TRAINING_LIBRARY_PREVIEW === 'true'
  const modules = parsed.modules.filter(module => module.reviewed || preview)
  const assessment = parsed.assessment && (preview || (parsed.assessment.reviewed && parsed.assessment.rows.every(row => modules.some(module => module.key === row.key)))) ? parsed.assessment : undefined
  return { version: parsed.version, preview, modules, assessment, standardsToConfirm: assessment ? parsed.standardsToConfirm : undefined }
}
