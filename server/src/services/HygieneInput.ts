import { z } from 'zod'

const text = z.string()
const optionalText = text.nullable().optional()
const identifier = text.nullable().optional()
const integer = z.number().finite().int()

// HTTP data is business input, never a Prisma update expression or relation.
export const hygieneAreaCreateBody = z.object({
  name: text.trim().min(1),
  code: text.regex(/^[a-zA-Z0-9_]+$/),
  icon: optionalText,
  color: optionalText,
  priority: integer.optional(),
  description: optionalText,
  managerId: identifier,
  isActive: z.boolean().optional(),
  sortOrder: integer.optional(),
}).strict()
export const hygieneAreaUpdateBody = hygieneAreaCreateBody.partial().strict()
export const hygieneAreaCreateInput = hygieneAreaCreateBody.extend({ storeId: text.min(1) }).strict()

const checklist = z.object({
  item: text.trim().min(1),
  description: optionalText,
  isRequired: z.boolean().optional(),
  // The existing form submits order; the service constructs order from the array.
  order: integer.optional(),
}).strict()

export const hygieneTemplateUpdateBody = z.object({
  areaCode: text.min(1).optional(),
  name: text.trim().min(1).optional(),
  description: optionalText,
  category: text.min(1).optional(),
  frequency: text.min(1).optional(),
  specificDays: z.array(integer).nullable().optional(),
  time: text.min(1).optional(),
  executionTimes: z.array(text).nullable().optional(),
  priority: integer.min(1).max(4).optional(),
  estimatedMinutes: integer.min(1).optional(),
  standardBefore: optionalText,
  standardDuring: optionalText,
  standardAfter: optionalText,
  toolsRequired: z.array(text).nullable().optional(),
  photoRequired: z.boolean().optional(),
  evidenceType: text.min(1).optional(),
  assignedType: text.min(1).optional(),
  shift: optionalText,
  staffId: identifier,
  staffIds: z.array(text.min(1)).nullable().optional(),
  areaManagerId: identifier,
  requiresApproval: z.boolean().optional(),
  alertMinutesBefore: integer.optional(),
  autoGenerate: z.boolean().optional(),
  regulationCode: optionalText,
  status: z.enum(['active', 'paused']).optional(),
  checklists: z.array(checklist).optional(),
}).strict()
export const hygieneTemplateCreateBody = hygieneTemplateUpdateBody.extend({
  areaCode: text.min(1), name: text.trim().min(1),
}).strict()
export const hygieneTemplateCreateInput = hygieneTemplateCreateBody.extend({ storeId: text.min(1) }).strict()

const json = (value: unknown) => value === undefined ? undefined : value === null ? null : JSON.stringify(value)

export function areaWriteData(input: z.infer<typeof hygieneAreaUpdateBody>) {
  return {
    name: input.name, code: input.code, icon: input.icon, color: input.color,
    priority: input.priority, description: input.description, managerId: input.managerId,
    isActive: input.isActive, sortOrder: input.sortOrder,
  }
}

export function templateWriteData(input: z.infer<typeof hygieneTemplateUpdateBody>) {
  return {
    areaCode: input.areaCode, name: input.name, description: input.description,
    category: input.category, frequency: input.frequency, time: input.time,
    priority: input.priority, estimatedMinutes: input.estimatedMinutes,
    standardBefore: input.standardBefore, standardDuring: input.standardDuring, standardAfter: input.standardAfter,
    toolsRequired: json(input.toolsRequired), specificDays: json(input.specificDays),
    executionTimes: json(input.executionTimes), staffIds: json(input.staffIds),
    photoRequired: input.photoRequired, evidenceType: input.evidenceType,
    assignedType: input.assignedType, shift: input.shift, staffId: input.staffId,
    areaManagerId: input.areaManagerId, requiresApproval: input.requiresApproval,
    alertMinutesBefore: input.alertMinutesBefore, autoGenerate: input.autoGenerate,
    regulationCode: input.regulationCode, status: input.status,
  }
}

export function checklistWriteData(input: z.infer<typeof checklist>, order: number) {
  return { item: input.item, description: input.description, isRequired: input.isRequired ?? true, order }
}
