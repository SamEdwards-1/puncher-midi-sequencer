import { EnvelopePointJSON, PatchJSON, setStepNotes } from "@midiseq/core"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { choose } from "../../test/combobox"
import {
  click,
  clickAt,
  dragFrom,
  frame,
  openEditor,
  patch,
  ramp,
  rootStore,
  startStore,
  svg,
  tab,
  X,
  Y,
} from "../../test/envelopeEditor"
import { editItem } from "../../test/menus"
import { App } from "../App/App"

const setup = (
  shape: EnvelopePointJSON[] | null = ramp,
  change: (patch: PatchJSON) => PatchJSON = (patch) => patch,
) => {
  render(<App rootStore={startStore(shape, change)} />)
  openEditor(shape)
}

describe("the envelope editor", () => {
  describe("the notes underneath", () => {
    const notes = () => [...svg().querySelectorAll("[data-note]")]

    it("shows the notes the step plays, in each voice's colour", () => {
      // voice 1 plays 8ths across the quarter-note step
      setup(ramp, (start) => setStepNotes(start, 0, [60, 64]))
      expect(notes()).toHaveLength(2)
      expect(notes()[0]).toHaveAttribute("data-voice", "0")
      expect(notes()[0]).toHaveAttribute("fill", "var(--midiseq-voice-0)")
    })

    it("follows the voices as they change", () => {
      setup(ramp, (start) => setStepNotes(start, 0, [60, 64]))
      const voices = within(screen.getByRole("region", { name: "Voices" }))
      choose(voices.getByLabelText("Pace"), "16th")
      expect(notes()).toHaveLength(4)

      fireEvent.click(screen.getByRole("button", { name: "Voice 1 Dot 1" }))
      expect(notes()).toHaveLength(3)
    })

    it("keep their voice's own colour under an envelope", () => {
      setup(ramp, (start) => setStepNotes(start, 0, [60]))
      expect(notes()[0]).not.toHaveAttribute("fill-opacity")
    })

    it("keep the same keys from step to step", () => {
      setup([], (start) =>
        setStepNotes(setStepNotes(start, 0, [60]), 5, [72, 76]),
      )
      const keys = () => svg().getAttribute("data-keys")
      // the grid's lowest key at the bottom, its highest at the top
      expect(keys()).toBe("60-76")

      fireEvent.click(screen.getByRole("button", { name: "Step 6" }))
      expect(keys()).toBe("60-76")
      // and a step with nothing on it doesn't close them up either
      fireEvent.click(screen.getByRole("button", { name: "Step 9" }))
      expect(keys()).toBe("60-76")
    })

    it("moves when a key is set beyond them", () => {
      setup([], (start) =>
        setStepNotes(setStepNotes(start, 0, [67]), 5, [72, 76]),
      )
      const keys = () => svg().getAttribute("data-keys")
      expect(keys()).toBe("67-76")

      // step 1's G4 down a semitone: the bottom row follows it
      click("Note 1 down")
      expect(keys()).toBe("66-76")
    })

    it("reach every note a voice's transpose takes past the grid's keys", () => {
      setup([], (start) => {
        const next = setStepNotes(start, 0, [60, 64])
        next.voices[1] = { ...next.voices[1], enabled: true, transposeAmt: 24 }
        return next
      })
      expect(svg().getAttribute("data-keys")).toBe("60-88")
      const shown = notes().map((note) => note.getAttribute("data-voice"))
      expect(shown).toContain("1")
      expect(shown).toContain("0")
    })

    it("can't be dragged or clicked", () => {
      setup([], (start) => setStepNotes(start, 0, [60]))
      const before = patch()
      const note = notes()[0]
      fireEvent.mouseDown(note, { clientX: X(0.1), clientY: Y(64) })
      fireEvent.mouseUp(document)
      expect(patch()).toBe(before)
    })
  })

  describe("velocity", () => {
    // voice 1 plays 8ths across the quarter-note step: points at 0 and a half
    const withNotes = (start: PatchJSON) => setStepNotes(start, 0, [60, 64])
    const velocityPoints = () => [...svg().querySelectorAll("[data-point]")]
    const velocities = () =>
      velocityPoints().map((point) =>
        Number(point.getAttribute("data-velocity")),
      )
    const dot = (number: number) =>
      screen.getByRole("button", { name: `Voice 1 Dot ${number}` })
    const stem = (point: Element) => {
      const line = point.querySelector("[data-stem]") as Element
      return {
        from: Number(line.getAttribute("x1")),
        to: Number(line.getAttribute("x2")),
      }
    }
    // halfway along a note's stem
    const alongStem = (index: number) => {
      const { from, to } = stem(velocityPoints()[index])
      return (from + to) / 2
    }
    const firstBar = X(0)
    const secondBar = X(0.5)

    it("draws a lollipop at each of the voice's notes, as long as the note", () => {
      setup(null, withNotes)
      expect(tab("Velocity 1")).toHaveAttribute("aria-selected", "true")
      expect(velocities()).toEqual([64, 64])
      const heads = velocityPoints().map((point) =>
        Number(point.querySelector("circle")?.getAttribute("cx")),
      )
      expect(heads[0]).toBeCloseTo(X(0))
      expect(heads[1]).toBeCloseTo(X(0.5))
      // each stem ends where its note does in the roll
      const rolled = [...svg().querySelectorAll('[data-note][data-voice="0"]')]
      velocityPoints().forEach((point, index) => {
        const note = rolled[index]
        expect(stem(point).to).toBeCloseTo(
          Number(note.getAttribute("x")) + Number(note.getAttribute("width")),
        )
      })
      // in the voice's colour, and no line running through them
      expect(velocityPoints()[0].querySelector("circle")).toHaveAttribute(
        "fill",
        "var(--midiseq-voice-0)",
      )
      expect(svg().querySelector("[data-envelope-line]")).toBeNull()
      expect(screen.getByRole("button", { name: "Draw" })).toBeInTheDocument()
    })

    it("dims the other voices' velocities behind, out of reach", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[1] = {
          ...next.voices[1],
          enabled: true,
          pace: "4th",
          velocity: 100,
        }
        return next
      })
      const others = svg().querySelector("[data-other-velocities]") as Element
      expect(others).toHaveAttribute("opacity", "0.35")
      expect(others).toHaveAttribute("pointer-events", "none")
      const other = others.querySelector("[data-voice='1']") as Element
      expect(other).toHaveAttribute("data-velocity", "100")
      expect(other.querySelector("circle")).toHaveAttribute(
        "fill",
        "var(--midiseq-voice-1)",
      )

      // dragging where voice 2's note is moves nothing of voice 2's
      const before = patch().voices[1]
      dragFrom([firstBar, Y(100)], [[firstBar, Y(40)]])
      expect(patch().voices[1]).toBe(before)
      expect(velocities()).toEqual([64, 64])

      // and on its own tab, it is voice 1 that is dimmed
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))
      expect(velocities()).toEqual([100])
      expect(
        svg().querySelectorAll("[data-other-velocities] [data-voice='0']"),
      ).toHaveLength(2)
    })

    it("marks where a note is plain and where it is either accent", () => {
      setup(null, withNotes)
      const levels = [...svg().querySelectorAll("[data-level]")].map((line) =>
        Number(line.getAttribute("data-level")),
      )
      expect(levels).toEqual([44, 64, 84])
    })

    it("makes a point dragged onto an accent's velocity that accent", () => {
      setup(null, withNotes)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(84)]])

      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "+",
        velocityOffset: 0,
      })
      expect(velocities()).toEqual([84, 64])
      // and the dot grows to say so
      expect(dot(1)).toHaveAttribute("data-accent", "+")
    })

    it("snaps a point dropped near an accent's velocity onto it", () => {
      setup(null, withNotes)
      // within a quarter of the accent amount: five either side of 44
      dragFrom([firstBar, Y(64)], [[firstBar, Y(40)]])
      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "-",
        velocityOffset: 0,
      })
      expect(velocities()[0]).toBe(44)
    })

    it("shows a dot's own velocity as the level it is nearest", () => {
      setup(null, withNotes)
      // well past either accent, as dragged in the report: 34 and 100
      dragFrom([firstBar, Y(64)], [[firstBar, Y(34)]])
      dragFrom([secondBar, Y(64)], [[secondBar, Y(100)]])

      expect(velocities()).toEqual([34, 100])
      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "none",
        velocityOffset: -30,
      })
      // nearer 44 than 64 reads small, nearer 84 than 64 reads big
      expect(dot(1)).toHaveAttribute("data-accent", "-")
      expect(dot(1)).toHaveClass("scale-80")
      expect(dot(2)).toHaveAttribute("data-accent", "+")
      expect(dot(2)).toHaveClass("scale-[1.15]")
    })

    it("keeps a point between the levels as the dot's own, at its size", () => {
      setup(null, withNotes)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(72)]])

      expect(patch().voices[0].pattern[0]).toMatchObject({
        accent: "none",
        velocityOffset: 8,
      })
      expect(velocities()[0]).toBe(72)
      expect(dot(1)).toHaveAttribute("data-accent", "none")
      expect(dot(1).title).toContain("Velocity 72")
    })

    it("returns a clicked point's note to the voice's velocity", () => {
      setup(null, withNotes)
      dragFrom([secondBar, Y(64)], [[secondBar, Y(100)]])
      expect(velocities()).toEqual([64, 100])

      clickAt(secondBar, Y(100))
      expect(velocities()).toEqual([64, 64])
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "none",
        velocityOffset: 0,
      })
    })

    it("changes nothing where a stem or the space between is clicked", () => {
      setup(null, withNotes)
      const before = patch()
      clickAt(alongStem(0), Y(64))
      fireEvent.mouseDown(svg(), {
        clientX: X(0.75),
        clientY: Y(20),
        detail: 2,
      })
      fireEvent.mouseUp(document)
      expect(patch()).toBe(before)
      expect(velocities()).toEqual([64, 64])
    })

    it("raises a note by its stem", () => {
      setup(null, withNotes)
      dragFrom([alongStem(1), Y(64)], [[alongStem(1), Y(74)]])
      expect(velocities()).toEqual([64, 74])
    })

    it("moves every point from one dot together", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[0].pattern[0] = { ...next.voices[0].pattern[0], ratchet: 2 }
        return next
      })
      // the first dot's two hits, then the second dot
      expect(velocities()).toEqual([64, 64, 64])
      // each hit as long as a ratchet makes it
      const [hit, , whole] = velocityPoints().map(stem)
      expect(hit.to - hit.from).toBeLessThan(whole.to - whole.from)
      dragFrom([firstBar, Y(64)], [[firstBar, Y(30)]])
      expect(velocities()).toEqual([30, 30, 64])
    })

    it("paints every note a Draw stroke crosses", () => {
      setup(null, withNotes)
      click("Draw")
      dragFrom(
        [X(0.25), Y(30)],
        [
          [X(0.4), Y(30)],
          [X(0.75), Y(30)],
        ],
      )
      // only the second note lies on the stroke's way
      expect(velocities()).toEqual([64, 30])
    })

    it("makes a whole drag one undo entry", () => {
      setup(null, withNotes)
      const before = patch()
      dragFrom(
        [firstBar, Y(64)],
        [
          [firstBar, Y(70)],
          [firstBar, Y(90)],
          [firstBar, Y(100)],
        ],
      )
      fireEvent.click(editItem("Undo"))
      expect(patch()).toBe(before)
    })

    it("switches to Draw with B, as on an envelope", () => {
      setup(null, withNotes)
      frame().focus()
      fireEvent.keyDown(frame(), { code: "KeyB" })
      expect(frame()).toHaveAttribute("data-tool", "draw")
      fireEvent.keyUp(frame(), { code: "KeyB" })
    })

    it("follows the voice of a dot that is edited", () => {
      setup(null, withNotes)
      fireEvent.click(screen.getByRole("button", { name: "Voice 3 Dot 2" }))
      expect(tab("Velocity 3")).toHaveAttribute("aria-selected", "true")

      fireEvent.contextMenu(
        screen.getByRole("button", { name: "Voice 2 Dot 1" }),
      )
      expect(tab("Velocity 2")).toHaveAttribute("aria-selected", "true")
    })

    it("leaves an open CC where it is when a dot is edited", () => {
      setup(ramp, withNotes)
      fireEvent.click(screen.getByRole("button", { name: "Voice 3 Dot 2" }))
      expect(tab("CC 74")).toHaveAttribute("aria-selected", "true")
    })

    it("follows an accent picked on the dot", () => {
      setup(null, withNotes)
      fireEvent.contextMenu(dot(2))
      const options = within(
        screen.getByRole("dialog", { name: "Voice 1 Dot 2" }),
      )
      fireEvent.change(options.getByLabelText("Accent"), {
        target: { value: "-" },
      })
      expect(velocities()).toEqual([64, 44])
    })

    it("takes a velocity typed in the dot's options, exactly", () => {
      setup(null, withNotes)
      fireEvent.contextMenu(dot(2))
      const options = within(
        screen.getByRole("dialog", { name: "Voice 1 Dot 2" }),
      )
      const field = options.getByRole("textbox", { name: "Velocity" })
      expect(field).toHaveValue("64")

      // near the + accent's 84, but kept as typed
      fireEvent.focus(field)
      fireEvent.change(field, { target: { value: "83" } })
      fireEvent.keyDown(field, { key: "Enter" })
      expect(velocities()).toEqual([64, 83])
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "none",
        velocityOffset: 19,
      })

      // one more lands on the accent
      fireEvent.click(options.getByRole("button", { name: "Velocity up" }))
      expect(patch().voices[0].pattern[1]).toMatchObject({
        accent: "+",
        velocityOffset: 0,
      })
      expect(options.getByLabelText("Accent")).toHaveValue("+")
    })

    it("follows the voice's velocity and the accent amount", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[0].pattern[0] = {
          ...next.voices[0].pattern[0],
          accent: "+",
        }
        return next
      })
      expect(velocities()).toEqual([84, 64])

      act(() => rootStore.playbackSettings.setAccentAmount(30))
      expect(velocities()).toEqual([94, 64])

      const voices = within(screen.getByRole("region", { name: "Voices" }))
      fireEvent.click(voices.getByRole("button", { name: "Velocity up" }))
      expect(velocities()).toEqual([95, 65])
    })

    it("shows only its own voice's notes, even where an older patch shares a channel", () => {
      setup(null, (start) => {
        const next = withNotes(start)
        next.voices[1] = {
          ...next.voices[1],
          enabled: true,
          channel: 1,
          pace: "4th",
          velocity: 100,
        }
        return next
      })
      expect(velocities()).toEqual([64, 64])
      fireEvent.click(screen.getByRole("tab", { name: "Velocity 2" }))
      expect(velocities()).toEqual([100])
    })
  })
})
