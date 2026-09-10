#!/usr/bin/env python3
"""
Offline validator for assets/vehicle/vehicle.glb.

Loads the GLB, applies a named hinge pose, and rasterises it to a PNG with a
z-buffer and simple two-light shading. This exists so the asset can be inspected
— proportions, hinge positions, whether geometry behind an open door is solid —
without a device or a browser in the loop.

Usage:
  python3 tools/preview_model.py out.png --view threeQuarter --open liftgate=1
"""

import argparse
import json
import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLB = os.path.join(ROOT, "assets", "vehicle", "vehicle.glb")

VIEWS = {
    # eye, target, fov degrees.  +Z is the nose, +X is the vehicle's right.
    "threeQuarter": ((6.4, 2.55, 5.6), (0.0, 0.80, 0.05), 27.0),
    "rearQuarter": ((-6.2, 2.45, -5.2), (0.0, 0.82, -0.20), 27.0),
    "side": ((9.6, 1.15, 0.0), (0.0, 0.82, 0.0), 25.0),
    "sideLeft": ((-9.6, 1.15, 0.0), (0.0, 0.82, 0.0), 25.0),
    "front": ((0.0, 1.35, 9.4), (0.0, 0.80, 0.0), 25.0),
    "rear": ((0.0, 1.35, -9.4), (0.0, 0.80, 0.0), 25.0),
    "top": ((0.02, 10.4, 0.02), (0.0, 0.0, 0.0), 27.0),
    "cabin": ((-0.36, 1.24, -0.30), (-0.05, 1.00, 1.30), 66.0),
}


def load_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, "not a glTF 2.0 binary"
    off = 12
    js = None
    binchunk = b""
    while off < len(data):
        length, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + length]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binchunk = chunk
        off += 8 + length
    return js, binchunk


def read_accessor(g, buf, index):
    acc = g["accessors"][index]
    view = g["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    fmt = {5126: "f", 5125: "I", 5123: "H"}[acc["componentType"]]
    size = struct.calcsize("<" + fmt)
    total = count * comps
    values = struct.unpack_from(f"<{total}{fmt}", buf, start)
    if comps == 1:
        return list(values)
    return [values[i * comps:(i + 1) * comps] for i in range(count)]


def rot_matrix(axis, radians):
    x, y, z = axis
    c, s = math.cos(radians), math.sin(radians)
    t = 1 - c
    return (
        (t * x * x + c, t * x * y - s * z, t * x * z + s * y),
        (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
        (t * x * z - s * y, t * y * z + s * x, t * z * z + c),
    )


def mat_apply(m, v):
    return (
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    )


def collect(g, buf, poses):
    """Walk the scene graph, returning world-space triangles with a material."""
    articulation = json.load(open(os.path.join(ROOT, "assets", "vehicle", "vehicle.articulation.json")))
    hinges = articulation["hinges"]
    by_node_name = {v["node"]: (k, v) for k, v in hinges.items()}

    tris = []
    nodes = g["nodes"]

    def walk(index, translation, rotation):
        node = nodes[index]
        name = node.get("name", "")
        t = node.get("translation", [0, 0, 0])
        offset = (translation[0] + t[0], translation[1] + t[1], translation[2] + t[2])
        rot = rotation
        if name in by_node_name:
            key, spec = by_node_name[name]
            amount = poses.get(key, 0.0)
            if amount:
                rot = rot_matrix(tuple(spec["axis"]), math.radians(spec["openDegrees"] * amount))
        if "mesh" in node:
            mesh = g["meshes"][node["mesh"]]
            for prim in mesh["primitives"]:
                pos = read_accessor(g, buf, prim["attributes"]["POSITION"])
                idx = read_accessor(g, buf, prim["indices"])
                mat = g["materials"][prim["material"]]["name"]
                # A hinge node's own translation is the pivot; children are stored
                # pivot-relative, so rotate first and then translate.
                pts = []
                for p in pos:
                    q = mat_apply(rot, p) if rot else p
                    pts.append((q[0] + offset[0], q[1] + offset[1], q[2] + offset[2]))
                for i in range(0, len(idx), 3):
                    tris.append((pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]], mat))
        for child in node.get("children", []):
            walk(child, offset, rot)

    walk(g["scenes"][0]["nodes"][0], (0.0, 0.0, 0.0), None)
    return tris


MAT_COLOUR = {
    "paint": (0.30, 0.33, 0.37),
    "glass": (0.10, 0.13, 0.17),
    "trim": (0.09, 0.10, 0.11),
    "chrome": (0.72, 0.74, 0.77),
    "cabinShell": (0.15, 0.15, 0.16),
    "panelInner": (0.19, 0.20, 0.21),
    "seat": (0.22, 0.23, 0.25),
    "dash": (0.16, 0.17, 0.18),
    "screen": (0.04, 0.04, 0.05),
    "tire": (0.06, 0.06, 0.07),
    "rim": (0.62, 0.64, 0.66),
    "headlightLens": (0.86, 0.90, 0.96),
    "taillightLens": (0.66, 0.10, 0.12),
    "indicatorLens": (0.85, 0.50, 0.12),
    "brakeDisc": (0.24, 0.25, 0.26),
}


LIT_MATERIALS = {
    "head": ("headlightLens",),
    "tail": ("taillightLens",),
    "indicator": ("indicatorLens",),
}


def render(tris, view, width, height, cull=False, lit=frozenset()):
    lit_materials = set()
    for group in lit:
        lit_materials.update(LIT_MATERIALS.get(group, ()))
    eye, target, fov = VIEWS[view]
    up = (0.0, 1.0, 0.0)

    def normalize(v):
        m = math.sqrt(sum(c * c for c in v)) or 1.0
        return tuple(c / m for c in v)

    fwd = normalize(tuple(target[i] - eye[i] for i in range(3)))
    right = normalize((
        fwd[1] * up[2] - fwd[2] * up[1],
        fwd[2] * up[0] - fwd[0] * up[2],
        fwd[0] * up[1] - fwd[1] * up[0],
    ))
    camup = (
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
    )
    f = 1.0 / math.tan(math.radians(fov) / 2.0)
    aspect = width / height

    depth = [1e30] * (width * height)
    colour = [(0.055, 0.058, 0.063)] * (width * height)

    key = normalize((0.55, 0.82, 0.45))
    fill = normalize((-0.6, 0.35, -0.5))

    def project(p):
        d = (p[0] - eye[0], p[1] - eye[1], p[2] - eye[2])
        cx = d[0] * right[0] + d[1] * right[1] + d[2] * right[2]
        cy = d[0] * camup[0] + d[1] * camup[1] + d[2] * camup[2]
        cz = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]
        if cz <= 0.02:
            return None
        sx = (cx * f / aspect / cz) * 0.5 * width + width * 0.5
        sy = height * 0.5 - (cy * f / cz) * 0.5 * height
        return (sx, sy, cz)

    for a, b, c, mat in tris:
        pa, pb, pc = project(a), project(b), project(c)
        if not (pa and pb and pc):
            continue
        area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if abs(area) < 1e-9:
            continue
        if cull and area > 0:
            continue
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = normalize((
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
        ))
        lam = max(0.0, sum(n[i] * key[i] for i in range(3)))
        lam2 = max(0.0, sum(n[i] * fill[i] for i in range(3)))
        base = MAT_COLOUR.get(mat, (0.5, 0.5, 0.5))
        shade = 0.14 + 0.78 * lam + 0.24 * lam2
        if mat in ("headlightLens", "taillightLens", "indicatorLens"):
            # An unlit lens is a dark piece of glass; a lit one emits, so it is
            # drawn at full value regardless of which way its normal points.
            shade = 2.9 if mat in lit_materials else 0.34
        px = tuple(min(1.0, base[i] * shade) for i in range(3))

        minx = max(0, int(min(pa[0], pb[0], pc[0])))
        maxx = min(width - 1, int(max(pa[0], pb[0], pc[0])) + 1)
        miny = max(0, int(min(pa[1], pb[1], pc[1])))
        maxy = min(height - 1, int(max(pa[1], pb[1], pc[1])) + 1)
        for y in range(miny, maxy + 1):
            for x in range(minx, maxx + 1):
                px0, py0 = x + 0.5, y + 0.5
                w0 = ((pb[0] - pa[0]) * (py0 - pa[1]) - (px0 - pa[0]) * (pb[1] - pa[1])) / area
                w1 = ((pc[0] - pb[0]) * (py0 - pb[1]) - (px0 - pb[0]) * (pc[1] - pb[1])) / area
                w2 = ((pa[0] - pc[0]) * (py0 - pc[1]) - (px0 - pc[0]) * (pa[1] - pc[1])) / area
                if w0 < 0 or w1 < 0 or w2 < 0:
                    continue
                z = w1 * pa[2] + w2 * pb[2] + w0 * pc[2]
                i = y * width + x
                if z < depth[i]:
                    depth[i] = z
                    colour[i] = px
    return colour


def write_png(path, pixels, width, height, supersample):
    w, h = width // supersample, height // supersample
    rows = bytearray()
    for y in range(h):
        rows.append(0)
        for x in range(w):
            acc = [0.0, 0.0, 0.0]
            for sy in range(supersample):
                for sx in range(supersample):
                    p = pixels[(y * supersample + sy) * width + (x * supersample + sx)]
                    for k in range(3):
                        acc[k] += p[k]
            n = supersample * supersample
            for k in range(3):
                v = acc[k] / n
                v = v ** (1 / 2.2)
                rows.append(max(0, min(255, int(v * 255 + 0.5))))

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(rows), 6))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--view", default="threeQuarter", choices=sorted(VIEWS))
    ap.add_argument("--open", action="append", default=[],
                    help="hinge=amount, e.g. liftgate=1 or doorFrontLeft=0.6")
    ap.add_argument("--width", type=int, default=520)
    ap.add_argument("--height", type=int, default=340)
    ap.add_argument("--ss", type=int, default=2, help="supersampling factor")
    ap.add_argument("--only", default=None, help="comma-separated materials to draw")
    ap.add_argument("--hide", default=None, help="comma-separated materials to skip")
    ap.add_argument("--cull", action="store_true", help="backface-cull like a GPU would")
    ap.add_argument("--lights", default="", help="comma-separated lit groups: head,tail,indicator")
    args = ap.parse_args()

    poses = {}
    for spec in args.open:
        k, _, v = spec.partition("=")
        poses[k] = float(v or 1.0)

    g, buf = load_glb(GLB)
    tris = collect(g, buf, poses)
    if args.only:
        keep = set(args.only.split(","))
        tris = [t for t in tris if t[3] in keep]
    if args.hide:
        drop = set(args.hide.split(","))
        tris = [t for t in tris if t[3] not in drop]
    w, h = args.width * args.ss, args.height * args.ss
    lit = set(g for g in args.lights.split(",") if g)
    pixels = render(tris, args.view, w, h, cull=args.cull, lit=lit)
    write_png(args.out, pixels, w, h, args.ss)
    print(f"{args.out}  {len(tris)} triangles  view={args.view}  poses={poses or '{}'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
