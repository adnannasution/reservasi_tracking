const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// DATABASE SETUP & AUTO MIGRATE
// ─────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  console.log('🔄 Running database migration...');

  // taex_reservasi
  db.exec(`
    CREATE TABLE IF NOT EXISTS taex_reservasi (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment   TEXT,
      "order"     TEXT,
      revision    TEXT,
      material    TEXT,
      itm         TEXT,
      material_description TEXT,
      qty_reqmts  REAL DEFAULT 0,
      qty_stock   REAL DEFAULT 0,
      pr          TEXT,
      item        TEXT,
      qty_pr      REAL,
      po          TEXT,
      po_date     TEXT,
      qty_deliv   REAL,
      delivery_date TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // prisma_reservasi
  db.exec(`
    CREATE TABLE IF NOT EXISTS prisma_reservasi (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment           TEXT,
      "order"             TEXT,
      revision            TEXT,
      material            TEXT,
      itm                 TEXT,
      material_description TEXT,
      qty_reqmts          REAL DEFAULT 0,
      qty_stock_onhand    REAL,
      pr_prisma           TEXT,
      item_prisma         TEXT,
      qty_pr_prisma       REAL,
      code_kertas_kerja   TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );
  `);

  // kumpulan_summary
  db.exec(`
    CREATE TABLE IF NOT EXISTS kumpulan_summary (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      material            TEXT,
      material_description TEXT,
      qty_req             REAL DEFAULT 0,
      qty_stock           REAL DEFAULT 0,
      qty_pr              REAL,
      qty_to_pr           REAL,
      code_tracking       TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );
  `);

  // sap_pr
  db.exec(`
    CREATE TABLE IF NOT EXISTS sap_pr (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      material            TEXT,
      material_description TEXT,
      pr                  TEXT,
      item                TEXT,
      qty_pr              REAL,
      tracking            TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );
  `);

  // app_state (kertas kerja current, counters, dll)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_taex_material   ON taex_reservasi(material);
    CREATE INDEX IF NOT EXISTS idx_taex_order      ON taex_reservasi("order");
    CREATE INDEX IF NOT EXISTS idx_prisma_material ON prisma_reservasi(material);
    CREATE INDEX IF NOT EXISTS idx_prisma_order    ON prisma_reservasi("order");
    CREATE INDEX IF NOT EXISTS idx_sap_pr          ON sap_pr(pr);
    CREATE INDEX IF NOT EXISTS idx_kumpulan_code   ON kumpulan_summary(code_tracking);
  `);

  // Seed default data jika taex_reservasi kosong
  const count = db.prepare('SELECT COUNT(*) as c FROM taex_reservasi').get();
  if (count.c === 0) {
    console.log('🌱 Seeding default TA-ex data...');
    const insert = db.prepare(`
      INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
      VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)
    `);
    const seed = [
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"I090912197",itm:"0006",material_description:"BOLT,STUD,A193,B7,5/8IN,105MM,2NUT",qty_reqmts:16,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750428",itm:"0007",material_description:"GASKET,SPW,316L,GRAP,8IN,300,OR,316L,CS",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750428",itm:"0008",material_description:"GASKET,SPW,316L,GRAP,8IN,300,OR,316L,CS",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750095",itm:"0009",material_description:"GASKET,SW,HP/IR:304,OR:CS,GRPD,3IN,300",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750095",itm:"0010",material_description:"GASKET,SW,HP/IR:304,OR:CS,GRPD,3IN,300",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750146",itm:"0011",material_description:"GASKET,SW,HP/IR:SS304,OR:CS,GRA,300,2IN",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750146",itm:"0012",material_description:"GASKET,SW,HP/IR:SS304,OR:CS,GRA,300,2IN",qty_reqmts:4,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-H-1/00",order:"8302345979",revision:"RU21025",material:"J200750510",itm:"0013",material_description:"GASKET,SW,SS304,GRPD,OR:CS,300,6IN",qty_reqmts:8,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-E-5/01",order:"8302345980",revision:"RU21026",material:"J200750510",itm:"0014",material_description:"GASKET,SW,SS304,GRPD,OR:CS,300,6IN",qty_reqmts:8,qty_stock:0,pr:null,item:null,qty_pr:null,po:"4500987654",po_date:"2025-03-10",qty_deliv:4,delivery_date:"2025-04-01"},
      {equipment:"701-E-5/01",order:"8302345980",revision:"RU21026",material:"B100440012",itm:"0015",material_description:"BOLT,HEX,A193,B7,1IN,UNC,165MM,2NUT,2WASHER",qty_reqmts:24,qty_stock:12,pr:null,item:null,qty_pr:null,po:"4500987655",po_date:"2025-03-12",qty_deliv:12,delivery_date:"2025-04-05"},
      {equipment:"701-E-5/01",order:"8302345980",revision:"RU21026",material:"I090912198",itm:"0016",material_description:"VALVE,GATE,SS316,2IN,300LB,BW",qty_reqmts:2,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
      {equipment:"701-T-3/00",order:"8302345981",revision:"RU21027",material:"K300150001",itm:"0001",material_description:"PACKING,GRAPHITE,ROPE,12MM",qty_reqmts:10,qty_stock:0,pr:null,item:null,qty_pr:null,po:null,po_date:null,qty_deliv:null,delivery_date:null},
    ];
    const insertMany = db.transaction((rows) => { rows.forEach(r => insert.run(r)); });
    insertMany(seed);
    console.log(`✅ Seeded ${seed.length} rows`);
  }

  console.log('✅ Migration complete');
}

migrate();

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// HELPERS: row mapper
// ─────────────────────────────────────────────
function mapTaex(r) {
  return {
    ID: r.id, Equipment: r.equipment, Order: r.order, Revision: r.revision,
    Material: r.material, Itm: r.itm, Material_Description: r.material_description,
    Qty_Reqmts: r.qty_reqmts, Qty_Stock: r.qty_stock,
    PR: r.pr, Item: r.item, Qty_PR: r.qty_pr,
    PO: r.po, PO_Date: r.po_date, Qty_Deliv: r.qty_deliv, Delivery_Date: r.delivery_date,
  };
}

function mapPrisma(r) {
  return {
    ID: r.id, Equipment: r.equipment, Order: r.order, Revision: r.revision,
    Material: r.material, Itm: r.itm, Material_Description: r.material_description,
    Qty_Reqmts: r.qty_reqmts, Qty_StockOnhand: r.qty_stock_onhand,
    PR_Prisma: r.pr_prisma, Item_Prisma: r.item_prisma, Qty_PR_Prisma: r.qty_pr_prisma,
    CodeKertasKerja: r.code_kertas_kerja,
  };
}

function mapKumpulan(r) {
  return {
    ID: r.id, Material: r.material, Material_Description: r.material_description,
    Qty_Req: r.qty_req, Qty_Stock: r.qty_stock,
    Qty_PR: r.qty_pr, Qty_To_PR: r.qty_to_pr, CodeTracking: r.code_tracking,
  };
}

function mapSAP(r) {
  return {
    ID: r.id, Material: r.material, Material_Description: r.material_description,
    PR: r.pr, Item: r.item, Qty_PR: r.qty_pr, Tracking: r.tracking,
  };
}

function setState(key, value) {
  db.prepare(`INSERT OR REPLACE INTO app_state(key,value,updated_at) VALUES(?,?,datetime('now'))`).run(key, JSON.stringify(value));
}

function getState(key) {
  const row = db.prepare('SELECT value FROM app_state WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : null;
}

// ─────────────────────────────────────────────
// API: HEALTH
// ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// API: LOAD ALL (untuk init frontend)
// ─────────────────────────────────────────────
app.get('/api/data', (req, res) => {
  try {
    const taexData            = db.prepare('SELECT * FROM taex_reservasi ORDER BY id').all().map(mapTaex);
    const prismaReservasiData = db.prepare('SELECT * FROM prisma_reservasi ORDER BY id').all().map(mapPrisma);
    const kumpulanData        = db.prepare('SELECT * FROM kumpulan_summary ORDER BY id').all().map(mapKumpulan);
    const prData              = db.prepare('SELECT * FROM sap_pr ORDER BY id').all().map(mapSAP);
    const kkCurrent           = getState('kk_current');
    const kkCounter           = getState('kk_counter') || 0;
    const prCounter           = getState('pr_counter') || 0;

    res.json({
      taexData, prismaReservasiData, kumpulanData, prData,
      kkData:   kkCurrent ? kkCurrent.data  : [],
      kkCode:   kkCurrent ? kkCurrent.code  : null,
      summaryData: getState('summary_current') || [],
      kkCounter, prCounter,
      lastUpdated: new Date().toISOString(),
    });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// API: TAEX RESERVASI
// ─────────────────────────────────────────────

// GET all
app.get('/api/taex', (req, res) => {
  const rows = db.prepare('SELECT * FROM taex_reservasi ORDER BY id').all().map(mapTaex);
  res.json(rows);
});

// POST bulk replace (upload excel)
app.post('/api/taex/replace', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM taex_reservasi').run();
      const ins = db.prepare(`
        INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
        VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)
      `);
      rows.forEach(r => ins.run({
        equipment: r.Equipment||null, order: r.Order||null, revision: r.Revision||null,
        material: r.Material||null, itm: r.Itm||null, material_description: r.Material_Description||null,
        qty_reqmts: r.Qty_Reqmts||0, qty_stock: r.Qty_Stock||0,
        pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null,
        po: r.PO||null, po_date: r.PO_Date||null, qty_deliv: r.Qty_Deliv??null, delivery_date: r.Delivery_Date||null,
      }));
    });
    run();
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST append
app.post('/api/taex/append', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const ins = db.prepare(`
      INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
      VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)
    `);
    const run = db.transaction(() => { rows.forEach(r => ins.run({
      equipment: r.Equipment||null, order: r.Order||null, revision: r.Revision||null,
      material: r.Material||null, itm: r.Itm||null, material_description: r.Material_Description||null,
      qty_reqmts: r.Qty_Reqmts||0, qty_stock: r.Qty_Stock||0,
      pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null,
      po: r.PO||null, po_date: r.PO_Date||null, qty_deliv: r.Qty_Deliv??null, delivery_date: r.Delivery_Date||null,
    })); });
    run();
    const all = db.prepare('SELECT * FROM taex_reservasi ORDER BY id').all().map(mapTaex);
    res.json({ ok: true, count: rows.length, data: all });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// POST single
app.post('/api/taex', (req, res) => {
  try {
    const r = req.body;
    const info = db.prepare(`
      INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
      VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)
    `).run({
      equipment: r.Equipment||null, order: r.Order||null, revision: r.Revision||null,
      material: r.Material||null, itm: r.Itm||null, material_description: r.Material_Description||null,
      qty_reqmts: r.Qty_Reqmts||0, qty_stock: r.Qty_Stock||0,
      pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null,
      po: r.PO||null, po_date: r.PO_Date||null, qty_deliv: r.Qty_Deliv??null, delivery_date: r.Delivery_Date||null,
    });
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// PUT update full taex state
app.put('/api/taex', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM taex_reservasi').run();
      const ins = db.prepare(`
        INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
        VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)
      `);
      rows.forEach(r => ins.run({
        equipment: r.Equipment||null, order: r.Order||null, revision: r.Revision||null,
        material: r.Material||null, itm: r.Itm||null, material_description: r.Material_Description||null,
        qty_reqmts: r.Qty_Reqmts||0, qty_stock: r.Qty_Stock||0,
        pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null,
        po: r.PO||null, po_date: r.PO_Date||null, qty_deliv: r.Qty_Deliv??null, delivery_date: r.Delivery_Date||null,
      }));
    });
    run();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// API: PRISMA RESERVASI
// ─────────────────────────────────────────────
app.get('/api/prisma', (req, res) => {
  res.json(db.prepare('SELECT * FROM prisma_reservasi ORDER BY id').all().map(mapPrisma));
});

app.put('/api/prisma', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM prisma_reservasi').run();
      const ins = db.prepare(`
        INSERT INTO prisma_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock_onhand,pr_prisma,item_prisma,qty_pr_prisma,code_kertas_kerja)
        VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock_onhand,@pr_prisma,@item_prisma,@qty_pr_prisma,@code_kertas_kerja)
      `);
      rows.forEach(r => ins.run({
        equipment: r.Equipment||null, order: r.Order||null, revision: r.Revision||null,
        material: r.Material||null, itm: r.Itm||null, material_description: r.Material_Description||null,
        qty_reqmts: r.Qty_Reqmts||0, qty_stock_onhand: r.Qty_StockOnhand??null,
        pr_prisma: r.PR_Prisma||null, item_prisma: r.Item_Prisma||null,
        qty_pr_prisma: r.Qty_PR_Prisma??null, code_kertas_kerja: r.CodeKertasKerja||null,
      }));
    });
    run();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// API: KUMPULAN SUMMARY
// ─────────────────────────────────────────────
app.get('/api/kumpulan', (req, res) => {
  res.json(db.prepare('SELECT * FROM kumpulan_summary ORDER BY id').all().map(mapKumpulan));
});

app.put('/api/kumpulan', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM kumpulan_summary').run();
      const ins = db.prepare(`
        INSERT INTO kumpulan_summary (material,material_description,qty_req,qty_stock,qty_pr,qty_to_pr,code_tracking)
        VALUES (@material,@material_description,@qty_req,@qty_stock,@qty_pr,@qty_to_pr,@code_tracking)
      `);
      rows.forEach(r => ins.run({
        material: r.Material||null, material_description: r.Material_Description||null,
        qty_req: r.Qty_Req||0, qty_stock: r.Qty_Stock||0,
        qty_pr: r.Qty_PR??null, qty_to_pr: r.Qty_To_PR??null, code_tracking: r.CodeTracking||null,
      }));
    });
    run();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// API: SAP PR
// ─────────────────────────────────────────────
app.get('/api/pr', (req, res) => {
  res.json(db.prepare('SELECT * FROM sap_pr ORDER BY id').all().map(mapSAP));
});

app.post('/api/pr/replace', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM sap_pr').run();
      const ins = db.prepare(`
        INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking)
        VALUES (@material,@material_description,@pr,@item,@qty_pr,@tracking)
      `);
      rows.forEach(r => ins.run({
        material: r.Material||null, material_description: r.Material_Description||null,
        pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null, tracking: r.Tracking||null,
      }));
    });
    run();
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/pr/append', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const ins = db.prepare(`
      INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking)
      VALUES (@material,@material_description,@pr,@item,@qty_pr,@tracking)
    `);
    const run = db.transaction(() => { rows.forEach(r => ins.run({
      material: r.Material||null, material_description: r.Material_Description||null,
      pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null, tracking: r.Tracking||null,
    })); });
    run();
    const all = db.prepare('SELECT * FROM sap_pr ORDER BY id').all().map(mapSAP);
    res.json({ ok: true, count: rows.length, data: all });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/pr', (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    const run = db.transaction(() => {
      db.prepare('DELETE FROM sap_pr').run();
      const ins = db.prepare(`
        INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking)
        VALUES (@material,@material_description,@pr,@item,@qty_pr,@tracking)
      `);
      rows.forEach(r => ins.run({
        material: r.Material||null, material_description: r.Material_Description||null,
        pr: r.PR||null, item: r.Item||null, qty_pr: r.Qty_PR??null, tracking: r.Tracking||null,
      }));
    });
    run();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// API: APP STATE (kk_current, kk_counter, pr_counter, summary_current)
// ─────────────────────────────────────────────
app.get('/api/state/:key', (req, res) => {
  const val = getState(req.params.key);
  res.json({ key: req.params.key, value: val });
});

app.post('/api/state/:key', (req, res) => {
  setState(req.params.key, req.body.value);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// API: RESET ALL
// ─────────────────────────────────────────────
app.post('/api/reset', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM taex_reservasi').run();
      db.prepare('DELETE FROM prisma_reservasi').run();
      db.prepare('DELETE FROM kumpulan_summary').run();
      db.prepare('DELETE FROM sap_pr').run();
      db.prepare('DELETE FROM app_state').run();
    })();
    // Re-seed
    migrate();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// API: SAVE ALL STATE (bulk sync dari frontend)
// ─────────────────────────────────────────────
app.post('/api/save', (req, res) => {
  try {
    const { taexData, prismaReservasiData, kumpulanData, prData, kkData, kkCode, summaryData, kkCounter, prCounter } = req.body;

    db.transaction(() => {
      // taex
      if (Array.isArray(taexData)) {
        db.prepare('DELETE FROM taex_reservasi').run();
        const ins = db.prepare(`INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date) VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock,@pr,@item,@qty_pr,@po,@po_date,@qty_deliv,@delivery_date)`);
        taexData.forEach(r => ins.run({ equipment:r.Equipment||null,order:r.Order||null,revision:r.Revision||null,material:r.Material||null,itm:r.Itm||null,material_description:r.Material_Description||null,qty_reqmts:r.Qty_Reqmts||0,qty_stock:r.Qty_Stock||0,pr:r.PR||null,item:r.Item||null,qty_pr:r.Qty_PR??null,po:r.PO||null,po_date:r.PO_Date||null,qty_deliv:r.Qty_Deliv??null,delivery_date:r.Delivery_Date||null }));
      }
      // prisma
      if (Array.isArray(prismaReservasiData)) {
        db.prepare('DELETE FROM prisma_reservasi').run();
        const ins = db.prepare(`INSERT INTO prisma_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock_onhand,pr_prisma,item_prisma,qty_pr_prisma,code_kertas_kerja) VALUES (@equipment,@order,@revision,@material,@itm,@material_description,@qty_reqmts,@qty_stock_onhand,@pr_prisma,@item_prisma,@qty_pr_prisma,@code_kertas_kerja)`);
        prismaReservasiData.forEach(r => ins.run({ equipment:r.Equipment||null,order:r.Order||null,revision:r.Revision||null,material:r.Material||null,itm:r.Itm||null,material_description:r.Material_Description||null,qty_reqmts:r.Qty_Reqmts||0,qty_stock_onhand:r.Qty_StockOnhand??null,pr_prisma:r.PR_Prisma||null,item_prisma:r.Item_Prisma||null,qty_pr_prisma:r.Qty_PR_Prisma??null,code_kertas_kerja:r.CodeKertasKerja||null }));
      }
      // kumpulan
      if (Array.isArray(kumpulanData)) {
        db.prepare('DELETE FROM kumpulan_summary').run();
        const ins = db.prepare(`INSERT INTO kumpulan_summary (material,material_description,qty_req,qty_stock,qty_pr,qty_to_pr,code_tracking) VALUES (@material,@material_description,@qty_req,@qty_stock,@qty_pr,@qty_to_pr,@code_tracking)`);
        kumpulanData.forEach(r => ins.run({ material:r.Material||null,material_description:r.Material_Description||null,qty_req:r.Qty_Req||0,qty_stock:r.Qty_Stock||0,qty_pr:r.Qty_PR??null,qty_to_pr:r.Qty_To_PR??null,code_tracking:r.CodeTracking||null }));
      }
      // sap pr
      if (Array.isArray(prData)) {
        db.prepare('DELETE FROM sap_pr').run();
        const ins = db.prepare(`INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking) VALUES (@material,@material_description,@pr,@item,@qty_pr,@tracking)`);
        prData.forEach(r => ins.run({ material:r.Material||null,material_description:r.Material_Description||null,pr:r.PR||null,item:r.Item||null,qty_pr:r.Qty_PR??null,tracking:r.Tracking||null }));
      }
      // states
      if (kkData !== undefined || kkCode !== undefined) setState('kk_current', { data: kkData||[], code: kkCode||null });
      if (summaryData !== undefined) setState('summary_current', summaryData||[]);
      if (kkCounter !== undefined) setState('kk_counter', kkCounter);
      if (prCounter !== undefined) setState('pr_counter', prCounter);
    })();

    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
// SERVE SPA
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PRISMA TA-ex System running on port ${PORT}`);
  console.log(`📦 Database: ${DB_PATH}`);
});
