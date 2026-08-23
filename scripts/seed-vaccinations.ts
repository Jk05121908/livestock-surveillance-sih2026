/**
 * Seed Vaccination Data Generator — SIH 2026 Livestock Surveillance
 * Generates 50–100 vaccination records across 3–5 Maharashtra villages
 * and 5–10 vets. Outputs JSON, CSV and SQL for Supabase import.
 *
 * Usage:
 *   npx tsx scripts/seed-vaccinations.ts [count]
 *   npm run seed:vaccinations
 *   deno run --allow-read --allow-write scripts/seed-vaccinations.ts
 *
 * Env (optional): SEED_COUNT=75
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config — Real Maharashtra villages (Ahmednagar district)
// ---------------------------------------------------------------------------

type VillageInfo = { village: string; block: string; district: string };

const VILLAGES: VillageInfo[] = [
  { village: "Hiware Bazar", block: "Parner", district: "Ahmednagar" },
  { village: "Ralegan Siddhi", block: "Parner", district: "Ahmednagar" },
  { village: "Shani Shingnapur", block: "Nevasa", district: "Ahmednagar" },
  { village: "Kolhewadi", block: "Sangamner", district: "Ahmednagar" },
  { village: "Takali Dhokeshwar", block: "Parner", district: "Ahmednagar" },
];

const VACCINE_TYPES = ["FMD", "mastitis", "brucellosis", "anthrax"] as const;
type VaccineType = typeof VACCINE_TYPES[number];

const VACCINE_NOTES: Record<VaccineType, string[]> = {
  FMD: ["Foot and Mouth Disease booster", "Annual FMD vaccination", "FMD primary dose"],
  mastitis: ["Mastitis prevention protocol", "Quarter-wise mastitis vaccine", "Mastitis booster"],
  brucellosis: ["Brucellosis S19 strain", "Brucellosis calfhood vaccination", "Brucella annual dose"],
  anthrax: ["Anthrax spore vaccine", "Anthrax annual preventive", "Anthrax booster dose"],
};

// Dummy farmers — ties to Member 2's schema (farmers table)
// If Member 2 already seeded farmers, replace these IDs with real farmer_ids
type Farmer = { id: string; name: string; village: string; block: string; phone: string };

const FARMER_FIRST = ["Ramesh", "Suresh", "Ashok", "Sunil", "Anil", "Vijay", "Prakash", "Dattatray", "Balasaheb", "Namdev", "Tukaram", "Eknath", "Bhausaheb", "Shankar", "Ganesh", "Mahesh", "Sanjay", "Popat", "Kisan", "Baban"];
const FARMER_LAST = ["Pawar", "Shinde", "Deshmukh", "Kale", "Jadhav", "Gawade", "Lonkar", "Thorat", "Kharat", "More", "Gaikwad", "Bhosale", "Mhaske", "Darade", "Gholap", "Bankar", "Ghule", "Autade", "Pardhi", "Shirsath"];

const VET_FIRST = ["Dr. Rajesh", "Dr. Priya", "Dr. Amit", "Dr. Sneha", "Dr. Vikram", "Dr. Anjali", "Dr. Sandeep", "Dr. Kavita", "Dr. Manoj", "Dr. Pooja"];
const VET_LAST = ["Deshmukh", "Kulkarni", "Patil", "Joshi", "Shinde", "Pawar", "Gaikwad", "Mane", "Kadam", "Bhosale"];
const VET_SPECIALIZATIONS = ["Large Animal Medicine", "Veterinary Epidemiology", "Bovine Health", "Preventive Medicine", "Field Veterinarian"];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(): string {
  return `+91${randomInt(7000000000, 9999999999)}`;
}

function uuidFromParts(prefix: string, n: number): string {
  // deterministic pseudo-UUID for seed reproducibility (not RFC4122 strict but works for SQL)
  const hex = n.toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-a${hex.slice(1, 4)}-${prefix}${hex.padStart(12, "0").slice(-12)}`;
}

function randomDatePast6Months(): string {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(now.getMonth() - 6);

  // Realistic distribution: 40% in last 2 months, 35% in months 3-4, 25% in months 5-6
  const bucket = Math.random();
  let start: Date, end: Date;
  if (bucket < 0.4) {
    // last 2 months
    start = new Date(now);
    start.setMonth(now.getMonth() - 2);
    end = now;
  } else if (bucket < 0.75) {
    start = new Date(now);
    start.setMonth(now.getMonth() - 4);
    end = new Date(now);
    end.setMonth(now.getMonth() - 2);
  } else {
    start = sixMonthsAgo;
    end = new Date(now);
    end.setMonth(now.getMonth() - 4);
  }

  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  const d = new Date(t);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

function generateFarmers(count = 30): Farmer[] {
  const farmers: Farmer[] = [];
  for (let i = 1; i <= count; i++) {
    const vil = randomChoice(VILLAGES);
    const name = `${randomChoice(FARMER_FIRST)} ${randomChoice(FARMER_LAST)}`;
    farmers.push({
      id: uuidFromParts("f00f", i + 1000),
      name,
      village: vil.village,
      block: vil.block,
      phone: randomPhone(),
    });
  }
  // Ensure each village has at least 4 farmers
  for (const vil of VILLAGES) {
    const countInVillage = farmers.filter((f) => f.village === vil.village).length;
    if (countInVillage < 4) {
      for (let k = countInVillage; k < 4; k++) {
        const name = `${randomChoice(FARMER_FIRST)} ${randomChoice(FARMER_LAST)}`;
        farmers.push({
          id: uuidFromParts("f00f", farmers.length + 2000),
          name,
          village: vil.village,
          block: vil.block,
          phone: randomPhone(),
        });
      }
    }
  }
  return farmers;
}

type Vet = { id: string; name: string; phone: string; village: string; block: string; specialization: string };

function generateVets(count = 8): Vet[] {
  const vets: Vet[] = [];
  const usedVillages = [...VILLAGES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const vil = usedVillages[i % usedVillages.length];
    vets.push({
      id: uuidFromParts("beef", i + 5000),
      name: `${randomChoice(VET_FIRST)} ${randomChoice(VET_LAST)}`,
      phone: randomPhone(),
      village: vil.village,
      block: vil.block,
      specialization: randomChoice(VET_SPECIALIZATIONS),
    });
  }
  return vets;
}

type VaccinationRecord = {
  id: string;
  farmer_id: string;
  farmer_name: string;
  animal_id: string;
  vaccine_type: VaccineType;
  village: string;
  block: string;
  district: string;
  date: string; // YYYY-MM-DD
  notes: string;
  vet_id: string | null;
  created_at: string;
};

function generateVaccinations(farmers: Farmer[], vets: Vet[], count: number): VaccinationRecord[] {
  const records: VaccinationRecord[] = [];
  const animalSpecies = ["BOV", "BUF", "GOAT"]; // bovine, buffalo, goat
  for (let i = 0; i < count; i++) {
    const farmer = randomChoice(farmers);
    const vil = VILLAGES.find((v) => v.village === farmer.village)!;
    const vaccine = randomChoice(VACCINE_TYPES);
    const species = randomChoice(animalSpecies);
    const animalNum = randomInt(1001, 9999);
    const vet = Math.random() > 0.15 ? randomChoice(vets.filter((v) => v.block === vil.block || Math.random() > 0.5)) : null;

    records.push({
      id: uuidFromParts("c0de", i + 9000),
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      animal_id: `${species}-${animalNum}`,
      vaccine_type: vaccine,
      village: vil.village,
      block: vil.block,
      district: vil.district,
      date: randomDatePast6Months(),
      notes: randomChoice(VACCINE_NOTES[vaccine]),
      vet_id: vet ? vet.id : null,
      created_at: new Date().toISOString(),
    });
  }
  // Sort by date descending for realistic recent-first view
  records.sort((a, b) => b.date.localeCompare(a.date));
  return records;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function toCSV(records: VaccinationRecord[]): string {
  const header = ["id", "farmer_id", "farmer_name", "animal_id", "vaccine_type", "village", "block", "district", "date", "notes", "vet_id", "created_at"];
  const rows = records.map((r) =>
    header.map((h) => {
      const v = (r as unknown as Record<string, string | null>)[h] ?? "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function vetsToCSV(vets: Vet[]): string {
  const header = ["id", "name", "phone", "village", "block", "specialization"];
  const rows = vets.map((v) =>
    header.map((h) => {
      const val = (v as unknown as Record<string, string>)[h] ?? "";
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function farmersToCSV(farmers: Farmer[]): string {
  const header = ["id", "name", "village", "block", "phone"];
  const rows = farmers.map((f) =>
    header.map((h) => `"${String((f as unknown as Record<string, string>)[h]).replace(/"/g, '""')}"`).join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

function toSQL(vaccinations: VaccinationRecord[], vets: Vet[], farmers: Farmer[]): string {
  const lines: string[] = [];
  lines.push("-- Seed data for livestock-surveillance-sih2026");
  lines.push("-- Generated: " + new Date().toISOString());
  lines.push("-- Villages: " + VILLAGES.map((v) => v.village).join(", "));
  lines.push("-- Run in Supabase SQL Editor or psql");
  lines.push("");
  lines.push("-- Optional: seed farmers (if Member 2's farmers table is empty)");
  lines.push("-- Uncomment below to insert dummy farmers");
  lines.push("/*");
  for (const f of farmers) {
    lines.push(
      `INSERT INTO farmers (id, name, village, block, phone) VALUES ('${f.id}', '${f.name.replace(/'/g, "''")}', '${f.village}', '${f.block}', '${f.phone}') ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push("*/");
  lines.push("");
  lines.push("-- Seed vets (5–10 across villages/blocks)");
  for (const v of vets) {
    lines.push(
      `INSERT INTO vets (id, name, phone, village, block, specialization) VALUES ('${v.id}', '${v.name.replace(/'/g, "''")}', '${v.phone}', '${v.village}', '${v.block}', '${v.specialization}') ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push("");
  lines.push("-- Seed vaccinations (50–100 records, past 6 months)");
  for (const r of vaccinations) {
    const notesEsc = r.notes.replace(/'/g, "''");
    const vetVal = r.vet_id ? `'${r.vet_id}'` : "NULL";
    lines.push(
      `INSERT INTO vaccinations (id, farmer_id, animal_id, vaccine_type, village, block, district, date, notes, vet_id, created_at) VALUES ('${r.id}', '${r.farmer_id}', '${r.animal_id}', '${r.vaccine_type}', '${r.village}', '${r.block}', '${r.district}', '${r.date}', '${notesEsc}', ${vetVal}, '${r.created_at}') ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push("");
  lines.push("-- Verify:");
  lines.push("-- SELECT village, count(*) FROM vaccinations GROUP BY village;");
  lines.push("-- SELECT vaccine_type, count(*) FROM vaccinations GROUP BY vaccine_type;");
  lines.push("-- SELECT * FROM vets;");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const argCount = parseInt(process.argv[2] || process.env.SEED_COUNT || "", 10);
  const count = !isNaN(argCount) && argCount >= 10 && argCount <= 500 ? argCount : randomInt(50, 100);
  const vetCount = randomInt(5, 10);

  console.log(`Generating ${count} vaccination records across ${VILLAGES.length} villages...`);
  console.log(`Villages: ${VILLAGES.map((v) => `${v.village} (${v.block})`).join(" | ")}`);
  console.log(`Vaccines: ${VACCINE_TYPES.join(", ")}`);

  const farmers = generateFarmers(30);
  const vets = generateVets(vetCount);
  const vaccinations = generateVaccinations(farmers, vets, count);

  // Stats
  const byVillage = VILLAGES.map((v) => ({
    village: v.village,
    count: vaccinations.filter((r) => r.village === v.village).length,
  }));
  const byVaccine = VACCINE_TYPES.map((v) => ({
    vaccine: v,
    count: vaccinations.filter((r) => r.vaccine_type === v).length,
  }));

  console.log("\nDistribution by village:");
  byVillage.forEach((b) => console.log(`  ${b.village}: ${b.count}`));
  console.log("\nDistribution by vaccine:");
  byVaccine.forEach((b) => console.log(`  ${b.vaccine}: ${b.count}`));
  console.log(`\nVets generated: ${vets.length}`);
  vets.forEach((v) => console.log(`  ${v.name} — ${v.village} (${v.block}) — ${v.specialization}`));

  // Ensure output dirs
  const outDir = path.join(process.cwd(), "seed-data");
  const altOutDir = path.join(process.cwd(), "supabase", "seed");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(altOutDir)) fs.mkdirSync(altOutDir, { recursive: true });

  // Write JSON
  fs.writeFileSync(path.join(outDir, "farmers.json"), JSON.stringify(farmers, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "vets.json"), JSON.stringify(vets, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "vaccinations.json"), JSON.stringify(vaccinations, null, 2), "utf8");

  // Write CSV
  fs.writeFileSync(path.join(outDir, "farmers.csv"), farmersToCSV(farmers), "utf8");
  fs.writeFileSync(path.join(outDir, "vets.csv"), vetsToCSV(vets), "utf8");
  fs.writeFileSync(path.join(outDir, "vaccinations.csv"), toCSV(vaccinations), "utf8");

  // Write SQL
  const sql = toSQL(vaccinations, vets, farmers);
  fs.writeFileSync(path.join(outDir, "seed.sql"), sql, "utf8");
  fs.writeFileSync(path.join(altOutDir, "vaccinations.sql"), sql, "utf8");

  // Also duplicate to supabase/seed for convenience
  fs.writeFileSync(path.join(altOutDir, "farmers.json"), JSON.stringify(farmers, null, 2), "utf8");
  fs.writeFileSync(path.join(altOutDir, "vets.json"), JSON.stringify(vets, null, 2), "utf8");

  console.log(`\n✓ Wrote:`);
  console.log(`  seed-data/farmers.json (${farmers.length} farmers)`);
  console.log(`  seed-data/vets.json (${vets.length} vets)`);
  console.log(`  seed-data/vaccinations.json (${vaccinations.length} records)`);
  console.log(`  seed-data/vaccinations.csv`);
  console.log(`  seed-data/vets.csv`);
  console.log(`  seed-data/farmers.csv`);
  console.log(`  seed-data/seed.sql (SQL inserts)`);
  console.log(`  supabase/seed/vaccinations.sql (duplicate for supabase import)`);

  console.log("\nNext steps:");
  console.log("  1. Review seed-data/vaccinations.json");
  console.log("  2. In Supabase Dashboard → SQL Editor → paste & run seed-data/seed.sql");
  console.log("  3. Or: use Supabase CSV import for vaccinations.csv & vets.csv");
  console.log("  4. Verify: SELECT village, count(*) FROM vaccinations GROUP BY village;");
}

main();
