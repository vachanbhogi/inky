export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return ''

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0.toFixed(2), y0.toFixed(2), ((x0 + x1) / 2).toFixed(2), ((y0 + y1) / 2).toFixed(2))
      return acc
    },
    ['M', ...stroke[0].map((num) => num.toFixed(2)), 'Q']
  )

  d.push('Z')
  return d.join(' ')
}
