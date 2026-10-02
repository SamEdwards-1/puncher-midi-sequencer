// The editor's columns, shared with the top bar so the transport can end
// where the grid's column does.
export type Columns = "three" | "two" | "one"

export const THREE_COLUMN_TRACKS =
  "grid-cols-[minmax(calc(16rem-25px),calc(20rem-25px))_1fr_minmax(calc(18rem+100px),calc(22rem+100px))]"
export const TWO_COLUMN_TRACKS =
  "grid-cols-[minmax(calc(18rem+100px),calc(22rem+100px))_1fr]"
