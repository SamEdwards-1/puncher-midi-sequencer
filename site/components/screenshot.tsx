"use client"

import { Expand, X } from "lucide-react"
import Image from "next/image"
import { useRef } from "react"
import { track } from "../lib/analytics"
import { screenshots } from "../lib/screenshots"

export function Screenshot({
  src,
  caption,
  hero = false,
}: {
  src: keyof typeof screenshots
  caption: string
  hero?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  return (
    <figure className={hero ? "screenshot hero-screenshot" : "screenshot"}>
      <button
        type="button"
        className="screenshot-button"
        aria-label={`Enlarge screenshot: ${caption}`}
        onClick={() => {
          dialog.current?.showModal()
          track("screenshot_open", { screenshot: src })
        }}
      >
        <Image
          src={screenshots[src]}
          alt={caption}
          loading={hero ? "eager" : "lazy"}
          sizes="(max-width: 767px) 90vw, (max-width: 1199px) 65vw, 680px"
        />
        <span className="expand-image">
          <Expand size={16} />
        </span>
      </button>
      {!hero && <figcaption>{caption}</figcaption>}
      <dialog
        ref={dialog}
        className="image-dialog"
        aria-label={caption}
        onClick={(event) => {
          if (event.currentTarget === event.target) dialog.current?.close()
        }}
      >
        <button
          type="button"
          className="image-close icon-button"
          aria-label="Close screenshot"
          onClick={() => dialog.current?.close()}
        >
          <X size={22} />
        </button>
        <Image src={screenshots[src]} alt={caption} unoptimized />
        <p>{caption}</p>
      </dialog>
    </figure>
  )
}
