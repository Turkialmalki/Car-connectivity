# Assets

## The vehicle model

**File:** `assets/vehicle/vehicle.glb`
**Mapping:** `assets/vehicle/vehicle.articulation.json` (generated) →
`src/components/vehicle-3d/articulation.ts` (consumed by the app)
**Source:** authored in this repository by `tools/build_vehicle_model.py`.
**Licence:** same as this repository. No third-party geometry, textures or
scans are included.

### What it depicts

A generic mid-size electric crossover, dimensioned to a real package:

| Dimension  | Value    |
| ---------- | -------- |
| Length     | 4.751 m  |
| Width      | 1.921 m  |
| Height     | 1.624 m  |
| Wheelbase  | 2.890 m  |
| Wheel      | 19", 255/45 |

It is deliberately **not badged as any manufacturer's vehicle**, and the app's
fixtures describe it as an "Electric crossover" for the same reason — see the
limitation at the bottom of this file.

### How it is built

Not from primitive shapes. `tools/build_vehicle_model.py` holds a table of
longitudinal *stations*, each describing a cross-section of the body (rocker
height, roofline, half-width, beltline height, roof width). Each station is
splined into a closed ring, and consecutive rings are skinned into one
continuous lofted surface — the way a body-in-white is actually drawn. A
wheel-arch sweep lifts the lower flank around each axle, and the open ends of
the loft are capped into bumper surfaces.

That single surface is then **partitioned** into panels by region. Because every
panel is cut from one surface, a closed door lines up with the body exactly;
because each panel also gets an inner skin and a rim, an open door has thickness
rather than a paper edge; and because a deeper cabin shell sits inside the whole
passenger compartment, an open door or tailgate reveals an interior instead of a
hole.

### Articulation

Seven independently controllable parts, each its own node under a hinge node
placed at the real hinge line:

| Semantic part (app) | Node                     | Axis | Travel | Pivot (x, y, z)        |
| ------------------- | ------------------------ | ---- | ------ | ---------------------- |
| `driverDoor`        | `hinge_doorFrontLeft`    | Y    | +64°   | −0.905, 0.760, 0.955   |
| `passengerDoor`     | `hinge_doorFrontRight`   | Y    | −64°   | 0.905, 0.760, 0.955    |
| `rearLeftDoor`      | `hinge_doorRearLeft`     | Y    | +72°   | −0.900, 0.760, −0.100  |
| `rearRightDoor`     | `hinge_doorRearRight`    | Y    | −72°   | 0.900, 0.760, −0.100   |
| `rearTrunk`         | `hinge_liftgate`         | X    | +44°   | 0, 1.512, −1.520       |
| `frontTrunk`        | `hinge_frunkLid`         | X    | −52°   | 0, 1.062, 1.150        |
| `chargePort`        | `hinge_chargePortFlap`   | Y    | −105°  | −0.905, 0.905, −1.700  |

Front doors hinge at the A-pillar, rear doors at the B-pillar, the tailgate at
the roof's trailing edge, the bonnet at the cowl, and the charge flap on the
left rear quarter. `src/tests/vehicle-articulation.test.ts` asserts that the
app's mapping still agrees with the shipped asset on every axis and angle, so a
regenerated model that moved a hinge fails the suite rather than silently
rotating a door about the wrong axis.

### Light surfaces

Ten separately addressable emissive surfaces, conforming to the bodywork (they
are offset patches of the same loft, so a lens sits on the panel rather than
floating near it) and parented to whichever panel owns that stretch of body —
the tail lamps on the tailgate travel with it when it opens:

`headlightLeft`, `headlightRight`, `daytimeRunningBar`, `taillightLeft`,
`taillightRight`, `taillightBar`, `indicatorFrontLeft`, `indicatorFrontRight`,
`indicatorRearLeft`, `indicatorRearRight`.

Grouped for the app in `LIGHT_GROUPS`: headlights, daytime running, taillights,
indicators.

### Interior

Cabin shell, load floor, dashboard, centre screen, steering wheel (left-hand
drive) and four seats. Enough to make an open door and the cabin camera preset
read correctly; not a trimmed interior.

### Budget

| Metric    | Value      |
| --------- | ---------- |
| Triangles | 32,680     |
| Nodes     | 41         |
| Meshes    | 33         |
| Materials | 15         |
| File size | 2.10 MB    |
| Textures  | none — all materials are PBR factors |

No textures at all, which is why the file is small and why it costs no texture
memory on device. Loaded once per session and shared between every screen
(`src/components/vehicle-3d/model-loader.ts`): geometry is shared across clones,
and only the materials the app writes to — light lenses and body paint — are
cloned per instance.

### Regenerating and validating

```sh
python3 tools/build_vehicle_model.py          # writes the .glb and the mapping JSON
python3 tools/preview_model.py out.png --view threeQuarter
python3 tools/preview_model.py out.png --view rearQuarter --open liftgate=1
python3 tools/preview_model.py out.png --view threeQuarter --lights head,tail
```

`tools/preview_model.py` is a dependency-free software rasteriser (z-buffer,
two-light shading, PNG output). It loads the GLB, applies a named hinge pose and
renders it, so the asset can be inspected — proportions, hinge direction,
whether geometry behind an open door is solid — without a device or a browser.
The frames in `docs/evidence/` were produced with it.

Inspecting the asset this way caught four defects that would otherwise have
shipped: missing wheel arches, uncapped loft ends (you could see straight into
the body cavity from the front), inverted rotation on the doors, liftgate and
bonnet, and a fold in the surface where the arch sweep collapsed several ring
samples onto one height.

---

## Known limitation: no licensed articulated production vehicle

The brief asked for a **Tesla Model Y** GLB/glTF with independently controllable
parts. That asset was not obtainable, and this is reported rather than papered
over.

**What was checked**

- Khronos `glTF-Sample-Assets`: the closest candidate is `CarConcept`
  (CC-BY-4.0, professionally modelled, genuinely articulable — separate
  `BodyDoorL*`/`BodyDoorR*`, `BodyHood`, `BodyHeadlights`, `BodyTaillights`,
  `BodyTurnsignalsRear` and interior nodes). It was rejected because it is a
  **two-door concept car**: no rear doors, no tailgate, no charge-port flap, and
  it is not a Model Y. Shipping it under a Tesla label is exactly the
  substitution the brief prohibits.
- Sketchfab / CGTrader / Free3D Model Y listings: either paid, or licence-
  restricted, or single-mesh with no separable panels, or requiring an
  authenticated download. None could be verified as both permission-cleared and
  articulated.

**Exactly what is missing**

A permission-cleared Tesla Model Y (2025 "Juniper") glTF/GLB whose scene graph
exposes, as separate nodes: four doors, tailgate, bonnet, charge-port flap, and
distinct head/tail/indicator light meshes.

**What was done instead**

The vehicle was authored (above) so that every required articulation genuinely
exists and every interaction in the app is real. The consequence is that the
model is a **generic crossover, not a Model Y** — so the app no longer claims
otherwise. Fixtures, the pairing screen and the About screen all describe an
"Electric crossover", and the previously bundled Tesla photography has been
removed along with its attribution block.

**Swapping in a licensed Model Y later** is a two-file change: drop the GLB in as
`assets/vehicle/vehicle.glb`, and update the node names, axes, angles and pivots
in `src/components/vehicle-3d/articulation.ts` to match its scene graph. Nothing
else in the app refers to node names. Restore the vehicle's `model` string in
`src/infrastructure/mock-connected-cloud/fixtures.ts` at the same time.
