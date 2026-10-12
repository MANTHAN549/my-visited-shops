import { describe, expect, it } from 'vitest'
import { fetchRoute, RoutingError, shouldRecalculate, straightLineGeometry } from '@/services/routingService'

describe('routing service', () => {
  it('throws a non-retryable error when no provider is configured', async () => {
    await expect(
      fetchRoute({
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 1, longitude: 1 },
        profile: 'driving',
        baseUrl: '',
      }),
    ).rejects.toThrow(/no routing service is configured/i)
  })

  it('reports a network failure as retryable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch

    try {
      await expect(
        fetchRoute({
          origin: { latitude: 0, longitude: 0 },
          destination: { latitude: 1, longitude: 1 },
          profile: 'driving',
          baseUrl: 'https://routing.invalid',
        }),
      ).rejects.toThrow(/could not reach the routing service/i)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('converts GeoJSON [lng, lat] coordinates into Leaflet [lat, lng]', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            code: 'Ok',
            routes: [
              {
                distance: 4200,
                duration: 600,
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [73.8567, 18.5204],
                    [73.86, 18.53],
                  ],
                },
              },
            ],
          }),
      })) as unknown as typeof fetch

    try {
      const route = await fetchRoute({
        origin: { latitude: 18.5204, longitude: 73.8567 },
        destination: { latitude: 18.53, longitude: 73.86 },
        profile: 'driving',
        baseUrl: 'https://router.example.org',
      })

      expect(route.distanceMeters).toBe(4200)
      expect(route.durationSeconds).toBe(600)
      // First pair must be [lat, lng] in that order.
      expect(route.geometry[0]).toEqual([18.5204, 73.8567])
      expect(route.provider).toBe('router.example.org')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('treats a NoRoute answer as a definitive, non-retryable failure', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 'NoRoute', message: 'no route' }),
      })) as unknown as typeof fetch

    try {
      const error = await fetchRoute({
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 1, longitude: 1 },
        profile: 'driving',
        baseUrl: 'https://router.example.org',
      }).catch((err: unknown) => err as RoutingError)

      expect(error).toBeInstanceOf(RoutingError)
      expect((error as RoutingError).retryable).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('flags rate limiting as retryable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })) as unknown as typeof fetch

    try {
      const error = (await fetchRoute({
        origin: { latitude: 0, longitude: 0 },
        destination: { latitude: 1, longitude: 1 },
        profile: 'driving',
        baseUrl: 'https://router.example.org',
      }).catch((err: unknown) => err)) as RoutingError

      expect(error.message).toMatch(/rate limiting/i)
      expect(error.retryable).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('route recalculation guard', () => {
  it('always calculates when there is no previous origin', () => {
    expect(shouldRecalculate(null, { latitude: 10, longitude: 10 })).toBe(true)
  })

  it('does not recalculate for a tiny GPS wobble', () => {
    const moved = shouldRecalculate(
      { latitude: 18.5204, longitude: 73.8567 },
      { latitude: 18.52041, longitude: 73.85671 },
    )
    expect(moved).toBe(false)
  })

  it('recalculates after a meaningful move', () => {
    const moved = shouldRecalculate(
      { latitude: 18.5204, longitude: 73.8567 },
      { latitude: 18.54, longitude: 73.88 },
    )
    expect(moved).toBe(true)
  })
})

describe('straight-line fallback', () => {
  it('returns exactly two Leaflet-ordered points', () => {
    const line = straightLineGeometry(
      { latitude: 1, longitude: 2 },
      { latitude: 3, longitude: 4 },
    )
    expect(line).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})
