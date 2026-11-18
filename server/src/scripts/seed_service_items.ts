import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

// ─── SuperStore catalog ───────────────────────────────────────────────────────
// vatRate 7  → food, non-alcoholic drinks (German reduced rate)
// vatRate 19 → household, electronics, hygiene, alcohol, office
// costPriceCents  = Einkaufspreis (purchase/cost price)
// defaultUnitPriceCents = Verkaufspreis (selling price)
const ITEMS = [
  // ── Molkereiprodukte / Dairy ──────────────────────────────────────────────
  { name: 'Vollmilch 3,5 % (1 L)',        description: 'Frischmilch 3,5 % Fett, 1-Liter-Packung',                         unit: 'Stück', category: 'Molkereiprodukte', costPriceCents:  79, defaultUnitPriceCents:  109, vatRate:  7, notes: 'Kühlware — MHD beachten' },
  { name: 'Butter (250 g)',                description: 'Süßrahmbutter 250 g, Folie',                                       unit: 'Stück', category: 'Molkereiprodukte', costPriceCents: 149, defaultUnitPriceCents:  199, vatRate:  7, notes: 'Kühlware' },
  { name: 'Gouda Scheiben (400 g)',        description: 'Goudakäse jung, vorgeschnitten, 400 g',                             unit: 'Stück', category: 'Molkereiprodukte', costPriceCents: 239, defaultUnitPriceCents:  329, vatRate:  7, notes: 'Kühlware' },
  { name: 'Naturjoghurt (500 g)',          description: 'Joghurt mild, 3,5 % Fett, Becher 500 g',                           unit: 'Stück', category: 'Molkereiprodukte', costPriceCents: 109, defaultUnitPriceCents:  149, vatRate:  7 },
  { name: 'Eier (10er Karton)',            description: 'Frische Eier Größe M, 10 Stück, Klasse A',                         unit: 'Stück', category: 'Molkereiprodukte', costPriceCents: 259, defaultUnitPriceCents:  349, vatRate:  7 },

  // ── Backwaren & Grundnahrung / Bakery & Staples ───────────────────────────
  { name: 'Toastbrot (750 g)',             description: 'Weizenmischbrot, geschnitten, 750-g-Packung',                       unit: 'Stück', category: 'Backwaren & Grundnahrung', costPriceCents: 139, defaultUnitPriceCents:  189, vatRate:  7 },
  { name: 'Nudeln (500 g)',                description: 'Hartweizen-Spaghetti, 500-g-Packung',                               unit: 'Stück', category: 'Backwaren & Grundnahrung', costPriceCents:  99, defaultUnitPriceCents:  149, vatRate:  7 },
  { name: 'Reis (1 kg)',                   description: 'Parboiled Langkornreis, 1-kg-Packung',                               unit: 'Stück', category: 'Backwaren & Grundnahrung', costPriceCents: 129, defaultUnitPriceCents:  179, vatRate:  7 },
  { name: 'Zucker (1 kg)',                 description: 'Weißer Kristallzucker, 1-kg-Packung',                               unit: 'Stück', category: 'Backwaren & Grundnahrung', costPriceCents:  89, defaultUnitPriceCents:  129, vatRate:  7 },
  { name: 'Sonnenblumenöl (1 L)',          description: 'Pflanzenöl kaltgepresst, 1-Liter-Flasche',                         unit: 'Stück', category: 'Backwaren & Grundnahrung', costPriceCents: 179, defaultUnitPriceCents:  249, vatRate:  7 },

  // ── Obst & Gemüse / Produce ───────────────────────────────────────────────
  { name: 'Äpfel (1 kg)',                  description: 'Tafeläpfel Klasse I, locker gewogen',                               unit: 'kg',    category: 'Obst & Gemüse', costPriceCents: 139, defaultUnitPriceCents:  199, vatRate:  7 },
  { name: 'Kartoffeln (2,5 kg)',           description: 'Festkochende Speisekartoffeln, Netz 2,5 kg',                        unit: 'Stück', category: 'Obst & Gemüse', costPriceCents: 179, defaultUnitPriceCents:  249, vatRate:  7 },
  { name: 'Tomaten (500 g)',               description: 'Rispentomaten Klasse I, Schale 500 g',                              unit: 'Stück', category: 'Obst & Gemüse', costPriceCents: 139, defaultUnitPriceCents:  199, vatRate:  7 },
  { name: 'Bananen (1 kg)',                description: 'Bananen Klasse I, Bund ca. 1 kg',                                   unit: 'kg',    category: 'Obst & Gemüse', costPriceCents: 119, defaultUnitPriceCents:  179, vatRate:  7 },

  // ── Getränke / Beverages ──────────────────────────────────────────────────
  { name: 'Mineralwasser (0,5 L)',         description: 'Stilles Mineralwasser, PET-Flasche 0,5 L',                         unit: 'Stück', category: 'Getränke', costPriceCents:  39, defaultUnitPriceCents:   59, vatRate:  7 },
  { name: 'Orangensaft (1 L)',             description: 'Frisch gepresster Orangensaft, 1-Liter-Karton',                     unit: 'Stück', category: 'Getränke', costPriceCents: 179, defaultUnitPriceCents:  249, vatRate:  7 },
  { name: 'Cola (0,5 L)',                  description: 'Cola-Limonade, PET-Flasche 0,5 L',                                  unit: 'Stück', category: 'Getränke', costPriceCents:  99, defaultUnitPriceCents:  149, vatRate:  7 },
  { name: 'Bier (0,5 L Flasche)',          description: 'Lagerbier 4,9 % vol., Glasflasche 0,5 L',                          unit: 'Stück', category: 'Getränke', costPriceCents:  85, defaultUnitPriceCents:  129, vatRate: 19, notes: 'Alkohol → Regelsteuersatz 19 %' },
  { name: 'Rotwein (0,75 L)',              description: 'Rotwein trocken, Glasflasche 0,75 L',                               unit: 'Stück', category: 'Getränke', costPriceCents: 479, defaultUnitPriceCents:  699, vatRate: 19, notes: 'Alkohol → Regelsteuersatz 19 %' },

  // ── Haushalt & Reinigung / Household ─────────────────────────────────────
  { name: 'Spülmittel (500 ml)',           description: 'Geschirrspülmittel Zitrone, Flasche 500 ml',                       unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 139, defaultUnitPriceCents:  199, vatRate: 19 },
  { name: 'Waschmittel Pulver (1,5 kg)',   description: 'Vollwaschmittel für Buntwäsche, 1,5-kg-Packung (ca. 20 WL)',       unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 469, defaultUnitPriceCents:  699, vatRate: 19 },
  { name: 'Toilettenpapier (8 Rollen)',    description: '3-lagiges Toilettenpapier, 8er Pack',                               unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 269, defaultUnitPriceCents:  399, vatRate: 19 },
  { name: 'Küchenrolle (4 Rollen)',        description: 'Haushaltsrolle 2-lagig, 4er Pack',                                  unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 199, defaultUnitPriceCents:  299, vatRate: 19 },
  { name: 'Müllsäcke 60 L (20er)',         description: 'Abfallsäcke 60 Liter, robust, 20-Stück-Packung',                   unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 239, defaultUnitPriceCents:  349, vatRate: 19 },
  { name: 'Handspülbürste',               description: 'Abwaschbürste mit Holzstiel',                                       unit: 'Stück', category: 'Haushalt & Reinigung', costPriceCents: 189, defaultUnitPriceCents:  299, vatRate: 19 },

  // ── Hygiene / Personal Care ───────────────────────────────────────────────
  { name: 'Shampoo (300 ml)',              description: 'Haarshampoo für normales Haar, 300-ml-Flasche',                     unit: 'Stück', category: 'Hygiene & Körperpflege', costPriceCents: 239, defaultUnitPriceCents:  349, vatRate: 19 },
  { name: 'Handseife flüssig (300 ml)',    description: 'Flüssigseife Aloe Vera, Pumpflasche 300 ml',                       unit: 'Stück', category: 'Hygiene & Körperpflege', costPriceCents: 169, defaultUnitPriceCents:  249, vatRate: 19 },
  { name: 'Zahnpasta (75 ml)',             description: 'Fluoridzahnpasta, Tube 75 ml',                                     unit: 'Stück', category: 'Hygiene & Körperpflege', costPriceCents: 155, defaultUnitPriceCents:  229, vatRate: 19 },
  { name: 'Desinfektionsmittel (500 ml)', description: 'Händedesinfektionsmittel, Flasche 500 ml, WHO-Formel',              unit: 'Stück', category: 'Hygiene & Körperpflege', costPriceCents: 339, defaultUnitPriceCents:  499, vatRate: 19 },

  // ── Elektronik & Büro / Electronics & Office ─────────────────────────────
  { name: 'AA-Batterien (4er Pack)',       description: 'Alkaline-Batterien Mignon AA, 1,5 V, 4er Pack',                    unit: 'Stück', category: 'Elektronik & Büro', costPriceCents: 259, defaultUnitPriceCents:  399, vatRate: 19 },
  { name: 'USB-C Ladekabel (1 m)',         description: 'USB-A auf USB-C Kabel, 1 Meter, Schnellladefähig',                 unit: 'Stück', category: 'Elektronik & Büro', costPriceCents: 649, defaultUnitPriceCents:  999, vatRate: 19 },
  { name: 'A4-Kopierpapier (500 Blatt)',   description: '80 g/m² Druckerpapier, Ries 500 Blatt',                            unit: 'Stück', category: 'Elektronik & Büro', costPriceCents: 469, defaultUnitPriceCents:  699, vatRate: 19 },
  { name: 'Kugelschreiber (10er Pack)',    description: 'Einweg-Kugelschreiber, blau, 10er Pack',                            unit: 'Stück', category: 'Elektronik & Büro', costPriceCents: 189, defaultUnitPriceCents:  299, vatRate: 19 },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[ServiceItem Seed] Connected to MongoDB');

  const db     = mongoose.connection.db!;
  const tenant = await db.collection('tenants').findOne({ loginCode: 'demo' });
  if (!tenant) {
    console.error('[ServiceItem Seed] Demo tenant not found. Run seed.ts first.');
    process.exit(1);
  }

  const tenantId = tenant._id as mongoose.Types.ObjectId;
  const col      = db.collection('m3_service_items');

  let inserted = 0, updated = 0;
  for (const item of ITEMS) {
    const exists = await col.findOne({ tenantId, name: item.name });
    if (exists) {
      await col.updateOne(
        { _id: exists._id },
        { $set: { costPriceCents: item.costPriceCents, category: item.category ?? '', updatedAt: new Date() } }
      );
      const ek = `EK ${(item.costPriceCents / 100).toFixed(2)} €`;
      const vk = `VK ${(item.defaultUnitPriceCents / 100).toFixed(2)} €`;
      console.log(`[ServiceItem Seed] ↺ ${item.name.padEnd(35)} ${ek.padStart(12)} ${vk.padStart(12)}`);
      updated++;
      continue;
    }
    await col.insertOne({
      tenantId,
      ...item,
      description: item.description ?? '',
      unit:        item.unit ?? 'Stück',
      isActive:    true,
      createdAt:   new Date(),
      updatedAt:   new Date(),
    });
    const ek = `EK ${(item.costPriceCents / 100).toFixed(2)} €`;
    const vk = `VK ${(item.defaultUnitPriceCents / 100).toFixed(2)} €`;
    console.log(`[ServiceItem Seed] ✓ ${item.name.padEnd(35)} ${ek.padStart(12)} ${vk.padStart(12)} | ${item.vatRate} % MwSt.`);
    inserted++;
  }

  console.log(`\n[ServiceItem Seed] Done — ${inserted} inserted, ${updated} updated with costPriceCents + category.`);
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
