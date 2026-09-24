import { FILE_EXTENSION, PATTERNS_EXTENSION } from "@midiseq/core"

export interface OpenedFile {
  name: string
  text: string
}

interface FilePickers {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
}

// What a picker offers, and what a file input accepts.
export interface FileKind {
  description: string
  extension: string
}

export const PATCH_FILE: FileKind = {
  description: "midiseq patch",
  extension: FILE_EXTENSION,
}

export const PATTERNS_FILE: FileKind = {
  description: "midiseq patterns",
  extension: PATTERNS_EXTENSION,
}

const pickerOptions = (kind: FileKind) => ({
  types: [
    {
      description: kind.description,
      accept: { "application/json": [kind.extension] },
    },
  ],
})

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

  // Reads a file without making it the one Save writes to.
  async openCopy(kind: FileKind): Promise<OpenedFile | null> {
    return this.pick(kind)
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
    } catch {
      // the picker was dismissed
      return null
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
    text: string,
    suggestedName: string,
    kind: FileKind,
  ): Promise<string | null> {
    return this.saveTo(text, suggestedName, kind, false)
  }

  private async saveTo(
    text: string,
    suggestedName: string,
    kind: FileKind,
    remember: boolean,
  ): Promise<string | null> {
    if (this.pickers.showSaveFilePicker === undefined) {
      return this.download(text, suggestedName)
    }
    try {
      const handle = await this.pickers.showSaveFilePicker({
        ...pickerOptions(kind),
        suggestedName,
      })
      if (remember) {
        this.handle = handle
      }
      return this.write(handle, text)
    } catch {
      return null
    }
  }

  private async write(
    handle: FileSystemFileHandle,
    text: string,
  ): Promise<string> {
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return handle.name
  }

  private openWithInput(kind: FileKind): Promise<OpenedFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = kind.extension
      input.onchange = async () => {
        const file = input.files?.[0]
        resolve(
          file === undefined
            ? null
            : { name: file.name, text: await file.text() },
        )
      }
      input.oncancel = () => resolve(null)
      input.click()
    })
  }

  private download(text: string, name: string): string {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    return name
  }
}
