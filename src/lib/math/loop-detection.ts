function getIntersection(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): [number, number] | null {
  const denom = (d[1] - c[1]) * (b[0] - a[0]) - (d[0] - c[0]) * (b[1] - a[1])
  if (denom === 0) return null

  const ua = ((d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0])) / denom
  const ub = ((b[0] - a[0]) * (a[1] - c[1]) - (b[1] - a[1]) * (a[0] - c[0])) / denom

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return [a[0] + ua * (b[0] - a[0]), a[1] + ua * (b[1] - a[1])]
  }
  return null
}

export function isClosedLoop(pts: [number, number][]) {
  const n = pts.length
  if (n < 8) return { isLoop: false }

  const tailLimit = Math.min(Math.floor(n * 0.5), 45)
  const headLimit = Math.min(Math.floor(n * 0.6), 45)

  for (let i = n - 2; i >= n - tailLimit; i--) {
    for (let j = 0; j < headLimit; j++) {
      if (Math.abs(i - j) <= 2) continue
      const hit = getIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1])
      if (hit) {
        const poly: [number, number][] = [hit, ...pts.slice(j + 1, i + 1), hit]
        let dist = 0
        for (let k = 1; k < poly.length; k++) {
          dist += Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1])
        }
        if (dist >= 70) {
          return { isLoop: true, polygon: poly }
        }
      }
    }
  }

  let perimeter = 0
  for (let i = 1; i < n; i++) {
    perimeter += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  if (perimeter < 70) return { isLoop: false }

  const end = pts[n - 1]
  let minGap = 999999
  let startIdx = 0

  const checkCount = Math.min(15, Math.floor(n * 0.35))
  for (let i = 0; i < checkCount; i++) {
    const d = Math.hypot(end[0] - pts[i][0], end[1] - pts[i][1])
    if (d < minGap) {
      minGap = d
      startIdx = i
    }
  }

  if (minGap > Math.max(50, perimeter * 0.35)) {
    return { isLoop: false }
  }

  const loopPts = pts.slice(startIdx)
  const closed = [...loopPts, loopPts[0], loopPts[1]]
  let angleSum = 0

  for (let i = 1; i < closed.length - 1; i++) {
    const dx1 = closed[i][0] - closed[i - 1][0]
    const dy1 = closed[i][1] - closed[i - 1][1]
    const dx2 = closed[i + 1][0] - closed[i][0]
    const dy2 = closed[i + 1][1] - closed[i][1]

    angleSum += Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2)
  }

  if (Math.abs(angleSum) >= 4.2) {
    return {
      isLoop: true,
      polygon: [...loopPts, loopPts[0]],
    }
  }

  return { isLoop: false }
}
