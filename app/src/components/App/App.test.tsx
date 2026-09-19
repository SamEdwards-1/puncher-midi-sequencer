import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import RootStore from "../../stores/RootStore"
import { App } from "./App"

describe("App", () => {
  it("renders the sequencer editor layout", () => {
    render(<App rootStore={new RootStore()} />)

    expect(screen.getByRole("banner")).toBeInTheDocument()
    expect(screen.getByText("Sequencer")).toBeInTheDocument()
    expect(screen.getByText("Jumps")).toBeInTheDocument()
    expect(screen.getByText("Sequence Grid")).toBeInTheDocument()
    expect(screen.getByText("Voices")).toBeInTheDocument()
    for (const action of ["Hang", "Bump", "Flip", "Shift"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument()
    }
  })

  it("shows the patch name from the sequencer store", () => {
    const rootStore = new RootStore()
    render(<App rootStore={rootStore} />)
    expect(screen.getByText("Untitled")).toBeInTheDocument()

    act(() => {
      rootStore.sequencerStore.name = "Bassline"
    })
    expect(screen.getByText("Bassline")).toBeInTheDocument()
  })
})
