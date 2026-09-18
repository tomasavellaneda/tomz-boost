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

  /**
   * Escribe a disco ANTES de actualizar el cache en memoria. Con el orden
   * inverso (cache primero), un fallo de writeFileSync (permisos, disco
   * lleno) dejaba el cache con un valor que en realidad nunca se persistio:
   * get() devolvia "guardado" durante el resto de la sesion aunque en el
   * proximo inicio de la app se perdiera el cambio. Ahora, si falla, el
   * cache retiene el ultimo valor realmente persistido y la excepcion se
   * propaga para que el llamador se entere.
   */
  set(value: T): void {
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), 'utf-8')
    this.cache = value
  }

  getDataDir(): string {
    return join(app.getPath('userData'), 'data')
  }
}
