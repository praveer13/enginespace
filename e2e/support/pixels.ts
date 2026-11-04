/*
 * Looking at a capture's pixels, for the check that a 3D picture is drawn and not blank (ARCHITECTURE §10.1: "3D scenes are captured as
 * artifacts and checked for 'rendered and not blank' by sampling pixels, never by pixel diff. SwiftShader output is not a reference").
 *
 * A production build does not keep a WebGL frame to read back, so the page cannot be asked for its canvas: the capture is a screenshot,
 * a PNG that this decodes in a blank tab of the same browser, the way the browser itself decodes images, with no library.
 */
import type { BrowserContext } from '@playwright/test'

export interface PixelStats {
  width: number
  height: number
  /** How many pixels were looked at: a grid over the picture. */
  samples: number
  /** Distinct colours among them, at 5 bits a channel. A flat picture has one. */
  colours: number
  /** The standard deviation of their luma, 0 to 255. A flat picture has none. */
  spread: number
}

export async function pixelStats(context: BrowserContext, png: Buffer): Promise<PixelStats> {
  const tab = await context.newPage()
  try {
    return await tab.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const drawing = canvas.getContext('2d')
      if (drawing === null) throw new Error('no 2D canvas to read the picture with')
      drawing.drawImage(bitmap, 0, 0)
      const { data, width, height } = drawing.getImageData(0, 0, canvas.width, canvas.height)
      const colours = new Set<string>()
      let sum = 0
      let squares = 0
      let samples = 0
      const stepY = Math.max(1, Math.floor(height / 40))
      const stepX = Math.max(1, Math.floor(width / 60))
      for (let y = 2; y < height; y += stepY) {
        for (let x = 2; x < width; x += stepX) {
          const i = (y * width + x) * 4
          const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
          colours.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`)
          sum += luma
          squares += luma * luma
          samples += 1
        }
      }
      const mean = sum / samples
      return { width, height, samples, colours: colours.size, spread: Math.sqrt(Math.max(0, squares / samples - mean * mean)) }
    }, png.toString('base64'))
  } finally {
    await tab.close()
  }
}

/**
 * Whether a capture shows a drawn scene. The bars are those of e2e/loop-scene.spec.ts's check on the loop's canvas: more than 40
 * colours in the grid, and a luma spread above 12 [estimated]. A blank or a single-colour canvas has one colour and no spread.
 */
export const looksDrawn = (stats: PixelStats): boolean => stats.colours > 40 && stats.spread > 12
