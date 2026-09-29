import { fireEvent, within } from "@testing-library/react"

// The options a combo box offers, opening its list first if it isn't open.
export const comboOptions = (field: HTMLElement): HTMLElement[] => {
  if (field.getAttribute("aria-expanded") !== "true") {
    fireEvent.keyDown(field, { key: "ArrowDown" })
  }
  const list = document.getElementById(
    field.getAttribute("aria-controls") ?? "",
  )
  return within(list as HTMLElement).getAllByRole("option")
}

// Picks a combo box's option by its label, clicking it in the open list.
export const choose = (field: HTMLElement, label: string) => {
  const option = comboOptions(field).find((each) => each.textContent === label)
  if (option === undefined) {
    throw new Error(`No option "${label}"`)
  }
  fireEvent.click(option)
}
