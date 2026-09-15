#!/usr/bin/env node
/**
 * Encrypts the plaintext dataset (.data/latest.json) into a password-protected
 * blob (public/data/latest.enc) using AES-256-GCM with a PBKDF2-derived key.
 *
 * The browser decrypts it client-side with the shared password (Web Crypto),
 * so on static GitHub Pages the numbers are NOT readable without the password —
 * the plaintext JSON never ships. Posters stay as static images.
 *
 * Requires env DASHBOARD_PASSWORD. No npm deps.
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const IN_FILE = path.join(ROOT, '.data', 'latest.json')
const OUT_FILE = path.join(ROOT, 'public', 'data', 'latest.enc')
const ITER = 150000

const password = process.env.DASHBOARD_PASSWORD
if (!password) {
  console.error('✖ DASHBOARD_PASSWORD env is required')
  process.exit(1)
}
if (!existsSync(IN_FILE)) {
  console.error('✖ .data/latest.json not found — run fetch-meta.mjs first')
  process.exit(1)
}

// Minified on the way in. The file on disk stays pretty-printed because that is
// what makes it readable while debugging a run; the indentation has no business
// in the blob every visitor downloads — on this dataset it is half the bytes.
const raw = await fs.readFile(IN_FILE, 'utf8')
const plaintext = Buffer.from(JSON.stringify(JSON.parse(raw)))
const salt = crypto.randomBytes(16)
const iv = crypto.randomBytes(12)
const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256')
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
const tag = cipher.getAuthTag()
// append the GCM auth tag so Web Crypto's subtle.decrypt accepts it
const ct = Buffer.concat([body, tag])

const blob = {
  v: 1,
  alg: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iter: ITER,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ct: ct.toString('base64'),
}
await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
await fs.writeFile(OUT_FILE, JSON.stringify(blob))
console.log(
  `✔ Encrypted ${(raw.length / 1024).toFixed(0)}KB → ${(plaintext.length / 1024).toFixed(0)}KB minified ` +
    `→ ${path.relative(ROOT, OUT_FILE)} (${(ct.length / 1024).toFixed(0)}KB)`,
)
