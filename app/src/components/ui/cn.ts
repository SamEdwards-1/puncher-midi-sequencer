// Joins class names, dropping whatever is absent. Conflicting utilities are
// avoided by choosing between them here rather than letting two land on the
// same element, where the stylesheet's order would decide.
export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter((part) => typeof part === "string").join(" ")
