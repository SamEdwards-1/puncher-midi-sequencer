// Settings are kept in local storage as JSON, one key each.

export const read = (storage: Storage | null, key: string): unknown => {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null")
  } catch {
    return null
  }
}

export const write = (storage: Storage | null, key: string, value: unknown) => {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // storage can be full or blocked; the choice just won't persist
  }
}

export const defaultStorage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
