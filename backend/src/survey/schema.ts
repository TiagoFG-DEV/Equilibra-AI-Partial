import { z } from 'zod';
export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const Focus = z.object({
 id: Id, version: z.string(), approved: z.boolean(), methodology: z.string(), privacyNotice: z.string().min(20),
 questions: z.array(z.object({ id: Id, theme: Id, text: z.string().min(1).max(1000), required: z.boolean(), source: z.string().min(1), format: z.enum(['number','text']), higherIsBetter: z.boolean().default(true) }).strict()).min(1).max(100)
}).strict().refine(f => new Set(f.questions.map(q => q.id)).size === f.questions.length && f.questions.some(q => q.required), 'IDs únicos e perguntas obrigatórias necessários');
export const Knowledge = z.object({ id: Id, version: z.string(), approved: z.boolean(), source: z.string().url(), theme: Id, context: z.string().max(12000), risks: z.array(z.object({ id: Id, label: z.string().max(150), alarmTerms: z.array(z.string().min(2)), followups: z.array(z.string().min(1).max(600)).max(3) }).strict()).max(30) }).strict();
export type FocusType = z.infer<typeof Focus>;
export type KnowledgeType = z.infer<typeof Knowledge>;
