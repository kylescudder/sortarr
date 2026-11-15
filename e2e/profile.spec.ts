import { test, expect } from '@playwright/test'
import sharp from 'sharp'

// A large photo, like a 24 MP iPhone shot, as a JPEG.
const photo = async () =>
  sharp({
    create: {
      width: 5712,
      height: 4284,
      channels: 3,
      background: '#e8b04b'
    }
  })
    .jpeg({ quality: 80 })
    .toBuffer()

for (const iphoneLimit of [false, true])
  test(`uploads and removes a profile photo${iphoneLimit ? ' when createImageBitmap refuses it, as iOS Safari does' : ''}`, async ({
    page
  }, info) => {
    if (iphoneLimit)
      await page.addInitScript(() => {
        window.createImageBitmap = () =>
          Promise.reject(new DOMException('decode limit', 'InvalidStateError'))
      })
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Sign out' }).waitFor()
    await page.locator('input[type=file]').setInputFiles({
      name: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
      buffer: await photo()
    })
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
