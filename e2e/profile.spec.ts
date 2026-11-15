import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'

// A 12 MP photo, the size iPhones save by default. Random pixels don't
// compress, so the cropped 512 px upload is well over 100 KB, like a real
// photo; a flat colour compressed to a few KB and hid an 8 KB body limit.
const photo = () => {
  const width = 4032
  const height = 3024
  return sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 }
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

for (const iphoneLimit of [false, true])
  test(`uploads and removes a profile photo${iphoneLimit ? ' when createImageBitmap refuses it, as iOS Safari does' : ''}`, async ({
    page
  }, info) => {
    if (iphoneLimit)
      await page.addInitScript(() => {
        window.createImageBitmap = (image: ImageBitmapSource) =>
          Promise.reject(
            new DOMException(
              `iOS decode limit for ${image.constructor.name}`,
              'InvalidStateError'
            )
          )
      })
    // The server must accept a realistically sized upload (a body limit
    // once cut these off with an empty 413).
    const upload = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/profile/avatar') &&
        r.request().method() === 'PUT'
    )
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Sign out' }).waitFor()
    await page.locator('input[type=file]').setInputFiles({
      name: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
      buffer: await photo()
    })
    expect((await upload).status()).toBe(200)
    const avatar = page.locator('img[src^="/api/profile/avatar?v="]').first()
    await expect(avatar).toBeVisible()
    const response = await page.request.get((await avatar.getAttribute('src'))!)
    expect(response.headers()['content-type']).toBe('image/jpeg')
    expect((await sharp(await response.body()).metadata()).width).toBe(256)
    await page.screenshot({
      path: info.outputPath('profile-photo.png'),
      fullPage: true
    })
    await page.getByRole('button', { name: 'Change avatar' }).click()
    await page.getByRole('menuitem', { name: /delete|remove/i }).click()
    await expect(avatar).toHaveCount(0)
  })
