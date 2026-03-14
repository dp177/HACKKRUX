/*
 * One-time medicine import script.
 * Usage:
 *   node src/scripts/importMedicines.js ./data/medicines.json
 *   node src/scripts/importMedicines.js --common-500
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { connectDatabase, disconnectDatabase, Medicine } = require('../models');

const COMMON_INGREDIENTS = [
  'Paracetamol', 'Ibuprofen', 'Diclofenac', 'Aceclofenac', 'Naproxen', 'Etoricoxib', 'Aspirin', 'Tramadol', 'Codeine', 'Mefenamic Acid',
  'Pantoprazole', 'Omeprazole', 'Esomeprazole', 'Rabeprazole', 'Lansoprazole', 'Famotidine', 'Sucralfate', 'Domperidone', 'Ondansetron', 'Dicyclomine',
  'Cetirizine', 'Levocetirizine', 'Fexofenadine', 'Loratadine', 'Montelukast', 'Hydroxyzine', 'Prednisolone', 'Deflazacort', 'Dexamethasone', 'Budesonide',
  'Amoxicillin', 'Amoxicillin-Clavulanate', 'Azithromycin', 'Clarithromycin', 'Doxycycline', 'Cefixime', 'Cefuroxime', 'Cefpodoxime', 'Levofloxacin', 'Ofloxacin',
  'Ciprofloxacin', 'Metronidazole', 'Tinidazole', 'Nitrofurantoin', 'Linezolid', 'Clindamycin', 'Rifaximin', 'Mupirocin', 'Acyclovir', 'Fluconazole',
  'Metformin', 'Glimepiride', 'Gliclazide', 'Vildagliptin', 'Sitagliptin', 'Teneligliptin', 'Empagliflozin', 'Dapagliflozin', 'Pioglitazone', 'Insulin Glargine',
  'Amlodipine', 'Telmisartan', 'Losartan', 'Olmesartan', 'Valsartan', 'Ramipril', 'Enalapril', 'Atenolol', 'Metoprolol', 'Nebivolol',
  'Hydrochlorothiazide', 'Chlorthalidone', 'Furosemide', 'Spironolactone', 'Torsemide', 'Clopidogrel', 'Rosuvastatin', 'Atorvastatin', 'Fenofibrate', 'Isosorbide Mononitrate',
  'Salbutamol', 'Formoterol', 'Tiotropium', 'Theophylline', 'Ambroxol', 'Acetylcysteine', 'Dextromethorphan', 'Bromhexine', 'Levosalbutamol', 'Ipratropium',
  'Thyroxine', 'Carbimazole', 'Calcium Carbonate', 'Vitamin D3', 'Iron Folic Acid', 'Cyanocobalamin', 'Folic Acid', 'Zinc Sulfate', 'Magnesium Oxide', 'Potassium Citrate',
  'Sertraline', 'Escitalopram', 'Fluoxetine', 'Amitriptyline', 'Clonazepam', 'Alprazolam', 'Lorazepam', 'Sodium Valproate', 'Levetiracetam', 'Phenytoin',
  'Gabapentin', 'Pregabalin', 'Baclofen', 'Tizanidine', 'Topiramate', 'Risperidone', 'Olanzapine', 'Quetiapine', 'Aripiprazole', 'Haloperidol',
  'Tamsulosin', 'Finasteride', 'Dutasteride', 'Sildenafil', 'Tadalafil', 'Oxybutynin', 'Solifenacin', 'Mirabegron', 'Nitroglycerin', 'Heparin',
  'Warfarin', 'Apixaban', 'Rivaroxaban', 'Dabigatran', 'Tranexamic Acid', 'Ethamsylate', 'Medroxyprogesterone', 'Norethisterone', 'Combined Oral Contraceptive', 'Progesterone',
  'Lactulose', 'Bisacodyl', 'Senna', 'Polyethylene Glycol', 'Loperamide', 'Racecadotril', 'Mesalamine', 'Sulfasalazine', 'Ursodeoxycholic Acid', 'Pancreatin',
  'Allopurinol', 'Colchicine', 'Febuxostat', 'Hydroxychloroquine', 'Methotrexate', 'Leflunomide', 'Azathioprine', 'Mycophenolate', 'Cyclosporine', 'Tacrolimus',
  'Miconazole', 'Clotrimazole', 'Terbinafine', 'Ketoconazole', 'Permethrin', 'Benzoyl Peroxide', 'Adapalene', 'Tretinoin', 'Minoxidil', 'Biotin'
];

const STRENGTH_VARIANTS = [
  '100mg', '200mg', '250mg', '300mg', '400mg', '500mg', '650mg', '5mg', '10mg', '20mg'
];

const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Suspension', 'Drops'];

function buildCommonMedicines(count = 500) {
  const rows = [];

  for (let i = 0; i < COMMON_INGREDIENTS.length; i += 1) {
    const ingredient = COMMON_INGREDIENTS[i];

    for (let j = 0; j < 4; j += 1) {
      const strength = STRENGTH_VARIANTS[(i + j) % STRENGTH_VARIANTS.length];
      const dosageForm = DOSAGE_FORMS[(i + j) % DOSAGE_FORMS.length];

      rows.push({
        name: `${ingredient} ${strength}`,
        genericName: ingredient,
        dosageForms: [dosageForm],
        strength: [strength],
        manufacturer: null,
        isActive: true
      });

      if (rows.length >= count) {
        return rows;
      }
    }
  }

  return rows.slice(0, count);
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

async function run() {
  const arg = process.argv[2];
  let rows = [];

  if (!arg || arg === '--common-500') {
    rows = buildCommonMedicines(500);
  } else {
    const absolutePath = path.resolve(process.cwd(), arg);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Input file not found: ${absolutePath}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('Input JSON must be an array of medicine objects.');
      process.exit(1);
    }

    rows = parsed
      .map((item) => {
        const name = String(item?.name || '').trim();
        if (!name) return null;

        return {
          name,
          genericName: String(item?.genericName || item?.generic_name || '').trim() || null,
          dosageForms: normalizeArray(item?.dosageForms || item?.dosage_forms || item?.forms),
          strength: normalizeArray(item?.strength || item?.strengths),
          manufacturer: String(item?.manufacturer || '').trim() || null,
          isActive: item?.isActive !== false
        };
      })
      .filter(Boolean);
  }

  if (!rows.length) {
    console.error('No valid medicine rows found in input file.');
    process.exit(1);
  }

  await connectDatabase();

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const result = await Medicine.updateOne(
      { name: row.name },
      {
        $set: {
          genericName: row.genericName,
          dosageForms: row.dosageForms,
          strength: row.strength,
          manufacturer: row.manufacturer,
          isActive: row.isActive
        },
        $setOnInsert: {
          name: row.name
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) inserted += 1;
    else if (result.modifiedCount > 0) updated += 1;
  }

  console.log(`Medicine import complete. Inserted: ${inserted}, Updated: ${updated}, Total processed: ${rows.length}`);
  await disconnectDatabase();
}

run().catch(async (error) => {
  console.error('Medicine import failed:', error?.message || error);
  try {
    await disconnectDatabase();
  } catch {
    // ignore
  }
  process.exit(1);
});
