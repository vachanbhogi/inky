import math
import numpy as np

RASTER_SIZE = 384
UNIMERNET_MEAN = 0.7931
UNIMERNET_STD = 0.1738


def deskew_strokes(strokes):
	if len(strokes) < 2:
		return strokes

	all_pts = [p for s in strokes for p in s]
	if not all_pts:
		return strokes

	arr = np.array(all_pts)
	min_x, min_y = float(arr[:, 0].min()), float(arr[:, 1].min())
	max_x, max_y = float(arr[:, 0].max()), float(arr[:, 1].max())

	w = max_x - min_x
	h = max_y - min_y
	if w < 50 or w / max(1.0, h) < 1.2:
		return strokes

	n_bins = min(16, max(5, int(w / 25)))
	bin_max = np.full(n_bins, -999999.0)
	bin_x = np.zeros(n_bins)
	bin_cnt = np.zeros(n_bins)

	for s in strokes:
		for p in s:
			b = min(n_bins - 1, max(0, int(((p[0] - min_x) / w) * n_bins)))
			if p[1] > bin_max[b]:
				bin_max[b] = p[1]
			bin_x[b] += p[0]
			bin_cnt[b] += 1

	valid = [(bin_x[i] / bin_cnt[i], bin_max[i]) for i in range(n_bins) if bin_cnt[i] > 0]
	if len(valid) < 3:
		return strokes

	vx = np.array([p[0] for p in valid])
	vy = np.array([p[1] for p in valid])
	poly = np.polyfit(vx, vy, 1)
	ang = math.atan(poly[0])

	if abs(ang) < 3.5 * math.pi / 180 or abs(ang) > 32 * math.pi / 180:
		return strokes

	cx, cy = (min_x + max_x) / 2, (min_y + max_y) / 2
	cos, sin = math.cos(-ang), math.sin(-ang)

	out = []
	for s in strokes:
		pts = []
		for p in s:
			dx, dy = p[0] - cx, p[1] - cy
			rot = [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
			pts.append(tuple(rot + list(p[2:])))
		out.append(pts)
	return out


def rasterize_strokes(strokes, size=RASTER_SIZE, deskew=False):
	bg = (1.0 - UNIMERNET_MEAN) / UNIMERNET_STD
	fg = (0.0 - UNIMERNET_MEAN) / UNIMERNET_STD
	out = np.full((1, 1, size, size), bg, dtype=np.float32)

	if not strokes:
		return out

	inp = deskew_strokes(strokes) if deskew else strokes
	all_pts = [p for s in inp for p in s]
	if not all_pts:
		return out

	arr = np.array(all_pts)
	min_x, min_y = float(arr[:, 0].min()), float(arr[:, 1].min())
	max_x, max_y = float(arr[:, 0].max()), float(arr[:, 1].max())

	w = max(1.0, max_x - min_x)
	h = max(1.0, max_y - min_y)
	scale = min((size - 48) / w, (size - 48) / h)
	ox = (size - w * scale) / 2 - min_x * scale
	oy = (size - h * scale) / 2 - min_y * scale

	grid = np.zeros((size, size), dtype=np.uint8)
	r = 2

	for s in inp:
		for i in range(1, len(s)):
			x1, y1 = s[i - 1][0] * scale + ox, s[i - 1][1] * scale + oy
			x2, y2 = s[i][0] * scale + ox, s[i][1] * scale + oy
			steps = max(1, int(math.hypot(x2 - x1, y2 - y1) * 1.5))
			for st in range(steps + 1):
				cx = int(round(x1 + (x2 - x1) * st / steps))
				cy = int(round(y1 + (y2 - y1) * st / steps))
				for dy in range(-r, r + 1):
					for dx in range(-r, r + 1):
						if dx * dx + dy * dy <= r * r + 1:
							px, py = cx + dx, cy + dy
							if 0 <= px < size and 0 <= py < size:
								grid[py, px] = 1

	out[0, 0][grid == 1] = fg
	return out
