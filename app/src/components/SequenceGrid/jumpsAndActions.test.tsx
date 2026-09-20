import { createDefaultPatch } from "@midiseq/core"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import RootStore from "../../stores/RootStore"
import { ManualTicker } from "../../test/fakes"
import { App } from "../App/App"

let rootStore: RootStore

const patch = () => rootStore.sequencerStore.patch
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }))
const sequencerPanel = () =>
  within(screen.getByRole("region", { name: "Sequencer" }))

const setup = () => {
  rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  render(<App rootStore={rootStore} />)
  click("Step 1")
}

describe("jumps", () => {
  it("picks a destination from the grid", () => {
    setup()
    expect(sequencerPanel().getByText("None")).toBeInTheDocument()

    fireEvent.click(
      sequencerPanel().getAllByRole("button", { name: "Pick" })[0],
    )
    click("Step 5")

    expect(patch().steps[0].jump.dest).toBe(4)
    // picking ends after one step, so the grid goes back to selecting
    click("Step 3")
    expect(patch().steps[0].jump.dest).toBe(4)
  })

  it("picks a normal step and clears it again", () => {
    setup()
    fireEvent.click(
      sequencerPanel().getAllByRole("button", { name: "Pick" })[1],
    )
    click("Step 7")
    expect(patch().steps[0].jump.normal).toBe(6)

    click("Clear normal")
    expect(patch().steps[0].jump.normal).toBeNull()
  })

  it("marks a jump's source and destination in one colour", () => {
    setup()
    fireEvent.click(
      sequencerPanel().getAllByRole("button", { name: "Pick" })[0],
    )
    click("Step 5")

    const source = screen.getByRole("button", { name: "Step 1" })
    const dest = screen.getByRole("button", { name: "Step 5" })
    const colour = source.getAttribute("data-jump-source")

    expect(colour).toBeTruthy()
    // the pair shares its colour, and each marks its own corner
    expect(dest.getAttribute("data-jump-dest")).toBe(colour)
    expect(source.getAttribute("data-jump-dest")).toBeNull()
    expect(dest.getAttribute("data-jump-source")).toBeNull()
  })

  it("gives each jump its own colour", () => {
    setup()
    fireEvent.click(
      sequencerPanel().getAllByRole("button", { name: "Pick" })[0],
    )
    click("Step 5")

    click("Step 2")
    fireEvent.click(
      sequencerPanel().getAllByRole("button", { name: "Pick" })[0],
    )
    click("Step 6")

    const first = screen
      .getByRole("button", { name: "Step 1" })
      .getAttribute("data-jump-source")
    const second = screen
      .getByRole("button", { name: "Step 2" })
      .getAttribute("data-jump-source")
    expect(first).not.toBe(second)
  })

  it("changes the jump rule", () => {
    setup()
    fireEvent.change(sequencerPanel().getByLabelText("Rule"), {
      target: { value: "every:3" },
    })
    expect(patch().steps[0].jump.rule).toEqual({ kind: "every", n: 3 })

    fireEvent.change(sequencerPanel().getByLabelText("Rule"), {
      target: { value: "chance:25" },
    })
    expect(patch().steps[0].jump.rule).toEqual({ kind: "chance", pct: 25 })
  })
})

describe("preview on click", () => {
  // preview is remembered between visits, so it is set explicitly
  const setPreview = (on: boolean) => {
    const toggle = screen.getByRole("switch", {
      name: "Audition step",
    }) as HTMLInputElement
    if (toggle.checked !== on) {
      fireEvent.click(toggle)
    }
  }

  it("sounds a clicked step while it is on", () => {
    setup()
    const preview = vi.spyOn(rootStore.player, "previewStep")
    setPreview(true)

    click("Step 4")
    expect(preview).toHaveBeenCalledWith(3)
  })

  it("stays quiet while it is off, but still selects", () => {
    setup()
    const preview = vi.spyOn(rootStore.player, "previewStep")
    setPreview(false)

    click("Step 4")
    expect(preview).not.toHaveBeenCalled()
    expect(screen.getByText(/Step Editor 4/)).toBeInTheDocument()
  })
})

describe("marking rests and skips", () => {
  it("marks and unmarks steps while the mode is on", () => {
    setup()
    click("Rest")
    click("Step 2")
    click("Step 3")
    expect(patch().steps[1].state).toBe("rest")
    expect(patch().steps[2].state).toBe("rest")

    // clicking a marked step takes the mark off again
    click("Step 2")
    expect(patch().steps[1].state).toBe("normal")

    click("Rest")
    click("Step 4")
    expect(patch().steps[3].state).toBe("normal")
  })

  it("marks skips", () => {
    setup()
    click("Skip")
    click("Step 6")
    expect(patch().steps[5].state).toBe("skip")
  })
})

describe("action buttons", () => {
  it("holds an action while the button is down", () => {
    setup()
    const hang = screen.getByRole("button", { name: "Hang" })

    fireEvent.pointerDown(hang)
    expect(rootStore.player.actions.hang).toBe(true)

    fireEvent.pointerUp(hang)
    expect(rootStore.player.actions.hang).toBe(false)
  })

  it("holds an action while its key is down", () => {
    setup()
    fireEvent.keyDown(window, { code: "KeyF" })
    expect(rootStore.player.actions.flip).toBe(true)

    fireEvent.keyUp(window, { code: "KeyF" })
    expect(rootStore.player.actions.flip).toBe(false)
  })

  // latch is view state and lives on between tests, so it is set explicitly
  const setLatch = (on: boolean) => {
    const latch = screen.getByRole("switch", {
      name: "Latch",
    }) as HTMLInputElement
    if (latch.checked !== on) {
      fireEvent.click(latch)
    }
    return latch
  }

  it("latches an action on and off", () => {
    setup()
    setLatch(true)

    const bump = screen.getByRole("button", { name: "Bump" })
    fireEvent.pointerDown(bump)
    fireEvent.pointerUp(bump)
    expect(rootStore.player.actions.bump).toBe(true)

    fireEvent.pointerDown(bump)
    fireEvent.pointerUp(bump)
    expect(rootStore.player.actions.bump).toBe(false)
  })

  it("drops held actions when latch is switched off", () => {
    setup()
    setLatch(true)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Shift" }))
    expect(rootStore.player.actions.shift).toBe(true)

    setLatch(false)
    expect(rootStore.player.actions.shift).toBe(false)
  })
})

describe("step options", () => {
  it("opens on a right-click and edits the dot", () => {
    setup()
    const dot = screen.getByRole("button", { name: "Dot 2" })
    fireEvent.contextMenu(dot)

    const options = within(screen.getByRole("dialog", { name: "Dot 2" }))
    fireEvent.change(options.getByLabelText("Ratchet"), {
      target: { value: "3" },
    })
    expect(patch().voices[0].pattern[1].ratchet).toBe(3)

    fireEvent.change(options.getByLabelText("Condition"), {
      target: { value: "3:3" },
    })
    expect(patch().voices[0].pattern[1].condition).toBe("3:3")

    fireEvent.click(options.getByRole("button", { name: "Reset dot" }))
    expect(patch().voices[0].pattern[1]).toMatchObject({
      ratchet: 1,
      condition: "always",
      on: true,
    })
    expect(screen.queryByRole("dialog", { name: "Dot 2" })).toBeNull()
  })

  it("marks the dot being edited", () => {
    setup()
    const dot = screen.getByRole("button", { name: "Dot 5" })
    expect(dot).toHaveAttribute("data-editing", "false")

    fireEvent.contextMenu(dot)
    expect(dot).toHaveAttribute("data-editing", "true")
    expect(screen.getByRole("button", { name: "Dot 6" })).toHaveAttribute(
      "data-editing",
      "false",
    )

    fireEvent.keyDown(window, { key: "Escape" })
    expect(dot).toHaveAttribute("data-editing", "false")
  })

  it("closes on Escape", () => {
    setup()
    fireEvent.contextMenu(screen.getByRole("button", { name: "Dot 1" }))
    expect(screen.getByRole("dialog", { name: "Dot 1" })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Dot 1" })).toBeNull()
  })
})
