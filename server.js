const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────────
// DATABASE — PostgreSQL
// Set DATABASE_URL di environment variables GCP Cloud Run
// ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────
const SEED_DATA = [
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

// ─────────────────────────────────────────────
// AUTO MIGRATE
// ─────────────────────────────────────────────
async function migrate() {
  console.log('🔄 Running PostgreSQL migration...');

  await query(`
    CREATE TABLE IF NOT EXISTS taex_reservasi (
      id                   SERIAL PRIMARY KEY,
      equipment            TEXT,
      "order"              TEXT,
      revision             TEXT,
      material             TEXT,
      itm                  TEXT,
      material_description TEXT,
      qty_reqmts           NUMERIC DEFAULT 0,
      qty_stock            NUMERIC DEFAULT 0,
      pr                   TEXT,
      item                 TEXT,
      qty_pr               NUMERIC,
      po                   TEXT,
      po_date              TEXT,
      qty_deliv            NUMERIC,
      delivery_date        TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS prisma_reservasi (
      id                   SERIAL PRIMARY KEY,
      equipment            TEXT,
      "order"              TEXT,
      revision             TEXT,
      material             TEXT,
      itm                  TEXT,
      material_description TEXT,
      qty_reqmts           NUMERIC DEFAULT 0,
      qty_stock_onhand     NUMERIC,
      pr_prisma            TEXT,
      item_prisma          TEXT,
      qty_pr_prisma        NUMERIC,
      code_kertas_kerja    TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS kumpulan_summary (
      id                   SERIAL PRIMARY KEY,
      material             TEXT,
      material_description TEXT,
      qty_req              NUMERIC DEFAULT 0,
      qty_stock            NUMERIC DEFAULT 0,
      qty_pr               NUMERIC,
      qty_to_pr            NUMERIC,
      code_tracking        TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sap_pr (
      id                   SERIAL PRIMARY KEY,
      material             TEXT,
      material_description TEXT,
      pr                   TEXT,
      item                 TEXT,
      qty_pr               NUMERIC,
      tracking             TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_taex_material   ON taex_reservasi(material)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_taex_order      ON taex_reservasi("order")`);
  await query(`CREATE INDEX IF NOT EXISTS idx_prisma_material ON prisma_reservasi(material)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_prisma_order    ON prisma_reservasi("order")`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sap_pr          ON sap_pr(pr)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_kumpulan_code   ON kumpulan_summary(code_tracking)`);

  // Seed jika kosong
  const { rows } = await query('SELECT COUNT(*) as c FROM taex_reservasi');
  if (parseInt(rows[0].c) === 0) {
    console.log('🌱 Seeding default data...');
    await withTransaction(async (client) => {
      for (const r of SEED_DATA) {
        await client.query(
          `INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r.equipment,r.order,r.revision,r.material,r.itm,r.material_description,
           r.qty_reqmts,r.qty_stock,r.pr,r.item,r.qty_pr,r.po,r.po_date,r.qty_deliv,r.delivery_date]
        );
      }
    });
    console.log(`✅ Seeded ${SEED_DATA.length} rows`);
  }
  console.log('✅ Migration complete');
}

// ─────────────────────────────────────────────
// ROW MAPPERS
// ─────────────────────────────────────────────
const n = v => v !== null && v !== undefined ? Number(v) : null;
const mapTaex = r => ({
  ID: r.id, Equipment: r.equipment, Order: r.order, Revision: r.revision,
  Material: r.material, Itm: r.itm, Material_Description: r.material_description,
  Qty_Reqmts: n(r.qty_reqmts), Qty_Stock: n(r.qty_stock),
  PR: r.pr, Item: r.item, Qty_PR: n(r.qty_pr),
  PO: r.po, PO_Date: r.po_date, Qty_Deliv: n(r.qty_deliv), Delivery_Date: r.delivery_date,
});
const mapPrisma = r => ({
  ID: r.id, Equipment: r.equipment, Order: r.order, Revision: r.revision,
  Material: r.material, Itm: r.itm, Material_Description: r.material_description,
  Qty_Reqmts: n(r.qty_reqmts), Qty_StockOnhand: n(r.qty_stock_onhand),
  PR_Prisma: r.pr_prisma, Item_Prisma: r.item_prisma, Qty_PR_Prisma: n(r.qty_pr_prisma),
  CodeKertasKerja: r.code_kertas_kerja,
});
const mapKumpulan = r => ({
  ID: r.id, Material: r.material, Material_Description: r.material_description,
  Qty_Req: n(r.qty_req), Qty_Stock: n(r.qty_stock),
  Qty_PR: n(r.qty_pr), Qty_To_PR: n(r.qty_to_pr), CodeTracking: r.code_tracking,
});
const mapSAP = r => ({
  ID: r.id, Material: r.material, Material_Description: r.material_description,
  PR: r.pr, Item: r.item, Qty_PR: n(r.qty_pr), Tracking: r.tracking,
});

// ─────────────────────────────────────────────
// STATE HELPERS
// ─────────────────────────────────────────────
async function getState(key) {
  const { rows } = await query('SELECT value FROM app_state WHERE key=$1', [key]);
  return rows.length ? JSON.parse(rows[0].value) : null;
}
async function setState(key, value) {
  await query(
    `INSERT INTO app_state(key,value,updated_at) VALUES($1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, JSON.stringify(value)]
  );
}

// ─────────────────────────────────────────────
// BULK HELPERS
// ─────────────────────────────────────────────
async function bulkReplaceTaex(client, rows) {
  await client.query('DELETE FROM taex_reservasi');
  for (const r of rows) {
    await client.query(
      `INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
       r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null]
    );
  }
}
async function bulkReplacePrisma(client, rows) {
  await client.query('DELETE FROM prisma_reservasi');
  for (const r of rows) {
    await client.query(
      `INSERT INTO prisma_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock_onhand,pr_prisma,item_prisma,qty_pr_prisma,code_kertas_kerja)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_StockOnhand??null,
       r.PR_Prisma||null,r.Item_Prisma||null,r.Qty_PR_Prisma??null,r.CodeKertasKerja||null]
    );
  }
}
async function bulkReplaceKumpulan(client, rows) {
  await client.query('DELETE FROM kumpulan_summary');
  for (const r of rows) {
    await client.query(
      `INSERT INTO kumpulan_summary (material,material_description,qty_req,qty_stock,qty_pr,qty_to_pr,code_tracking)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.Material||null,r.Material_Description||null,r.Qty_Req||0,r.Qty_Stock||0,r.Qty_PR??null,r.Qty_To_PR??null,r.CodeTracking||null]
    );
  }
}
async function bulkReplacePR(client, rows) {
  await client.query('DELETE FROM sap_pr');
  for (const r of rows) {
    await client.query(
      `INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.Material||null,r.Material_Description||null,r.PR||null,r.Item||null,r.Qty_PR??null,r.Tracking||null]
    );
  }
}

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// Health
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'postgresql', time: new Date().toISOString() });
  } catch(e) { res.status(500).json({ status: 'error', error: e.message }); }
});

// Load all
app.get('/api/data', async (req, res) => {
  try {
    const [taex, prisma, kumpulan, pr, kkCurrent, kkCounter, prCounter, summaryData] = await Promise.all([
      query('SELECT * FROM taex_reservasi ORDER BY id'),
      query('SELECT * FROM prisma_reservasi ORDER BY id'),
      query('SELECT * FROM kumpulan_summary ORDER BY id'),
      query('SELECT * FROM sap_pr ORDER BY id'),
      getState('kk_current'),
      getState('kk_counter'),
      getState('pr_counter'),
      getState('summary_current'),
    ]);
    res.json({
      taexData:            taex.rows.map(mapTaex),
      prismaReservasiData: prisma.rows.map(mapPrisma),
      kumpulanData:        kumpulan.rows.map(mapKumpulan),
      prData:              pr.rows.map(mapSAP),
      kkData:              kkCurrent ? kkCurrent.data : [],
      kkCode:              kkCurrent ? kkCurrent.code : null,
      summaryData:         summaryData || [],
      kkCounter:           kkCounter || 0,
      prCounter:           prCounter || 0,
      lastUpdated:         new Date().toISOString(),
    });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── TAEX ──
app.get('/api/taex', async (req, res) => {
  try { const { rows } = await query('SELECT * FROM taex_reservasi ORDER BY id'); res.json(rows.map(mapTaex)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/taex', async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await query(
      `INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
       r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.post('/api/taex/replace', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceTaex(c, rows));
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.post('/api/taex/append', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
           r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
           r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null]
        );
      }
    });
    const { rows: all } = await query('SELECT * FROM taex_reservasi ORDER BY id');
    res.json({ ok: true, count: rows.length, data: all.map(mapTaex) });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.put('/api/taex', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceTaex(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── PRISMA ──
app.get('/api/prisma', async (req, res) => {
  try { const { rows } = await query('SELECT * FROM prisma_reservasi ORDER BY id'); res.json(rows.map(mapPrisma)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/prisma', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePrisma(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── KUMPULAN ──
app.get('/api/kumpulan', async (req, res) => {
  try { const { rows } = await query('SELECT * FROM kumpulan_summary ORDER BY id'); res.json(rows.map(mapKumpulan)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/kumpulan', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceKumpulan(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── SAP PR ──
app.get('/api/pr', async (req, res) => {
  try { const { rows } = await query('SELECT * FROM sap_pr ORDER BY id'); res.json(rows.map(mapSAP)); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/pr/replace', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePR(c, rows));
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.post('/api/pr/append', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO sap_pr (material,material_description,pr,item,qty_pr,tracking) VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.Material||null,r.Material_Description||null,r.PR||null,r.Item||null,r.Qty_PR??null,r.Tracking||null]
        );
      }
    });
    const { rows: all } = await query('SELECT * FROM sap_pr ORDER BY id');
    res.json({ ok: true, count: rows.length, data: all.map(mapSAP) });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});
app.put('/api/pr', async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePR(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── APP STATE ──
app.get('/api/state/:key', async (req, res) => {
  try { res.json({ key: req.params.key, value: await getState(req.params.key) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/state/:key', async (req, res) => {
  try { await setState(req.params.key, req.body.value); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RESET ALL ──
app.post('/api/reset', async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM taex_reservasi');
      await client.query('DELETE FROM prisma_reservasi');
      await client.query('DELETE FROM kumpulan_summary');
      await client.query('DELETE FROM sap_pr');
      await client.query('DELETE FROM app_state');
      await client.query('ALTER SEQUENCE taex_reservasi_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE prisma_reservasi_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE kumpulan_summary_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE sap_pr_id_seq RESTART WITH 1');
    });
    await migrate();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── BULK SAVE ──
app.post('/api/save', async (req, res) => {
  try {
    const { taexData, prismaReservasiData, kumpulanData, prData, kkData, kkCode, summaryData, kkCounter, prCounter } = req.body;
    await withTransaction(async (client) => {
      if (Array.isArray(taexData))            await bulkReplaceTaex(client, taexData);
      if (Array.isArray(prismaReservasiData)) await bulkReplacePrisma(client, prismaReservasiData);
      if (Array.isArray(kumpulanData))        await bulkReplaceKumpulan(client, kumpulanData);
      if (Array.isArray(prData))              await bulkReplacePR(client, prData);
    });
    if (kkData !== undefined || kkCode !== undefined) await setState('kk_current', { data: kkData||[], code: kkCode||null });
    if (summaryData !== undefined) await setState('summary_current', summaryData||[]);
    if (kkCounter !== undefined)   await setState('kk_counter', kkCounter);
    if (prCounter !== undefined)   await setState('pr_counter', prCounter);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ── SERVE SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START — migrate dulu baru listen
// ─────────────────────────────────────────────
migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 PRISMA TA-ex System running on port ${PORT}`);
      console.log(`🐘 Database: PostgreSQL`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });