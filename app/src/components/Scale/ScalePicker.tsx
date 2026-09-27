import { SCALE_FITS, ScaleFit, ScaleJSON } from "@midiseq/core"
import { FC, useState } from "react"
import { Localized, useLocalization } from "../../localize/useLocalization"
import {
  makeScale,
  SCALE_CHOICES,
  ScaleChoice,
  ScaleGuess,
  sameScale,
  scaleLabel,
  TONICS,
} from "../../theory/scales"
import { Button } from "../ui/Button"
import { Select } from "../ui/Select"

const NONE = ""

/**
 * A scale's tonic and name, or none. The tonic can be picked before a name,
 * and is kept while there is none, so picking one after starts from it.
 * `choices` narrows the names offered; common ones come first, under a
 * heading of their own where there are others.
 */
export const ScaleSelects: FC<{
  scale: ScaleJSON | null
  onScale: (scale: ScaleJSON | null) => void
  choices?: readonly ScaleChoice[]
}> = ({ scale, onScale, choices = SCALE_CHOICES }) => {
  const localized = useLocalization()
  const [tonic, setTonic] = useState(scale?.tonic ?? 0)
  const shownTonic = scale?.tonic ?? tonic
  const fit = scale?.fit ?? "up"
  const common = choices.filter((choice) => choice.common)
  const more = choices.filter((choice) => !choice.common)
  // a scale from a file or an import that isn't offered still shows as
  // itself
  const known = choices.some((choice) => choice.name === scale?.name)
  const options = (list: readonly ScaleChoice[]) =>
    list.map((choice) => (
      <option key={choice.name} value={choice.name}>
        {choice.label}
      </option>
    ))

  return (
    <div className="flex min-w-0 gap-1">
      <Select
        aria-label={localized["sequencer-scale-tonic"]}
        className="w-[3.6rem] flex-none"
        value={shownTonic}
        onChange={(event) => {
          const next = Number(event.target.value)
          setTonic(next)
          if (scale !== null) {
            onScale({ ...scale, tonic: next })
          }
        }}
      >
        {TONICS.map((name, pitch) => (
          <option key={name} value={pitch}>
            {name}
          </option>
        ))}
      </Select>
      <Select
        aria-label={localized["sequencer-scale"]}
        className="min-w-0 flex-1"
        value={scale?.name ?? NONE}
        onChange={(event) =>
          onScale(
            event.target.value === NONE
              ? null
              : makeScale(shownTonic, event.target.value, fit),
          )
        }
      >
        <option value={NONE}>{localized["sequencer-scale-none"]}</option>
        {scale !== null && !known && (
          <option value={scale.name}>
            {SCALE_CHOICES.find((choice) => choice.name === scale.name)
              ?.label ?? scale.name}
          </option>
        )}
        {common.length === 0 || more.length === 0 ? (
          options(choices)
        ) : (
          <>
            <optgroup label={localized["sequencer-scale-common"]}>
              {options(common)}
            </optgroup>
            <optgroup label={localized["sequencer-scale-more"]}>
              {options(more)}
            </optgroup>
          </>
        )}
      </Select>
    </div>
  )
}

/** What becomes of the notes outside the scale: up, down, or left out. */
export const FitButtons: FC<{
  scale: ScaleJSON | null
  onScale: (scale: ScaleJSON) => void
}> = ({ scale, onScale }) => (
  <div className="flex gap-1">
    {SCALE_FITS.map((fit: ScaleFit) => (
      <Button
        key={fit}
        type="button"
        size="field"
        disabled={scale === null}
        active={scale?.fit === fit}
        aria-pressed={scale?.fit === fit}
        onClick={() => scale !== null && onScale({ ...scale, fit })}
      >
        <Localized name={`sequencer-scale-fit-${fit}`} />
      </Button>
    ))}
  </div>
)

/**
 * How a move takes a note that lands outside the scale, as a dropdown for
 * a setting of its own; it does nothing where there is never a scale, when
 * it is `disabled`.
 */
export const FitSelect: FC<{
  value: ScaleFit
  disabled: boolean
  onChange: (fit: ScaleFit) => void
}> = ({ value, disabled, onChange }) => {
  const localized = useLocalization()
  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as ScaleFit)}
    >
      {SCALE_FITS.map((fit) => (
        <option key={fit} value={fit}>
          {localized[`sequencer-scale-fit-${fit}`]}
        </option>
      ))}
    </Select>
  )
}

/**
 * The scales that best fit the notes, to pick with a click; the one in use
 * is lit. Says so when there are no notes to go on.
 */
export const ScaleGuesses: FC<{
  guesses: ScaleGuess[]
  scale: ScaleJSON | null
  onScale: (scale: ScaleJSON) => void
}> = ({ guesses, scale, onScale }) =>
  guesses.length === 0 ? (
    <span className="text-small text-fg-tertiary">
      <Localized name="sequencer-scale-no-notes" />
    </span>
  ) : (
    <div className="flex min-w-0 flex-wrap gap-1" data-scale-guesses>
      {guesses.map((guess) => {
        const label = scaleLabel(guess)
        const on = sameScale(guess, scale)
        return (
          <Button
            key={label}
            type="button"
            size="sm"
            active={on}
            aria-pressed={on}
            onClick={() => {
              const next = makeScale(
                guess.tonic,
                guess.name,
                scale?.fit ?? "up",
              )
              if (next !== null) {
                onScale(next)
              }
            }}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
