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

## Key assumptions & caveats

- LSOA GVA is allocated to Output Areas by population + business weighting; business counts allocated from MSOA by household share. Figures at street level are **estimates**.
- The value model assumes **no usable coverage exists today**. Where coverage exists, results are upper bounds.
- Productivity uplift default 0.7%/yr of covered GVA (literature range ~0.3–1.5%) and consumer value default £200/resident/yr — both adjustable via sliders.
- Footfall and card-spend data have no free open equivalents; business density and GVA act as proxies.

## Run it

Hosted on GitHub Pages (free), or locally with: `python3 -m http.server` in this folder, then open http://localhost:8000
