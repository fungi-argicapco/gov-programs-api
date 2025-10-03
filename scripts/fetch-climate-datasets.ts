#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';

const USER_AGENT = 'gov-programs-api/1.0 (+https://github.com/fungi-argicapco/gov-programs-api)';

const OUTPUT_DIR = process.env.CLIMATE_OUTPUT_DIR
  ? path.resolve(process.cwd(), process.env.CLIMATE_OUTPUT_DIR)
  : path.join(process.cwd(), 'data', 'climate_esg', 'cache');

const ND_GAIN_SOURCE = process.env.ND_GAIN_SOURCE ||
  'https://gain.nd.edu/assets/gain/files/resources-2025-20-05-11h12.zip';
const AQUEDUCT_SOURCE = process.env.AQUEDUCT_SOURCE ||
  'https://files.wri.org/aqueduct/aqueduct-4-0-country-rankings.zip';
const INFORM_GLOBAL_SOURCE = process.env.INFORM_GLOBAL_SOURCE ||
  path.join(process.cwd(), 'data', 'climate_esg', 'raw', 'inform', 'inform_global.csv');
const INFORM_SUBNATIONAL_SOURCE = process.env.INFORM_SUBNATIONAL_SOURCE ||
  path.join(process.cwd(), 'data', 'climate_esg', 'raw', 'inform', 'inform_subnational.csv');
const EPI_SOURCE = process.env.EPI_SOURCE ||
  path.join(process.cwd(), 'data', 'climate_esg', 'raw', 'epi', 'epi_scores.csv');
const UNEP_SOURCE = process.env.UNEP_SOURCE ||
  path.join(process.cwd(), 'data', 'climate_esg', 'raw', 'unep', 'unep_surface_water.csv');

function sha256Hex(value: string | Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(value);
  return hash.digest('hex');
}

async function fetchSource(source: string): Promise<Uint8Array> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const headers: Record<string, string> = { 'user-agent': USER_AGENT };
    const response = await fetch(source, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download ${source}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return new Uint8Array(await readFile(source));
}

async function loadNdGain() {
  console.log('Fetching ND-GAIN from', ND_GAIN_SOURCE);
  let archive: Uint8Array;
  try {
    archive = await fetchSource(ND_GAIN_SOURCE);
  } catch (error) {
    console.warn('ND-GAIN download failed. Provide ND_GAIN_SOURCE pointing to the ZIP archive.', error);
    return null;
  }
  try {
    const entries = unzipSync(archive);
    const names = Object.keys(entries);
    const find = (pattern: RegExp) => names.find((name) => pattern.test(name.toLowerCase()));
    const indexEntry = entries[find(/index/) || '']?.toString?.();
    const vulnerabilityEntry = entries[find(/vulner/) || '']?.toString?.();
    const readinessEntry = entries[find(/readiness/) || '']?.toString?.();
    if (!indexEntry || !vulnerabilityEntry || !readinessEntry) {
      throw new Error('Could not locate ND-GAIN CSV files in archive');
    }
    const indexRows = parse(indexEntry, { columns: true, skip_empty_lines: true, trim: true });
    const vulnerabilityRows = parse(vulnerabilityEntry, { columns: true, skip_empty_lines: true, trim: true });
    const readinessRows = parse(readinessEntry, { columns: true, skip_empty_lines: true, trim: true });
    const byKey = new Map<string, any>();
    const ensure = (iso3: string, year: string | number) => {
      const key = `${iso3}-${year}`;
      if (!byKey.has(key)) {
        byKey.set(key, { iso3, year: year ? Number(year) : null, index: null, vulnerability: null, readiness: null });
      }
      return byKey.get(key);
    };
    indexRows.forEach((row: any) => {
      const entry = ensure(row.iso3 || row.ISO3, row.year || row.Year);
      entry.index = row.index ? Number(row.index) : Number(row.Index ?? row.Score ?? null);
    });
    vulnerabilityRows.forEach((row: any) => {
      const entry = ensure(row.iso3 || row.ISO3, row.year || row.Year);
      entry.vulnerability = row.vulnerability ? Number(row.vulnerability) : Number(row.Score ?? null);
    });
    readinessRows.forEach((row: any) => {
      const entry = ensure(row.iso3 || row.ISO3, row.year || row.Year);
      entry.readiness = row.readiness ? Number(row.readiness) : Number(row.Score ?? null);
    });
    const metrics = Array.from(byKey.values());
    const output = {
      version: new Date().toISOString().slice(0, 10),
      metrics
    };
    return output;
  } catch (error) {
    console.warn('Failed to parse ND-GAIN archive. Please ensure the ZIP structure matches expectations.', error);
    return null;
  }
}

async function loadAqueduct() {
  console.log('Fetching Aqueduct rankings from', AQUEDUCT_SOURCE);
  let archive: Uint8Array;
  try {
    archive = await fetchSource(AQUEDUCT_SOURCE);
  } catch (error) {
    console.warn('Aqueduct download failed. Provide AQUEDUCT_SOURCE pointing to the ZIP archive.', error);
    return null;
  }
  try {
    const entries = unzipSync(archive);
    const names = Object.keys(entries);
    const workbookName = names.find((name) => name.toLowerCase().endsWith('.xlsx'));
    if (!workbookName) throw new Error('Aqueduct archive missing XLSX workbook');
    const workbook = XLSX.read(entries[workbookName], { type: 'buffer' });
    const countrySheet = XLSX.utils.sheet_to_json(workbook.Sheets['country_baseline'], { defval: null });
    const provinceSheet = XLSX.utils.sheet_to_json(workbook.Sheets['province_baseline'], { defval: null });

    const mapIndicator = (indicator: string | null) => {
      if (!indicator) return null;
      if (indicator === 'bws') return 'baseline_water_stress';
      return indicator;
    };

    const countryMetrics = countrySheet
      .filter((row: any) => mapIndicator(row.indicator_name))
      .map((row: any) => ({
        iso3: row.gid_0,
        indicator: mapIndicator(row.indicator_name),
        value: row.score != null ? Number(row.score) : null
      }));

    const provinceMetrics = provinceSheet
      .filter((row: any) => mapIndicator(row.indicator_name))
      .map((row: any) => ({
        countryIso3: row.gid_0,
        provinceCode: row.gid_1,
        provinceName: row.name_1,
        indicator: mapIndicator(row.indicator_name),
        value: row.score != null ? Number(row.score) : null
      }));

    return { country: countryMetrics, province: provinceMetrics };
  } catch (error) {
    console.warn('Failed to parse Aqueduct workbook.', error);
    return null;
  }
}

async function loadCsvMetrics(source: string, mapFn: (row: any) => any) {
  const data = await fetchSource(source);
  const csv = new TextDecoder().decode(data);
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map(mapFn);
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const ndGain = await loadNdGain();
  if (ndGain) {
    const file = path.join(OUTPUT_DIR, 'nd_gain.json');
    writeFileSync(file, JSON.stringify(ndGain, null, 2));
    console.log('Wrote', file, 'hash=', sha256Hex(JSON.stringify(ndGain.metrics)));
  }

  const aqueduct = await loadAqueduct();
  if (aqueduct) {
    const countryFile = path.join(OUTPUT_DIR, 'aqueduct_country.json');
    const provinceFile = path.join(OUTPUT_DIR, 'aqueduct_province.json');
    writeFileSync(countryFile, JSON.stringify({ metrics: aqueduct.country }, null, 2));
    writeFileSync(provinceFile, JSON.stringify({ metrics: aqueduct.province }, null, 2));
    console.log('Wrote', countryFile, 'hash=', sha256Hex(JSON.stringify(aqueduct.country)));
    console.log('Wrote', provinceFile, 'hash=', sha256Hex(JSON.stringify(aqueduct.province)));
  }

  const informGlobal = await loadCsvMetrics(INFORM_GLOBAL_SOURCE, (row) => ({
    iso3: row.iso3,
    year: row.year ? Number(row.year) : null,
    riskScore: row.risk_score != null ? Number(row.risk_score) : null,
    hazardExposure: row.hazard_exposure != null ? Number(row.hazard_exposure) : null,
    vulnerability: row.vulnerability != null ? Number(row.vulnerability) : null,
    copingCapacity: row.coping_capacity != null ? Number(row.coping_capacity) : null
  }));
  writeFileSync(path.join(OUTPUT_DIR, 'inform_global.json'), JSON.stringify({ metrics: informGlobal }, null, 2));

  const informSubnational = await loadCsvMetrics(INFORM_SUBNATIONAL_SOURCE, (row) => ({
    countryIso3: row.country_iso3,
    adminCode: row.admin_code,
    adminName: row.admin_name,
    year: row.year ? Number(row.year) : null,
    riskScore: row.risk_score != null ? Number(row.risk_score) : null,
    hazardExposure: row.hazard_exposure != null ? Number(row.hazard_exposure) : null,
    vulnerability: row.vulnerability != null ? Number(row.vulnerability) : null,
    copingCapacity: row.coping_capacity != null ? Number(row.coping_capacity) : null
  }));
  writeFileSync(path.join(OUTPUT_DIR, 'inform_subnational.json'), JSON.stringify({ metrics: informSubnational }, null, 2));

  const epiMetrics = await loadCsvMetrics(EPI_SOURCE, (row) => ({
    iso3: row.iso3,
    year: row.year ? Number(row.year) : null,
    epiScore: row.epi_score != null ? Number(row.epi_score) : null,
    climatePolicyScore: row.climate_policy_score != null ? Number(row.climate_policy_score) : null,
    biodiversityScore: row.biodiversity_score != null ? Number(row.biodiversity_score) : null
  }));
  writeFileSync(path.join(OUTPUT_DIR, 'yale_epi.json'), JSON.stringify({ metrics: epiMetrics }, null, 2));

  const unepMetrics = await loadCsvMetrics(UNEP_SOURCE, (row) => ({
    countryIso3: row.country_iso3,
    adminLevel: row.admin_level,
    unitCode: row.unit_code,
    unitName: row.unit_name,
    metric: row.metric,
    year: row.year ? Number(row.year) : null,
    value: row.value != null ? Number(row.value) : null,
    unit: row.unit ?? null
  }));
  const unepCountry = unepMetrics.filter((row: any) => row.adminLevel === 'GAUL0');
  const unepSubnational = unepMetrics.filter((row: any) => row.adminLevel !== 'GAUL0');
  writeFileSync(path.join(OUTPUT_DIR, 'unep_country.json'), JSON.stringify({ metrics: unepCountry }, null, 2));
  writeFileSync(path.join(OUTPUT_DIR, 'unep_subnational.json'), JSON.stringify({ metrics: unepSubnational }, null, 2));

  console.log('Climate dataset snapshots written to', OUTPUT_DIR);
  console.log('Upload these JSON files to R2 (keys under climate/*) for the ingestion worker to consume.');
}

run().catch((error) => {
  console.error('fetch-climate-datasets failed', error);
  process.exitCode = 1;
});
