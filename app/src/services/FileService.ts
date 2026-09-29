import {
  FILE_EXTENSION,
  MIDI_EXTENSION,
  PATTERNS_EXTENSION,
} from "@midiseq/core"

export interface OpenedFile {
  name: string
  text: string
}

// A binary file, such as MIDI, as it was read.
export interface OpenedBinaryFile {
  name: string
  bytes: Uint8Array
}

interface FilePickers {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
}

// What a picker offers, and what a file input accepts.
export interface FileKind {
  description: string
  extension: string
  // JSON unless it says otherwise
  mimeType?: string
  // other extensions it is also found under
  alsoAccepts?: string[]
}

// A file's contents: text, or bytes for a binary format such as MIDI.
export type FileContents = string | Uint8Array<ArrayBuffer>

export const PATCH_FILE: FileKind = {
  description: "midiseq patch",
  extension: FILE_EXTENSION,
}

export const PATTERNS_FILE: FileKind = {
  description: "midiseq patterns",
  extension: PATTERNS_EXTENSION,
}

export const MIDI_FILE: FileKind = {
  description: "MIDI file",
  extension: MIDI_EXTENSION,
  mimeType: "audio/midi",
  alsoAccepts: [".midi"],
}

export const WAV_FILE: FileKind = {
  description: "WAV audio",
  extension: ".wav",
  mimeType: "audio/wav",
}

export const MP3_FILE: FileKind = {
  description: "MP3 audio",
  extension: ".mp3",
  mimeType: "audio/mpeg",
}

const mimeTypeOf = (kind: FileKind) => kind.mimeType ?? "application/json"

const extensionsOf = (kind: FileKind) => [
  kind.extension,
  ...(kind.alsoAccepts ?? []),
]

const pickerOptions = (kind: FileKind) => ({
  types: [
    {
      description: kind.description,
      accept: { [mimeTypeOf(kind)]: extensionsOf(kind) },
    },
  ],
})

// A file picked, with nothing read from it yet, and its handle where the
// browser gives one, to open it again later.
export interface PickedFile {
  file: File
  handle: FileSystemFileHandle | null
}

// Chrome and Edge ask again before a handle kept from an earlier visit is
// read; the DOM types don't declare how.
interface PermissionedHandle {
  queryPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: "read" }) => Promise<PermissionState>
}

const allowReading = async (handle: FileSystemFileHandle) => {
  const asking = handle as FileSystemFileHandle & PermissionedHandle
  const read = { mode: "read" } as const
  if (
    asking.queryPermission === undefined ||
    (await asking.queryPermission(read)) === "granted"
  ) {
    return
  }
  if ((await asking.requestPermission?.(read)) !== "granted") {
    throw new Error("The browser wasn't allowed to read it.")
  }
}

/** Whether a file opened again has since been moved or deleted. */
export const isGone = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError"

// Closing a picker is a choice, and ends quietly. Anything else is a failure
// the person clicking needs to hear about, so it carries on up.
const dismissed = (error: unknown): null => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return null
  }
  throw error
}

/**
 * Opening and saving `.midiseq.json` files. Chrome and Edge can write back to
 * the file that was opened; elsewhere it falls back to a file input and a
 * download. Other files — exported patterns — are read and written as copies,
 * leaving the patch's own file where it was.
 */
export class FileService {
  private handle: FileSystemFileHandle | null = null

  // the pickers live on window, where the DOM types don't declare them
  constructor(
    private readonly pickers: FilePickers = window as unknown as FilePickers,
  ) {}

  get canWriteInPlace(): boolean {
    return this.handle !== null
  }

  // the patch's own file, as last opened or saved, where there is a handle
  get currentHandle(): FileSystemFileHandle | null {
    return this.handle
  }

  forget() {
    this.handle = null
  }

  async open(): Promise<OpenedFile | null> {
    const opened = await this.pick(PATCH_FILE)
    if (opened !== null && opened.handle !== null) {
      this.handle = opened.handle
    }
    return opened
  }

  // Opens a patch file again by the handle kept for it, without a picker.
  async reopen(handle: FileSystemFileHandle): Promise<OpenedFile> {
    const file = await this.reread(handle)
    const text = await file.text()
    this.handle = handle
    return { name: file.name, text }
  }

  // A file, such as MIDI, again by the handle kept for it, not yet read.
  async reread(handle: FileSystemFileHandle): Promise<File> {
    await allowReading(handle)
    return handle.getFile()
  }

  // Reads a file without making it the one Save writes to.
  async openCopy(kind: FileKind): Promise<OpenedFile | null> {
    return this.pick(kind)
  }

  // Reads a binary file, such as MIDI, as bytes.
  async openBinary(kind: FileKind): Promise<OpenedBinaryFile | null> {
    const picked = await this.pickFile(kind)
    return picked === null
      ? null
      : {
          name: picked.file.name,
          bytes: new Uint8Array(await picked.file.arrayBuffer()),
        }
  }

  // The file picked, with nothing read from it yet, so whoever asked can
  // say it is loading before reading it.
  async pickFile(kind: FileKind): Promise<PickedFile | null> {
    if (this.pickers.showOpenFilePicker === undefined) {
      const file = await this.fileFromInput(kind)
      return file === null ? null : { file, handle: null }
    }
    try {
      const [handle] = await this.pickers.showOpenFilePicker(
        pickerOptions(kind),
      )
      return { file: await handle.getFile(), handle }
    } catch (error) {
      return dismissed(error)
    }
  }

  private async pick(
    kind: FileKind,
  ): Promise<(OpenedFile & { handle: FileSystemFileHandle | null }) | null> {
    if (this.pickers.showOpenFilePicker === undefined) {
      const opened = await this.openWithInput(kind)
      return opened === null ? null : { ...opened, handle: null }
    }
    try {
      const [handle] = await this.pickers.showOpenFilePicker(
        pickerOptions(kind),
      )
      const file = await handle.getFile()
      return { name: file.name, text: await file.text(), handle }
    } catch (error) {
      return dismissed(error)
    }
  }

  // Writes back to the open file when there is one, and asks where to put it
  // otherwise.
  async save(text: string, suggestedName: string): Promise<string | null> {
    if (this.handle !== null) {
      return this.write(this.handle, text)
    }
    return this.saveAs(text, suggestedName)
  }

  async saveAs(text: string, suggestedName: string): Promise<string | null> {
    return this.saveTo(text, suggestedName, PATCH_FILE, true)
  }

  // Writes a file without making it the one Save writes to.
  async saveCopy(
    contents: FileContents,
    suggestedName: string,
    kind: FileKind,
  ): Promise<string | null> {
    return this.saveTo(contents, suggestedName, kind, false)
  }

  /**
   * Asks where a copy goes now, while the click that asked for it still
   * lets a picker open, and gives back what writes it there — for a file
   * that takes a while to make. Where there is no picker, the copy is
   * downloaded under `suggestedName` once it is written.
   */
  async saveCopyLater(
    suggestedName: string,
    kind: FileKind,
  ): Promise<((contents: FileContents) => Promise<string>) | null> {
    if (this.pickers.showSaveFilePicker === undefined) {
      return async (contents) => this.download(contents, suggestedName, kind)
    }
    try {
      const handle = await this.pickers.showSaveFilePicker({
        ...pickerOptions(kind),
        suggestedName,
      })
      return (contents) => this.write(handle, contents)
    } catch (error) {
      return dismissed(error)
    }
  }

  private async saveTo(
    text: FileContents,
    suggestedName: string,
    kind: FileKind,
    remember: boolean,
  ): Promise<string | null> {
    if (this.pickers.showSaveFilePicker === undefined) {
      return this.download(text, suggestedName, kind)
    }
    try {
      const handle = await this.pickers.showSaveFilePicker({
        ...pickerOptions(kind),
        suggestedName,
      })
      if (remember) {
        this.handle = handle
      }
      return await this.write(handle, text)
    } catch (error) {
      return dismissed(error)
    }
  }

  private async write(
    handle: FileSystemFileHandle,
    text: FileContents,
  ): Promise<string> {
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return handle.name
  }

  private async openWithInput(kind: FileKind): Promise<OpenedFile | null> {
    const file = await this.fileFromInput(kind)
    return file === null ? null : { name: file.name, text: await file.text() }
  }

  private fileFromInput(kind: FileKind): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = extensionsOf(kind).join(",")
      input.onchange = () => resolve(input.files?.[0] ?? null)
      input.oncancel = () => resolve(null)
      input.click()
    })
  }

  private download(
    contents: FileContents,
    name: string,
    kind: FileKind = PATCH_FILE,
  ): string {
    const url = URL.createObjectURL(
      new Blob([contents], { type: mimeTypeOf(kind) }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    return name
  }
}
