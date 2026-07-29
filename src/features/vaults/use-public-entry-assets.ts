import { useEffect, useState } from 'react'
import {
  cachedWebsiteAsset,
  getPublicAssetsByIds,
  resolveWebsiteIcons,
} from '../../shared/api/public-assets-api'

const reconciledHostnameSets = new Set<string>()
const COMPLETE_LIST_RECONCILIATION_VERSION = 2

/** Reconcile and hydrate the complete decrypted list, independently of the
 * virtualized render window. The first request schedules missing acquisitions;
 * bounded read-only polls then populate the shared cache as workers finish. */
export function useReconcilePublicEntryAssets(iconReferences: ReadonlyArray<string | null>): void {
  const hostnames = [...new Set(iconReferences.flatMap((reference) =>
    reference?.startsWith('website:') ? [reference.slice('website:'.length)] : []))].sort()
  const hostnameKey = hostnames.join(',')
  useEffect(() => {
    if (!hostnameKey || reconciledHostnameSets.has(hostnameKey)) return
    reconciledHostnameSets.add(hostnameKey)
    let current = true
    let attempt = 0
    let acquisitionScheduled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const reconcile = async () => {
      const unresolved = hostnames.filter((hostname) => !cachedWebsiteAsset(hostname))
      if (unresolved.length === 0) return
      try {
        await resolveWebsiteIcons(unresolved, !acquisitionScheduled)
        acquisitionScheduled = true
      } catch {
        // Preserve successful pages and retry scheduling if any page failed.
      }
      if (!current) return
      if (unresolved.some((hostname) => !cachedWebsiteAsset(hostname)) && attempt++ < 30) {
        timer = setTimeout(reconcile, 2_000)
      }
    }
    void reconcile()
    return () => {
      current = false
      if (timer) clearTimeout(timer)
      // A remount must be able to resume an interrupted reconciliation.
      if (hostnames.some((hostname) => !cachedWebsiteAsset(hostname))) {
        reconciledHostnameSets.delete(hostnameKey)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostnameKey, COMPLETE_LIST_RECONCILIATION_VERSION])
}

export function usePublicEntryAssets(iconReferences: ReadonlyArray<string | null>): void {
  const [, setRevision] = useState(0)
  const ids = [...new Set(iconReferences.flatMap((reference) =>
    reference?.startsWith('public-asset:') ? [reference.slice('public-asset:'.length)] : []))].sort()
  const key = ids.join(',')
  const hostnames = [...new Set(iconReferences.flatMap((reference) =>
    reference?.startsWith('website:') ? [reference.slice('website:'.length)] : []))].sort()
  const hostnameKey = hostnames.join(',')
  useEffect(() => {
    if (ids.length === 0) return
    let current = true
    void getPublicAssetsByIds(ids)
      .then(() => { if (current) setRevision((value) => value + 1) })
      .catch(() => undefined)
    return () => { current = false }
    // A stable key prevents a new array from retriggering the batch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (hostnames.length === 0) return
    let current = true
    let attempt = 0
    let acquisitionScheduled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const resolve = async () => {
      const unresolved = hostnames.filter((hostname) => !cachedWebsiteAsset(hostname))
      if (unresolved.length === 0) return
      try {
        await resolveWebsiteIcons(unresolved, !acquisitionScheduled)
        acquisitionScheduled = true
      } catch {
        // The next bounded poll retries the one scheduling request; a failed
        // request must not turn all later checks into read-only polls.
      }
      if (!current) return
      setRevision((value) => value + 1)
      // A large import is drained by a bounded backend worker pool. Continue
      // checking long enough for a hostname near the tail and for one genuine
      // retry after a transient upstream failure; this only queries Palladin's
      // catalog and never downloads a remote favicon in the browser.
      if (unresolved.some((hostname) => !cachedWebsiteAsset(hostname)) && attempt++ < 30) {
        timer = setTimeout(resolve, 2_000)
      }
    }
    void resolve()
    return () => { current = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostnameKey])
}
