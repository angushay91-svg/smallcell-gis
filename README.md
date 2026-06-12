# Small Cell Value Mapper — England & Wales

A free, open-data GIS web app. Click anywhere on a map of England & Wales and it estimates, for a configurable coverage circle (default 200m, like an outdoor small cell):

- Residents, household premises and business units covered
- Annual economic activity (GVA, 2023 current prices) inside the circle
- Deprivation decile of the covered population (IMD 2019 / WIMD 2019)
- Estimated annual value of bringing new mobile coverage to the area, plus a 10-year Green Book (3.5% discount) value
- Save, compare and export candidate sites to CSV

## How it works

The `data/` folder holds a pre-processed national dataset: all 188,880 Census 2021 Output Areas in England & Wales, each with population, households, allocated GVA, deprivation decile and estimated business count, split into 117 geographic tiles. The app (one HTML file, no server, no build tools) loads only the tiles near your pin.

## Data sources (all free and open, Open Government Licence)

| Layer | Source |
|---|---|
| Population & households | ONS Census 2021, TS001 & TS041 (Nomis bulk) |
| Output Area centroids & lookups | ONS Open Geography Portal |
| Economic activity | ONS UK small area GVA estimates 1998–2023 (LSOA level) |
| Deprivation | MHCLG English Indices of Deprivation 2019; Welsh Government WIMD 2019 |
| Businesses | ONS UK Business Counts (local units, MSOA) via Nomis API |
| Addressable premises | ONS National Statistics UPRN Lookup (Dec 2025) — 37.5m UPRNs counted per Output Area |
| Transport | DfT NaPTAN — 355k active bus stops, rail/tram access points and ferry terminals (exact locations) |
| Elevation (England) | Environment Agency LiDAR Composite DSM 1m (includes buildings/trees), fetched live via WCS at click time |
| Elevation (Wales/gaps) | AWS Terrain Tiles (~30m, ground only) fallback |
| Mast context | OpenStreetMap communication masts via Overpass API (ODbL) |

## Terrain line-of-sight mode

With LiDAR mode on, the app fetches a 1m elevation grid around your pin, places the antenna at a chosen height above the surface, casts rays out to the max radius and paints the true line-of-sight footprint — shadows behind buildings, trees and hills excluded. All economics are weighted by the footprint, not the circle. This is a viewshed (standard first-cut for small-cell siting), not full RF ray tracing: no reflections/diffraction modelled.

## Key assumptions & caveats

- LSOA GVA is allocated to Output Areas by population + business weighting; business counts allocated from MSOA by household share. Figures at street level are **estimates**.
- The value model assumes **no usable coverage exists today**. Where coverage exists, results are upper bounds.
- Productivity uplift default 0.7%/yr of covered GVA (literature range ~0.3–1.5%) and consumer value default £200/resident/yr — both adjustable via sliders.
- Footfall and card-spend data have no free open equivalents; business density and GVA act as proxies.

## Run it

Hosted on GitHub Pages (free), or locally with: `python3 -m http.server` in this folder, then open http://localhost:8000
