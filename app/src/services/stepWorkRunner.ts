import { exportStepMidi, previewStep, stepEvents } from "@midiseq/core"
import type { StepWorkJob, StepWorkResult } from "./StepWork"

export const runStepWork = (job: StepWorkJob): StepWorkResult => {
  switch (job.kind) {
    case "preview":
      return {
        id: job.id,
        kind: "preview",
        preview: previewStep(job.patch, job.step, {
          accentAmount: job.accentAmount,
        }),
      }
    case "events":
      return {
        id: job.id,
        kind: "events",
        events: stepEvents(job.patch, job.step, {
          accentAmount: job.accentAmount,
        }),
      }
    case "midi":
      return {
        id: job.id,
        kind: "midi",
        bytes: exportStepMidi(job.patch, job.step, job.options),
      }
  }
}
