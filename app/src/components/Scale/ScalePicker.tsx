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
import { ComboBox, ComboOption } from "../ui/ComboBox"
import { cn } from "../ui/cn"

const NONE = ""

const TONIC_OPTIONS = TONICS.map((name, pitch) => ({
  value: pitch,
  label: name,
}))

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
  className?: string
}> = ({ scale, onScale, choices = SCALE_CHOICES, className }) => {
  const localized = useLocalization()
  const [tonic, setTonic] = useState(scale?.tonic ?? 0)
  const shownTonic = scale?.tonic ?? tonic
  const fit = scale?.fit ?? "up"
  // a scale from a file or an import that isn't offered still shows as
  // itself
  const known = choices.some((choice) => choice.name === scale?.name)
  // common names come first, under a heading of their own where there are
  // others
  const common = choices.filter((choice) => choice.common)
  const more = choices.filter((choice) => !choice.common)
  const grouped = common.length > 0 && more.length > 0
  const names: ComboOption<string>[] = [
    { value: NONE, label: localized["sequencer-scale-none"] },
    ...(scale !== null && !known
      ? [
          {
            value: scale.name,
            label:
              SCALE_CHOICES.find((choice) => choice.name === scale.name)
                ?.label ?? scale.name,
          },
        ]
      : []),
    ...(grouped ? [...common, ...more] : choices).map((choice) => ({
      value: choice.name,
      label: choice.label,
      group: !grouped
        ? undefined
        : choice.common
          ? localized["sequencer-scale-common"]
          : localized["sequencer-scale-more"],
    })),
  ]

  return (
    <div className={cn("flex min-w-0 gap-1", className)}>
      <ComboBox
        aria-label={localized["sequencer-scale-tonic"]}
        className="w-[3.4rem] flex-none"
        value={shownTonic}
        options={TONIC_OPTIONS}
        onChange={(next) => {
          setTonic(next)
          if (scale !== null) {
            onScale({ ...scale, tonic: next })
          }
        }}
      />
      <ComboBox
        aria-label={localized["sequencer-scale"]}
        className="min-w-0 flex-1"
        value={scale?.name ?? NONE}
        options={names}
        onChange={(name) =>
          onScale(name === NONE ? null : makeScale(shownTonic, name, fit))
        }
      />
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
 * a setting of its own.
 */
export const FitSelect: FC<{
  value: ScaleFit
  onChange: (fit: ScaleFit) => void
}> = ({ value, onChange }) => {
  const localized = useLocalization()
  return (
    <ComboBox
      value={value}
      options={SCALE_FITS.map((fit) => ({
        value: fit,
        label: localized[`sequencer-scale-fit-${fit}`],
      }))}
      onChange={onChange}
    />
  )
}

/**
 * The scales that best fit the notes, as tags to pick with a click, and
 * last chromatic — no scale at all — which is always there; the one in use
 * is lit.
 */
export const ScaleGuesses: FC<{
  guesses: ScaleGuess[]
  scale: ScaleJSON | null
  onScale: (scale: ScaleJSON | null) => void
  className?: string
}> = ({ guesses, scale, onScale, className }) => (
  <div
    className={cn("flex min-w-0 flex-wrap gap-1", className)}
    data-scale-guesses
  >
    {guesses.map((guess) => {
      const label = scaleLabel(guess)
      const on = sameScale(guess, scale)
      return (
        <Button
          key={label}
          type="button"
          size="pill"
          active={on}
          aria-pressed={on}
          onClick={() => {
            const next = makeScale(guess.tonic, guess.name, scale?.fit ?? "up")
            if (next !== null) {
              onScale(next)
            }
          }}
        >
          {label}
        </Button>
      )
    })}
    <Button
      type="button"
      size="pill"
      active={scale === null}
      aria-pressed={scale === null}
      onClick={() => onScale(null)}
    >
      <Localized name="sequencer-scale-chromatic" />
    </Button>
  </div>
)
