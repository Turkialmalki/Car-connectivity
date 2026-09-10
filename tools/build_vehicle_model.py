#!/usr/bin/env python3
"""
Articulated mid-size electric crossover — glTF 2.0 generator.

WHY THIS EXISTS
---------------
The app needs a vehicle that can actually be operated: four doors that swing on
their own hinges, a rear liftgate, a front boot lid, a charge-port flap, and
light surfaces that can be lit independently. No openly-licensed asset with that
articulation was available (see docs/ASSETS.md), so the body is authored here.

HOW THE BODY IS BUILT
---------------------
Not from primitives. A longitudinal table of cross-section *stations* describes
the silhouette (rocker height, roofline, half-width, beltline, roof width). Each
station is turned into a closed ring by splining a set of section control points,
and consecutive rings are skinned into a continuous surface — a loft, the same
way a real body-in-white is drawn.

The single lofted surface is then PARTITIONED into panels by (z, t) region,
where t runs 0 (underbody centreline) -> 0.5 (beltline) -> 1 (roof centreline).
Because every panel is cut from one surface, a closed door lines up with the
body exactly; opening it reveals the interior shell rather than a hole.

Every panel is emitted as its own node under a hinge node placed at the real
hinge line, so rotation happens about the correct axis and pivot.

Output: assets/vehicle/vehicle.glb  (+ a JSON report of node names)
"""

import json
import math
import os
import struct
import sys

# --------------------------------------------------------------------------
# Vehicle package.
#
# Styled after a full-size three-row electric SUV in the Rivian R1S idiom:
# upright and slab-sided, a long flat roof, short overhangs, high ground
# clearance, squared wheel arches, a near-vertical tailgate, and the signature
# lighting — a full-width bar across the nose with tall vertical "stadium"
# lamps outboard of it.
#
# The geometry is authored here, so this is a styling reference, not a copy of
# any manufacturer's data, and the app does not badge the vehicle. See
# docs/ASSETS.md.
# --------------------------------------------------------------------------
LENGTH = 5.100
WIDTH = 2.015
HEIGHT = 1.820
WHEELBASE = 3.076

HALF_W = WIDTH / 2.0
FRONT_AXLE_Z = WHEELBASE / 2.0
REAR_AXLE_Z = -WHEELBASE / 2.0
WHEEL_RADIUS = 0.4100          # 22" wheel, ~275/50
TIRE_WIDTH = 0.2750

# Longitudinal stations: (z, y_bottom, y_top, half_width, belt_y, roof_half_width)
#   y_bottom  underbody / valance height at this station
#   y_top     highest point of the section (bonnet crown, roof, or tailgate)
#   belt_y    beltline — the crease where bodyside ends and glass begins
#   roof_hw   half-width of the roof / upper surface at this station
# Ordered nose (+z) to tail (-z).
STATIONS = [
    # Slab front: the section stays nearly full size right up to the nose, so
    # the face is vertical and the end cap only rounds its perimeter.
    (2.5500, 0.302, 1.352, 0.972, 1.296, 0.694),
    (2.5100, 0.292, 1.366, 0.990, 1.306, 0.708),
    (2.4600, 0.285, 1.374, 1.000, 1.314, 0.718),
    (2.3800, 0.281, 1.380, 1.005, 1.322, 0.724),
    (2.2800, 0.278, 1.383, 1.0072, 1.328, 0.728),
    (2.1000, 0.276, 1.386, 1.0075, 1.318, 0.730),
    (1.9000, 0.272, 1.392, 1.0075, 1.322, 0.733),
    (1.7500, 0.268, 1.396, 1.0075, 1.326, 0.735),
    (1.4500, 0.263, 1.406, 1.0075, 1.336, 0.740),
    (1.2000, 0.261, 1.416, 1.0075, 1.346, 0.742),
    (1.0500, 0.260, 1.432, 1.0075, 1.356, 0.745),   # cowl — bonnet ends
    # Windscreen. Upright, ~50 degrees, and the beltline drops to its true
    # height as the bodyside takes over from the bonnet.
    (0.9900, 0.259, 1.478, 1.0075, 1.272, 0.766),
    (0.9500, 0.259, 1.522, 1.0075, 1.196, 0.790),
    (0.8000, 0.258, 1.642, 1.0075, 1.152, 0.815),
    (0.6500, 0.257, 1.742, 1.0075, 1.142, 0.825),
    (0.4800, 0.256, 1.800, 1.0075, 1.136, 0.830),
    (0.3000, 0.255, 1.818, 1.0075, 1.131, 0.832),
    # Long flat roof over three rows.
    (0.0000, 0.254, 1.820, 1.0075, 1.129, 0.833),
    (-0.4000, 0.254, 1.820, 1.0075, 1.127, 0.833),
    (-0.9000, 0.255, 1.820, 1.0075, 1.125, 0.832),
    (-1.3000, 0.257, 1.819, 1.0060, 1.123, 0.830),
    (-1.7000, 0.260, 1.814, 1.0030, 1.121, 0.826),
    # Near-vertical tailgate: the roofline holds to the tail, and the rear face
    # stands up rather than sloping away.
    (-2.0500, 0.265, 1.802, 0.9980, 1.119, 0.816),
    (-2.2500, 0.268, 1.798, 0.9950, 1.117, 0.812),
    (-2.4000, 0.272, 1.792, 0.9900, 1.114, 0.806),
    (-2.5000, 0.279, 1.780, 0.9800, 1.110, 0.794),
    (-2.5500, 0.292, 1.754, 0.9600, 1.104, 0.774),
]

# Section control points, lower half: (width_factor_of_hw, height_fraction_of_lower)
# Slab-sided: maximum width is held over a long stretch instead of peaking.
LOWER_CONTROLS = [
    (0.000, 0.000),
    (0.450, 0.004),
    (0.780, 0.022),
    (0.920, 0.070),
    (0.975, 0.150),
    (0.995, 0.262),
    (1.000, 0.400),
    (1.000, 0.560),
    (0.998, 0.700),
    (0.992, 0.840),
    (0.980, 0.940),
    (0.968, 1.000),
]

# Section control points, upper half: (blend, height_fraction_of_upper)
# Little tumblehome — the glass stands up nearly vertical.
UPPER_CONTROLS = [
    (0.000, 0.000),
    (0.045, 0.130),
    (0.130, 0.310),
    (0.260, 0.500),
    (0.430, 0.680),
    (0.640, 0.830),
    (0.850, 0.930),
    (1.000, 0.975),
]
# Roof crown: square-shouldered and flat across the middle.
ROOF_CROWN = [
    (0.940, 0.992),
    (0.680, 1.000),
    (0.000, 1.002),
]

LOWER_SAMPLES = 17  # inclusive of both ends; t = 0 .. 0.5
UPPER_SAMPLES = 17  # t = 0.5 .. 1.0
STATION_SUBDIV = 2  # extra interpolated stations between table entries

# End-cap rings: (scale toward the ring centroid, distance pushed outboard).
# End-cap rings: (scale toward the ring centroid, distance pushed outboard).
# Deliberately shallow — this vehicle has flat vertical ends, so the cap only
# breaks the perimeter edge instead of drawing the face out into a snout.
CAP_PROFILE = [
    (0.988, 0.009),
    (0.952, 0.019),
    (0.878, 0.027),
    (0.700, 0.033),
    (0.000, 0.037),
]


# --------------------------------------------------------------------------
# Spline + math helpers
# --------------------------------------------------------------------------
def catmull_rom(points, count):
    """Resample a polyline through `points` with a centripetal Catmull-Rom spline.

    Uniform in spline parameter (not arc length) so that sample i means the same
    feature on every station — that is what keeps the loft's quads aligned.
    """
    n = len(points)
    if n < 2:
        return [tuple(points[0]) for _ in range(count)]
    ext = [points[0]] + [tuple(p) for p in points] + [points[-1]]
    segments = n - 1
    out = []
    for i in range(count):
        u = (i / (count - 1)) * segments if count > 1 else 0.0
        seg = min(int(u), segments - 1)
        f = u - seg
        p0, p1, p2, p3 = ext[seg], ext[seg + 1], ext[seg + 2], ext[seg + 3]
        f2, f3 = f * f, f * f * f
        vals = []
        for k in range(2):
            a, b, c, d = p0[k], p1[k], p2[k], p3[k]
            vals.append(
                0.5
                * (
                    (2 * b)
                    + (-a + c) * f
                    + (2 * a - 5 * b + 4 * c - d) * f2
                    + (-a + 3 * b - 3 * c + d) * f3
                )
            )
        out.append((vals[0], vals[1]))
    return out


def lerp(a, b, f):
    return a + (b - a) * f


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def norm(v):
    m = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if m < 1e-9:
        return (0.0, 1.0, 0.0)
    return (v[0] / m, v[1] / m, v[2] / m)


def interp_station(a, b, f):
    return tuple(lerp(a[k], b[k], f) for k in range(6))


def build_stations():
    """Densify the station table so the loft is smooth along its length."""
    dense = []
    for i in range(len(STATIONS) - 1):
        a, b = STATIONS[i], STATIONS[i + 1]
        for s in range(STATION_SUBDIV):
            dense.append(interp_station(a, b, s / STATION_SUBDIV))
    dense.append(STATIONS[-1])
    return dense


ARCH_RADIUS = 0.615     # opening radius around the axle centre
ARCH_TOP = 1.052        # height of the arch crown above the ground
ARCH_SQUARENESS = 2.7   # 2 = circular; higher squares the arch off
ARCH_FLANK_START = 0.46  # |x|/hw at which the arch starts to bite
ARCH_FLANK_FULL = 0.84   # |x|/hw at which it bites fully


def arch_floor(z, x_fraction, y_bot):
    """Lowest bodywork height at this station and flank position.

    Sweeping the lower flank upward around each axle is what turns a plain
    lofted tube into a car: without it the wheels intersect a solid side.

    The profile is a superellipse rather than a circle, because this vehicle's
    arches are squared off at the top rather than domed.
    """
    best = y_bot
    for axle in (FRONT_AXLE_Z, REAR_AXLE_Z):
        dz = abs(z - axle)
        if dz >= ARCH_RADIUS:
            continue
        arc = (1.0 - (dz / ARCH_RADIUS) ** ARCH_SQUARENESS) ** (1.0 / ARCH_SQUARENESS)
        best = max(best, y_bot + (ARCH_TOP - y_bot) * arc)
    if best <= y_bot:
        return y_bot
    span = ARCH_FLANK_FULL - ARCH_FLANK_START
    blend = min(1.0, max(0.0, (x_fraction - ARCH_FLANK_START) / span))
    blend = blend * blend * (3 - 2 * blend)  # smoothstep
    return y_bot + (best - y_bot) * blend


def half_ring(station):
    """Return LOWER_SAMPLES + UPPER_SAMPLES - 1 points (x, y) for the +x half."""
    z, y_bot, y_top, hw, belt_y, roof_hw = station
    belt_y = min(belt_y, y_top - 0.012)
    lower_h = belt_y - y_bot
    upper_h = y_top - belt_y

    lo = catmull_rom(LOWER_CONTROLS, LOWER_SAMPLES)
    pts = [(wf * hw, y_bot + hf * lower_h) for wf, hf in lo]

    belt_w = hw * LOWER_CONTROLS[-1][0]
    up_controls = list(UPPER_CONTROLS)
    up = catmull_rom(up_controls, UPPER_SAMPLES - len(ROOF_CROWN))
    upper_pts = [(lerp(belt_w, roof_hw, blend), belt_y + hf * upper_h) for blend, hf in up]
    upper_pts += [(roof_hw * wf, belt_y + hf * upper_h) for wf, hf in ROOF_CROWN]

    # Sweep the lower flank up around the axles.
    #
    # Clamping points to the arch line would collapse several ring samples onto
    # the same height, and the surface folds over itself there — that is what
    # produced the spikes around the arches. Instead the whole lower section is
    # REMAPPED into the space that remains above the arch, so sample ordering and
    # spacing survive and the skin stays single-valued.
    lower_h = belt_y - y_bot
    swept = []
    for index, (x, y) in enumerate(pts):
        if lower_h <= 1e-6:
            swept.append((x, y))
            continue
        floor = arch_floor(z, abs(x / hw) if hw else 0.0, y_bot)
        if floor <= y_bot + 1e-6:
            swept.append((x, y))
            continue
        fraction = (y - y_bot) / lower_h
        if fraction >= 1.0:
            swept.append((x, y))
            continue
        swept.append((x, floor + fraction * (belt_y - floor)))
    pts = swept

    # Drop the duplicated beltline point so t is continuous across the join.
    pts += upper_pts[1:]
    return pts


def build_surface():
    """Loft the stations into a vertex grid.

    Returns (grid, t_values) where grid[i][j] is a 3D point: i indexes stations
    nose->tail, j indexes the closed ring. t_values[j] in [0, 1] is the section
    parameter used for panel classification.
    """
    stations = build_stations()
    half_count = LOWER_SAMPLES + UPPER_SAMPLES - 1

    # Ring order: +x half bottom->top, then -x half top->bottom (skipping the
    # shared centreline points at both ends) so the ring closes exactly once.
    t_values = []
    for j in range(half_count):
        t_values.append(j / (half_count - 1))
    for j in range(half_count - 2, 0, -1):
        t_values.append(j / (half_count - 1))

    grid = []
    for st in stations:
        z = st[0]
        hp = half_ring(st)
        ring = [(x, y, z) for x, y in hp]
        ring += [(-x, y, z) for x, y in reversed(hp[1:-1])]
        grid.append(ring)

    # The loft is an open tube; without caps you look straight into the body
    # cavity from the front and rear. Shrink the end rings toward their own
    # centroid while pushing them outboard, which rounds the nose and tail into
    # bumper surfaces instead of a flat lid.
    def cap(ring, direction):
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        z0 = ring[0][2]
        out = []
        for scale, push in CAP_PROFILE:
            z = z0 + direction * push
            out.append([(cx + (p[0] - cx) * scale, cy + (p[1] - cy) * scale, z) for p in ring])
        return out

    front_caps = cap(grid[0], +1.0)
    rear_caps = cap(grid[-1], -1.0)
    grid = list(reversed(front_caps)) + grid + rear_caps
    return grid, t_values


# --------------------------------------------------------------------------
# Panel classification
#
# t: 0 = underbody centreline, 0.5 = beltline, 1.0 = roof centreline.
# Shut lines are chosen to sit on real panel gaps.
# --------------------------------------------------------------------------
BODY = "body"
FRUNK = "frunkLid"
LIFTGATE = "liftgate"
DOOR_FL = "doorFrontLeft"
DOOR_FR = "doorFrontRight"
DOOR_RL = "doorRearLeft"
DOOR_RR = "doorRearRight"
PORT = "chargePortFlap"

DOOR_T_MIN, DOOR_T_MAX = 0.130, 0.842
FRONT_DOOR_Z = (-0.205, 0.945)
REAR_DOOR_Z = (-1.455, -0.205)
FRUNK_Z = (1.090, 2.330)
FRUNK_T_MIN = 0.560
# The tailgate is close to vertical, so it is mostly the rear FACE plus a short
# run of roof, rather than the long sloping hatch of a fastback.
LIFTGATE_UPPER_Z = -2.055
LIFTGATE_LOWER_Z = -2.290
LIFTGATE_T_MIN = 0.150
# Charge port sits on the driver's-side FRONT wing on this vehicle, ahead of the
# door and behind the wheel arch — not on the rear quarter.
PORT_Z = (1.560, 1.790)
PORT_T = (0.470, 0.610)

# Glass bands, evaluated after panel assignment.
WINDSCREEN_Z = (0.240, 1.090)
GLASS_T_MIN = 0.848  # roof band; only glass where the z range says so


def classify(z, t, x):
    """Which panel owns the quad whose centre is (x, y, z) at section param t."""
    if PORT_Z[0] <= z <= PORT_Z[1] and PORT_T[0] <= t <= PORT_T[1] and x < 0:
        return PORT
    if DOOR_T_MIN <= t <= DOOR_T_MAX:
        if FRONT_DOOR_Z[0] <= z <= FRONT_DOOR_Z[1]:
            return DOOR_FL if x < 0 else DOOR_FR
        if REAR_DOOR_Z[0] <= z <= REAR_DOOR_Z[1]:
            return DOOR_RL if x < 0 else DOOR_RR
    if FRUNK_Z[0] <= z <= FRUNK_Z[1] and t >= FRUNK_T_MIN:
        return FRUNK
    if t >= LIFTGATE_T_MIN:
        if t >= 0.500 and z <= LIFTGATE_UPPER_Z:
            return LIFTGATE
        if t < 0.500 and z <= LIFTGATE_LOWER_Z:
            return LIFTGATE
    return BODY


def is_glass(panel, z, t):
    """Separate glazing so it can take a transparent material."""
    if panel in (DOOR_FL, DOOR_FR, DOOR_RL, DOOR_RR):
        return t >= 0.600
    if panel == LIFTGATE:
        # Backlight: the upper band of the near-vertical tailgate.
        return t >= 0.620 and z >= -2.480
    if panel == BODY:
        if WINDSCREEN_Z[0] <= z <= WINDSCREEN_Z[1] and t >= 0.700:
            return True
        # Rear quarter glass, between the rear door and the liftgate.
        if -1.520 <= z <= -1.245 and t >= 0.560:
            return True
    return False


# --------------------------------------------------------------------------
# Hinges: pivot point + rotation axis + the sign/limit of a full opening.
# --------------------------------------------------------------------------
# Sign convention, verified against tools/preview_model.py renders:
#   about +Y, a panel hinged at its FRONT edge swings outboard when the rotation
#   pushes its trailing edge away from the centreline — positive on the left,
#   negative on the right;
#   about +X, a panel hinged at its REAR edge lifts on a positive angle, and one
#   hinged at its front edge (the bonnet) lifts on a negative angle.
HINGES = {
    DOOR_FL: dict(pivot=(-0.955, 0.900, 0.945), axis=(0, 1, 0), open_deg=66.0),
    DOOR_FR: dict(pivot=(0.955, 0.900, 0.945), axis=(0, 1, 0), open_deg=-66.0),
    DOOR_RL: dict(pivot=(-0.950, 0.900, -0.205), axis=(0, 1, 0), open_deg=74.0),
    DOOR_RR: dict(pivot=(0.950, 0.900, -0.205), axis=(0, 1, 0), open_deg=-74.0),
    # Tailgate swings up about the roof's trailing edge.
    LIFTGATE: dict(pivot=(0.0, 1.802, -2.055), axis=(1, 0, 0), open_deg=68.0),
    # Bonnet is hinged at the cowl and lifts from its leading edge.
    FRUNK: dict(pivot=(0.0, 1.432, 1.090), axis=(1, 0, 0), open_deg=-50.0),
    # Flap swings forward about its leading vertical edge on the front wing.
    PORT: dict(pivot=(-1.000, 1.190, 1.790), axis=(0, 1, 0), open_deg=100.0),
}


# --------------------------------------------------------------------------
# Mesh accumulation
# --------------------------------------------------------------------------
class Mesh:
    """Vertex-welded triangle soup with per-material primitives."""

    def __init__(self, name):
        self.name = name
        self.prims = {}  # material name -> dict(pos, nrm, idx, lookup)

    def prim(self, material):
        p = self.prims.get(material)
        if p is None:
            p = {"pos": [], "nrm": [], "idx": [], "lookup": {}}
            self.prims[material] = p
        return p

    def add_tri(self, material, a, b, c, flip=False):
        if flip:
            a, b, c = a, c, b
        raw = cross(sub(b, a), sub(c, a))
        if raw[0] * raw[0] + raw[1] * raw[1] + raw[2] * raw[2] < 1e-14:
            return  # degenerate (e.g. the collapsed ring at a cap's tip)
        n = norm(raw)
        p = self.prim(material)
        for v in (a, b, c):
            key = (round(v[0], 5), round(v[1], 5), round(v[2], 5), round(n[0], 2), round(n[1], 2), round(n[2], 2))
            i = p["lookup"].get(key)
            if i is None:
                i = len(p["pos"]) // 3
                p["lookup"][key] = i
                p["pos"] += [v[0], v[1], v[2]]
                p["nrm"] += [n[0], n[1], n[2]]
            p["idx"].append(i)

    def add_quad(self, material, a, b, c, d, flip=False):
        self.add_tri(material, a, b, c, flip)
        self.add_tri(material, a, c, d, flip)

    def empty(self):
        return all(len(p["idx"]) == 0 for p in self.prims.values())

    def translate(self, offset):
        for p in self.prims.values():
            for i in range(0, len(p["pos"]), 3):
                p["pos"][i] -= offset[0]
                p["pos"][i + 1] -= offset[1]
                p["pos"][i + 2] -= offset[2]

    def triangles(self):
        return sum(len(p["idx"]) for p in self.prims.values()) // 3


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
SHELL_THICKNESS = 0.045   # panel skin thickness
CABIN_OFFSET = 0.105      # cabin shell sits deeper, so it never z-fights a door
LENS_OFFSET = 0.009       # light lenses stand proud of the bodywork

MATERIALS = {
    # name:            (baseColor RGBA,             metallic, rough, emissive, blend)
    "paint":           ((0.815, 0.822, 0.828, 1.0), 0.55, 0.255, None, False),
    "glass":           ((0.055, 0.070, 0.082, 0.40), 0.10, 0.055, None, True),
    "trim":            ((0.070, 0.074, 0.078, 1.0), 0.35, 0.520, None, False),
    "chrome":          ((0.760, 0.775, 0.790, 1.0), 1.00, 0.170, None, False),
    "cabinShell":      ((0.108, 0.112, 0.120, 1.0), 0.05, 0.870, None, False),
    "panelInner":      ((0.140, 0.145, 0.152, 1.0), 0.10, 0.760, None, False),
    "seat":            ((0.170, 0.176, 0.188, 1.0), 0.02, 0.820, None, False),
    "dash":            ((0.128, 0.132, 0.140, 1.0), 0.06, 0.700, None, False),
    "screen":          ((0.020, 0.022, 0.026, 1.0), 0.20, 0.120, None, False),
    "tire":            ((0.043, 0.044, 0.047, 1.0), 0.02, 0.940, None, False),
    "rim":             ((0.640, 0.652, 0.668, 1.0), 0.92, 0.260, None, False),
    "headlightLens":   ((0.780, 0.815, 0.860, 1.0), 0.10, 0.090, (0, 0, 0), False),
    "taillightLens":   ((0.420, 0.055, 0.062, 1.0), 0.10, 0.110, (0, 0, 0), False),
    "indicatorLens":   ((0.620, 0.330, 0.075, 1.0), 0.10, 0.120, (0, 0, 0), False),
    "brakeDisc":       ((0.300, 0.305, 0.312, 1.0), 0.75, 0.420, None, False),
}

# Light surfaces.
#
# Selected by ABSOLUTE position — z depth, height above ground, and distance
# from the centreline — rather than by the section parameter `t`. On the flat
# front and rear faces the end-cap rings shrink toward their centroid, so a
# constant-`t` band sweeps inward across the face and paints a wedge instead of
# a lamp. Real bounds are predictable there; `t` is not.
#
# Layout is this vehicle's signature: a full-width horizontal bar high on the
# face, with a TALL VERTICAL lamp at each outer corner beneath it.
#   z: depth range      y: height above ground      x: distance from centreline
LIGHT_PATCHES = {
    "daytimeRunningBar":   dict(z=(2.500, 2.566), y=(1.140, 1.300), x=(0.000, 0.985),
                                side=0, material="headlightLens", facing="front"),
    "headlightLeft":       dict(z=(2.460, 2.592), y=(0.868, 1.150), x=(0.620, 0.950),
                                side=-1, material="headlightLens", facing="front"),
    "headlightRight":      dict(z=(2.460, 2.592), y=(0.868, 1.150), x=(0.620, 0.950),
                                side=+1, material="headlightLens", facing="front"),
    "indicatorFrontLeft":  dict(z=(2.460, 2.592), y=(0.730, 0.860), x=(0.620, 0.950),
                                side=-1, material="indicatorLens", facing="front"),
    "indicatorFrontRight": dict(z=(2.460, 2.592), y=(0.730, 0.860), x=(0.620, 0.950),
                                side=+1, material="indicatorLens", facing="front"),

    "taillightBar":        dict(z=(-2.566, -2.420), y=(1.310, 1.470), x=(0.000, 0.985),
                                side=0, material="taillightLens", facing="rear"),
    "taillightLeft":       dict(z=(-2.592, -2.400), y=(0.980, 1.310), x=(0.620, 0.950),
                                side=-1, material="taillightLens", facing="rear"),
    "taillightRight":      dict(z=(-2.592, -2.400), y=(0.980, 1.310), x=(0.620, 0.950),
                                side=+1, material="taillightLens", facing="rear"),
    "indicatorRearLeft":   dict(z=(-2.592, -2.400), y=(0.830, 0.965), x=(0.620, 0.950),
                                side=-1, material="indicatorLens", facing="rear"),
    "indicatorRearRight":  dict(z=(-2.592, -2.400), y=(0.830, 0.965), x=(0.620, 0.950),
                                side=+1, material="indicatorLens", facing="rear"),
}


def grid_normals(grid):
    """Area-weighted vertex normals over the closed loft grid."""
    rows, cols = len(grid), len(grid[0])
    acc = [[[0.0, 0.0, 0.0] for _ in range(cols)] for _ in range(rows)]
    for i in range(rows - 1):
        for j in range(cols):
            j2 = (j + 1) % cols
            a, b = grid[i][j], grid[i + 1][j]
            c, d = grid[i + 1][j2], grid[i][j2]
            n = cross(sub(b, a), sub(d, a))
            for (ii, jj) in ((i, j), (i + 1, j), (i + 1, j2), (i, j2)):
                acc[ii][jj][0] += n[0]
                acc[ii][jj][1] += n[1]
                acc[ii][jj][2] += n[2]
    return [[norm(tuple(acc[i][j])) for j in range(cols)] for i in range(rows)]


def offset_grid(grid, normals, distance):
    return [
        [
            (
                grid[i][j][0] - normals[i][j][0] * distance,
                grid[i][j][1] - normals[i][j][1] * distance,
                grid[i][j][2] - normals[i][j][2] * distance,
            )
            for j in range(len(grid[i]))
        ]
        for i in range(len(grid))
    ]


def cell_centre(grid, i, j):
    cols = len(grid[0])
    j2 = (j + 1) % cols
    pts = (grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2])
    return tuple(sum(p[k] for p in pts) / 4.0 for k in range(3))


def build_panels():
    """Partition the loft into panel meshes, each with skin thickness and a rim."""
    grid, t_values = build_surface()
    normals = grid_normals(grid)
    inner = offset_grid(grid, normals, SHELL_THICKNESS)
    rows, cols = len(grid), len(grid[0])

    cells = {}          # panel -> set of (i, j)
    cell_material = {}  # (i, j) -> outer material
    for i in range(rows - 1):
        for j in range(cols):
            j2 = (j + 1) % cols
            cx, _, cz = cell_centre(grid, i, j)
            t = (t_values[j] + t_values[j2]) / 2.0
            panel = classify(cz, t, cx)
            cells.setdefault(panel, set()).add((i, j))
            cell_material[(i, j)] = "glass" if is_glass(panel, cz, t) else "paint"

    meshes = {}
    for panel, cellset in cells.items():
        mesh = Mesh(panel)
        for (i, j) in sorted(cellset):
            j2 = (j + 1) % cols
            mat = cell_material[(i, j)]
            # Outer skin.
            mesh.add_quad(mat, grid[i][j], grid[i + 1][j], grid[i + 1][j2], grid[i][j2])
            # Inner skin, wound the other way so it is visible from inside.
            imat = "panelInner" if mat == "paint" else "glass"
            mesh.add_quad(imat, inner[i][j], inner[i + 1][j], inner[i + 1][j2], inner[i][j2], flip=True)

        # Rim: close the gap between skins along edges the panel does not share
        # with itself. Without this an open door would show a paper-thin edge.
        edge_use = {}
        for (i, j) in cellset:
            j2 = (j + 1) % cols
            for e in (((i, j), (i + 1, j)), ((i + 1, j), (i + 1, j2)),
                      ((i + 1, j2), (i, j2)), ((i, j2), (i, j))):
                key = tuple(sorted(e))
                edge_use[key] = edge_use.get(key, 0) + 1
        for (p, q), count in edge_use.items():
            if count != 1:
                continue
            a, b = grid[p[0]][p[1]], grid[q[0]][q[1]]
            c, d = inner[q[0]][q[1]], inner[p[0]][p[1]]
            mesh.add_quad("trim", a, b, c, d)
            mesh.add_quad("trim", a, b, c, d, flip=True)
        meshes[panel] = mesh

    # Cabin shell: a deeper inner surface spanning the passenger compartment, so
    # an open door reveals an interior rather than the inside of the far door.
    cabin = offset_grid(grid, normals, CABIN_OFFSET)
    shell = Mesh("cabinShell")
    for i in range(rows - 1):
        for j in range(cols):
            j2 = (j + 1) % cols
            cx, _, cz = cell_centre(grid, i, j)
            t = (t_values[j] + t_values[j2]) / 2.0
            if not (-2.520 <= cz <= 1.10):
                continue
            if t < 0.055:  # leave the floor to the dedicated floor pan
                continue
            shell.add_quad("cabinShell", cabin[i][j], cabin[i + 1][j],
                           cabin[i + 1][j2], cabin[i][j2], flip=True)
    meshes["cabinShell"] = shell

    # Light lenses, offset proud of the body and parented to whichever panel
    # owns that stretch of bodywork, so a lens on the tailgate travels with it.
    lights = {}
    for name, spec in LIGHT_PATCHES.items():
        zr, yr, xr = spec["z"], spec["y"], spec["x"]
        side, material, facing = spec["side"], spec["material"], spec["facing"]
        want_nz = 1.0 if facing == "front" else -1.0
        mesh = Mesh(name)
        owner_votes = {}
        outer = offset_grid(grid, normals, -LENS_OFFSET)
        for i in range(rows - 1):
            for j in range(cols):
                j2 = (j + 1) % cols
                cx, cy, cz = cell_centre(grid, i, j)
                t = (t_values[j] + t_values[j2]) / 2.0
                if not (zr[0] <= cz <= zr[1]):
                    continue
                if not (yr[0] <= cy <= yr[1]):
                    continue
                if not (xr[0] <= abs(cx) <= xr[1]):
                    continue
                # Only surfaces that actually point the right way: a lamp band
                # must not creep over the bonnet lip or around the roof.
                nz = (normals[i][j][2] + normals[i + 1][j][2]
                      + normals[i + 1][j2][2] + normals[i][j2][2]) / 4.0
                if nz * want_nz < 0.28:
                    continue
                if side < 0 and cx >= 0:
                    continue
                if side > 0 and cx <= 0:
                    continue
                mesh.add_quad(material, outer[i][j], outer[i + 1][j],
                              outer[i + 1][j2], outer[i][j2])
                owner = classify(cz, t, cx)
                owner_votes[owner] = owner_votes.get(owner, 0) + 1
        if mesh.empty():
            continue
        owner = max(owner_votes.items(), key=lambda kv: kv[1])[0]
        lights[name] = (mesh, owner)

    return meshes, lights, grid, normals


# --------------------------------------------------------------------------
# Sub-assemblies
# --------------------------------------------------------------------------
def add_revolve(mesh, material, profile, axis_point, segments, flip=False):
    """Revolve a 2D profile (radius, x_offset) about the X axis at axis_point."""
    ax, ay, az = axis_point
    rings = []
    for s in range(segments):
        a = 2 * math.pi * s / segments
        ca, sa = math.cos(a), math.sin(a)
        rings.append([(ax + xo, ay + r * ca, az + r * sa) for r, xo in profile])
    for s in range(segments):
        r0, r1 = rings[s], rings[(s + 1) % segments]
        for k in range(len(profile) - 1):
            mesh.add_quad(material, r0[k], r0[k + 1], r1[k + 1], r1[k], flip=flip)


def build_wheel(name, centre, mirrored):
    """Tyre carcass revolved from a real sidewall profile, plus a spoked rim."""
    mesh = Mesh(name)
    hw = TIRE_WIDTH / 2.0
    R = WHEEL_RADIUS
    rim_r = 0.2794  # 22in
    # (radius, lateral offset) walking across the tyre from inner to outer face.
    tyre_profile = [
        (rim_r, -hw * 0.86),
        (rim_r + 0.030, -hw * 0.99),
        (R - 0.052, -hw * 1.00),
        (R - 0.012, -hw * 0.86),
        (R, -hw * 0.66),
        (R, hw * 0.66),
        (R - 0.012, hw * 0.86),
        (R - 0.052, hw * 1.00),
        (rim_r + 0.030, hw * 0.99),
        (rim_r, hw * 0.86),
    ]
    add_revolve(mesh, "tire", tyre_profile, centre, 36, flip=mirrored)

    # Rim barrel + face.
    barrel = [(rim_r, -hw * 0.86), (rim_r, hw * 0.80), (rim_r * 0.97, hw * 0.86)]
    add_revolve(mesh, "rim", barrel, centre, 36, flip=mirrored)

    cx, cy, cz = centre
    face_x = cx + (hw * 0.86 if not mirrored else -hw * 0.86)
    hub_r = 0.062
    # Ten-spoke face: alternating raised spokes and recessed windows.
    spokes = 10
    for s in range(spokes):
        a0 = 2 * math.pi * s / spokes
        a1 = a0 + (2 * math.pi / spokes) * 0.56
        a2 = a0 + (2 * math.pi / spokes)
        inner0 = (face_x, cy + hub_r * math.cos(a0), cz + hub_r * math.sin(a0))
        inner1 = (face_x, cy + hub_r * math.cos(a1), cz + hub_r * math.sin(a1))
        outer0 = (face_x, cy + rim_r * 0.94 * math.cos(a0), cz + rim_r * 0.94 * math.sin(a0))
        outer1 = (face_x, cy + rim_r * 0.94 * math.cos(a1), cz + rim_r * 0.94 * math.sin(a1))
        mesh.add_quad("rim", inner0, outer0, outer1, inner1, flip=mirrored)
        # Recessed window between this spoke and the next.
        back_x = face_x - (0.030 if not mirrored else -0.030)
        w0 = (back_x, cy + hub_r * math.cos(a1), cz + hub_r * math.sin(a1))
        w1 = (back_x, cy + hub_r * math.cos(a2), cz + hub_r * math.sin(a2))
        w2 = (back_x, cy + rim_r * 0.94 * math.cos(a2), cz + rim_r * 0.94 * math.sin(a2))
        w3 = (back_x, cy + rim_r * 0.94 * math.cos(a1), cz + rim_r * 0.94 * math.sin(a1))
        mesh.add_quad("brakeDisc", w0, w3, w2, w1, flip=mirrored)
    # Hub cap.
    for s in range(spokes):
        a0 = 2 * math.pi * s / spokes
        a1 = 2 * math.pi * (s + 1) / spokes
        mesh.add_tri(
            "chrome",
            (face_x, cy, cz),
            (face_x, cy + hub_r * math.cos(a0), cz + hub_r * math.sin(a0)),
            (face_x, cy + hub_r * math.cos(a1), cz + hub_r * math.sin(a1)),
            flip=mirrored,
        )
    return mesh


def loft_box(mesh, material, sections, close_ends=True):
    """Skin a list of cross-sections; each section is a closed list of 3D points."""
    for s in range(len(sections) - 1):
        a, b = sections[s], sections[s + 1]
        n = len(a)
        for k in range(n):
            k2 = (k + 1) % n
            mesh.add_quad(material, a[k], b[k], b[k2], a[k2])
    if close_ends:
        for sec, flip in ((sections[0], True), (sections[-1], False)):
            cx = tuple(sum(p[k] for p in sec) / len(sec) for k in range(3))
            for k in range(len(sec)):
                mesh.add_tri(material, cx, sec[k], sec[(k + 1) % len(sec)], flip=flip)


def rounded_rect(cx, cy, cz, half_w, half_h, radius, axis, steps=5):
    """A rounded rectangle in the plane perpendicular to `axis`, as a point loop."""
    pts = []
    corners = ((1, 1), (-1, 1), (-1, -1), (1, -1))
    for sx, sy in corners:
        for s in range(steps):
            a = (math.pi / 2) * (s / (steps - 1))
            u = sx * (half_w - radius + radius * math.cos(a) * (1 if sx > 0 else 1))
            v = sy * (half_h - radius + radius * math.sin(a))
            u = sx * (half_w - radius) + sx * radius * math.cos(a)
            v = sy * (half_h - radius) + sy * radius * math.sin(a)
            pts.append((u, v))
    out = []
    for u, v in pts:
        if axis == "z":
            out.append((cx + u, cy + v, cz))
        elif axis == "y":
            out.append((cx + u, cy, cz + v))
        else:
            out.append((cx, cy + u, cz + v))
    return out


def build_seat(name, x, z, scale=1.0):
    """A seat: cushion, raked backrest and head restraint.

    The floor sits high in this vehicle, so seat heights are referenced to the
    load floor at y = 0.43 rather than to the ground.
    """
    mesh = Mesh(name)
    base = 0.430
    hw, hh = 0.262 * scale, 0.058
    # Cushion.
    loft_box(mesh, "seat", [
        rounded_rect(x, base + 0.135, z + 0.250, hw * 0.92, hh, 0.035, "y"),
        rounded_rect(x, base + 0.148, z, hw, hh * 1.15, 0.035, "y"),
        rounded_rect(x, base + 0.168, z - 0.230, hw * 0.95, hh * 1.1, 0.035, "y"),
    ])
    # Backrest, raked back from the cushion's rear edge.
    loft_box(mesh, "seat", [
        rounded_rect(x, base + 0.196, z - 0.246, hw * 0.95, 0.062, 0.030, "y"),
        rounded_rect(x, base + 0.436, z - 0.300, hw * 0.98, 0.060, 0.030, "y"),
        rounded_rect(x, base + 0.672, z - 0.356, hw * 0.90, 0.054, 0.030, "y"),
    ])
    # Head restraint.
    loft_box(mesh, "seat", [
        rounded_rect(x, base + 0.728, z - 0.364, 0.108, 0.044, 0.028, "y"),
        rounded_rect(x, base + 0.832, z - 0.374, 0.113, 0.046, 0.028, "y"),
        rounded_rect(x, base + 0.906, z - 0.384, 0.095, 0.040, 0.026, "y"),
    ])
    return mesh


def build_interior_fittings():
    """Load floor, dashboard, centre screen, steering wheel and three seat rows."""
    meshes = []

    floor = Mesh("cabinFloor")
    z0, z1 = -2.40, 1.00
    for i in range(28):
        za = lerp(z0, z1, i / 28)
        zb = lerp(z0, z1, (i + 1) / 28)
        w = 0.90
        floor.add_quad("cabinShell", (-w, 0.430, za), (w, 0.430, za),
                       (w, 0.430, zb), (-w, 0.430, zb), flip=True)
    meshes.append(floor)

    dash = Mesh("dashboard")
    loft_box(dash, "dash", [
        rounded_rect(0.0, 1.108, 0.985, 0.90, 0.080, 0.045, "y"),
        rounded_rect(0.0, 1.168, 0.855, 0.89, 0.094, 0.045, "y"),
        rounded_rect(0.0, 1.174, 0.730, 0.87, 0.074, 0.040, "y"),
    ])
    meshes.append(dash)

    screen = Mesh("centreScreen")
    sp = rounded_rect(0.0, 1.222, 0.756, 0.208, 0.134, 0.012, "z")
    back = [(x, y, z - 0.024) for x, y, z in sp]
    loft_box(screen, "screen", [back, sp])
    meshes.append(screen)

    # Left-hand drive: the driver sits on the left.
    wheel = Mesh("steeringWheel")
    add_revolve(wheel, "trim", [(0.182, -0.019), (0.202, -0.010), (0.202, 0.010), (0.182, 0.019)],
                (-0.392, 1.132, 0.902), 24)
    meshes.append(wheel)

    # Three rows.
    for name, x, z, scale in (
        ("seatFrontLeft", -0.392, 0.330, 1.0),
        ("seatFrontRight", 0.392, 0.330, 1.0),
        ("seatRearLeft", -0.412, -0.700, 1.0),
        ("seatRearRight", 0.412, -0.700, 1.0),
        ("seatThirdLeft", -0.400, -1.660, 0.92),
        ("seatThirdRight", 0.400, -1.660, 0.92),
    ):
        meshes.append(build_seat(name, x, z, scale))

    return meshes


def build_mirrors():
    """Door mirrors, parented to the front doors so they swing with them."""
    out = {}
    for name, sign, owner in (("mirrorLeft", -1, DOOR_FL), ("mirrorRight", 1, DOOR_FR)):
        mesh = Mesh(name)
        base_x = sign * 0.998
        loft_box(mesh, "trim", [
            rounded_rect(base_x, 1.248, 0.858, 0.022, 0.032, 0.012, "x"),
            rounded_rect(base_x + sign * 0.082, 1.268, 0.850, 0.038, 0.046, 0.016, "x"),
            rounded_rect(base_x + sign * 0.146, 1.276, 0.842, 0.032, 0.052, 0.016, "x"),
        ])
        out[name] = (mesh, owner)
    return out


# --------------------------------------------------------------------------
# glTF 2.0 / GLB writer
# --------------------------------------------------------------------------
class Gltf:
    def __init__(self):
        self.bin = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.meshes = []
        self.nodes = []
        self.materials = []
        self.material_index = {}

    def _align(self):
        while len(self.bin) % 4:
            self.bin.append(0)

    def _view(self, data, target):
        self._align()
        offset = len(self.bin)
        self.bin += data
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target}
        )
        return len(self.buffer_views) - 1

    def add_floats(self, values, components):
        data = struct.pack(f"<{len(values)}f", *values)
        view = self._view(data, 34962)  # ARRAY_BUFFER
        count = len(values) // components
        mins = [min(values[i::components]) for i in range(components)]
        maxs = [max(values[i::components]) for i in range(components)]
        self.accessors.append({
            "bufferView": view,
            "componentType": 5126,
            "count": count,
            "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3"}[components],
            "min": mins,
            "max": maxs,
        })
        return len(self.accessors) - 1

    def add_indices(self, indices):
        data = struct.pack(f"<{len(indices)}I", *indices)
        view = self._view(data, 34963)  # ELEMENT_ARRAY_BUFFER
        self.accessors.append({
            "bufferView": view,
            "componentType": 5125,
            "count": len(indices),
            "type": "SCALAR",
        })
        return len(self.accessors) - 1

    def material(self, name):
        if name in self.material_index:
            return self.material_index[name]
        colour, metallic, rough, emissive, blend = MATERIALS[name]
        m = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": list(colour),
                "metallicFactor": metallic,
                "roughnessFactor": rough,
            },
            "doubleSided": False,
        }
        if emissive is not None:
            m["emissiveFactor"] = list(emissive)
        if blend:
            m["alphaMode"] = "BLEND"
            m["doubleSided"] = True
        self.materials.append(m)
        self.material_index[name] = len(self.materials) - 1
        return self.material_index[name]

    def add_mesh(self, mesh):
        prims = []
        for material, p in mesh.prims.items():
            if not p["idx"]:
                continue
            prims.append({
                "attributes": {
                    "POSITION": self.add_floats(p["pos"], 3),
                    "NORMAL": self.add_floats(p["nrm"], 3),
                },
                "indices": self.add_indices(p["idx"]),
                "material": self.material(material),
            })
        if not prims:
            return None
        self.meshes.append({"name": mesh.name, "primitives": prims})
        return len(self.meshes) - 1

    def add_node(self, name, mesh_index=None, translation=None, children=None):
        node = {"name": name}
        if mesh_index is not None:
            node["mesh"] = mesh_index
        if translation is not None and any(abs(v) > 1e-9 for v in translation):
            node["translation"] = list(translation)
        if children:
            node["children"] = children
        self.nodes.append(node)
        return len(self.nodes) - 1

    def write(self, path, root_index):
        gltf = {
            "asset": {"version": "2.0", "generator": "tools/build_vehicle_model.py"},
            "scene": 0,
            "scenes": [{"nodes": [root_index]}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin)}],
        }
        json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "
        bin_bytes = bytes(self.bin)
        while len(bin_bytes) % 4:
            bin_bytes += b"\x00"
        total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
            f.write(json_bytes)
            f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
            f.write(bin_bytes)
        return total


# --------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------
PANEL_NODE = {
    DOOR_FL: "doorFrontLeft",
    DOOR_FR: "doorFrontRight",
    DOOR_RL: "doorRearLeft",
    DOOR_RR: "doorRearRight",
    LIFTGATE: "liftgate",
    FRUNK: "frunkLid",
    PORT: "chargePortFlap",
}


def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root_dir, "assets", "vehicle")
    os.makedirs(out_dir, exist_ok=True)

    panels, lights, grid, normals = build_panels()
    mirrors = build_mirrors()

    g = Gltf()
    report = {"hinges": {}, "lights": [], "meshes": {}, "static": []}

    # Children collected per hinge so mirrors and lenses travel with their panel.
    hinge_children = {p: [] for p in PANEL_NODE}
    root_children = []

    # --- Static body ---
    body_idx = g.add_mesh(panels[BODY])
    root_children.append(g.add_node("bodyShell", body_idx))
    report["meshes"]["bodyShell"] = panels[BODY].triangles()
    report["static"].append("bodyShell")

    for key in ("cabinShell",):
        idx = g.add_mesh(panels[key])
        root_children.append(g.add_node(key, idx))
        report["meshes"][key] = panels[key].triangles()
        report["static"].append(key)

    for mesh in build_interior_fittings():
        idx = g.add_mesh(mesh)
        if idx is None:
            continue
        root_children.append(g.add_node(mesh.name, idx))
        report["meshes"][mesh.name] = mesh.triangles()
        report["static"].append(mesh.name)

    # --- Wheels ---
    for name, x, z, mirrored in (
        ("wheelFrontLeft", -0.872, FRONT_AXLE_Z, True),
        ("wheelFrontRight", 0.872, FRONT_AXLE_Z, False),
        ("wheelRearLeft", -0.872, REAR_AXLE_Z, True),
        ("wheelRearRight", 0.872, REAR_AXLE_Z, False),
    ):
        mesh = build_wheel(name, (x, WHEEL_RADIUS, z), mirrored)
        idx = g.add_mesh(mesh)
        root_children.append(g.add_node(name, idx))
        report["meshes"][name] = mesh.triangles()
        report["static"].append(name)

    # --- Extra parts that ride on a moving panel ---
    extras = {}
    for name, (mesh, owner) in list(mirrors.items()) + [
        (n, (m, o)) for n, (m, o) in lights.items()
    ]:
        extras.setdefault(owner, []).append((name, mesh))

    # --- Articulated panels ---
    for panel, node_name in PANEL_NODE.items():
        mesh = panels.get(panel)
        if mesh is None or mesh.empty():
            print(f"WARNING: panel {panel} produced no geometry", file=sys.stderr)
            continue
        hinge = HINGES[panel]
        pivot = hinge["pivot"]

        mesh.translate(pivot)
        mesh_idx = g.add_mesh(mesh)
        children = [g.add_node(f"panel_{node_name}", mesh_idx)]
        report["meshes"][f"panel_{node_name}"] = mesh.triangles()

        for extra_name, extra_mesh in extras.pop(panel, []):
            extra_mesh.translate(pivot)
            eidx = g.add_mesh(extra_mesh)
            if eidx is None:
                continue
            children.append(g.add_node(extra_name, eidx))
            report["meshes"][extra_name] = extra_mesh.triangles()
            if extra_name in LIGHT_PATCHES:
                report["lights"].append(extra_name)

        hinge_node = g.add_node(f"hinge_{node_name}", translation=pivot, children=children)
        root_children.append(hinge_node)
        report["hinges"][node_name] = {
            "node": f"hinge_{node_name}",
            "pivot": [round(v, 4) for v in pivot],
            "axis": list(hinge["axis"]),
            "openDegrees": hinge["open_deg"],
        }

    # --- Parts riding on the static body ---
    for owner, items in extras.items():
        for extra_name, extra_mesh in items:
            eidx = g.add_mesh(extra_mesh)
            if eidx is None:
                continue
            root_children.append(g.add_node(extra_name, eidx))
            report["meshes"][extra_name] = extra_mesh.triangles()
            if extra_name in LIGHT_PATCHES:
                report["lights"].append(extra_name)
            else:
                report["static"].append(extra_name)

    root = g.add_node("vehicleRoot", children=root_children)
    out_path = os.path.join(out_dir, "vehicle.glb")
    size = g.write(out_path, root)

    total_tris = sum(report["meshes"].values())
    report["totals"] = {
        "triangles": total_tris,
        "nodes": len(g.nodes),
        "meshes": len(g.meshes),
        "materials": len(g.materials),
        "bytes": size,
    }
    report["lights"] = sorted(set(report["lights"]))
    with open(os.path.join(out_dir, "vehicle.articulation.json"), "w") as f:
        json.dump(report, f, indent=2, sort_keys=True)

    print(f"wrote {out_path}  {size/1024:.0f} KB")
    print(f"  triangles {total_tris}  nodes {len(g.nodes)}  meshes {len(g.meshes)}  materials {len(g.materials)}")
    print(f"  hinges: {', '.join(sorted(report['hinges']))}")
    print(f"  lights: {', '.join(report['lights'])}")
    missing = [p for p in PANEL_NODE if p not in report["hinges"]]
    if missing:
        print(f"  MISSING PANELS: {missing}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
