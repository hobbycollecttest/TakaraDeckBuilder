export type ImageCard = { src: string; qty: number }
export type DeckImageInput = {
  name: string
  brand: string
  curveLabels: string[]
  legal: boolean
  total: number
  size: number
  curve: number[]
  groups: { label: string; count: number; cards: ImageCard[] }[]
  colors: { label: string; color: string; count: number }[]
  site: string
}

const W = 1600
const PAD = 56
const COLS = 8
const GAP = 16
const CARD_W = (W - PAD * 2 - GAP * (COLS - 1)) / COLS
const CARD_H = CARD_W * (838 / 600)
const CURVE_W = 350
const SANS = "'IBM Plex Sans', system-ui, sans-serif"
const COND = "'IBM Plex Sans Condensed', 'IBM Plex Sans', system-ui, sans-serif"

function load(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('A card picture failed to load'))
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

// Draws the deck as one picture: name and count on top, every card with its quantity, colors and site at the bottom.
export async function renderDeckImage(input: DeckImageInput): Promise<Blob> {
  await document.fonts?.ready
  const BAR_GAP = input.curve.length >= 10 ? 10 : 16
  const BAR_W = (CURVE_W - BAR_GAP * (input.curve.length - 1)) / input.curve.length
  const groups = input.groups.filter((g) => g.cards.length)
  const rows = (n: number) => Math.ceil(n / COLS)
  const HEAD = 150
  const LABEL = 58
  const FOOT = 96
  const height = PAD + HEAD + groups.reduce((h, g) => h + LABEL + rows(g.cards.length) * (CARD_H + GAP), 0) + FOOT

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = Math.round(height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot make the picture')
  ctx.fillStyle = '#17171a'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.textBaseline = 'alphabetic'

  // header
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 54px ${SANS}`
  ctx.fillText(fit(ctx, input.name || 'Untitled deck', W - PAD * 2 - 260 - CURVE_W - 60), PAD, PAD + 58)
  ctx.font = `700 22px ${COND}`
  ctx.fillStyle = '#b9b9be'
  ctx.fillText(input.brand, PAD, PAD + 100)
  // cost curve, between the name and the count
  const peak = Math.max(1, ...input.curve)
  const cx = W - PAD - 250 - CURVE_W
  const base = PAD + 76
  ctx.textAlign = 'center'
  input.curve.forEach((n, i) => {
    const x = cx + i * (BAR_W + BAR_GAP)
    const h = n ? Math.max(3, (n / peak) * 52) : 1
    ctx.fillStyle = n ? '#ffffff' : '#3a3a40'
    ctx.fillRect(x, base - h, BAR_W, h)
    if (n) {
      ctx.font = `600 16px ${COND}`
      ctx.fillStyle = '#d6d6da'
      ctx.fillText(String(n), x + BAR_W / 2, base - h - 6)
    }
    ctx.font = `500 16px ${COND}`
    ctx.fillStyle = '#8a8b91'
    ctx.fillText(input.curveLabels[i], x + BAR_W / 2, base + 22)
  })
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 64px ${COND}`
  const sizeText = `/${input.size}`
  ctx.font = `500 30px ${COND}`
  const sizeW = ctx.measureText(sizeText).width
  ctx.fillStyle = '#8a8b91'
  ctx.fillText(sizeText, W - PAD, PAD + 58)
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 64px ${COND}`
  ctx.fillText(String(input.total), W - PAD - sizeW - 4, PAD + 58)
  ctx.font = `500 22px ${SANS}`
  ctx.fillStyle = input.legal ? '#6fcf8a' : '#e0786f'
  ctx.fillText(input.legal ? 'Legal deck' : input.total === input.size ? 'Not a legal deck' : input.total < input.size ? `${input.size - input.total} cards short` : `${input.total - input.size} cards over`, W - PAD, PAD + 100)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#3a3a40'
  ctx.fillRect(PAD, PAD + HEAD - 22, W - PAD * 2, 1)

  let y = PAD + HEAD
  for (const g of groups) {
    ctx.font = `600 20px ${SANS}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(g.label.toUpperCase(), PAD, y + 30)
    ctx.fillStyle = '#8a8b91'
    ctx.font = `600 22px ${COND}`
    ctx.fillText(String(g.count), PAD + 14 + measure(ctx, g.label.toUpperCase(), `600 20px ${SANS}`), y + 30)
    y += LABEL
    const images = await Promise.all(g.cards.map((c) => load(c.src)))
    g.cards.forEach((c, i) => {
      const x = PAD + (i % COLS) * (CARD_W + GAP)
      const cy = y + Math.floor(i / COLS) * (CARD_H + GAP)
      ctx.save()
      roundRect(ctx, x, cy, CARD_W, CARD_H, CARD_W * 0.045)
      ctx.clip()
      ctx.drawImage(images[i], x, cy, CARD_W, CARD_H)
      ctx.restore()
      // quantity badge
      const r = 25
      const bx = x + CARD_W - r - 8
      const by = cy + CARD_H - r - 8
      ctx.beginPath()
      ctx.arc(bx, by, r + 3, 0, Math.PI * 2)
      ctx.fillStyle = '#17171a'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(bx, by, r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.fillStyle = '#17171a'
      ctx.font = `700 30px ${COND}`
      ctx.textAlign = 'center'
      ctx.fillText(String(c.qty), bx, by + 11)
      ctx.textAlign = 'left'
    })
    y += rows(g.cards.length) * (CARD_H + GAP)
  }

  // footer
  ctx.fillStyle = '#3a3a40'
  ctx.fillRect(PAD, y + 14, W - PAD * 2, 1)
  let x = PAD
  ctx.font = `500 22px ${SANS}`
  for (const c of input.colors) {
    ctx.beginPath()
    ctx.arc(x + 9, y + 54, 9, 0, Math.PI * 2)
    ctx.fillStyle = c.color
    ctx.fill()
    ctx.fillStyle = '#d6d6da'
    const text = `${c.label} ${c.count}`
    ctx.fillText(text, x + 28, y + 62)
    x += 28 + ctx.measureText(text).width + 34
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = '#8a8b91'
  ctx.fillText(input.site, W - PAD, y + 62)
  ctx.textAlign = 'left'

  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made'))), 'image/png'))
}

function measure(ctx: CanvasRenderingContext2D, text: string, font: string) {
  const prev = ctx.font
  ctx.font = font
  const w = ctx.measureText(text).width
  ctx.font = prev
  return w
}
