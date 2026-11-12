import type { PostHog } from 'posthog-js'

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY

let client: PostHog | undefined
// Events tracked before posthog-js has loaded; sent once it initializes.
const pending: [string, Record<string, unknown> | undefined][] = []

export function track(event: string, properties?: Record<string, unknown>) {
  if (!posthogKey) return
  if (client) client.capture(event, properties)
  else pending.push([event, properties])
}

// Loads posthog-js as a separate async chunk (kept out of the critical bundle)
// and initializes it on the next idle frame. The automatic pageview fires at
// init time, so deferring here still captures the initial pageview — just a
// few hundred ms after load rather than during the critical path.
export function initAnalytics() {
  if (!posthogKey) return

  const start = () =>
    import('posthog-js').then(({ default: posthog }) => {
      posthog.init(posthogKey, {
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
        defaults: '2025-05-24',
        capture_pageview: true,
      })
      client = posthog
      for (const [event, properties] of pending.splice(0)) posthog.capture(event, properties)
    })

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void start(), { timeout: 2000 })
  } else {
    window.setTimeout(() => void start(), 1)
  }
}
