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
# Vehicle package. Mid-size electric crossover proportions, metres.
# --------------------------------------------------------------------------
LENGTH = 4.751
WIDTH = 1.921
HEIGHT = 1.624
WHEELBASE = 2.890

HALF_W = WIDTH / 2.0
FRONT_AXLE_Z = WHEELBASE / 2.0
REAR_AXLE_Z = -WHEELBASE / 2.0
WHEEL_RADIUS = 0.3785
TIRE_WIDTH = 0.255

# Longitudinal stations: (z, y_bottom, y_top, half_width, belt_y, roof_half_width)
#   y_bottom  underbody / valance height at this station
#   y_top     highest point of the section (hood crown, roof, or decklid)
#   belt_y    beltline — the crease where bodyside ends and glass begins
#   roof_hw   half-width of the roof / upper surface at this station
# Ordered nose (+z) to tail (-z).
STATIONS = [
    (2.3755, 0.360, 0.740, 0.700, 0.680, 0.400),
    (2.3000, 0.268, 0.800, 0.812, 0.748, 0.480),
    (2.2000, 0.212, 0.858, 0.888, 0.802, 0.540),
    (2.1000, 0.190, 0.898, 0.912, 0.842, 0.565),
    (1.9500, 0.176, 0.940, 0.933, 0.884, 0.585),
    (1.8000, 0.168, 0.972, 0.944, 0.914, 0.596),
    (1.6000, 0.161, 1.006, 0.952, 0.948, 0.602),
    (1.4000, 0.156, 1.038, 0.957, 0.978, 0.604),
    (1.2400, 0.153, 1.062, 0.959, 1.000, 0.604),
    (1.1400, 0.152, 1.078, 0.9605, 1.014, 0.602),
    # Cowl -> windscreen. y_top climbs steeply, roof width opens out.
    (1.0600, 0.151, 1.120, 0.9605, 1.008, 0.660),
    (0.9600, 0.150, 1.196, 0.9605, 1.000, 0.716),
    (0.8000, 0.150, 1.310, 0.9605, 0.994, 0.742),
    (0.6000, 0.150, 1.442, 0.9605, 0.988, 0.740),
    (0.4000, 0.149, 1.545, 0.9605, 0.982, 0.730),
    (0.2000, 0.148, 1.601, 0.9605, 0.978, 0.717),
    (0.0000, 0.146, 1.621, 0.9605, 0.974, 0.708),
    (-0.2000, 0.145, 1.624, 0.9605, 0.971, 0.703),
    (-0.4500, 0.145, 1.621, 0.9600, 0.968, 0.700),
    (-0.7000, 0.145, 1.612, 0.9580, 0.966, 0.697),
    (-1.0000, 0.148, 1.590, 0.9525, 0.963, 0.688),
    (-1.2000, 0.150, 1.568, 0.9490, 0.960, 0.678),
    (-1.3400, 0.152, 1.548, 0.9460, 0.958, 0.668),
    (-1.5000, 0.155, 1.516, 0.9410, 0.955, 0.650),
    (-1.6500, 0.159, 1.474, 0.9350, 0.951, 0.624),
    (-1.8000, 0.166, 1.418, 0.9270, 0.946, 0.592),
    (-1.9200, 0.174, 1.356, 0.9180, 0.940, 0.560),
    (-2.0400, 0.188, 1.276, 0.9060, 0.930, 0.522),
    (-2.1500, 0.212, 1.176, 0.8900, 0.912, 0.482),
    (-2.2500, 0.258, 1.058, 0.8600, 0.880, 0.440),
    (-2.3200, 0.320, 0.952, 0.8180, 0.836, 0.402),
    (-2.3755, 0.398, 0.868, 0.7500, 0.786, 0.360),
]

# Section control points, lower half: (width_factor_of_hw, height_fraction_of_lower)
# Runs from underbody centreline up to the beltline.
LOWER_CONTROLS = [
    (0.000, 0.000),
    (0.400, 0.004),
    (0.700, 0.028),
    (0.880, 0.092),
    (0.958, 0.210),
    (0.992, 0.360),
    (1.000, 0.500),
    (0.996, 0.660),
    (0.978, 0.830),
    (0.952, 0.945),
    (0.936, 1.000),
]

# Section control points, upper half: (blend, height_fraction_of_upper)
# `blend` interpolates half-width between hw*0.936 (beltline) and roof_hw.
# The last entries fold the surface over the roof crown to the centreline.
UPPER_CONTROLS = [
    (0.000, 0.000),
    (0.070, 0.120),
    (0.200, 0.290),
    (0.390, 0.470),
    (0.610, 0.650),
    (0.820, 0.810),
    (0.960, 0.915),
    (1.000, 0.972),  # roof rail
]
# Roof crown, expressed as (factor_of_roof_hw, height_fraction_of_upper).
ROOF_CROWN = [
    (0.860, 0.990),
    (0.560, 1.000),
    (0.000, 1.004),
]

LOWER_SAMPLES = 17  # inclusive of both ends; t = 0 .. 0.5
UPPER_SAMPLES = 17  # t = 0.5 .. 1.0
STATION_SUBDIV = 2  # extra interpolated stations between table entries

# End-cap rings: (scale toward the ring centroid, distance pushed outboard).
CAP_PROFILE = [
    (0.955, 0.022),
    (0.860, 0.043),
    (0.700, 0.060),
    (0.470, 0.071),
    (0.000, 0.078),
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


ARCH_RADIUS = 0.520     # opening radius around the axle centre
ARCH_TOP = 0.812        # height of the arch crown above the ground
ARCH_FLANK_START = 0.50  # |x|/hw at which the arch starts to bite
ARCH_FLANK_FULL = 0.86   # |x|/hw at which it bites fully


def arch_floor(z, x_fraction, y_bot):
    """Lowest bodywork height at this station and flank position.

    Sweeping the lower flank upward around each axle is what turns a plain
    lofted tube into a car: without it the wheels intersect a solid side.
    """
    best = y_bot
    for axle in (FRONT_AXLE_Z, REAR_AXLE_Z):
        dz = z - axle
        if abs(dz) >= ARCH_RADIUS:
            continue
        arc = math.sqrt(max(0.0, 1.0 - (dz / ARCH_RADIUS) ** 2))
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

DOOR_T_MIN, DOOR_T_MAX = 0.130, 0.822
FRONT_DOOR_Z = (-0.100, 0.955)
REAR_DOOR_Z = (-1.245, -0.100)
FRUNK_Z = (1.150, 1.985)
FRUNK_T_MIN = 0.545
LIFTGATE_UPPER_Z = -1.520
LIFTGATE_LOWER_Z = -1.800
LIFTGATE_T_MIN = 0.145
PORT_Z = (-1.700, -1.480)
PORT_T = (0.352, 0.492)

# Glass bands, evaluated after panel assignment.
WINDSCREEN_Z = (0.150, 1.150)
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
        return t >= 0.560
    if panel == LIFTGATE:
        # Backlight: the upper band forward of the tail.
        return t >= 0.640 and z >= -2.240
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
    DOOR_FL: dict(pivot=(-0.905, 0.760, 0.955), axis=(0, 1, 0), open_deg=64.0),
    DOOR_FR: dict(pivot=(0.905, 0.760, 0.955), axis=(0, 1, 0), open_deg=-64.0),
    DOOR_RL: dict(pivot=(-0.900, 0.760, -0.100), axis=(0, 1, 0), open_deg=72.0),
    DOOR_RR: dict(pivot=(0.900, 0.760, -0.100), axis=(0, 1, 0), open_deg=-72.0),
    # Liftgate swings up and rearward about the roof's trailing edge.
    LIFTGATE: dict(pivot=(0.0, 1.512, -1.520), axis=(1, 0, 0), open_deg=44.0),
    # Bonnet is hinged at the cowl and lifts from its leading edge.
    FRUNK: dict(pivot=(0.0, 1.062, 1.150), axis=(1, 0, 0), open_deg=-52.0),
    # Flap swings outboard about its rearward vertical edge.
    PORT: dict(pivot=(-0.905, 0.905, -1.700), axis=(0, 1, 0), open_deg=-105.0),
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

# Light surfaces: name -> (z range, t range, side)  side: -1 left, +1 right, 0 both
LIGHT_PATCHES = {
    "headlightLeft":       ((2.012, 2.238), (0.300, 0.452), -1, "headlightLens"),
    "headlightRight":      ((2.012, 2.238), (0.300, 0.452), +1, "headlightLens"),
    "indicatorFrontLeft":  ((2.012, 2.238), (0.236, 0.296), -1, "indicatorLens"),
    "indicatorFrontRight": ((2.012, 2.238), (0.236, 0.296), +1, "indicatorLens"),
    "daytimeRunningBar":   ((2.196, 2.330), (0.470, 0.560), 0, "headlightLens"),
    "taillightLeft":       ((-2.330, -2.150), (0.300, 0.452), -1, "taillightLens"),
    "taillightRight":      ((-2.330, -2.150), (0.300, 0.452), +1, "taillightLens"),
    "indicatorRearLeft":   ((-2.330, -2.150), (0.236, 0.296), -1, "indicatorLens"),
    "indicatorRearRight":  ((-2.330, -2.150), (0.236, 0.296), +1, "indicatorLens"),
    "taillightBar":        ((-2.360, -2.240), (0.470, 0.575), 0, "taillightLens"),
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
            if not (-2.405 <= cz <= 1.16):
                continue
            if t < 0.055:  # leave the floor to the dedicated floor pan
                continue
            shell.add_quad("cabinShell", cabin[i][j], cabin[i + 1][j],
                           cabin[i + 1][j2], cabin[i][j2], flip=True)
    meshes["cabinShell"] = shell

    # Light lenses, offset proud of the body and parented to whichever panel
    # owns that stretch of bodywork, so a lens on the tailgate travels with it.
    lights = {}
    for name, (zr, tr, side, material) in LIGHT_PATCHES.items():
        mesh = Mesh(name)
        owner_votes = {}
        outer = offset_grid(grid, normals, -LENS_OFFSET)
        for i in range(rows - 1):
            for j in range(cols):
                j2 = (j + 1) % cols
                cx, _, cz = cell_centre(grid, i, j)
                t = (t_values[j] + t_values[j2]) / 2.0
                if not (zr[0] <= cz <= zr[1] and tr[0] <= t <= tr[1]):
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
    rim_r = 0.2413  # 19in
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


def build_seat(name, x, z, facing_back=False):
    mesh = Mesh(name)
    hw, hh = 0.255, 0.055
    # Cushion.
    loft_box(mesh, "seat", [
        rounded_rect(x, 0.415, z + 0.24, hw * 0.92, hh, 0.035, "y"),
        rounded_rect(x, 0.425, z, hw, hh * 1.15, 0.035, "y"),
        rounded_rect(x, 0.445, z - 0.22, hw * 0.95, hh * 1.1, 0.035, "y"),
    ])
    # Backrest, raked back from the cushion's rear edge.
    loft_box(mesh, "seat", [
        rounded_rect(x, 0.470, z - 0.235, hw * 0.95, 0.060, 0.030, "y"),
        rounded_rect(x, 0.700, z - 0.290, hw * 0.98, 0.058, 0.030, "y"),
        rounded_rect(x, 0.930, z - 0.345, hw * 0.90, 0.052, 0.030, "y"),
    ])
    # Head restraint.
    loft_box(mesh, "seat", [
        rounded_rect(x, 0.985, z - 0.352, 0.105, 0.042, 0.028, "y"),
        rounded_rect(x, 1.085, z - 0.362, 0.110, 0.044, 0.028, "y"),
        rounded_rect(x, 1.155, z - 0.372, 0.092, 0.038, 0.026, "y"),
    ])
    return mesh


def build_interior_fittings():
    """Floor pan, dashboard, centre screen, steering wheel and seats."""
    meshes = []

    floor = Mesh("cabinFloor")
    z0, z1 = -2.16, 1.02
    for i in range(24):
        za = lerp(z0, z1, i / 24)
        zb = lerp(z0, z1, (i + 1) / 24)
        w = 0.84
        floor.add_quad("cabinShell", (-w, 0.245, za), (w, 0.245, za), (w, 0.245, zb), (-w, 0.245, zb), flip=True)
    meshes.append(floor)

    dash = Mesh("dashboard")
    loft_box(dash, "dash", [
        rounded_rect(0.0, 0.905, 0.985, 0.86, 0.075, 0.045, "y"),
        rounded_rect(0.0, 0.960, 0.855, 0.85, 0.090, 0.045, "y"),
        rounded_rect(0.0, 0.965, 0.735, 0.83, 0.070, 0.040, "y"),
    ])
    meshes.append(dash)

    screen = Mesh("centreScreen")
    sp = rounded_rect(0.0, 1.010, 0.760, 0.190, 0.128, 0.012, "z")
    back = [(x, y, z - 0.022) for x, y, z in sp]
    loft_box(screen, "screen", [back, sp])
    meshes.append(screen)

    # Left-hand drive: the driver sits on the left.
    wheel = Mesh("steeringWheel")
    add_revolve(wheel, "trim", [(0.176, -0.018), (0.196, -0.010), (0.196, 0.010), (0.176, 0.018)],
                (-0.375, 0.930, 0.905), 24)
    meshes.append(wheel)

    for name, x, z in (
        ("seatFrontLeft", -0.375, 0.330),
        ("seatFrontRight", 0.375, 0.330),
        ("seatRearLeft", -0.395, -0.640),
        ("seatRearRight", 0.395, -0.640),
    ):
        meshes.append(build_seat(name, x, z))

    return meshes


def build_mirrors():
    """Door mirrors, parented to the front doors so they swing with them."""
    out = {}
    for name, sign, owner in (("mirrorLeft", -1, DOOR_FL), ("mirrorRight", 1, DOOR_FR)):
        mesh = Mesh(name)
        base_x = sign * 0.945
        loft_box(mesh, "trim", [
            rounded_rect(base_x, 1.030, 0.845, 0.020, 0.030, 0.012, "x"),
            rounded_rect(base_x + sign * 0.075, 1.048, 0.838, 0.036, 0.042, 0.016, "x"),
            rounded_rect(base_x + sign * 0.135, 1.055, 0.832, 0.030, 0.048, 0.016, "x"),
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
        ("wheelFrontLeft", -0.828, FRONT_AXLE_Z, True),
        ("wheelFrontRight", 0.828, FRONT_AXLE_Z, False),
        ("wheelRearLeft", -0.828, REAR_AXLE_Z, True),
        ("wheelRearRight", 0.828, REAR_AXLE_Z, False),
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
