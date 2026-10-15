/**
 * Zod validation schemas.
 *
 * These are used by the Add/Edit shop form, the visit dialog and the backup
 * importer, so every path into persisted shop data is validated with the same rules.
 */
import { z } from 'zod'

export const contactRoleSchema = z.enum(['Owner', 'Manager', 'Staff', 'Other'])

export const contactSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  role: contactRoleSchema.optional(),
  notes: z.string().trim().max(500).optional(),
})

/**
 * A coordinate field.
 *
 * Accepts a number or a numeric string (form inputs always hand over strings).
 * An empty or non-numeric value is rejected explicitly, so an empty latitude can
 * never silently become 0 — which would place a shop on the equator.
 */
const coordinate = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number()])
    .refine(
      (value) => String(value).trim() !== '' && Number.isFinite(Number(value)),
      `${label} must be a number`,
    )
    .transform((value) => Number(value))
    .refine((value) => value >= min && value <= max, `${label} must be between ${min} and ${max}`)

export const shopFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Shop name is required')
    .max(120, 'Shop name is too long (120 characters max)'),
  category: z.string().trim().max(60).default(''),
  address: z.string().trim().max(300).default(''),
  latitude: coordinate(-90, 90, 'Latitude'),
  longitude: coordinate(-180, 180, 'Longitude'),
  primaryOwnerName: z.string().trim().max(120).default(''),
  primaryOwnerPhone: z.string().trim().max(40).default(''),
  contacts: z.array(contactSchema).max(20).default([]),
  notes: z.string().trim().max(4000).default(''),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  imageDataUrl: z
    .string()
    .max(3_000_000, 'Image is too large - please choose a smaller one')
    .nullable()
    .optional(),
})

export type ShopFormValues = z.input<typeof shopFormSchema>

export const visitFormSchema = z.object({
  visitedAt: z.string().min(1, 'Visit date and time is required'),
  note: z
    .string()
    .trim()
    .min(1, 'Please write a short note describing the visit')
    .max(4000, 'Note is too long'),
  purpose: z.string().trim().max(200).default(''),
  amountSpent: z
    .string()
    .trim()
    .max(40)
    .refine(
      (value) => value === '' || /^-?\d*([.,]\d{0,2})?$/.test(value.replace(/\s/g, '')),
      'Amount must be a number, for example 1250 or 1250.50',
    )
    .default(''),
})

export type VisitFormValues = z.input<typeof visitFormSchema>

/** Flatten a ZodError into `{ field: firstMessage }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/**
 * Structural validation of the outer (unencrypted) part of a backup file.
 * `backupService.parseBackupFile` performs the same checks with friendlier error
 * messages; this schema exists so the shape is documented in one place and can be
 * reused by tooling.
 */
export const backupFileSchema = z.object({
  format: z.literal('my-visited-shops-backup'),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  encrypted: z.boolean(),
  integrity: z.string(),
  counts: z
    .object({ shops: z.number().int().nonnegative(), visits: z.number().int().nonnegative() })
    .optional(),
  app: z.object({ name: z.string(), version: z.string() }).optional(),
  data: z.unknown().optional(),
  cipher: z
    .object({
      algorithm: z.literal('AES-GCM'),
      kdf: z.literal('PBKDF2-SHA256'),
      iterations: z.number().int().min(100_000),
      salt: z.string().min(1),
      iv: z.string().min(1),
      ciphertext: z.string().min(1),
    })
    .optional(),
})

export type BackupFileInput = z.input<typeof backupFileSchema>
