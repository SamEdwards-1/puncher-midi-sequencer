import { FILE_EXTENSION } from "@midiseq/core"

export interface OpenedFile {
  name: string
  text: string
}

interface FilePickers {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
}

const pickerOptions = {
  types: [
    {
      description: "midiseq patch",
      accept: { "application/json": [FILE_EXTENSION] },
    },
  ],
}

/**
 * Opening and saving `.midiseq.json` files. Chrome and Edge can write back to
 * the file that was opened; elsewhere it falls back to a file input and a
 * download.
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
    if (this.pickers.showOpenFilePicker === undefined) {
      return this.openWithInput()
    }
    try {
      const [handle] = await this.pickers.showOpenFilePicker(pickerOptions)
      const file = await handle.getFile()
      this.handle = handle
      return { name: file.name, text: await file.text() }
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
    if (this.pickers.showSaveFilePicker === undefined) {
      return this.download(text, suggestedName)
    }
    try {
      const handle = await this.pickers.showSaveFilePicker({
        ...pickerOptions,
        suggestedName,
      })
      this.handle = handle
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

  private openWithInput(): Promise<OpenedFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input")
      input.type = "file"
      input.accept = FILE_EXTENSION
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
