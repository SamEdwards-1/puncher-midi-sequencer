import { createDefaultPatch, PatchJSON } from "@midiseq/core"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const dot = (voice: number, number: number) =>
  screen.getByRole("button", { name: `Voice ${voice} Dot ${number}` })
const marks = (voice: number, number: number) =>
  [...dot(voice, number).querySelectorAll("[data-collision]")].map((mark) =>
    Number(mark.getAttribute("data-collision")),
  )
const selectStep = (number: number) =>
  fireEvent.click(screen.getByRole("button", { name: `Step ${number}` }))
const setPatch = (change: (patch: PatchJSON) => void) =>
  act(() => {
    const next = structuredClone(rootStore.sequencerStore.patch)
    change(next)
    rootStore.sequencerStore.patch = next
  })

/**
 * A quarter-note step 1 holding middle C, with voices 1 and 2 both on:
 * each plays C on its first two dots, 8ths at half length, so they collide
 * twice, a rest apart.
 */
beforeEach(() => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  const patch = createDefaultPatch()
  patch.pace = "4th"
  patch.steps[0].notes = [60]
  patch.voices[1].enabled = true
  rootStore.sequencerStore.patch = patch
  render(<App rootStore={rootStore} />)
  selectStep(1)
})

describe("collisions on the pattern dots", () => {
  it("marks the dots of voices sounding the same note at once", () => {
    // the first collision on each voice's first dot, the second on its second
    expect(marks(1, 1)).toEqual([0])
    expect(marks(2, 1)).toEqual([0])
    expect(marks(1, 2)).toEqual([1])
    expect(marks(2, 2)).toEqual([1])
    // dots that play nothing on this step, or play alone, are left be
    expect(marks(1, 3)).toEqual([])
    expect(marks(3, 1)).toEqual([])
  })

  it("colours each collision apart", () => {
    const colour = (voice: number, number: number) =>
      (dot(voice, number).querySelector("[data-collision]") as HTMLElement)
        .style.color
    expect(colour(1, 1)).toBe("var(--midiseq-collision-0)")
    expect(colour(2, 1)).toBe(colour(1, 1))
    expect(colour(1, 2)).toBe("var(--midiseq-collision-1)")
  })

  it("names the note and the other voice when hovered", () => {
    expect(dot(1, 1).title).toContain(
      "Same note as another voice: C4 · Voice 2",
    )
    expect(dot(2, 1).title).toContain("Voice 1")
  })

  it("bobs a collision's marks on every dot while one of its dots is hovered", () => {
    const bouncing = () =>
      [...document.querySelectorAll("[data-bouncing='true']")].map((mark) =>
        Number(mark.getAttribute("data-collision")),
      )
    expect(bouncing()).toEqual([])

    fireEvent.mouseEnter(dot(1, 1))
    // both voices' marks for the first collision, and not the second's
    expect(bouncing()).toEqual([0, 0])
    expect(dot(2, 1).querySelector("[data-collision]")?.classList).toContain(
      "collision-bounce",
    )

    fireEvent.mouseLeave(dot(1, 1))
    expect(bouncing()).toEqual([])

    // a dot with no collision sets nothing going
    fireEvent.mouseEnter(dot(1, 3))
    expect(bouncing()).toEqual([])
  })

  it("follows the step in the editor", () => {
    // step 2 holds no notes, so nothing sounds together
    selectStep(2)
    expect(marks(1, 1)).toEqual([])
    selectStep(1)
    expect(marks(1, 1)).toEqual([0])
  })

  it("marks the dots the voices have come round to by the step", () => {
    setPatch((patch) => {
      patch.steps[1].notes = [60]
    })
    // two dots a step, so step 2 comes in on each voice's third dot
    selectStep(2)
    expect(marks(1, 1)).toEqual([])
    expect(marks(1, 3)).toEqual([0])
    expect(marks(2, 4)).toEqual([1])
  })

  it("moves the band to where the step comes in, while stopped", () => {
    const reached = (voice: number) =>
      [1, 2, 3, 4, 5, 6].filter(
        (number) => dot(voice, number).getAttribute("data-reached") === "true",
      )
    setPatch((patch) => {
      patch.steps[1].notes = [60]
      patch.steps[2].notes = [64]
    })
    expect(reached(1)).toEqual([1, 2])
    selectStep(2)
    expect(reached(1)).toEqual([3, 4])
    selectStep(3)
    expect(reached(1)).toEqual([5, 6])
    // voice 3 is off, but its pattern turns all the same
    expect(reached(3)).toEqual([5, 6])
  })

  it("clears when the voices part", () => {
    // an octave apart, voice 2 no longer doubles voice 1
    setPatch((patch) => {
      patch.voices[1].offset = 12
    })
    expect(marks(1, 1)).toEqual([])
    expect(marks(2, 1)).toEqual([])
  })

  it("ignores a voice that is off", () => {
    setPatch((patch) => {
      patch.voices[1].enabled = false
    })
    expect(marks(1, 1)).toEqual([])
  })
})
