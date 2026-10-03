import {
  ModulationJSON,
  ModulationTarget,
  modulationOf,
  PatchJSON,
} from "@midiseq/core"

/**
 * What is done in the editor, told to Google Tag Manager, which passes it on
 * to Google Analytics. Only the published build loads Tag Manager (see
 * scripts/tagManager.ts); developing or testing, there is no data layer, and
 * nothing is told.
 *
 * Nothing a person makes goes out: no file, patch or device names, only what
 * kind of thing was done.
 */

export type EventParams = Record<string, string | number | boolean>

interface TagManagerWindow {
  dataLayer?: unknown[]
}

// the longest text Google Analytics keeps in a parameter
const MAX_TEXT = 100

/**
 * Tells Tag Manager of `event`. Its parameters go under `event_params`,
 * cleared first: the data layer merges each push into what it already holds,
 * so one event's parameters would otherwise still be there for the next.
 */
export const track = (event: string, params: EventParams = {}) => {
  const layer = (window as TagManagerWindow).dataLayer
  if (layer === undefined) {
    return
  }
  layer.push({ event_params: null })
  layer.push({ event, event_params: params })
}

/** Who changed a setting's modulation: someone in the editor, or an agent. */
export type ModulationVia = "editor" | "agent"

// "voice.pace", with the voice counted from 1 apart; "sequencer.scale";
// "action.sync"
const targetParams = (target: ModulationTarget): EventParams => ({
  target: `${target.kind}.${target.setting}`,
  ...("voice" in target && { voice: target.voice + 1 }),
})

/**
 * A setting given a modulation, or the one it has changed: which setting,
 * and the CC that drives it.
 */
export const trackModulationSet = (
  modulation: ModulationJSON,
  change: "assign" | "edit",
  via: ModulationVia,
) =>
  track("modulation_set", {
    ...targetParams(modulation.target),
    cc: modulation.cc,
    change,
    via,
  })

/**
 * Every modulation a change to the patch gave, changed or took away. A
 * modulation left alone is the same object after as before.
 */
export const trackModulations = (
  before: PatchJSON,
  after: PatchJSON,
  via: ModulationVia,
) => {
  for (const modulation of after.modulations) {
    const was = modulationOf(before, modulation.target)
    if (was === undefined) {
      trackModulationSet(modulation, "assign", via)
    } else if (was !== modulation) {
      trackModulationSet(modulation, "edit", via)
    }
  }
  for (const { target } of before.modulations) {
    if (modulationOf(after, target) === undefined) {
      track("modulation_remove", { ...targetParams(target), via })
    }
  }
}

const errorName = (error: unknown) =>
  error instanceof Error ? error.name : typeof error

/**
 * A failure the person was told of: what was being done, as the app says it
 * ("save the patch"), and the kind of error, never its message, which can
 * name a file.
 */
export const trackFailure = (action: string, error: unknown) =>
  track("app_error", { action, error_name: errorName(error) })

/**
 * Errors nothing caught, as they reach `target`, the window. Their messages
 * come from the code rather than from what a person made, so they go too,
 * cut to what Analytics keeps. Returns what stops listening.
 */
export const trackUncaughtErrors = (target: Window) => {
  const report = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    track("app_error", {
      action: "uncaught",
      error_name: errorName(error),
      error_message: message.slice(0, MAX_TEXT),
    })
  }
  const onError = (event: ErrorEvent) => report(event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => report(event.reason)
  target.addEventListener("error", onError)
  target.addEventListener("unhandledrejection", onRejection)
  return () => {
    target.removeEventListener("error", onError)
    target.removeEventListener("unhandledrejection", onRejection)
  }
}
