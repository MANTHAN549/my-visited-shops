import type { AppSettings, Shop, Visit } from '@/types'
export interface EncryptionMeta {
  mode: 'none' | 'encrypted'
  salt?: string
  iterations?: number
  verifier?: string
  verifierIv?: string
  createdAt: string
  version: number
}
export const ENCRYPTION_ENVELOPE_VERSION = 1
export interface ShopRecord {
  id: string; createdAt: string; updatedAt: string; lastVisitedAt: string | null; visitCount: number
  enc: 0 | 1; data: string; iv?: string; v: number
}
export interface VisitRecord {
  id: string; shopId: string; visitedAt: string; createdAt: string; updatedAt: string
  enc: 0 | 1; data: string; iv?: string; v: number
}
export interface KeyValueRecord { key: string; value: unknown; updatedAt: string }
export interface SyncQueueRecord { id: string; entity: 'shop' | 'visit'; recordId: string; operation: 'upsert' | 'delete'; queuedAt: string }
export interface SyncStateRecord { id: string; entity: 'shop' | 'visit'; recordId: string; revision: number; updatedAt: string }
export type LegacySettings = AppSettings
export type LegacyShop = Shop
export type LegacyVisit = Visit
