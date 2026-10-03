// What readers do in the docs, told to Google Tag Manager as the editor tells
// it (see app/src/services/analytics.ts), for Google Analytics. Only a
// production build loads Tag Manager; developing, there is no data layer and
// nothing is told.

type EventParams = Record<string, string | number | boolean>

// Parameters go under `event_params`, cleared first: the data layer merges
// each push into what it holds, so one event's would otherwise reach the next.
export function track(event: string, params: EventParams = {}) {
  const layer = (window as { dataLayer?: unknown[] }).dataLayer
  if (layer === undefined) return
  layer.push({ event_params: null })
  layer.push({ event, event_params: params })
}
