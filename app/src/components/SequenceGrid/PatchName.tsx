import { FC, useRef, useState } from "react"
import { usePatchEditor } from "../../actions/patch"
import { useMobxSelector } from "../../hooks/useMobxSelector"
import { useStores } from "../../hooks/useStores"
import { useLocalization } from "../../localize/useLocalization"

/**
 * The patch's name, in the grid's bar where its title would be. A click
 * edits it in place: Enter or leaving the field keeps it, one undoable edit,
 * and Escape lets it be. A name left empty keeps the one it had.
 */
export const PatchName: FC = () => {
  const { sequencerStore } = useStores()
  const { editSequencer } = usePatchEditor()
  const localized = useLocalization()
  const name = useMobxSelector(
    () => sequencerStore.patch.name,
    [sequencerStore],
  )
  // the text being typed, while the name is being edited
  const [draft, setDraft] = useState<string | null>(null)
  // whether this edit is over, so the blur as the field goes adds nothing
  const done = useRef(false)

  const start = () => {
    done.current = false
    setDraft(name)
  }
  const cancel = () => {
    done.current = true
    setDraft(null)
  }
  const commit = () => {
    if (done.current) {
      return
    }
    done.current = true
    const next = draft?.trim() ?? ""
    setDraft(null)
    if (next !== "" && next !== name) {
      editSequencer({ name: next })
    }
  }

  if (draft !== null) {
    return (
      <input
        type="text"
        aria-label={localized["sequencer-patch-name"]}
        value={draft}
        spellCheck={false}
        maxLength={200}
        // biome-ignore lint/a11y/noAutofocus: the field replaces the name just clicked
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit()
          } else if (event.key === "Escape") {
            cancel()
          }
        }}
        className="box-border w-full min-w-0 rounded-sm border border-theme bg-background px-[0.3rem] py-0 font-semibold text-title text-fg focus:outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      title={localized["sequencer-patch-rename"]}
      aria-label={`${localized["sequencer-patch-name"]}: ${name}`}
      onClick={start}
      className="-mx-[0.3rem] block max-w-full cursor-text truncate rounded-sm border border-transparent px-[0.3rem] text-left font-semibold text-title text-fg hover:border-divider"
    >
      {name}
    </button>
  )
}
