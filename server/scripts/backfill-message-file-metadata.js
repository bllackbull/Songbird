import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  listMessageFilesNeedingMetadata,
  updateMessageFileMetadata,
} from '../db.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(scriptDir, '..')
const dataDir = path.resolve(serverDir, '..', 'data')
const uploadRootDir = path.join(dataDir, 'uploads', 'messages')

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null
  const signature = '89504e470d0a1a0a'
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!width || !height) return null
  return { width, height }
}

function parseGifDimensions(buffer) {
  if (buffer.length < 10) return null
  const header = buffer.subarray(0, 6).toString('ascii')
  if (header !== 'GIF87a' && header !== 'GIF89a') return null
  const width = buffer.readUInt16LE(6)
  const height = buffer.readUInt16LE(8)
  if (!width || !height) return null
  return { width, height }
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4) return null
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let offset = 2
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xd9 || marker === 0xda) break
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2
      continue
    }
    if (offset + 4 > buffer.length) break
    const blockLength = buffer.readUInt16BE(offset + 2)
    if (blockLength < 2) break
    if (sofMarkers.has(marker)) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      if (!width || !height) return null
      return { width, height }
    }
    offset += 2 + blockLength
  }
  return null
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const dataOffset = offset + 8
    if (dataOffset + chunkSize > buffer.length) break
    if (chunkType === 'VP8X' && chunkSize >= 10) {
      const width = 1 + readUInt24LE(buffer, dataOffset + 4)
      const height = 1 + readUInt24LE(buffer, dataOffset + 7)
      if (width > 0 && height > 0) return { width, height }
    }
    if (chunkType === 'VP8L' && chunkSize >= 5) {
      const b0 = buffer[dataOffset + 1]
      const b1 = buffer[dataOffset + 2]
      const b2 = buffer[dataOffset + 3]
      const b3 = buffer[dataOffset + 4]
      const width = 1 + (b0 | ((b1 & 0x3f) << 8))
      const height = 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10))
      if (width > 0 && height > 0) return { width, height }
    }
    if (chunkType === 'VP8 ' && chunkSize >= 10) {
      const width = buffer.readUInt16LE(dataOffset + 6) & 0x3fff
      const height = buffer.readUInt16LE(dataOffset + 8) & 0x3fff
      if (width > 0 && height > 0) return { width, height }
    }
    offset = dataOffset + chunkSize + (chunkSize % 2)
  }
  return null
}

function parseImageDimensions(filePath) {
  const maxBytes = 512 * 1024
  const fd = fs.openSync(filePath, 'r')
  try {
    const stat = fs.fstatSync(fd)
    const readSize = Math.min(maxBytes, Number(stat.size || 0))
    if (readSize <= 0) return null
    const buffer = Buffer.allocUnsafe(readSize)
    fs.readSync(fd, buffer, 0, readSize, 0)
    return (
      parsePngDimensions(buffer) ||
      parseJpegDimensions(buffer) ||
      parseGifDimensions(buffer) ||
      parseWebpDimensions(buffer)
    )
  } finally {
    fs.closeSync(fd)
  }
}

function hasFfprobe() {
  const test = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' })
  return test.status === 0
}

function probeVideoMetadata(filePath) {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      filePath,
    ],
    { encoding: 'utf8' }
  )
  if (probe.status !== 0) return null
  try {
    const parsed = JSON.parse(probe.stdout || '{}')
    const videoStream = Array.isArray(parsed.streams)
      ? parsed.streams.find((stream) => stream.codec_type === 'video')
      : null
    const width = Number(videoStream?.width)
    const height = Number(videoStream?.height)
    const durationSeconds = Number(videoStream?.duration ?? parsed?.format?.duration)
    return {
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
      durationSeconds:
        Number.isFinite(durationSeconds) && durationSeconds >= 0
          ? Math.round(durationSeconds * 1000) / 1000
          : null,
    }
  } catch (_) {
    return null
  }
}

function isImageMime(mimeType = '') {
  return String(mimeType).toLowerCase().startsWith('image/')
}

function isVideoMime(mimeType = '') {
  return String(mimeType).toLowerCase().startsWith('video/')
}

const args = process.argv.slice(2)
const limitArg = args.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 10000

const ffprobeAvailable = hasFfprobe()
const rows = listMessageFilesNeedingMetadata(limit)

let updated = 0
let skippedMissingFile = 0
let skippedUnknown = 0

for (const row of rows) {
  const filePath = path.join(uploadRootDir, String(row.stored_name || ''))
  if (!row.stored_name || !fs.existsSync(filePath)) {
    skippedMissingFile += 1
    continue
  }

  const mimeType = String(row.mime_type || '').toLowerCase()
  let width = null
  let height = null
  let durationSeconds = null

  if (isImageMime(mimeType)) {
    const imageMeta = parseImageDimensions(filePath)
    if (imageMeta) {
      width = imageMeta.width
      height = imageMeta.height
    } else if (ffprobeAvailable) {
      const fallbackMeta = probeVideoMetadata(filePath)
      width = fallbackMeta?.width ?? null
      height = fallbackMeta?.height ?? null
    }
  } else if (isVideoMime(mimeType)) {
    if (ffprobeAvailable) {
      const videoMeta = probeVideoMetadata(filePath)
      width = videoMeta?.width ?? null
      height = videoMeta?.height ?? null
      durationSeconds = videoMeta?.durationSeconds ?? null
    }
  } else {
    skippedUnknown += 1
    continue
  }

  const hasAnyNewMetadata =
    (width && !row.width_px) ||
    (height && !row.height_px) ||
    (durationSeconds !== null && !row.duration_seconds)
  if (!hasAnyNewMetadata) continue

  updateMessageFileMetadata(row.id, {
    widthPx: width,
    heightPx: height,
    durationSeconds,
  })
  updated += 1
}

console.log(`Data directory: ${dataDir}`)
console.log(`Upload directory: ${uploadRootDir}`)
console.log(`Scanned rows: ${rows.length}`)
console.log(`Updated rows: ${updated}`)
console.log(`Skipped (missing file): ${skippedMissingFile}`)
console.log(`Skipped (non-media): ${skippedUnknown}`)
if (!ffprobeAvailable) {
  console.log('ffprobe not found: video duration/size backfill was skipped for video files.')
}
