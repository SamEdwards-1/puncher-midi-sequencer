/**
 * Keeps each element's computed style until something that could change it
 * does.
 *
 * Testing Library's role queries ask for the style of nearly every element
 * they look at, to leave out what's hidden. jsdom caches styles too, but
 * forgets them all on any change to the document, and working one out again
 * means matching its whole built-in stylesheet against the element and its
 * ancestors. After each click, the next query re-did that for most of the
 * app, and that was most of the tests' time.
 *
 * With no stylesheets of our own (Vitest doesn't load CSS), an element's
 * style comes from its attributes and its ancestors', and jsdom's built-in
 * sheet has no sibling or structural selectors. So a change to an element's
 * attributes, or where it sits, can only change the styles in its subtree,
 * and those are the only ones forgotten.
 */
export const cacheComputedStyles = () => {
  const compute = window.getComputedStyle.bind(window)
  let styles = new WeakMap<Element, CSSStyleDeclaration>()

  const forget = (node: Node) => {
    if (node instanceof Element) {
      styles.delete(node)
      for (const each of node.querySelectorAll("*")) {
        styles.delete(each)
      }
    }
  }

  const apply = (records: MutationRecord[]) => {
    for (const change of records) {
      if (change.type === "attributes") {
        forget(change.target)
      } else if (change.type === "childList") {
        change.addedNodes.forEach(forget)
        change.removedNodes.forEach(forget)
        styles.delete(change.target as Element)
      } else if (change.target.parentElement !== null) {
        // :dir(auto) goes by the text
        styles.delete(change.target.parentElement)
      }
    }
  }

  // the observer is handed changes a microtask later, so a style asked for
  // before then takes them early
  const changes = new MutationObserver(apply)
  changes.observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  })

  window.getComputedStyle = (element, pseudoElement) => {
    apply(changes.takeRecords())
    if (pseudoElement != null || document.styleSheets.length > 0) {
      styles = new WeakMap()
      return compute(element, pseudoElement)
    }
    let style = styles.get(element)
    if (style === undefined) {
      style = compute(element)
      styles.set(element, style)
    }
    return style
  }
}
