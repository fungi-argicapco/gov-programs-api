# Climate & ESG Data Licensing

This note tracks the reuse terms for the external datasets that feed the climate/ESG pipelines. Treat it as the canonical registry when onboarding new feeds or publishing derived products.

## Restricted or Legal-Review Sources

| Dataset | Licence / Terms | Automation Status | Required Actions |
| --- | --- | --- | --- |
| **FAO Land-Use Change & Forestry (via WRI Climate Watch)** | FAO retains redistribution rights; contact FAO before republishing. | Not automated. | Coordinate with legal and FAO before storing or exposing derived values. |
| **UNEP-WCMC World Database on Protected Areas (WDPA)** | WDPA licence forbids redistribution and commercial use; maps only. | Not automated. | Seek written permission; otherwise keep usage to manual map generation. |
| **World Bank Microdata** | Research licence; no redistribution, linking, or automation. | Not automated. | Submit formal request per project; do not connect to pipelines. |
| **IEA (Weather for Energy Tracker, Net Zero by 2050)** | CC BY-NC variants; no commercial derivatives. | Not automated. | Confirm licence upgrade or contract before ingestion. |
| **IUCN Red List** | CC BY-NC; summary terms forbid commercial redistribution. | Not automated. | Obtain IUCN permission prior to storing or exposing records. |
| **IPCC Interactive Atlas Figures** | Figures remain IPCC property; underlying data CC BY 4.0. | Figures not automated. | Use NetCDF/GeoTIFF data only; avoid scraping figures without approval. |
| **CDP Climate Disclosure (licenced/Open Data)** | Licence restricts use to non-profit/internal. | Not automated. | Review contract terms; ensure usage complies with CDP agreement. |
| **MSCI ESG Ratings** | Non-commercial, personal use only. | Not automated. | Requires commercial licence before any ingestion. |
| **Sustainalytics ESG Data** | Third-party data terms restrict reuse/storage. | Not automated. | Obtain formal licence before automation. |
| **UNFCCC GHG Inventory** | Licence unspecified. | Not automated. | Treat as restricted until explicit permission received. |
| **Systems Change Lab aggregated datasets** | Mixed licences per source dataset. | Not automated. | Review each constituent dataset’s licence before ingestion. |
| **Germanwatch Climate Risk Index (CRI)** | PDF reports; redistribution requires permission. | Pending. | Seek Germanwatch/IFHV approval and machine-readable extract before adding to pipeline. |
| **WorldRiskIndex (IFHV)** | Requires HDX login; CC BY but manual approval recommended. | Pending. | Obtain HDX access and legal sign-off prior to automation. |
| **INFORM Risk Index (Global/Subnational)** | CC BY but HDX login required. | Seeded via manual download. | Maintain credential workflow; ensure snapshots retain provenance and comply with CC BY attribution. |

## Generally Permissive Sources (Attribution Required)

| Dataset | Licence | Notes |
| --- | --- | --- |
| WRI Climate Watch (open indicators) | CC BY 4.0 | Cite WRI + underlying providers. |
| FAOSTAT | CC BY 4.0 | Attribution; avoid implying FAO endorsement. |
| Global Forest Watch (first-party outputs) | CC BY 4.0 | Check sub-dataset licences. |
| NASA / NOAA | Public domain / CC0 | Attribution encouraged. |
| World Bank Open Data (non-microdata) | CC BY 4.0 | Link to indicator source page. |
| Global Carbon Project | CC BY 4.0 | Provide credit line. |
| EDGAR | CC BY 4.0 | Provide credit line. |
| IEA Methane Tracker | CC BY 4.0 | Attribution required. |
| ECMWF ERA5 | CC BY 4.0 | Attribute ECMWF/Copernicus; propagate licence. |
| EIA | Public domain | Cite EIA where practical. |
| Our World In Data | CC BY 4.0 | Honour third-party licences they aggregate. |
| IPCC CMIP6 (CEDA) | CC BY 4.0 | Attribute IPCC + modelling centre. |

## Operating Procedures

1. **Check the licence matrix before automation:** The machine-readable registry lives at `data/dataset_license_matrix.csv`. Update it whenever a new dataset is added or licences change.
2. **Capture evidence of permissions:** Store copies of licence agreements, emails, or approvals in the internal legal vault and reference them in this document.
3. **Enforce attribution in code:** Pipelines and API responses must embed source citations for every permissive dataset.
4. **Escalate ambiguous cases:** If a licence is unclear or uses bespoke terms, pause implementation and route to legal/compliance.
5. **Document manual steps:** For datasets that require login or manual downloads (e.g., HDX, Yale EPI, UNEP), record the procedure in `docs/INGESTION.md` once approved so operators follow a consistent process.

_Last updated: 2025-10-02_
