import { describe, expect, it } from "vitest"
import { GRAPH_HEIGHT } from "./EnvelopeGraph"
import { graphHeightFor } from "./graphHeight"

// an editor 200 tall besides its graph, in a view 600 tall
const rest = 200
const view = 600

describe("the envelope graph's height in the column", () => {
  it("is its own while the editor is not all in view", () => {
    // the editor's bottom is 100 below the window's
    expect(graphHeightFor({ room: 340, rest, view })).toBe(GRAPH_HEIGHT)
    // and just in view
    expect(graphHeightFor({ room: 440, rest, view })).toBe(GRAPH_HEIGHT)
  })

  it("then grows by as far as the column scrolls on", () => {
    expect(graphHeightFor({ room: 441, rest, view })).toBe(GRAPH_HEIGHT + 1)
    expect(graphHeightFor({ room: 520, rest, view })).toBe(GRAPH_HEIGHT + 80)
  })

  it("keeps the editor's bottom on the window's, to the nearest pixel", () => {
    expect(graphHeightFor({ room: 520.4, rest, view })).toBe(GRAPH_HEIGHT + 80)
    expect(graphHeightFor({ room: 520, rest: 199.6, view })).toBe(
      GRAPH_HEIGHT + 80,
    )
  })

  it("stops once the editor fills the view", () => {
    expect(graphHeightFor({ room: 600, rest, view })).toBe(400)
    expect(graphHeightFor({ room: 900, rest, view })).toBe(400)
  })

  it("keeps its own height where the view is too short to grow in", () => {
    expect(graphHeightFor({ room: 900, rest, view: 400 })).toBe(GRAPH_HEIGHT)
    expect(graphHeightFor({ room: 900, rest, view: 0 })).toBe(GRAPH_HEIGHT)
  })
})
