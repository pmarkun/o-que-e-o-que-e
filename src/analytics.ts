type AnalyticsEventData = Record<string, string | number | boolean>
type AnalyticsPayload = Record<string, unknown>
type PageView = { referrer: string; title: string; url: string }

type UmamiClient = {
  track(update: (payload: AnalyticsPayload) => AnalyticsPayload): void
}

declare global {
  interface Window {
    umami?: UmamiClient
  }
}

type PendingTrack =
  | { data?: AnalyticsEventData; kind: 'event'; name: string }
  | { kind: 'pageview'; pageView: PageView }

const pendingTracks: PendingTrack[] = []
let trackerRequested = false
let currentPageReferrer = document.referrer
let lastTrackedPath: string | null = null

function flushPendingEvents() {
  if (!window.umami) return
  for (const pending of pendingTracks.splice(0)) {
    if (pending.kind === 'event') sendEvent(pending.name, pending.data)
    else sendPageView(pending.pageView)
  }
}

function sendPageView(pageView: PageView) {
  window.umami?.track((payload) => ({ ...payload, ...pageView }))
}

function sendEvent(name: string, data?: AnalyticsEventData) {
  window.umami?.track((payload) => ({
    ...payload,
    data,
    name,
    referrer: currentPageReferrer,
    title: document.title,
    url: window.location.href,
  }))
}

export function loadAnalytics() {
  if (trackerRequested || window.location.pathname.startsWith('/admin')) return

  const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL?.trim()
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim()
  if (!scriptUrl || !websiteId) return

  try {
    new URL(scriptUrl)
  } catch {
    return
  }

  trackerRequested = true
  const script = document.createElement('script')
  script.defer = true
  script.src = scriptUrl
  script.dataset.websiteId = websiteId
  script.dataset.autoPageview = 'false'
  script.dataset.umamiLoader = 'true'
  script.addEventListener('load', flushPendingEvents, { once: true })
  script.addEventListener('error', () => pendingTracks.splice(0), { once: true })
  document.head.appendChild(script)
}

export function trackEvent(name: string, data?: AnalyticsEventData) {
  try {
    if (window.umami) {
      sendEvent(name, data)
    } else if (trackerRequested) {
      pendingTracks.push({ data, kind: 'event', name })
    }
  } catch {
    // Analytics must never interfere with the product flow.
  }
}

export function trackPageView() {
  currentPageReferrer = lastTrackedPath ?? document.referrer
  const pageView = {
    referrer: currentPageReferrer,
    title: document.title,
    url: window.location.href,
  }
  lastTrackedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  try {
    if (window.umami) {
      sendPageView(pageView)
    } else if (trackerRequested) {
      pendingTracks.push({ kind: 'pageview', pageView })
    }
  } catch {
    // Analytics must never interfere with the product flow.
  }
}
