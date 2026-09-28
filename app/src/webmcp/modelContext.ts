/**
 * WebMCP, as far as midiseq uses it: a page registers tools on
 * `document.modelContext` — each a name, a description, a JSON Schema for
 * its input and a function — and an agent in the browser calls them.
 * https://webmachinelearning.github.io/webmcp/
 *
 * Only the part of the API a page providing tools needs is typed here; the
 * rest, where an agent finds and calls them, is the browser's.
 */

export interface ToolAnnotations {
  // the tool changes nothing
  readOnlyHint?: boolean
  // what it returns holds text the page didn't write, such as a file's name
  untrustedContentHint?: boolean
}

export interface ModelContextTool {
  // letters, digits, _, - and ., at most 128 of them
  name: string
  // for the browser to show the person, where it says what an agent is doing
  title?: string
  description: string
  inputSchema?: object
  // given the input as an object; what it returns reaches the agent as JSON
  execute: (
    input: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
  annotations?: ToolAnnotations
}

export interface ModelContext {
  // rejects for a name already taken; aborting `signal` takes the tool away
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>
}

/**
 * The page's model context, where the browser offers one — one taking tools
 * a registration at a time, as the API has since it moved to `document`.
 */
export const modelContextOf = (document: Document): ModelContext | null => {
  const context = (document as Document & { modelContext?: ModelContext })
    .modelContext
  return typeof context?.registerTool === "function" ? context : null
}

/**
 * Registers the tools until `signal` is aborted, which takes them all away
 * again. One the browser refuses is left out rather than stopping the rest.
 */
export const registerTools = async (
  context: ModelContext,
  tools: readonly ModelContextTool[],
  signal: AbortSignal,
) => {
  if (signal.aborted) {
    return
  }
  await Promise.all(
    tools.map(async (tool) => {
      try {
        await context.registerTool(tool, { signal })
      } catch (error) {
        console.warn(`Couldn't offer the ${tool.name} tool to agents`, error)
      }
    }),
  )
}
