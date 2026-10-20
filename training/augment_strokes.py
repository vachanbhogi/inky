import math
import random


def apply_affine_shear(strokes, shear_angle_deg=None):
	if not strokes:
		return strokes
	if shear_angle_deg is None:
		shear_angle_deg = random.uniform(-25.0, 25.0)

	theta = math.radians(shear_angle_deg)
	tan_t = math.tan(theta)

	all_pts = [pt for s in strokes for pt in s]
	if not all_pts:
		return strokes
	cy = sum(p[1] for p in all_pts) / len(all_pts)

	sheared = []
	for s in strokes:
		sheared.append([(x + tan_t * (y - cy), y) for (x, y) in s])
	return sheared


def apply_speed_resampling(strokes, drop_prob=0.35, min_dist=2.0):
	resampled = []
	for s in strokes:
		if len(s) <= 2:
			resampled.append(list(s))
			continue

		new_s = [s[0]]
		for i in range(1, len(s) - 1):
			prev = new_s[-1]
			curr = s[i]
			d = math.hypot(curr[0] - prev[0], curr[1] - prev[1])
			if d < min_dist or (random.random() < drop_prob):
				continue
			new_s.append(curr)

		new_s.append(s[-1])
		resampled.append(new_s)
	return resampled


def apply_baseline_wobble(strokes, amplitude=None, frequency=None):
	all_pts = [pt for s in strokes for pt in s]
	if not all_pts:
		return strokes

	min_x = min(p[0] for p in all_pts)
	max_x = max(p[0] for p in all_pts)
	min_y = min(p[1] for p in all_pts)
	max_y = max(p[1] for p in all_pts)
	w = max(0.001, max_x - min_x)
	h = max(0.001, max_y - min_y)

	if amplitude is None:
		amplitude = random.uniform(0.03, 0.15) * h
	if frequency is None:
		cycles = random.uniform(0.5, 2.0)
		frequency = (2.0 * math.pi * cycles) / w

	phi = random.uniform(0, 2.0 * math.pi)

	wobbled = []
	for s in strokes:
		wobbled.append([
			(x, y + amplitude * math.sin(frequency * (x - min_x) + phi))
			for (x, y) in s
		])
	return wobbled


def apply_jitter(strokes, sigma_ratio=0.008):
	all_pts = [pt for s in strokes for pt in s]
	if not all_pts:
		return strokes
	min_x, max_x = min(p[0] for p in all_pts), max(p[0] for p in all_pts)
	min_y, max_y = min(p[1] for p in all_pts), max(p[1] for p in all_pts)
	diag = math.hypot(max_x - min_x, max_y - min_y)
	sigma = max(0.2, sigma_ratio * diag)

	jittered = []
	for s in strokes:
		jittered.append([
			(x + random.gauss(0, sigma), y + random.gauss(0, sigma))
			for (x, y) in s
		])
	return jittered


def apply_touching_ligatures(strokes, compression_factor=None):
	all_pts = [pt for s in strokes for pt in s]
	if not all_pts:
		return strokes
	min_x = min(p[0] for p in all_pts)
	max_x = max(p[0] for p in all_pts)
	cx = (min_x + max_x) / 2.0

	if compression_factor is None:
		compression_factor = random.uniform(0.70, 0.90)

	compressed = []
	for s in strokes:
		compressed.append([
			(cx + (x - cx) * compression_factor, y)
			for (x, y) in s
		])
	return compressed


def sample_brush_thickness(min_r=1.5, max_r=4.5):
	return random.uniform(min_r, max_r)


class StrokeAugmentor:
	def __init__(
		self,
		shear_prob=0.6,
		speed_resample_prob=0.5,
		baseline_wobble_prob=0.5,
		jitter_prob=0.4,
		touching_prob=0.35,
		min_brush_radius=1.5,
		max_brush_radius=4.5,
	):
		self.shear_prob = shear_prob
		self.speed_resample_prob = speed_resample_prob
		self.baseline_wobble_prob = baseline_wobble_prob
		self.jitter_prob = jitter_prob
		self.touching_prob = touching_prob
		self.min_brush_radius = min_brush_radius
		self.max_brush_radius = max_brush_radius

	def __call__(self, strokes):
		augmented = [list(s) for s in strokes]

		if random.random() < self.touching_prob:
			augmented = apply_touching_ligatures(augmented)

		if random.random() < self.baseline_wobble_prob:
			augmented = apply_baseline_wobble(augmented)

		if random.random() < self.shear_prob:
			augmented = apply_affine_shear(augmented)

		if random.random() < self.speed_resample_prob:
			augmented = apply_speed_resampling(augmented)

		if random.random() < self.jitter_prob:
			augmented = apply_jitter(augmented)

		brush_radius = sample_brush_thickness(self.min_brush_radius, self.max_brush_radius)

		return augmented, brush_radius
