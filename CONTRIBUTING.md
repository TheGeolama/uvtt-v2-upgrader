# 🤝 Contributing to the Universal VTT v2 (UVTT v2) Specification

Thank you for your interest in contributing to the **UVTT v2 Specification**! 

The UVTT v2 format is an open, community-driven standard designed to move the Virtual Tabletop (VTT) industry beyond the "flat earth" limitations of legacy schemas [150, 1846, 225, 233]. By introducing native multi-floor verticality, hardware-accelerated rendering profiles, and highly optimized topological campaign linking, we are building a standard that scales with modern GPU technology [150, 151, 1871, 234].

To maintain the architectural integrity of the specification while allowing it to thrive as a living standard, we enforce a structured process for all updates, additions, and modifications [150, 151].

---

## 🏛️ Governance Standards

The UVTT v2 specification is treated as a **collaborative consensus-based standard**. Our governance model ensures that no single entity or application can lock down or fragment the format [151, 264].

1. **The Specification Council:** A rotating committee of open-source VTT developers, digital artists, and map-making tool authors who oversee major version changes.
2. **Consensus-First Design:** Core schemas are frozen at major releases (e.g., `v2.0.0`) [224]. Any additions must undergo public review and achieve consensus regarding cross-platform feasibility, performance impact, and mathematical safety [151, 236].
3. **Immutability of Released Specs:** Once a schema version is formally published, its existing required properties are **strictly immutable** to prevent breaking downstream applications [151, 237].

---

## 🚀 The RFC (Request for Comments) Pipeline

All new feature proposals (e.g., normal mapping, dynamic water shader parameters, or spatial audio occlusion curves) must proceed through our formal **RFC Pipeline** [151, 236].

```
[ Idea / Issue ] ──► [ Draft RFC File ] ──► [ Community PR Review ] ──► [ Schema & Test Suite Merge ]
```

### Stage 0: Proposal & Discussion
Before writing any code or schemas, open a **Feature Proposal** issue using the template in `.github/ISSUE_TEMPLATE/` to discuss the use case with the community [150, 236]. Focus on:
* **The "Why":** What pain point does this solve?
* **Performance Impact:** How will this affect low-end or browser-based WebGL/WebGPU rendering pipelines? [150, 151, 226]

### Stage 1: Drafting the RFC
If the proposal receives initial support, submit a Pull Request adding a markdown document under the `/RFCs` directory (e.g., `/RFCs/rfc-002-your-feature.md`) [150, 151]. The RFC must follow the official template and include:
1. **Abstract:** High-level summary of the extension.
2. **Motivation:** Use cases and developer advantages [47].
3. **JSON Schema Additions:** Exact additions to `manifest.json`, `geometry.json`, or `entities.json` [148, 149, 150].
4. **Mathematical/Physics Models:** Any formal formulas required for consistent cross-engine implementation (e.g., weather vector blending or acoustic linear falloff) [113, 285, 286].
5. **Degradation Pathways:** Clear instructions on how older engines should handle the data [152, 156, 162].

### Stage 2: Community Review
The PR will remain open for at least **14 days** to allow developers from various VTT platforms and mapmaking tools to weigh in [151, 236]. We evaluate contributions against three core criteria:
* **Interoperability:** Can the feature be parsed easily in multiple languages (Go, TypeScript, Python, etc.)? [150, 254]
* **Backward Compatibility:** Does this violate our Backward-Compatibility Contract? [151, 236]
* **Draft Completeness:** Speculative features without concrete schemas are rejected.

### Stage 3: Schema Integration & Release
Upon approval, the RFC is merged, and the core schemas under `/schemas` are updated [150, 151]. Reference parsers and conformance suites must be updated to match before the version tag is bumped [150, 151].

---

## 🔒 The Backward-Compatibility Contract

We enforce a **strict, non-negotiable contract** to ensure creators never suffer from technical obsolescence or version anxiety [151, 152, 156]:

1. **Immutable Core Topology:** Standard vector geometry (walls, portals, paths) and foundational entity boundaries must never change their core required structures [151, 237].
2. **Additive-Only Extensibility:** New features must be additive and optional [151, 237]. They should reside inside the global `extensions` block in `manifest.json` or as custom properties inside standard entities [151].
3. **The Hardware Profile Rule:** Any map utilizing advanced features must declare its minimum rendering pipeline requirements in the `hardware_profile` block [151, 226]. Older engines must be allowed to safely ignore properties they do not support [151].
4. **Bi-Directional Migration Compatibility:** To prevent format fragmentation, any tools implementing the specification should support the **In-Memory Normalized Model (IMNM)** architecture [152, 221]:
   * **Bézier Flattening:** SVG Bezier curves must automatically subdivide into straight-line approximations when exporting to legacy V1 engines [156, 163].
   * **Property Pruning:** Non-standard or advanced V2 parameters must be cleanly pruned when compiling backward [156].
   * **Migration Fallbacks:** Downgraded files should embed the `__uvtt_migration_fallback` metadata header to track pruned history [156, 162].

---

## 🧪 Schema Validation & Conformance Criteria

To claim **"UVTT v2 Compliance"**, a parser, web app, or host engine must pass our **Conformance Suite** [151]. Schema validation is handled programmatically via the JSON Schema files located in `/schemas` [150].

Below are the key structural and topological rules that your code must enforce during schema validation [143, 170, 200, 225]:

### 1. Global Topology Validation (`manifest.json`)
* **Landing Zone Uniqueness:** A campaign map manifest is permitted to have **exactly one** landing zone marked as `is_default: true` [143, 296]. If multiple default zones are present, validation must fail with a `Topology Error` [143]. If zero default zones are defined, the camera falls back to the coordinate origin `[0.0, 0.0]` [143].
* **Topology Declarations:** The `resolution.topology` block must strictly define the grid style (`square`, `hex`, or `isometric`) [200, 226]. For `hex`, the `orientation` (`flat_top` or `pointy_top`) is required [200, 226]. For `isometric`, the `isometric_ratio` must be a valid float [200, 226].

### 2. Geometry Validation (`geometry.json`)
* **Vector Path Commands:** Path strings must strictly utilize standardized SVG vector formatting (commands like `move`, `line`, and `bezier` tracking `cp1`, `cp2`, and endpoint nodes) [113, 227].
* **Midpoint Orientation (Right-Hand Rule):** One-way blocking lines (e.g., one-way walls or illusory ledges) must define their orientation based on vector direction [18, 54, 227]. The "right" side of the wall is mathematically locked as the normal vector rotated 90 degrees clockwise from the path trajectory [18, 227].
* **Vertex Snapping Minimums:** Intersecting wall corners drawn within a tolerance of `0.05` map units must be snapped to identical coordinates during ingestion to guarantee sealed, light-leak-proof CAD environments [21, 23, 113].

### 3. Interactive Entities Validation (`entities.json`)
* **URI Formatting (Topological Networks):** All inter-map and intra-map transitions must use standardized URIs [172]:
  * **Compound Mode (Internal):** Must utilize `internal://{sub_map_slug}` to target layers bundled within the same `.uvtt2z` zip package [171, 172, 178].
  * **Federated Mode (Relative):** Must utilize `relative://{sibling_file}.uvtt2z#{landing_zone_id}` to point to standalone peer archives [169, 172, 178]. Absolute disk paths (e.g., `D:/Maps/...`) are **strictly prohibited** to prevent broken links on other systems [170].
* **Dangling Link Resolution:** The validator sweeps all teleport portals. If a portal references an internal sub-map that does not exist in the root manifest, or a federated relative map missing from the batch index, the compiler must throw a warning [170].
* **Physical Particle Constraints:** Weather emitters must declare their `bounds` (`polygon` or `circle`), a valid vertical Z-axis clamping range (`height.bottom` and `height.top`), and a recognized `collision_mode` enum [298, 301]:
  * Accepted values: `none`, `mask_under_overhead`, `ground_terminate`, `wall_bounce` [299].

---

## 🛠️ Code Contribution Guidelines

When contributing reference code (e.g., writing implementations in `/reference-parsers/` or expanding the Python Conformance Suite) [150]:

1. **No Patches:** Ensure all code additions are submitted as **full, complete, self-contained files** [289]. We do not accept raw diffs or partial code blocks that are difficult to verify [289, 290].
2. **Comment Rigorously:** Explain the geometric and spatial math in detail [97]. Any developer reading our reference parser should instantly understand how SVG curve-fitting or inverse-square decay works [65, 113].
3. **Tests Required:** Any PR altering schema validation or reference parsers must include corresponding test cases inside our master python/go test suites [252].

---

## 💬 Getting Help

If you run into issues or want to bounce an idea off the core team:
* Join the discussion in the **[GitHub Discussions]** space.
* Reach out to the core maintainers via the issue tracker [150, 237].

*Let's build an indestructible bridge that carries campaign cartography cleanly into the future!* [156]
