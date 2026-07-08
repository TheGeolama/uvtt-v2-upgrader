# Universal VTT v2 (UVTT v2) Open-Source Specification

Welcome to the Universal VTT v2 (UVTT v2) specification architecture document. Designed for independent Virtual Tabletop (VTT) developers, map authoring tool engineers, and community modders, this specification addresses the legacy technical bottlenecks of the original v1 standard to unlock modern, high-performance rendering pipelines.

## The Problem: Legacy v1 Bottlenecks

The original v1 standard (`.dd2vtt` / `.df2vtt`) pioneered portable map data, but its foundational architecture presents severe limitations for modern WebGL and desktop engines:

* **Data Payload Bloat:** The v1 standard forces map makers to embed multi-megabyte images via Base64 strings directly inside a single JSON file. This bloats the payload by roughly 33% and forces the client's CPU to execute expensive string-parsing operations.

* **The Flat Earth Assumption:** The v1 specification assumes a completely flat, infinite 2D plane.

* **All-or-Nothing Geometry:** Legacy walls are absolute barriers. There is no native handling for one-way mirrors, transparent terrain, or height-restricted obstacles.

* **Performance Blockages:** To simulate a curved room, v1 forces map makers to plot dozens of tiny, straight line segments. This drastically slows down VTT canvas rendering.

* **The Interaction Gap:** The v1 standard lacks a native concept of mechanical mechanics, traps, or routing.


## The Solution: The UVTT v2 Paradigm

The UVTT v2 specification is a complete architectural overhaul designed for hardware-accelerated engines (PixiJS, WebGL, Unity, etc.).

* **Binary Archive Container:** Transitioning to a ZIP archive as the native file format (`.uvtt2` or `.gvtt`) is a massive leap forward for asset management. Modern formats like `.epub` are essentially just zipped directories under the hood.

* **Verticality & 3D Spatial Awareness:** Every physical element now includes a height object containing bottom and top float properties. This applies to walls, overhead roof layers, and 3D positioning for lights.

* **Directional Line of Sight (LOS):** The standard utilizes left/right normal vectors relative to the direction a wall segment is drawn. Defining a wall from point A to B locks the mathematical half-spaces. The left side is mathematically defined as $\vec{n}_{left} = (y_1 - y_2, x_2 - x_1)$. The right side is defined as $\vec{n}_{right} = (y_2 - y_1, x_1 - x_2)$.

* **Native Bézier Curves:** The standard adopts W3C SVG vector logic. It supports move, line, and bezier coordinate plotting.

* **Spatial Event Routing:** Interactive spatial listeners are standardized for proximity triggers. This framework handles multi-level elevation changes and true portals.


---

## Directory Archive Tree Layout

To best serve both map-making tools and ingest pipelines, the internal directory prioritizes streamability. A VTT server should be able to read the metadata without loading an 8K image into RAM.

```text
campaign_dungeon.uvtt2/
├── manifest.json
├── map.json
├── preview.webp
└── assets/
    ├── base_map.webp
    ├── roof_layer.webp
    └── sfx_trap_click.ogg

```

### Architectural Benefits

* **`manifest.json`:** Acts as the single source of truth for file metadata, versioning, and internal asset routing maps.

* **`map.json`:** A clean, text-only data payload containing all geometry, flattened arrays, lighting nodes, and events.
 
* **`preview.webp`:** A highly compressed, low-resolution thumbnail placed at the root level. When a Gamemaster opens their map library, the client only fetches this tiny thumbnail.

* **`assets/`:** A dedicated directory that bundles raw binary files and keeps the data cleanly separated from the JSON.

* **Streamable Parsing:** JavaScript's zip.js library allowd backend APIs to read the central directory without loading the entire archive into memory. An API can extract the JSON to chunk bounding boxes while parallelizing the extraction of high-resolution WebP files.

* **WebGL Culling:** Consistent clockwise winding ensures closed geometric shapes can leverage hardware-accelerated backface culling to skip drawing hidden sides.



---

## Production-Ready `map.json` Schema Instance

The following payload represents a fully validated UVTT v2 `map.json` mapping an advanced dungeon section. This includes resolution topology, material-aware terrain, directional illusions, Bezier vector curves, Z-axis illumination, and relative-offset teleportation events.

```json
{
  "format_version": "2.0.0",
  "resolution": {
    "map_origin": {"x": 0.0, "y": 0.0},
    "grid_size": {"x": 70.0, "y": 70.0},
    "units_per_grid": 5.0,
    "unit_name": "ft",
    "topology": {
      "type": "square",
      "orientation": "flat_top",
      "offset": "none",
      "isometric_ratio": null
    }
  },
  "geometry": {
    "walls": [
      {
        "id": "wall_stone_linear_01",
        "type": "standard",
        "height": {"bottom": 0.0, "top": 20.0},
        "directional_blocks": {
          "left_to_right": ["light", "sight", "movement"],
          "right_to_left": ["light", "sight", "movement"]
        },
        "path": [
          {"type": "move", "x": 5.0, "y": 5.0},
          {"type": "line", "x": 25.0, "y": 5.0}
        ],
        "states": {
          "ethereal": false,
          "disbelieved_by": []
        }
      },
      {
        "id": "wall_tree_canopy_01",
        "type": "terrain",
        "height": {"bottom": 10.0, "top": 30.0},
        "directional_blocks": {
          "left_to_right": ["sight"],
          "right_to_left": ["sight"]
        },
        "path": [
          {"type": "move", "x": 8.0, "y": 12.0},
          {"type": "line", "x": 12.0, "y": 16.0}
        ],
        "states": {
          "ethereal": false,
          "disbelieved_by": []
        }
      },
      {
        "id": "wall_illusory_mirror_01",
        "type": "illusory",
        "height": {"bottom": 0.0, "top": 10.0},
        "directional_blocks": {
          "left_to_right": ["light", "sight", "movement"],
          "right_to_left": ["movement"]
        },
        "path": [
          {"type": "move", "x": 25.0, "y": 5.0},
          {"type": "line", "x": 25.0, "y": 15.0}
        ],
        "states": {
          "ethereal": false,
          "disbelieved_by": ["char_id_rogue_01"]
        }
      },
      {
        "id": "room_circular_apse_01",
        "type": "standard",
        "height": {"bottom": 0.0, "top": 20.0},
        "directional_blocks": {
          "left_to_right": ["light", "sight", "movement"],
          "right_to_left": ["light", "sight", "movement"]
        },
        "path": [
          {"type": "move", "x": 25.0, "y": 15.0},
          {
            "type": "bezier",
            "cp1": {"x": 30.0, "y": 15.0},
            "cp2": {"x": 35.0, "y": 20.0},
            "to": {"x": 35.0, "y": 25.0}
          }
        ],
        "states": {
          "ethereal": false,
          "disbelieved_by": []
        }
      }
    ],
    "portals": [
      {
        "id": "door_secret_bookshelf_01",
        "type": "door",
        "sub_type": "secret",
        "state": "closed",
        "height": {"bottom": 0.0, "top": 8.0},
        "directional_blocks": {
          "left_to_right": ["light", "sight", "movement"],
          "right_to_left": ["light", "sight", "movement"]
        },
        "line": {
          "p1": {"x": 10.0, "y": 5.0},
          "p2": {"x": 13.0, "y": 5.0}
        }
      }
    ]
  },
  "lights": [
    {
      "id": "light_sconce_magical_01",
      "type": "directional",
      "position": {"x": 25.0, "y": 10.0, "z": 6.5},
      "radius": {
        "bright": 30.0,
        "dim": 60.0
      },
      "cone": {
        "rotation": 180.0,
        "arc": 60.0
      },
      "color": "#4a90e2",
      "intensity": 0.85,
      "decay": "inverse_square",
      "animation": {
        "type": "pulse",
        "speed": 2.0,
        "intensity_variance": 0.15
      }
    }
  ],
  "events": [
    {
      "id": "trap_poison_dart_01",
      "trigger": {
        "type": "on_enter",
        "region": [
          {"x": 12.0, "y": 8.0},
          {"x": 14.0, "y": 8.0},
          {"x": 14.0, "y": 10.0},
          {"x": 12.0, "y": 10.0}
        ],
        "conditions": ["is_player_token"]
      },
      "actions": [
        {
          "target_id": "door_secret_bookshelf_01",
          "property": "state",
          "value": "locked"
        }
      ]
    },
    {
      "id": "stairs_spiral_down_01",
      "type": "teleport",
      "trigger_bounds": {
        "shape": "circle",
        "center": {"x": 35.0, "y": 25.0},
        "radius": 2.0
      },
      "conditions": {
        "requires_interaction": true,
        "interaction_key": "use_stairs",
        "allowed_modes": ["walking"]
      },
      "destination": {
        "type": "intra_map",
        "landing_mode": "relative_offset",
        "target_coordinates": {"x": 35.0, "y": 25.0, "z": -15.0},
        "offset": {"dx": 0.0, "dy": 2.0, "dz": -15.0},
        "target_rotation": 180.0,
        "fade_transition": "crossfade_black"
      }
    }
  ]
}

```
