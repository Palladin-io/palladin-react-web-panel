import { z } from 'zod'
import { api } from './client'
import { env } from '../lib/env'

export const publicAssetTypeSchema = z.enum(['websiteIcon', 'agentIcon'])

export const publicAssetSchema = z.object({
  id: z.string().uuid(),
  type: publicAssetTypeSchema,
  name: z.string().min(1).max(256),
  url: z.string().url().refine((value) => trustedPublicAssetUrl(value) !== null),
  revision: z.number().int().positive(),
  aliases: z.array(z.string().min(1).max(253)).optional(),
}).strict()

const searchResponseSchema = z.object({ items: z.array(publicAssetSchema) }).strict()
const ensureResponseSchema = z.object({
  items: z.array(z.object({
    hostname: z.string().min(1).max(253),
    asset: publicAssetSchema.nullable(),
  }).strict()),
}).strict()
const byIdsResponseSchema = z.object({ items: z.array(publicAssetSchema) }).strict()

export type PublicAsset = z.infer<typeof publicAssetSchema>

const assetCache = new Map<string, PublicAsset>()
const websiteAssetCache = new Map<string, PublicAsset>()
const cacheListeners = new Set<() => void>()
let cacheRevision = 0

function notifyCacheChanged(): void {
  cacheRevision += 1
  for (const listener of cacheListeners) listener()
}

export function subscribePublicAssetCache(listener: () => void): () => void {
  cacheListeners.add(listener)
  return () => cacheListeners.delete(listener)
}

export function publicAssetCacheRevision(): number {
  return cacheRevision
}

function remember(assets: Iterable<PublicAsset>): boolean {
  let changed = false
  for (const asset of assets) {
    if (assetCache.get(asset.id)?.revision !== asset.revision) changed = true
    assetCache.set(asset.id, asset)
  }
  return changed
}

export function cachedPublicAsset(assetId: string): PublicAsset | undefined {
  return assetCache.get(assetId)
}

export async function searchPublicAssets(query: string): Promise<PublicAsset[]> {
  const response = await api.get('api/public-assets/search', {
    searchParams: { type: 'websiteIcon', q: query, limit: '40' },
  }).json<unknown>()
  const items = searchResponseSchema.parse(response).items
  if (remember(items)) notifyCacheChanged()
  return items
}

export async function ensureWebsiteIcons(hostnames: string[]): Promise<Map<string, PublicAsset>> {
  const unique = [...new Set(hostnames.map(normalizePublicHostname).filter((x): x is string => x !== null))]
  if (unique.length === 0) return new Map()
  const result = new Map(unique.flatMap((hostname) => {
    const asset = websiteAssetCache.get(hostname)
    return asset ? [[hostname, asset] as const] : []
  }))
  const missing = unique.filter((hostname) => !result.has(hostname))
  if (missing.length === 0) return result
  const batches = Array.from({ length: Math.ceil(missing.length / 500) }, (_, index) =>
    missing.slice(index * 500, (index + 1) * 500))
  let firstError: unknown
  // Keep a small concurrency window: favicon acquisition performs outbound
  // network I/O, so an import must not fan hundreds of requests out at once.
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      try {
        const response = await api.post('api/public-assets/website-icons/ensure', {
          json: { hostnames: batch },
          timeout: 20_000,
        }).json<unknown>()
        const items = ensureResponseSchema.parse(response).items
        const changed = remember(items.flatMap(({ asset }) => asset ? [asset] : []))
        for (const { hostname, asset } of items) {
          if (asset) {
            websiteAssetCache.set(hostname, asset)
            result.set(hostname, asset)
          }
        }
        // Publish every successful page immediately. A sibling request may
        // still be pending when the bounded save path snapshots this cache.
        if (changed) notifyCacheChanged()
      } catch (error) {
        firstError ??= error
        // One slow/unreachable group must not discard assets resolved by the
        // other groups. Import remains best-effort and zero-knowledge.
      }
    }
  }))
  // Preserve successful pages in cache, but make the caller retry the batch
  // set if even one page was rejected (for example by broker backpressure or
  // rate limiting). Backend alias idempotency makes the retry safe.
  if (firstError) throw firstError
  return result
}

/**
 * Best-effort reservation for save paths. The catalog request keeps running
 * and warming the cache, but presentation metadata never holds a credential
 * save hostage to the transport's full timeout.
 */
export async function ensureWebsiteIconsWithin(
  hostnames: string[],
  timeoutMs: number,
): Promise<Map<string, PublicAsset>> {
  const cachedResult = (): Map<string, PublicAsset> => new Map(
    [...new Set(hostnames.map(normalizePublicHostname).filter((x): x is string => x !== null))]
      .flatMap((hostname) => {
        const asset = websiteAssetCache.get(hostname)
        return asset ? [[hostname, asset] as const] : []
      }),
  )
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      ensureWebsiteIcons(hostnames),
      new Promise<Map<string, PublicAsset>>((resolve) => {
        timeout = setTimeout(() => resolve(cachedResult()), timeoutMs)
      }),
    ])
  } catch {
    return cachedResult()
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

/** Accept only the configured immutable public-asset namespace for rendering. */
export function trustedPublicAssetUrl(value: string): string | null {
  try {
    const candidate = new URL(value)
    const base = new URL(env.publicAssetUrl)
    const prefix = `${base.pathname.replace(/\/$/, '')}/`
    return candidate.origin === base.origin
      && candidate.username === '' && candidate.password === ''
      && candidate.search === '' && candidate.hash === ''
      && candidate.pathname.startsWith(prefix)
      ? candidate.toString()
      : null
  } catch {
    return null
  }
}

export async function getPublicAssetsByIds(assetIds: string[]): Promise<PublicAsset[]> {
  const unique = [...new Set(assetIds)]
  const items: PublicAsset[] = []
  for (let offset = 0; offset < unique.length; offset += 200) {
    const response = await api.post('api/public-assets/by-ids', {
      json: { assetIds: unique.slice(offset, offset + 200) },
    }).json<unknown>()
    items.push(...byIdsResponseSchema.parse(response).items)
  }
  if (remember(items)) notifyCacheChanged()
  return items
}

/** Only a normalized public hostname leaves the zero-knowledge client. */
export function normalizePublicHostname(input: string): string | null {
  try {
    const candidate = input.includes('://') ? input : `https://${input}`
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, '')
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) return null
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return null
    // Keep this boundary aligned with the backend's DNS-only contract. A
    // single invalid hostname would otherwise reject the entire batch and
    // prevent valid entries after it from hydrating their icons.
    if (!hostname.includes('.') || !hostname.split('.').every((label) =>
      label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null
    // Keep the exact host. Icon metadata and branding are frequently scoped to
    // an application subdomain (online.mbank.pl, signup.heroku.com,
    // appleid.apple.com), not to its registrable parent domain. The backend may
    // apply its bounded parent fallback only after trying this exact host.
    return hostname
  } catch {
    return null
  }
}
