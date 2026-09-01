import fs from 'node:fs'

let transCount = 0

function loadFromDisk() {
  try {
    if (fs.existsSync('transCount')) {
      const raw = fs.readFileSync('transCount', 'utf8')
      const n = Number(raw)
      if (!Number.isNaN(n)) transCount = n
    }
  } catch (e) {
    console.warn('transCount load failed', e)
  }
  if (transCount === 0) saveToDisk()
}

function saveToDisk() {
  try {
    fs.writeFileSync('transCount', transCount + ' ', 'utf8')
  } catch (e) {
    console.warn('transCount save failed', e)
  }
}

loadFromDisk()

export function increaseTransCount() {
  transCount++
  saveToDisk()
}

export function getTransCount() {
  return transCount
}
