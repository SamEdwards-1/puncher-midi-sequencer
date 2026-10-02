export const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "production" ? "/edit" : "http://localhost:3000")
export const githubUrl =
  "https://github.com/SamEdwards-1/puncher-midi-sequencer"
