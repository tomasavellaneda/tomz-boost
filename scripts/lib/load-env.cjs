const { existsSync, readFileSync } = require('fs')
const { join } = require('path')

function loadDotEnv() {
  const files = [join(__dirname, '..', '..', '.env'), join(__dirname, '..', '.env')]
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const text = line.trim()
      if (!text || text.startsWith('#')) continue
      const eq = text.indexOf('=')
      if (eq === -1) continue
      const key = text.slice(0, eq).trim()
      let value = text.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && process.env[key] == null) process.env[key] = value
    }
  }
}

loadDotEnv()
