import { JsonStore } from '../utils/store'

// Interruptor maestro: cuando esta apagado, el watcher de juegos (games.ts)
// no aplica ningun perfil automaticamente aunque un juego individual tenga
// "autoWatch" activado.
const store = new JsonStore<{ enabled: boolean }>('auto-cpu-set.json', { enabled: true })

export function isAutoCpuSetEnabled(): boolean {
  return store.get().enabled
}

export function setAutoCpuSetEnabled(enabled: boolean): void {
  store.set({ enabled })
}
