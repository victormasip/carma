// Build a downloadable WordPress plugin zip from wordpress-plugin/carma-blog/
// into public/carma-blog.zip — the file the dashboard "Connect to WordPress"
// panel links to. Dependency-free (a tiny store-only ZIP writer), deterministic.
//
// Run after changing the plugin source:  node scripts/build-wp-zip.mjs

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = 'wordpress-plugin/carma-blog'
const PREFIX = 'carma-blog' // top folder inside the zip (WP plugin slug)
const OUT = 'public/carma-blog.zip'

// ── CRC32 ──────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function walk(dir, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
}

const files = []
walk(SRC, files)
files.sort()

const local = []
const central = []
let offset = 0
const DOS_DATE = 0x21 // 1980-01-01, valid + deterministic
const DOS_TIME = 0

for (const file of files) {
  const data = readFileSync(file)
  const name = PREFIX + '/' + relative(SRC, file).split('\\').join('/')
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)

  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0) // local file header sig
  lfh.writeUInt16LE(20, 4)         // version needed
  lfh.writeUInt16LE(0, 6)          // flags
  lfh.writeUInt16LE(0, 8)          // method 0 = store
  lfh.writeUInt16LE(DOS_TIME, 10)
  lfh.writeUInt16LE(DOS_DATE, 12)
  lfh.writeUInt32LE(crc, 14)
  lfh.writeUInt32LE(data.length, 18) // compressed size
  lfh.writeUInt32LE(data.length, 22) // uncompressed size
  lfh.writeUInt16LE(nameBuf.length, 26)
  lfh.writeUInt16LE(0, 28)          // extra len
  local.push(lfh, nameBuf, data)

  const cdh = Buffer.alloc(46)
  cdh.writeUInt32LE(0x02014b50, 0) // central dir sig
  cdh.writeUInt16LE(20, 4)         // version made by
  cdh.writeUInt16LE(20, 6)         // version needed
  cdh.writeUInt16LE(0, 8)
  cdh.writeUInt16LE(0, 10)
  cdh.writeUInt16LE(DOS_TIME, 12)
  cdh.writeUInt16LE(DOS_DATE, 14)
  cdh.writeUInt32LE(crc, 16)
  cdh.writeUInt32LE(data.length, 20)
  cdh.writeUInt32LE(data.length, 24)
  cdh.writeUInt16LE(nameBuf.length, 28)
  cdh.writeUInt16LE(0, 30) // extra
  cdh.writeUInt16LE(0, 32) // comment
  cdh.writeUInt16LE(0, 34) // disk no
  cdh.writeUInt16LE(0, 36) // internal attrs
  cdh.writeUInt32LE(0, 38) // external attrs
  cdh.writeUInt32LE(offset, 42)
  central.push(cdh, nameBuf)

  offset += lfh.length + nameBuf.length + data.length
}

const centralBuf = Buffer.concat(central)
// End Of Central Directory record — the map every unzipper reads FIRST to locate
// the central directory. The field offsets are fixed by the ZIP spec (APPNOTE
// 4.3.16); getting one wrong yields a file that opens to ZERO entries, which is
// exactly how WordPress reported "Incompatible Archive / no valid plugins found".
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0) // signature
eocd.writeUInt16LE(0, 4)          // number of this disk
eocd.writeUInt16LE(0, 6)          // disk with the start of the central directory
eocd.writeUInt16LE(files.length, 8)  // central-dir records on this disk
eocd.writeUInt16LE(files.length, 10) // total central-dir records
eocd.writeUInt32LE(centralBuf.length, 12) // size of central directory (bytes 12–15)
eocd.writeUInt32LE(offset, 16)    // OFFSET of central directory — MUST be byte 16, not 14
eocd.writeUInt16LE(0, 20)         // .ZIP comment length

const zip = Buffer.concat([...local, centralBuf, eocd])
mkdirSync('public', { recursive: true })
writeFileSync(OUT, zip)
console.log(`wrote ${OUT} — ${zip.length} bytes, ${files.length} files`)
for (const f of files) console.log('  +', PREFIX + '/' + relative(SRC, f).split('\\').join('/'))
