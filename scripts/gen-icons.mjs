/**
 * gen-icons.mjs
 *
 * 从源 PNG 生成 Electron 打包所需的图标格式：
 *   resources/icon.ico   — Windows（多尺寸 ICO，含 16/32/48/256px）
 *   resources/icon.png   — Linux（512×512）
 *
 * 用法：node scripts/gen-icons.mjs [source.png]
 * 默认源文件：resources/icon.png
 */

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')

const src = process.argv[2] ?? resolve(root, 'resources', 'icon.png')
const srcAbs = resolve(src)

console.log(`[gen-icons] 源文件: ${srcAbs}`)

// ── 去白背景：将近白色像素（RGB > 240）设为透明 ────────────────────────────────
async function removeWhiteBackground(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = Buffer.from(data)
  for (let i = 0; i < pixels.length; i += info.channels) {
    if (pixels[i] > 240 && pixels[i + 1] > 240 && pixels[i + 2] > 240) {
      pixels[i + 3] = 0
    }
  }
  return sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer()
}

// ── 手写 ICO 容器（Vista+ 支持 ICO 内嵌 PNG，NSIS 完全兼容）─────────────────
// ICO 格式：ICONDIR(6B) + N×ICONDIRENTRY(16B) + N×image_data
function buildIco(pngBufs) {
  const count = pngBufs.length
  const headerSize = 6 + count * 16
  const offsets = []
  let offset = headerSize
  for (const buf of pngBufs) {
    offsets.push(offset)
    offset += buf.length
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)     // reserved
  header.writeUInt16LE(1, 2)     // type = 1 (icon)
  header.writeUInt16LE(count, 4) // image count

  const dirEntries = pngBufs.map((buf, i) => {
    // 从 PNG IHDR 读实际尺寸
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    const entry = Buffer.alloc(16)
    entry.writeUInt8(w >= 256 ? 0 : w, 0)  // width  (0 = 256)
    entry.writeUInt8(h >= 256 ? 0 : h, 1)  // height (0 = 256)
    entry.writeUInt8(0, 2)                  // colorCount
    entry.writeUInt8(0, 3)                  // reserved
    entry.writeUInt16LE(1, 4)               // planes
    entry.writeUInt16LE(32, 6)              // bitCount
    entry.writeUInt32LE(buf.length, 8)      // bytesInRes
    entry.writeUInt32LE(offsets[i], 12)     // imageOffset
    return entry
  })

  return Buffer.concat([header, ...dirEntries, ...pngBufs])
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
const processedBuf = await removeWhiteBackground(srcAbs)
console.log('[gen-icons] ✓ 白色背景已去除')

mkdirSync(resolve(root, 'resources'), { recursive: true })

// 1. icon.png（Linux，512×512）
const pngOut = resolve(root, 'resources', 'icon.png')
await sharp(processedBuf)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(pngOut)
console.log('[gen-icons] ✓ resources/icon.png  (512×512)')

// 2. icon.ico（Windows，多尺寸）
const ICO_SIZES = [16, 32, 48, 256]
const pngBufs = await Promise.all(
  ICO_SIZES.map((size) =>
    sharp(processedBuf)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
)
const icoBuffer = buildIco(pngBufs)
const icoOut = resolve(root, 'resources', 'icon.ico')
writeFileSync(icoOut, icoBuffer)
console.log(`[gen-icons] ✓ resources/icon.ico  (${ICO_SIZES.join('/')}px, ${icoBuffer.length} bytes)`)

console.log('[gen-icons] ℹ  resources/icon.icns — 在 macOS 打包时用 iconutil 生成，Windows 跳过')
console.log('[gen-icons] 完成')
