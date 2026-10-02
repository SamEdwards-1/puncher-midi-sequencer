import { createDefaultPatch } from "@midiseq/core"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { App } from "../components/App/App"
import RootStore from "../stores/RootStore"
import { ManualTicker } from "../test/fakes"
import { ModelContext, ModelContextTool } from "./modelContext"

// what the browser has registered, as it keeps them: by name, until the
// registration's signal is aborted
let registered: Map<string, ModelContextTool>

beforeEach(() => {
  registered = new Map()
  const context: ModelContext = {
    registerTool: async (tool, options) => {
      if (registered.has(tool.name)) {
        throw new DOMException(tool.name, "InvalidStateError")
      }
      registered.set(tool.name, tool)
      options?.signal?.addEventListener("abort", () =>
        registered.delete(tool.name),
      )
    },
  }
  Object.defineProperty(document, "modelContext", {
    value: context,
    configurable: true,
  })
})

afterEach(() => {
  delete (document as { modelContext?: ModelContext }).modelContext
})

const TOOLS = 15

const show = async () => {
  const rootStore = new RootStore({
    requestMIDIAccess: null,
    ticker: new ManualTicker(),
    storage: null,
  })
  rootStore.sequencerStore.patch = createDefaultPatch()
  const shown = render(<App rootStore={rootStore} />)
  await waitFor(() => expect(registered.size).toBe(TOOLS))
  return { rootStore, shown }
}

const run = (name: string, input: unknown) =>
  act(async () => {
    const tool = registered.get(name)
    if (tool === undefined) {
      throw new Error(`${name} isn't registered`)
    }
    // biome-ignore lint/suspicious/noExplicitAny: a tool's result is whatever JSON it returns
    return (await tool.execute(input)) as any
  })

describe("WebMCP", () => {
  it("offers the sequencer's tools for as long as it is shown", async () => {
    const { shown } = await show()
    expect([...registered.keys()]).toContain("set_steps")

    shown.unmount()
    expect(registered.size).toBe(0)
  })

  it("offers nothing where the browser has no WebMCP", async () => {
    delete (document as { modelContext?: ModelContext }).modelContext
    render(
      <App
        rootStore={
          new RootStore({
            requestMIDIAccess: null,
            ticker: new ManualTicker(),
            storage: null,
          })
        }
      />,
    )
    await act(async () => {})
    expect(registered.size).toBe(0)
  })

  it("shows an agent's edits as they land, as a person's would be", async () => {
    const { rootStore } = await show()

    await run("set_steps", { steps: [{ step: 7, notes: ["E4", "G4", "C4"] }] })
    // the step editor goes to the step, which lists its notes as played
    expect(screen.getByText(/Step Editor 7/)).toBeInTheDocument()
    expect(screen.getByLabelText("Note 1")).toHaveValue("E4")
    expect(
      within(screen.getByRole("region", { name: "Grid" })).getByRole("button", {
        name: "Step 7",
      }),
    ).toHaveAttribute("data-has-notes", "true")

    await run("set_voices", { voices: [{ voice: 3, enabled: true }] })
    expect(screen.getByRole("button", { name: "Voice 3" })).toHaveAttribute(
      "data-active",
      "true",
    )

    // and Edit → Undo takes it back, one call at a time
    await act(async () => rootStore.history.undo())
    await act(async () => rootStore.history.undo())
    expect(rootStore.sequencerStore.patch.steps[6].notes).toEqual([])
  })

  it("reads what a person has selected", async () => {
    await show()
    await act(async () =>
      screen.getByRole("button", { name: "Step 12" }).click(),
    )
    const { selected } = await run("get_sequence", {})
    expect(selected.step).toBe(12)
  })

  it("shares the step it copies with the grid's menu", async () => {
    const { rootStore } = await show()
    await run("set_steps", { steps: [{ step: 1, notes: ["C4", "E4"] }] })
    await run("step_menu", { step: 1, action: "copy" })

    // a person pastes it from a step's right-click menu
    fireEvent.contextMenu(
      within(screen.getByRole("region", { name: "Grid" })).getByRole("button", {
        name: "Step 3",
      }),
    )
    const menu = screen.getByRole("menu", { name: "Step 3" })
    fireEvent.click(within(menu).getByRole("button", { name: "Paste" }))
    expect(rootStore.sequencerStore.patch.steps[2].notes).toEqual([60, 64])
  })
})
