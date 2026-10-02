import { act, screen } from "@testing-library/react"

/**
 * A dialog that has just been asked to open, once it has. The dialogs load
 * the first time they open, which in a test means transforming them then:
 * longer than a query waits by default when the whole suite runs at once.
 * React has also yet to run the dialog's effects when it first shows, which
 * is where it starts following the stores, so they are run before a test
 * goes on to use it.
 */
export const opened = async (name: string | RegExp): Promise<HTMLElement> => {
  const dialog = await screen.findByRole(
    "dialog",
    { name },
    { timeout: 10_000 },
  )
  await act(async () => {})
  return dialog
}
