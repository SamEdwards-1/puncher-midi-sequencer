import { fireEvent, screen } from "@testing-library/react"

// An item in the Edit menu, opening the menu first if it isn't open.
export const editItem = (name: string): HTMLElement => {
  if (screen.queryByRole("menu", { name: "Edit" }) === null) {
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
  }
  return screen.getByRole("button", { name })
}
