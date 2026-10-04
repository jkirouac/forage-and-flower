// Renders public/icon.svg to the PNG sizes phones need for the home screen.
import fs from 'node:fs'
import sharp from 'sharp'

const src = 'public/icon.svg'
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp(src).resize(size, size).png().toFile(`public/${name}`)
}
// Maskable: the same art with extra padding so Android's round crop keeps the flower whole.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2f5d46' } })
  .composite([{ input: await sharp(src).resize(380, 380).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile('public/icon-maskable-512.png')
fs.copyFileSync(src, 'public/favicon.svg')
console.log('icons written')
