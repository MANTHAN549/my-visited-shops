import { z } from 'zod'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types'

const isoDate = z.string().datetime({ offset: true })
const contactSchema = z.object({
  id: z.string().min(1), name: z.string(), phone: z.string(),
  role: z.enum(['Owner', 'Manager', 'Staff', 'Other']).optional(),
  notes: z.string().optional(),
}).strict()

export const persistedShopSchema = z.object({
  id: z.string().min(1), name: z.string(), category: z.string(), address: z.string(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  primaryOwnerName: z.string(), primaryOwnerPhone: z.string(), contacts: z.array(contactSchema),
  notes: z.string(), tags: z.array(z.string()), imageDataUrl: z.string().nullable().optional(),
  createdAt: isoDate, updatedAt: isoDate, lastVisitedAt: isoDate.nullable(), visitCount: z.number().int().nonnegative(),
}).strict()

export const persistedVisitSchema = z.object({
  id: z.string().min(1), shopId: z.string().min(1), visitedAt: isoDate, note: z.string(),
  purpose: z.string(), amountSpent: z.string(), createdAt: isoDate, updatedAt: isoDate,
}).strict()

export const persistedSettingsSchema = z.object({
  mapLayer: z.enum(['osm', 'topo']), reverseGeocodingEnabled: z.boolean(),
  routingBaseUrl: z.string(), routingProfile: z.enum(['driving', 'walking', 'cycling']),
  geocodingBaseUrl: z.string(), autoLockMinutes: z.number().int().nonnegative(), mobileListFirst: z.boolean(),
}).strict()

export type PersistedSettings = z.infer<typeof persistedSettingsSchema>
export const defaultPersistedSettings: PersistedSettings = DEFAULT_SETTINGS satisfies AppSettings

export const tombstoneSchema = z.object({
  id: z.string().min(1), type: z.enum(['shop', 'visit']), deletedAt: isoDate,
}).strict()

export const githubDocumentSchema = z.object({
  version: z.literal(2), updatedAt: isoDate,
  encryption: z.object({
    kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(600_000),
    salt: z.string().min(1), iv: z.string().min(1), ciphertext: z.string().min(1),
  }).strict(),
}).strict()

export const githubPayloadSchema = z.object({
  shops: z.array(persistedShopSchema), visits: z.array(persistedVisitSchema),
  settings: persistedSettingsSchema, deleted: z.array(tombstoneSchema),
}).strict()

export type PersistedShop = z.infer<typeof persistedShopSchema>
export type PersistedVisit = z.infer<typeof persistedVisitSchema>
export type Tombstone = z.infer<typeof tombstoneSchema>
