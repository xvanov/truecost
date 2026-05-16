"""
Astronomical Polar Chart
========================
360-degree circular celestial map using matplotlib polar projection.

Coordinate convention:
  - 0° at top (North / 12 o'clock)
  - Direction: clockwise
  - 12 Zodiac sectors, each 30°
  - 10 celestial markers with staggered radii for close pairs
"""

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

# ══════════════════════════════════════════════════════════════════════════
# DATA
# ══════════════════════════════════════════════════════════════════════════

MARKERS = {
    "Ascendant": 143.50,
    "Sun":        40.41,
    "Moon":      317.67,
    "Venus":      17.83,
    "Mercury":    22.17,
    "Ketu":       66.00,
    "Jupiter":   132.08,
    "Rahu":      246.00,
    "Saturn":    294.25,
    "Mars":      344.50,
}

ZODIAC = [
    "Aries",       "Taurus",    "Gemini",      "Cancer",
    "Leo",         "Virgo",     "Libra",        "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius",     "Pisces",
]

COLORS = {
    "Ascendant": "#FF5555",
    "Sun":       "#FFD700",
    "Moon":      "#CCCCFF",
    "Venus":     "#FF88CC",
    "Mercury":   "#44DDDD",
    "Ketu":      "#CD853F",
    "Jupiter":   "#FFA040",
    "Rahu":      "#BB80FF",
    "Saturn":    "#88CCEE",
    "Mars":      "#FF7755",
}

SHAPES = {
    "Ascendant": "D",
    "Sun":       "o",
    "Moon":      "o",
    "Venus":     "o",
    "Mercury":   "o",
    "Ketu":      "^",
    "Jupiter":   "o",
    "Rahu":      "v",
    "Saturn":    "s",
    "Mars":      "o",
}

# ══════════════════════════════════════════════════════════════════════════
# RADIAL STAGGERING
# Sort markers by degree; detect clusters where angular gap < threshold.
# Alternate even-index members to inner ring, odd-index to outer ring.
# This prevents overlap for Venus/Mercury (4.34° apart) and
# Jupiter/Ascendant (11.42° apart).
# ══════════════════════════════════════════════════════════════════════════

BASE_R         = 0.63
CLUSTER_THRESH = 15.0   # degrees — tighter than this → stagger
INNER_OFFSET   = -0.07
OUTER_OFFSET   = +0.08


def assign_radii(markers_dict, base=BASE_R, threshold=CLUSTER_THRESH):
    sorted_items = sorted(markers_dict.items(), key=lambda x: x[1])
    radii = {}
    i = 0
    while i < len(sorted_items):
        cluster = [sorted_items[i]]
        j = i + 1
        while j < len(sorted_items):
            if sorted_items[j][1] - cluster[-1][1] < threshold:
                cluster.append(sorted_items[j])
                j += 1
            else:
                break
        if len(cluster) == 1:
            radii[cluster[0][0]] = base
        else:
            for k, (name, _) in enumerate(cluster):
                radii[name] = base + (INNER_OFFSET if k % 2 == 0 else OUTER_OFFSET)
        i = j
    return radii


marker_radii = assign_radii(MARKERS)

# ══════════════════════════════════════════════════════════════════════════
# FIGURE SETUP
# ══════════════════════════════════════════════════════════════════════════

BG   = '#070714'
FACE = '#0b0b22'

fig = plt.figure(figsize=(14, 14), facecolor=BG)
ax  = fig.add_subplot(111, projection='polar', facecolor=FACE)

# ── Coordinate orientation ──────────────────────────────────────────────
ax.set_theta_zero_location('N')   # 0° at top (North)
ax.set_theta_direction(-1)         # clockwise

ax.set_ylim(0, 1.0)
ax.set_yticks([])
ax.set_xticks([])
ax.grid(False)
ax.spines['polar'].set_visible(False)

theta_full = np.linspace(0, 2 * np.pi, 720)

# ══════════════════════════════════════════════════════════════════════════
# STRUCTURAL RINGS
# ══════════════════════════════════════════════════════════════════════════

ring_specs = [
    (0.12, '#2244AA', 0.7, 0.50),   # hub boundary
    (0.45, '#223366', 0.5, 0.35),   # mid reference ring
    (0.80, '#3355AA', 1.0, 0.70),   # zodiac inner boundary
    (1.00, '#4466BB', 1.9, 0.92),   # outer boundary
]
for r_val, color, lw, alpha in ring_specs:
    ax.plot(theta_full, np.full_like(theta_full, r_val),
            color=color, lw=lw, alpha=alpha)

# ══════════════════════════════════════════════════════════════════════════
# ZODIAC BOUNDARIES — 12 radial lines at 0°, 30°, 60°, … 330°
# ══════════════════════════════════════════════════════════════════════════

for i in range(12):
    rad = np.radians(i * 30)
    # Bold line within zodiac band
    ax.plot([rad, rad], [0.80, 1.00],
            color='#5566AA', lw=1.1, alpha=0.85)
    # Faint dotted inner extension
    ax.plot([rad, rad], [0.12, 0.80],
            color='#334466', lw=0.5, linestyle=':', alpha=0.28)

# ══════════════════════════════════════════════════════════════════════════
# ZODIAC SECTOR LABELS
# Placed at the midpoint of each 30° sector (15°, 45°, 75°, …)
# ══════════════════════════════════════════════════════════════════════════

for i, sign in enumerate(ZODIAC):
    mid_rad = np.radians(i * 30 + 15)
    ax.text(mid_rad, 0.905, sign,
            ha='center', va='center',
            fontsize=8.5, fontweight='bold', color='#7799CC')

# ══════════════════════════════════════════════════════════════════════════
# DEGREE TICK MARKS on the outer ring
# ══════════════════════════════════════════════════════════════════════════

for deg in range(0, 360, 5):
    rad = np.radians(deg)
    if   deg % 30 == 0: inner_r, lw, color = 0.930, 1.3, '#5577AA'
    elif deg % 10 == 0: inner_r, lw, color = 0.955, 0.8, '#445577'
    else:               inner_r, lw, color = 0.975, 0.4, '#334466'
    ax.plot([rad, rad], [inner_r, 1.00], color=color, lw=lw)

# Small degree-number labels at the 30° marks
for deg in range(0, 360, 30):
    rad = np.radians(deg)
    ax.text(rad, 0.925, f'{deg}°',
            ha='center', va='center', fontsize=6.0, color='#556688')

# ══════════════════════════════════════════════════════════════════════════
# ASCENDANT AXIS LINE
# Runs from center to outer edge at 143.50°
# ══════════════════════════════════════════════════════════════════════════

asc_rad = np.radians(MARKERS["Ascendant"])
ax.plot([asc_rad, asc_rad], [0.0, 1.0],
        color='#FF5555', lw=2.5, linestyle='-', alpha=0.92, zorder=5)

# ══════════════════════════════════════════════════════════════════════════
# CELESTIAL MARKERS
# ══════════════════════════════════════════════════════════════════════════

for name, degree in MARKERS.items():
    rad   = np.radians(degree)
    r     = marker_radii[name]
    color = COLORS[name]
    shape = SHAPES[name]

    # ── Scatter point ───────────────────────────────────────────────────
    ax.scatter(rad, r, s=185, c=color, marker=shape,
               edgecolors='white', linewidths=0.9, zorder=8)

    # ── Label: push outward, cap just below zodiac inner ring (r=0.80) ──
    label_r = min(r + 0.12, 0.76)

    # Thin radial connector from marker to label
    if abs(label_r - r) > 0.005:
        ax.plot([rad, rad], [r, label_r],
                color=color, lw=0.7, alpha=0.55, zorder=6)

    ax.text(rad, label_r,
            f"{name}\n{degree:.2f}°",
            ha='center', va='center',
            fontsize=6.8, fontweight='bold', color=color, zorder=9,
            bbox=dict(
                boxstyle='round,pad=0.22',
                facecolor=BG,
                edgecolor=color,
                linewidth=0.75,
                alpha=0.88,
            ))

# ══════════════════════════════════════════════════════════════════════════
# TITLE
# ══════════════════════════════════════════════════════════════════════════

fig.suptitle(
    "Astronomical Polar Chart  —  Absolute Celestial Map\n"
    "0° at North (Top)  ·  Clockwise  ·  12 Zodiac Sectors",
    color='white', fontsize=15, fontweight='bold', y=0.975,
)

# ══════════════════════════════════════════════════════════════════════════
# LEGEND  (sorted by degree, displayed in 5 columns below chart)
# ══════════════════════════════════════════════════════════════════════════

legend_handles = [
    Line2D([0], [0],
           marker=SHAPES[name], color='w',
           markerfacecolor=COLORS[name],
           markersize=9, linewidth=0,
           label=f"{name:<12s}  {deg:7.2f}°")
    for name, deg in sorted(MARKERS.items(), key=lambda x: x[1])
]

ax.legend(
    handles=legend_handles,
    loc='lower center',
    bbox_to_anchor=(0.5, -0.13),
    ncol=5,
    fontsize=8.5,
    framealpha=0.30,
    facecolor=FACE,
    edgecolor='#334466',
    labelcolor='white',
    title="Celestial Bodies  (sorted by degree)",
    title_fontsize=9,
)

# ══════════════════════════════════════════════════════════════════════════
# SAVE & DISPLAY
# ══════════════════════════════════════════════════════════════════════════

plt.tight_layout()
plt.savefig('astronomical_polar_chart.png', dpi=150,
            bbox_inches='tight', facecolor=BG)
plt.show()
print("Saved: astronomical_polar_chart.png")
