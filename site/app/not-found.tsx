import Link from "next/link"

export default function NotFound() {
  return (
    <main id="main" className="not-found">
      <p className="eyebrow">404 / STEP NOT FOUND</p>
      <h1>This page isn't in the sequence.</h1>
      <p>Use search to find a guide, or return to the support overview.</p>
      <Link className="primary-button" href="/">
        Back to support →
      </Link>
    </main>
  )
}
