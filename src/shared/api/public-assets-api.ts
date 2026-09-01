import { z } from 'zod'
import { HTTPError } from 'ky'
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
})

const searchResponseSchema = z.object({ items: z.array(publicAssetSchema) })
const websiteIconEnsureStatusSchema = z.string().transform((status): 'pending' | 'ready' | 'failed' =>
  status === 'pending' || status === 'ready' || status === 'failed' ? status : 'failed')
const ensureResponseSchema = z.object({
  items: z.array(z.object({
    hostname: z.string().min(1).max(253),
    status: websiteIconEnsureStatusSchema,
    asset: publicAssetSchema.nullable(),
  }).transform((item) => ({
    ...item,
    status: item.status === 'ready' && item.asset === null ? 'failed' as const : item.status,
  }))),
})
const byIdsResponseSchema = z.object({ items: z.array(publicAssetSchema) })

export type PublicAsset = z.infer<typeof publicAssetSchema>

const assetCache = new Map<string, PublicAsset>()
const websiteAssetCache = new Map<string, PublicAsset>()
const websiteAssetStatusCache = new Map<string, z.infer<typeof websiteIconEnsureStatusSchema>>()
const cacheListeners = new Set<() => void>()
let cacheRevision = 0
const WEBSITE_ICON_POLL_INTERVAL_MS = 1_000
const COMPLETE_WEBSITE_ICON_POLL_INTERVAL_MS = 3_000
const WEBSITE_ICON_ACTIVITY_CHECK_INTERVAL_MS = 1_000

function retryAfterMilliseconds(error: unknown): number | null {
  if (!(error instanceof HTTPError) || error.response.status !== 429) return null
  const value = error.response.headers.get('retry-after')?.trim()
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const retryAt = Date.parse(value)
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now())
}

async function waitForWebsiteIconPoll(delayMs: number, assertActive?: () => void): Promise<void> {
  const deadline = Date.now() + delayMs
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(WEBSITE_ICON_ACTIVITY_CHECK_INTERVAL_MS, deadline - Date.now()),
    ))
    assertActive?.()
  }
}

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
  const missing = unique.filter((hostname) =>
    !result.has(hostname) && websiteAssetStatusCache.get(hostname) !== 'failed')
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
        const changed = remember(items.flatMap(({ status, asset }) =>
          status === 'ready' && asset ? [asset] : []))
        for (const { hostname, status, asset } of items) {
          websiteAssetStatusCache.set(hostname, status)
          if (status === 'ready' && asset) {
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

/** Wait only during a bounded explicit save flow and return published assets. */
export async function ensureWebsiteIconsWithin(
  hostnames: string[],
  timeoutMs: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<Map<string, PublicAsset>> {
  const unique = [...new Set(hostnames.map(normalizePublicHostname).filter((x): x is string => x !== null))]
  // `failed` is terminal only for one bounded preparation attempt. Keeping it
  // forever would make a browser tab ignore an icon that was uploaded or
  // successfully reacquired later. Revalidate it once when a new explicit
  // save/import/form preparation starts; a failed response still stops the
  // current polling loop immediately.
  for (const hostname of unique) {
    if (websiteAssetStatusCache.get(hostname) === 'failed') {
      websiteAssetStatusCache.delete(hostname)
    }
  }
  const cachedResult = (): Map<string, PublicAsset> => new Map(
    unique
      .flatMap((hostname) => {
        const asset = websiteAssetCache.get(hostname)
        return asset ? [[hostname, asset] as const] : []
      }),
  )
  const completedCount = () => unique.filter((hostname) => {
    const status = websiteAssetStatusCache.get(hostname)
    return status === 'ready' || status === 'failed'
  }).length
  const reportProgress = () => onProgress?.(completedCount(), unique.length)
  reportProgress()
  if (unique.length === 0 || timeoutMs <= 0) return cachedResult()

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const unresolved = unique.filter((hostname) => {
      const status = websiteAssetStatusCache.get(hostname)
      return status !== 'ready' && status !== 'failed'
    })
    if (unresolved.length === 0) return cachedResult()
    const remaining = deadline - Date.now()
    let requestTimeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        ensureWebsiteIcons(unresolved),
        new Promise<void>((resolve) => {
          requestTimeout = setTimeout(resolve, remaining)
        }),
      ])
      reportProgress()
    } catch {
      // Catalog enrichment is best-effort. The save continues without URLs
      // for assets that did not reach Ready before the deadline.
    } finally {
      if (requestTimeout !== undefined) clearTimeout(requestTimeout)
    }
    if (completedCount() === unique.length) return cachedResult()
    const waitMs = Math.min(WEBSITE_ICON_POLL_INTERVAL_MS, deadline - Date.now())
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
  reportProgress()
  return cachedResult()
}

/**
 * Prepare a complete import batch without a wall-clock deadline. The durable
 * backend queue supplies the terminal condition for every hostname (`ready`
 * or `failed`); transient catalog request failures are retried without
 * discarding progress made by sibling pages.
 */
export async function ensureWebsiteIconsUntilSettled(
  hostnames: string[],
  onProgress?: (completed: number, total: number) => void,
  assertActive?: () => void,
): Promise<Map<string, PublicAsset>> {
  const unique = [...new Set(hostnames.map(normalizePublicHostname).filter((x): x is string => x !== null))]
  for (const hostname of unique) {
    if (websiteAssetStatusCache.get(hostname) === 'failed') {
      websiteAssetStatusCache.delete(hostname)
    }
  }
  const cachedResult = (): Map<string, PublicAsset> => new Map(
    unique.flatMap((hostname) => {
      const asset = websiteAssetCache.get(hostname)
      return asset ? [[hostname, asset] as const] : []
    }),
  )
  const unresolvedHostnames = () => unique.filter((hostname) => {
    const status = websiteAssetStatusCache.get(hostname)
    return status !== 'ready' && status !== 'failed'
  })
  const reportProgress = () => onProgress?.(unique.length - unresolvedHostnames().length, unique.length)

  reportProgress()
  while (true) {
    assertActive?.()
    const unresolved = unresolvedHostnames()
    if (unresolved.length === 0) return cachedResult()
    let nextPollDelay = COMPLETE_WEBSITE_ICON_POLL_INTERVAL_MS
    try {
      await ensureWebsiteIcons(unresolved)
    } catch (error) {
      // A request-level failure is retried. Successfully completed sibling
      // pages stay cached, so one transient page cannot reset the batch.
      nextPollDelay = Math.max(
        COMPLETE_WEBSITE_ICON_POLL_INTERVAL_MS,
        retryAfterMilliseconds(error) ?? 0,
      )
    }
    reportProgress()
    assertActive?.()
    if (unresolvedHostnames().length === 0) return cachedResult()
    await waitForWebsiteIconPoll(nextPollDelay, assertActive)
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
