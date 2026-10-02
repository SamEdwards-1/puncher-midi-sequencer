export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "production" ? "/edit" : "http://localhost:3000")
export const githubUrl =
  "https://github.com/SamEdwards-1/puncher-midi-sequencer"
// The Google Tag Manager container shared with the editor (see
// app/vite.config.ts). Only a production build loads it, so local visits
// aren't counted.
export const tagManagerId =
  process.env.NODE_ENV === "production" ? "GTM-TGX7SPN4" : null
