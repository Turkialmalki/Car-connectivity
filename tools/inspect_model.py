#!/usr/bin/env python3
"""
Inspect any glTF/GLB and propose an articulation mapping for it.

Run this on a purchased Rivian R1S asset before wiring it in. It answers the
questions that decide whether the asset is usable at all:

  * Does its scene graph expose the parts as SEPARATE nodes, or is the body one
    inseparable mesh? (A single mesh cannot be articulated.)
  * Which node is each semantic part?
  * Where is each part's hinge, and which axis does it swing about?
  * Are the light surfaces separate meshes?
  * Is it small enough to ship to a phone?

It then prints a ready-to-paste `HINGES` block for
src/components/vehicle-3d/articulation.ts.

Usage:
  python3 tools/inspect_model.py path/to/rivian-r1s.glb
  python3 tools/inspect_model.py path/to/model.gltf --verbose
"""

import argparse
import json
import math
import os
import struct
import sys

# Semantic part -> keywords that commonly name it in commercial assets.
# Ordered most specific first, because "door" also matches "door_handle".
PART_KEYWORDS = {
    "frontTrunk": ["frunk", "hood", "bonnet", "capot"],
    "rearTrunk": ["liftgate", "tailgate", "trunk", "hatch", "boot", "decklid"],
    "chargePort": ["chargeport", "charge_port", "charge", "fuelflap", "fuel_cap", "flap"],
    "driverDoor": ["door_fl", "doorfrontleft", "door_front_left", "frontleftdoor", "door_l_f",
                   "doorl1", "door01", "leftfrontdoor"],
    "passengerDoor": ["door_fr", "doorfrontright", "door_front_right", "frontrightdoor",
                      "door_r_f", "doorr1", "rightfrontdoor"],
    "rearLeftDoor": ["door_rl", "doorrearleft", "door_rear_left", "rearleftdoor", "door_l_r",
                     "doorl2", "leftreardoor"],
    "rearRightDoor": ["door_rr", "doorrearright", "door_rear_right", "rearrightdoor",
                      "door_r_r", "doorr2", "rightreardoor"],
}

LIGHT_KEYWORDS = {
    "headlights": ["headlight", "head_light", "headlamp", "front_light", "lightfront"],
    "daytimeRunning": ["drl", "daytime", "lightbar", "light_bar", "runninglight"],
    "taillights": ["taillight", "tail_light", "taillamp", "rear_light", "brakelight", "stoplight"],
    "indicators": ["indicator", "turnsignal", "turn_signal", "blinker", "hazard"],
}

EXPECTED_LENGTH_M = 5.100  # Rivian R1S, for the scale check


def load(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] == b"glTF":
        _, version, _ = struct.unpack_from("<III", data, 0)
        if version != 2:
            raise SystemExit(f"glTF version {version} is not supported (need 2).")
        off, js, binchunk = 12, None, b""
        while off < len(data):
            length, ctype = struct.unpack_from("<II", data, off)
            chunk = data[off + 8: off + 8 + length]
            if ctype == 0x4E4F534A:
                js = json.loads(chunk.decode("utf-8"))
            elif ctype == 0x004E4942:
                binchunk = chunk
            off += 8 + length
        return js, binchunk, os.path.getsize(path)
    gltf = json.loads(data.decode("utf-8"))
    return gltf, b"", os.path.getsize(path)


def node_world_transforms(g):
    """Accumulated translation and scale per node (TRS, ignoring rotation)."""
    nodes = g.get("nodes", [])
    out = {}

    def walk(index, offset, scale):
        node = nodes[index]
        t = node.get("translation", [0, 0, 0])
        sc = node.get("scale", [1, 1, 1])
        if "matrix" in node:
            m = node["matrix"]  # column-major
            t = [m[12], m[13], m[14]]
            sc = [
                math.sqrt(m[0] ** 2 + m[1] ** 2 + m[2] ** 2),
                math.sqrt(m[4] ** 2 + m[5] ** 2 + m[6] ** 2),
                math.sqrt(m[8] ** 2 + m[9] ** 2 + m[10] ** 2),
            ]
        pos = [offset[i] + t[i] * scale[i] for i in range(3)]
        nsc = [scale[i] * sc[i] for i in range(3)]
        out[index] = (pos, nsc)
        for c in node.get("children", []):
            walk(c, pos, nsc)

    for scene_root in g.get("scenes", [{}])[g.get("scene", 0)].get("nodes", []):
        walk(scene_root, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0])
    return out


def mesh_bounds(g, mesh_index):
    """Local-space min/max from the POSITION accessors' declared min/max."""
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    tris = 0
    for prim in g["meshes"][mesh_index].get("primitives", []):
        acc_i = prim.get("attributes", {}).get("POSITION")
        if acc_i is None:
            continue
        acc = g["accessors"][acc_i]
        if "min" in acc and "max" in acc:
            for k in range(3):
                lo[k] = min(lo[k], acc["min"][k])
                hi[k] = max(hi[k], acc["max"][k])
        idx = prim.get("indices")
        tris += (g["accessors"][idx]["count"] if idx is not None else acc["count"]) // 3
    if lo[0] == float("inf"):
        return None, tris
    return (lo, hi), tris


def match_part(name):
    lowered = name.lower().replace("-", "_").replace(" ", "")
    for part, keys in PART_KEYWORDS.items():
        for key in keys:
            if key.replace("_", "") in lowered.replace("_", ""):
                return part
    # Generic door fallback: side + position words.
    if "door" in lowered:
        left = "left" in lowered or lowered.endswith("_l") or "_l_" in lowered
        right = "right" in lowered or lowered.endswith("_r") or "_r_" in lowered
        rear = "rear" in lowered or "back" in lowered
        front = "front" in lowered
        if left and rear:
            return "rearLeftDoor"
        if right and rear:
            return "rearRightDoor"
        if left and front:
            return "driverDoor"
        if right and front:
            return "passengerDoor"
    return None


def match_light(name):
    lowered = name.lower().replace("-", "_").replace(" ", "")
    for group, keys in LIGHT_KEYWORDS.items():
        for key in keys:
            if key.replace("_", "") in lowered.replace("_", ""):
                return group
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--verbose", action="store_true", help="list every node")
    args = ap.parse_args()

    g, binchunk, size = load(args.path)
    nodes = g.get("nodes", [])
    transforms = node_world_transforms(g)

    print(f"=== {os.path.basename(args.path)} ===")
    print(f"file size     {size / 1048576:.2f} MB")
    print(f"nodes         {len(nodes)}")
    print(f"meshes        {len(g.get('meshes', []))}")
    print(f"materials     {len(g.get('materials', []))}")
    print(f"animations    {len(g.get('animations', []))}")
    print(f"images        {len(g.get('images', []))}")

    exts = g.get("extensionsRequired", [])
    if exts:
        print(f"REQUIRED EXTENSIONS: {exts}")
        blocking = [e for e in exts if "draco" in e.lower() or "meshopt" in e.lower()]
        if blocking:
            print("  NOTE: three.js needs the matching decoder registered on GLTFLoader;")
            print("        this inspector cannot read compressed geometry.")

    # ---- scale + placement -------------------------------------------------
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    total_tris = 0
    for i, node in enumerate(nodes):
        if "mesh" not in node:
            continue
        bounds, tris = mesh_bounds(g, node["mesh"])
        total_tris += tris
        if not bounds:
            continue
        pos, scale = transforms.get(i, ([0, 0, 0], [1, 1, 1]))
        for k in range(3):
            lo[k] = min(lo[k], pos[k] + bounds[0][k] * scale[k])
            hi[k] = max(hi[k], pos[k] + bounds[1][k] * scale[k])

    if lo[0] != float("inf"):
        dims = [hi[k] - lo[k] for k in range(3)]
        longest = max(dims)
        axis = "XYZ"[dims.index(longest)]
        print(f"triangles     {total_tris:,}")
        print(f"bounds        X {lo[0]:.3f}..{hi[0]:.3f}  "
              f"Y {lo[1]:.3f}..{hi[1]:.3f}  Z {lo[2]:.3f}..{hi[2]:.3f}")
        print(f"dimensions    {dims[0]:.3f} x {dims[1]:.3f} x {dims[2]:.3f}  "
              f"(longest {longest:.3f} on {axis})")
        print(f"scale factor  {EXPECTED_LENGTH_M / longest:.4f}  "
              f"(to reach {EXPECTED_LENGTH_M} m)")
        if abs(longest - EXPECTED_LENGTH_M) > 0.4:
            print("  -> not in metres, or not the length expected. The loader "
                  "normalises this automatically.")
        if axis != "Z":
            print(f"  -> longest axis is {axis}, not Z. The vehicle likely faces "
                  "a different way; the loader's normalisation handles position "
                  "and scale but NOT orientation — rotate the root if the car "
                  "ends up sideways.")
        if total_tris > 250_000:
            print("  -> heavy for a phone. Decimate, or accept a lower frame rate.")

    # ---- articulation ------------------------------------------------------
    print("\n--- candidate articulated parts ---")
    found = {}
    for i, node in enumerate(nodes):
        name = node.get("name") or ""
        if not name:
            continue
        part = match_part(name)
        if not part or part in found:
            continue
        pos, scale = transforms.get(i, ([0, 0, 0], [1, 1, 1]))
        bounds = None
        if "mesh" in node:
            bounds, _ = mesh_bounds(g, node["mesh"])
        found[part] = (name, pos, bounds, scale)

    for part in PART_KEYWORDS:
        if part in found:
            name, pos, bounds, scale = found[part]
            extent = ""
            if bounds:
                d = [(bounds[1][k] - bounds[0][k]) * scale[k] for k in range(3)]
                extent = f"  size {d[0]:.2f}x{d[1]:.2f}x{d[2]:.2f}"
            print(f"  OK   {part:<16} <- {name!r}  at "
                  f"({pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f}){extent}")
        else:
            print(f"  MISS {part:<16} <- no node matched")

    missing = [p for p in PART_KEYWORDS if p not in found]
    if missing:
        print(f"\n  {len(missing)} part(s) unmatched. Either the asset does not "
              "separate them\n  (it cannot be articulated), or they are named "
              "differently — check the\n  full node list with --verbose and set "
              "the names by hand.")

    # ---- lights ------------------------------------------------------------
    print("\n--- candidate light surfaces ---")
    lights = {}
    for i, node in enumerate(nodes):
        name = node.get("name") or ""
        group = match_light(name) if name else None
        if group:
            lights.setdefault(group, []).append(name)
    for group in LIGHT_KEYWORDS:
        names = lights.get(group, [])
        print(f"  {'OK  ' if names else 'MISS'} {group:<16} {names if names else '<none>'}")

    # ---- paste-ready mapping ----------------------------------------------
    print("\n--- paste into src/components/vehicle-3d/articulation.ts ---")
    print("export const HINGES: Record<VehiclePart, HingeSpec> = {")
    defaults = {
        "driverDoor": ("y", 66, "Driver door"),
        "passengerDoor": ("y", -66, "Passenger door"),
        "rearLeftDoor": ("y", 74, "Rear left door"),
        "rearRightDoor": ("y", -74, "Rear right door"),
        "rearTrunk": ("x", 68, "Rear trunk"),
        "frontTrunk": ("x", -50, "Front trunk"),
        "chargePort": ("y", 100, "Charge port"),
    }
    for part, (axis, deg, label) in defaults.items():
        if part in found:
            name, pos, _, _ = found[part]
            pivot = f"[{pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f}]"
        else:
            name, pivot = "TODO_NODE_NAME", "[0, 0, 0]"
        print(f"  {part}: {{")
        print(f"    node: '{name}',")
        print(f"    axis: '{axis}',")
        print(f"    openDegrees: {deg},   // verify sign with tools/preview_model.py")
        print(f"    pivot: {pivot},")
        print(f"    label: '{label}',")
        print("  },")
    print("};")

    if args.verbose:
        print("\n--- all nodes ---")
        for i, node in enumerate(nodes):
            kind = "mesh" if "mesh" in node else "group"
            print(f"  [{i:>4}] {kind:<5} {node.get('name') or '<unnamed>'}")

    print("\nNext: point tools/preview_model.py at the new file to check hinge "
          "directions\nbefore running the app.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
