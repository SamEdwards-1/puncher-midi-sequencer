import {
  addEnvelope,
  createDefaultPatch,
  EnvelopePointJSON,
  PatchJSON,
} from "@midiseq/core"
import { fireEvent, screen } from "@testing-library/react"
import RootStore from "../stores/RootStore"
import { ManualTicker } from "./fakes"

// The envelope editor's tests, in several files so they run side by side.

export let rootStore: RootStore

export const patch = () => rootStore.sequencerStore.patch
export const envelopes = () => patch().steps[0].envelopes
export const points = () => envelopes()[0].points
export const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))

// jsdom has no layout, so the graph is its fallback 480 by 240, inset by 6
export const X = (time: number) => 6 + time * 468
export const Y = (value: number) => 6 + (1 - value / 127) * 228

// the middle of a point's square handle
export const centreX = (handle: Element) =>
  Number(handle.getAttribute("x")) + Number(handle.getAttribute("width")) / 2

export const frame = () => screen.getByRole("application", { name: "Envelope" })
export const svg = () => frame().querySelector("svg") as SVGSVGElement
export const press = (x: number, y: number, init: MouseEventInit = {}) =>
  fireEvent.mouseDown(svg(), {
    clientX: x,
    clientY: y,
    button: 0,
    detail: 1,
    ...init,
  })
export const moveTo = (x: number, y: number, init: MouseEventInit = {}) =>
  fireEvent.mouseMove(document, { clientX: x, clientY: y, ...init })
export const release = (x: number, y: number) =>
  fireEvent.mouseUp(document, { clientX: x, clientY: y })
export const clickAt = (x: number, y: number, init: MouseEventInit = {}) => {
  press(x, y, init)
  release(x, y)
}
export const dragFrom = (
  from: [number, number],
  path: [number, number][],
  init: MouseEventInit = {},
) => {
  press(...from, init)
  for (const [x, y] of path) {
    moveTo(x, y, init)
  }
  const [x, y] = path[path.length - 1]
  release(x, y)
}

export const ramp: EnvelopePointJSON[] = [
  { time: 0.25, value: 32 },
  { time: 0.75, value: 96 },
]

/**
 * A quarter-note sequencer, so step 1 is one beat; with the default 1/16
 * grid its lines fall at quarters of the step. Each test file renders the
 * app on it and then calls `openEditor`, the render being what puts the file
 * with the whole-app tests.
 */
export const startStore = (
  shape: EnvelopePointJSON[] | null,
  change: (patch: PatchJSON) => PatchJSON,
) => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    // settings such as the accent amount start fresh for every test
    storage: null,
  })
  let start: PatchJSON = { ...createDefaultPatch(), pace: "4th" }
  if (shape !== null) {
    // these tests were written for ramps; steps have tests of their own
    start = addEnvelope(start, 0, {
      cc: 74,
      channel: 1,
      shape: "ramps",
      points: shape,
    })
  }
  rootStore.sequencerStore.patch = change(start)
  return rootStore
}

export const openEditor = (shape: EnvelopePointJSON[] | null) => {
  fireEvent.click(screen.getByRole("button", { name: "Step 1" }))
  // the voice, lane and tool are view state and live on past a render
  fireEvent.click(screen.getByRole("button", { name: "Voice 1" }))
  fireEvent.click(
    screen.getByRole("tab", { name: shape !== null ? "CC 74" : "Velocity 1" }),
  )
  // both kinds of lane have the tools
  click("Edit points")
}

export const tab = (name: string) => screen.queryByRole("tab", { name })
export const type = (label: string, text: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: "Enter" })
}
