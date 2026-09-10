# Assets

## The vehicle model

**File:** `assets/vehicle/vehicle.glb`
**Mapping:** `assets/vehicle/vehicle.articulation.json` (generated) →
`src/components/vehicle-3d/articulation.ts` (consumed by the app)
**Source:** authored in this repository by `tools/build_vehicle_model.py`.
**Licence:** same as this repository. No third-party geometry, textures or
scans are included.

### What it depicts

A full-size three-row electric SUV, styled after the **Rivian R1S** and
dimensioned to that package:

| Dimension  | Value    |
| ---------- | -------- |
| Length     | 5.100 m  |
| Width      | 2.015 m  |
| Height     | 1.820 m  |
| Wheelbase  | 3.076 m  |
| Wheel      | 22", 275/50 |

The styling cues carried across are the ones that identify the vehicle at a
glance: upright and slab-sided, a long flat roof over three rows, short
overhangs, high ground clearance, squared-off wheel arches, a near-vertical
tailgate, and the signature lighting — a full-width bar across the nose with
tall vertical lamps outboard of it, repeated at the rear.

The geometry is **authored here from a styling reference**, not copied from any
manufacturer's data, and the app does **not badge the vehicle**: fixtures
describe it as an "Electric crossover". Calling generic geometry a Rivian R1S
would be the same misrepresentation the brief prohibits — see the limitation at
the bottom of this file.

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
| `driverDoor`        | `hinge_doorFrontLeft`    | Y    | +66°   | −0.955, 0.900, 0.945   |
| `passengerDoor`     | `hinge_doorFrontRight`   | Y    | −66°   | 0.955, 0.900, 0.945    |
| `rearLeftDoor`      | `hinge_doorRearLeft`     | Y    | +74°   | −0.950, 0.900, −0.205  |
| `rearRightDoor`     | `hinge_doorRearRight`    | Y    | −74°   | 0.950, 0.900, −0.205   |
| `rearTrunk`         | `hinge_liftgate`         | X    | +68°   | 0, 1.802, −2.055       |
| `frontTrunk`        | `hinge_frunkLid`         | X    | −50°   | 0, 1.432, 1.090        |
| `chargePort`        | `hinge_chargePortFlap`   | Y    | +100°  | −1.000, 1.190, 1.790   |

Front doors hinge at the A-pillar, rear doors at the B-pillar, the tailgate at
the roof's trailing edge, the bonnet at the cowl, and the charge flap on the
driver's-side **front wing** — where this vehicle carries it, rather than on the
rear quarter. `src/tests/vehicle-articulation.test.ts` asserts that the
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
| Triangles | 28,986     |
| Nodes     | 39         |
| Meshes    | 31         |
| Materials | 15         |
| File size | 1.72 MB    |
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

## Dropping in a licensed Rivian R1S

The app is built to take a real asset. The authored model above is the default
so the app works today; replacing it is a two-file change.

### 1. Get a model that is actually articulated

A single-mesh body **cannot** be animated. Before buying, confirm the scene
graph exposes four doors, the tailgate, the bonnet and the charge flap as
separate nodes. Sources checked: Sketchfab (~$20 royalty-free), CGTrader and
3DModels.org all list an R1S in glTF/GLB, but none could be verified as
articulated without purchasing.

### 2. Inspect it

```sh
python3 tools/inspect_model.py path/to/rivian-r1s.glb
python3 tools/inspect_model.py path/to/rivian-r1s.glb --verbose   # full node list
```

This reports size, triangle count, bounds and scale, then matches node names
against each semantic part and prints a **paste-ready `HINGES` block**. Anything
it marks `MISS` either is not separated in the asset or is named unusually —
find it in the `--verbose` list and set the name by hand.

### 3. Wire it in

1. Save it as `assets/vehicle/vehicle.glb`.
2. Paste the generated `HINGES` block into
   `src/components/vehicle-3d/articulation.ts`.
3. Check each door's node origin in the inspector output. If a door's node sits
   at `(0, 0, 0)` rather than out at its pillar, rotating it would swing the
   door around the middle of the car — set `pivotMode: 'wrap'` on that part and
   give the real hinge position in `pivot`. The loader then re-parents the node
   under a group at that point.
4. Update `LIGHT_GROUPS` with the asset's light mesh names.
5. Restore the vehicle's `model` string in
   `src/infrastructure/mock-connected-cloud/fixtures.ts` — with a licensed
   asset, naming it is accurate rather than a misrepresentation.

Scale, position and facing are handled automatically: the loader normalises any
asset into canonical space (5.1 m long, centred on X/Z, sitting on Y = 0, facing
+Z), so the camera presets and hotspot anchors keep working. Orientation is the
one exception — if the car arrives upside down or rolled, rotate the root.

### 4. Verify before running the app

```sh
python3 tools/preview_model.py /tmp/a.png --view threeQuarter --open doorFrontRight=1
python3 tools/preview_model.py /tmp/b.png --view rearQuarter --open liftgate=1
npx jest src/tests/vehicle-articulation.test.ts
```

The test asserts the app's mapping still agrees with the shipped asset on every
axis and angle, so a wrong sign fails the suite rather than silently rotating a
door the wrong way. Then `npm run smoke:web` drives the real app.

---

## Known limitation: no licensed articulated production vehicle

No permission-cleared, articulated GLB of a specific production vehicle could be
obtained — first a Tesla Model Y, then a Rivian R1S. This is reported rather
than papered over.

**What was checked**

- Khronos `glTF-Sample-Assets`: the closest candidate is `CarConcept`
  (CC-BY-4.0, professionally modelled, genuinely articulable — separate
  `BodyDoorL*`/`BodyDoorR*`, `BodyHood`, `BodyHeadlights`, `BodyTaillights`,
  `BodyTurnsignalsRear` and interior nodes). It was rejected because it is a
  **two-door concept car**: no rear doors, no tailgate, no charge-port flap, and
  it is not a Model Y. Shipping it under a Tesla label is exactly the
  substitution the brief prohibits.
- Sketchfab / CGTrader / Free3D listings for both the Model Y and the R1S:
  either paid, or licence-restricted, or single-mesh with no separable panels,
  or requiring an authenticated download. None could be verified as both
  permission-cleared and articulated without buying first.
- Photographs were considered and rejected as the primary vehicle: a photograph
  cannot open a door, light a lamp, or hold a camera preset, and the brief
  explicitly ruled out "a stock photograph with moving labels" and "a flat image
  rotated to imitate 3D".

**Exactly what is missing**

A permission-cleared **Rivian R1S** glTF/GLB whose scene graph exposes, as
separate nodes: four doors, tailgate, bonnet, charge-port flap, and distinct
head/tail/indicator light meshes. See "Dropping in a licensed Rivian R1S" above
for exactly what to do once one is available.

**What was done instead**

The vehicle was authored (above) so that every required articulation genuinely
exists and every interaction in the app is real, and then restyled to the R1S
idiom. Fixtures, the pairing screen and the About screen all describe an
"Electric crossover", and the previously bundled Tesla photography has been
removed along with its attribution block.

The consequence is that the model is a **styling reference, not a Rivian**, and
the app does not claim otherwise.
