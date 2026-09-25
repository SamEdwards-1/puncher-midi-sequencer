import { fireEvent, screen } from "@testing-library/react"

// An item in a menu of the bar, opening the menu first if it isn't open.
const menuItem =
  (menu: string) =>
  (name: string): HTMLElement => {
    if (screen.queryByRole("menu", { name: menu }) === null) {
      fireEvent.click(screen.getByRole("button", { name: menu }))
    }
    return screen.getByRole("button", { name })
  }

export const editItem = menuItem("Edit")
export const fileItem = menuItem("File")
