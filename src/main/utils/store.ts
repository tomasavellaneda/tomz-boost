import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Store JSON minimalista persistido en userData, sin dependencias externas. */
export class JsonStore<T> {
  private filePath: string
  private cache: T

  constructor(fileName: string, defaultValue: T) {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, fileName)
    this.cache = defaultValue
    this.load()
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        this.cache = JSON.parse(readFileSync(this.filePath, 'utf-8')) as T
      } catch {
        // ignora archivo corrupto, se queda con el default
      }
    }
  }

  get(): T {
    return this.cache
  }

  set(value: T): void {
    this.cache = value
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), 'utf-8')
  }

  getDataDir(): string {
    return join(app.getPath('userData'), 'data')
  }
}
