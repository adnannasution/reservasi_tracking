const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────────
// DATABASE — PostgreSQL
// Set DATABASE_URL di environment variables GCP Cloud Run
// ─────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: false  → untuk Unix socket (Cloud SQL via socket) ✅
  // ssl: true   → set DB_SSL=true di env jika koneksi TCP
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
// SEED DATA — kosong, tidak ada data default
// ─────────────────────────────────────────────
const SEED_DATA = [];

// ─────────────────────────────────────────────
// AUTO MIGRATE
// ─────────────────────────────────────────────
async function migrate() {
  console.log('🔄 Running PostgreSQL migration...');

  await query(`
    CREATE TABLE IF NOT EXISTS taex_reservasi (
      id                   SERIAL PRIMARY KEY,
      plant                TEXT,
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
      sloc                 TEXT,
      del                  TEXT,
      fis                  TEXT,
      ict                  TEXT,
      pg                   TEXT,
      recipient            TEXT,
      unloading_point      TEXT,
      reqmts_date          TEXT,
      qty_f_avail_check    NUMERIC,
      qty_withdrawn        NUMERIC,
      uom                  TEXT,
      gl_acct              TEXT,
      res_price            NUMERIC,
      res_per              NUMERIC,
      res_curr             TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE untuk migrasi DB yang sudah ada (aman jika kolom sudah ada)
  const newCols = [
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS sloc TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS del TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS fis TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS ict TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS pg TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS recipient TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS unloading_point TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS reqmts_date TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS qty_f_avail_check NUMERIC`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS qty_withdrawn NUMERIC`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS uom TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS gl_acct TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS res_price NUMERIC`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS res_per NUMERIC`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS res_curr TEXT`,
  ];
  for (const sql of newCols) { await query(sql); }

  await query(`
    CREATE TABLE IF NOT EXISTS prisma_reservasi (
      id                   SERIAL PRIMARY KEY,
      plant                TEXT,
      equipment            TEXT,
      revision             TEXT,
      "order"              TEXT,
      reservno             TEXT,
      itm                  TEXT,
      material             TEXT,
      material_description TEXT,
      del                  TEXT,
      fis                  TEXT,
      ict                  TEXT,
      pg                   TEXT,
      recipient            TEXT,
      unloading_point      TEXT,
      reqmts_date          TEXT,
      qty_reqmts           NUMERIC DEFAULT 0,
      uom                  TEXT,
      pr_prisma            TEXT,
      item_prisma          TEXT,
      qty_pr_prisma        NUMERIC,
      qty_stock_onhand     NUMERIC,
      code_kertas_kerja    TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE prisma_reservasi - migrasi untuk DB yang sudah ada
  const prismaCols = [
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS reservno TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS del TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS fis TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS ict TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS pg TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS recipient TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS unloading_point TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS reqmts_date TEXT`,
    `ALTER TABLE prisma_reservasi ADD COLUMN IF NOT EXISTS uom TEXT`,
  ];
  for (const sql of prismaCols) { await query(sql); }

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
      plant                TEXT,
      pr                   TEXT,
      item                 TEXT,
      material             TEXT,
      material_description TEXT,
      d                    TEXT,
      r                    TEXT,
      pgr                  TEXT,
      tracking_no          TEXT,
      qty_pr               NUMERIC,
      un                   TEXT,
      req_date             TEXT,
      valn_price           NUMERIC,
      pr_curr              TEXT,
      pr_per               NUMERIC,
      release_date         TEXT,
      tracking             TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE sap_pr - migrasi untuk DB yang sudah ada
  const sapCols = [
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS d TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS r TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS pgr TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS tracking_no TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS un TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS req_date TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS valn_price NUMERIC`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS pr_curr TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS pr_per NUMERIC`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS release_date TEXT`,
  ];
  for (const sql of sapCols) { await query(sql); }

  await query(`
    CREATE TABLE IF NOT EXISTS sap_po (
      id             SERIAL PRIMARY KEY,
      plnt           TEXT,
      purchreq       TEXT,
      item           TEXT,
      material       TEXT,
      short_text     TEXT,
      po             TEXT,
      po_item        TEXT,
      d              TEXT,
      dci            TEXT,
      pgr            TEXT,
      doc_date       TEXT,
      po_quantity    NUMERIC,
      qty_delivered  NUMERIC,
      deliv_date     TEXT,
      oun            TEXT,
      net_price      NUMERIC,
      crcy           TEXT,
      per            NUMERIC,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE sap_po - migrasi untuk DB yang sudah ada
  const sapPoCols = [
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS plnt TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS purchreq TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS item TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS material TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS short_text TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS po TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS po_item TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS d TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS dci TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS pgr TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS doc_date TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS po_quantity NUMERIC`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS qty_delivered NUMERIC`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS deliv_date TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS oun TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS net_price NUMERIC`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS crcy TEXT`,
    `ALTER TABLE sap_po ADD COLUMN IF NOT EXISTS per NUMERIC`,
  ];
  for (const sql of sapPoCols) { await query(sql); }


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
  await query(`CREATE INDEX IF NOT EXISTS idx_sap_po_po      ON sap_po(po)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sap_po_purchreq ON sap_po(purchreq)`);

  // Seed hanya jika SEED_DATA tidak kosong
  if (SEED_DATA.length > 0) {
    const { rows } = await query('SELECT COUNT(*) as c FROM taex_reservasi');
    if (parseInt(rows[0].c) === 0) {
      console.log('🌱 Seeding default data...');
      await withTransaction(async (client) => {
        for (const r of SEED_DATA) {
          await client.query(
            `INSERT INTO taex_reservasi (equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
            [r.equipment,r.order,r.revision,r.material,r.itm,r.material_description,
             r.qty_reqmts,r.qty_stock,r.pr,r.item,r.qty_pr,r.po,r.po_date,r.qty_deliv,r.delivery_date,
             null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]
          );
        }
      });
      console.log(`✅ Seeded ${SEED_DATA.length} rows`);
    }
  }
  console.log('✅ Migration complete');
}

// ─────────────────────────────────────────────
// ROW MAPPERS
// ─────────────────────────────────────────────
const n = v => v !== null && v !== undefined ? Number(v) : null;
const mapTaex = r => ({
  ID: r.id, Plant: r.plant, Equipment: r.equipment, Order: r.order, Revision: r.revision,
  Material: r.material, Itm: r.itm, Material_Description: r.material_description,
  Qty_Reqmts: n(r.qty_reqmts), Qty_Stock: n(r.qty_stock),
  PR: r.pr, Item: r.item, Qty_PR: n(r.qty_pr),
  PO: r.po, PO_Date: r.po_date, Qty_Deliv: n(r.qty_deliv), Delivery_Date: r.delivery_date,
  SLoc: r.sloc, Del: r.del, FIs: r.fis, Ict: r.ict, PG: r.pg,
  Recipient: r.recipient, Unloading_point: r.unloading_point, Reqmts_Date: r.reqmts_date,
  Qty_f_avail_check: n(r.qty_f_avail_check), Qty_Withdrawn: n(r.qty_withdrawn),
  UoM: r.uom, GL_Acct: r.gl_acct,
  Res_Price: n(r.res_price), Res_per: n(r.res_per), Res_Curr: r.res_curr,
});
const mapPrisma = r => ({
  ID: r.id, Plant: r.plant, Equipment: r.equipment, Revision: r.revision,
  Order: r.order, Reservno: r.reservno, Itm: r.itm,
  Material: r.material, Material_Description: r.material_description,
  Del: r.del, FIs: r.fis, Ict: r.ict, PG: r.pg,
  Recipient: r.recipient, Unloading_point: r.unloading_point, Reqmts_Date: r.reqmts_date,
  Qty_Reqmts: n(r.qty_reqmts), UoM: r.uom,
  PR_Prisma: r.pr_prisma, Item_Prisma: r.item_prisma, Qty_PR_Prisma: n(r.qty_pr_prisma),
  Qty_StockOnhand: n(r.qty_stock_onhand),
  CodeKertasKerja: r.code_kertas_kerja,
});
const mapKumpulan = r => ({
  ID: r.id, Material: r.material, Material_Description: r.material_description,
  Qty_Req: n(r.qty_req), Qty_Stock: n(r.qty_stock),
  Qty_PR: n(r.qty_pr), Qty_To_PR: n(r.qty_to_pr), CodeTracking: r.code_tracking,
});
const mapSAP = r => ({
  ID: r.id, Plant: r.plant,
  PR: r.pr, Item: r.item,
  Material: r.material, Material_Description: r.material_description,
  D: r.d, R: r.r, PGr: r.pgr, TrackingNo: r.tracking_no,
  Qty_PR: n(r.qty_pr), Un: r.un, Req_Date: r.req_date,
  Valn_price: n(r.valn_price), PR_Curr: r.pr_curr, PR_Per: n(r.pr_per),
  Release_Date: r.release_date,
  Tracking: r.tracking,
});


const mapPO = r => ({
  ID: r.id, Plnt: r.plnt,
  Purchreq: r.purchreq, Item: r.item,
  Material: r.material, Short_Text: r.short_text,
  PO: r.po, PO_Item: r.po_item,
  D: r.d, DCI: r.dci, PGr: r.pgr,
  Doc_Date: r.doc_date,
  PO_Quantity: n(r.po_quantity), Qty_Delivered: n(r.qty_delivered),
  Deliv_Date: r.deliv_date, OUn: r.oun,
  Net_Price: n(r.net_price), Crcy: r.crcy, Per: n(r.per),
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
      `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
       r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
       r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
       r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
       r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
       r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null]
    );
  }
}
async function bulkReplacePrisma(client, rows) {
  await client.query('DELETE FROM prisma_reservasi');
  for (const r of rows) {
    await client.query(
      `INSERT INTO prisma_reservasi (plant,equipment,revision,"order",reservno,itm,material,material_description,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_reqmts,uom,pr_prisma,item_prisma,qty_pr_prisma,qty_stock_onhand,code_kertas_kerja)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [r.Plant||null,r.Equipment||null,r.Revision||null,r.Order||null,r.Reservno||null,r.Itm||null,
       r.Material||null,r.Material_Description||null,
       r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
       r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
       r.Qty_Reqmts||0,r.UoM||null,
       r.PR_Prisma||null,r.Item_Prisma||null,r.Qty_PR_Prisma??null,
       r.Qty_StockOnhand??null,r.CodeKertasKerja||null]
    );
  }
}
async function bulkReplaceKumpulan(client, rows) {
  await client.query('DELETE FROM kumpulan_summary');
  for (const r of rows) {
    await client.query(
      `INSERT INTO kumpulan_summary (material,material_description,qty_req,qty_stock,qty_pr,qty_to_pr,code_tracking)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.Material||null,r.Material_Description||null,r.Qty_Req||0,r.Qty_Stock||0,
       r.Qty_PR??null,r.Qty_To_PR??null,r.CodeTracking||null]
    );
  }
}
async function bulkReplacePR(client, rows) {
  await client.query('DELETE FROM sap_pr');
  for (const r of rows) {
    await client.query(
      `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [r.Plant||null,r.PR||null,r.Item||null,r.Material||null,r.Material_Description||null,
       r.D||null,r.R||null,r.PGr||null,r.TrackingNo||null,
       r.Qty_PR??null,r.Un||null,r.Req_Date||null,
       r.Valn_price??null,r.PR_Curr||null,r.PR_Per??null,r.Release_Date||null,
       r.Tracking||null]
    );
  }
}

async function bulkReplacePO(client, rows) {
  await client.query('DELETE FROM sap_po');
  for (const r of rows) {
    await client.query(
      `INSERT INTO sap_po (plnt,purchreq,item,material,short_text,po,po_item,d,dci,pgr,doc_date,po_quantity,qty_delivered,deliv_date,oun,net_price,crcy,per)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [r.Plnt||null,r.Purchreq||null,r.Item||null,r.Material||null,r.Short_Text||null,
       r.PO||null,r.PO_Item||null,r.D||null,r.DCI||null,r.PGr||null,r.Doc_Date||null,
       r.PO_Quantity??null,r.Qty_Delivered??null,r.Deliv_Date||null,r.OUn||null,
       r.Net_Price??null,r.Crcy||null,r.Per??null]
    );
  }
}

// ─────────────────────────────────────────────
// GOOGLE CLOUD STORAGE + MULTER
// Set GCS_BUCKET di environment variables Cloud Run
// ─────────────────────────────────────────────
const gcsStorage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'reservasi-tracking-uploads';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // max 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya file Excel (.xlsx/.xls) yang diizinkan'));
  },
});

// Simpan file ke GCS sebagai backup
async function uploadToGCS(buffer, originalname) {
  try {
    const bucket = gcsStorage.bucket(BUCKET);
    const filename = `uploads/${Date.now()}_${originalname}`;
    const file = bucket.file(filename);
    await file.save(buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    console.log(`📁 File disimpan ke GCS: ${filename}`);
    return filename;
  } catch (e) {
    console.warn('⚠️ GCS upload gagal (tidak kritis):', e.message);
    return null;
  }
}

// Proses Excel per batch 500 baris — hemat memory
async function processExcelBatch(buffer, type) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) throw new Error('File Excel kosong atau format tidak sesuai');

  const BATCH_SIZE = 500;
  let total = 0;

  await withTransaction(async (client) => {
    if (type === 'taex')   await client.query('DELETE FROM taex_reservasi');
    if (type === 'prisma') await client.query('DELETE FROM prisma_reservasi');
    if (type === 'pr')     await client.query('DELETE FROM sap_pr');
    if (type === 'po')     await client.query('DELETE FROM sap_po');

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      for (const r of batch) {
        if (type === 'taex') {
          await client.query(
            `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
            [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
             r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
             r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
             r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
             r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
             r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
             r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null]
          );
        }
        if (type === 'prisma') {
          await client.query(
            `INSERT INTO prisma_reservasi (plant,equipment,revision,"order",reservno,itm,material,material_description,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_reqmts,uom,pr_prisma,item_prisma,qty_pr_prisma,qty_stock_onhand,code_kertas_kerja)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
            [r.Plant||null,r.Equipment||null,r.Revision||null,r.Order||null,r.Reservno||null,r.Itm||null,
             r.Material||null,r.Material_Description||null,
             r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
             r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
             r.Qty_Reqmts||0,r.UoM||null,
             r.PR_Prisma||null,r.Item_Prisma||null,r.Qty_PR_Prisma??null,
             r.Qty_StockOnhand??null,r.CodeKertasKerja||null]
          );
        }
        if (type === 'po') {
          await client.query(
            `INSERT INTO sap_po (plnt,purchreq,item,material,short_text,po,po_item,d,dci,pgr,doc_date,po_quantity,qty_delivered,deliv_date,oun,net_price,crcy,per)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [r.Plnt||null,r.Purchreq||null,r.Item||null,r.Material||null,r.Short_Text||r['Short Text']||null,
             r.PO||null,r.PO_Item||null,r.D||null,r.DCI||null,r.PGr||null,r.Doc_Date||r['Doc. Date']||null,
             r.PO_Quantity??r['PO Quantity']??null,r.Qty_Delivered??r['Qty Delivered']??null,
             r.Deliv_Date||r['Deliv. Date']||null,r.OUn||null,
             r.Net_Price??r['Net Price']??null,r.Crcy||null,r.Per??null]
          );
        }
        if (type === 'pr') {
          await client.query(
            `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [r.Plant||null,r.PR||r.Purchreq||null,r.Item||null,r.Material||null,r.Material_Description||r.Material_description||null,
             r.D||null,r.R||null,r.PGr||null,r.TrackingNo||r.TrackingNo||null,
             r.Qty_PR??r.Qty_Purchreq??null,r.Un||null,r.Req_Date||r.Reqdate||null,
             r.Valn_price??null,r.PR_Curr||null,r.PR_Per??null,r.Release_Date||null,
             r.Tracking||r.TrackingNo||null]
          );
        }
      }
      total += batch.length;
      console.log(`✅ Batch ${type}: ${total}/${rows.length} baris`);
    }
  });

  return { total, rowCount: rows.length };
}

// ─────────────────────────────────────────────
// SECURITY — API KEY MIDDLEWARE
// Set API_KEY di environment variables Cloud Run
// ─────────────────────────────────────────────
const API_KEY = process.env.API_KEY || null;

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: API key tidak valid' });
  }
  next();
}

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// Health — tanpa auth (untuk monitoring GCP)
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'postgresql', time: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ status: 'error', error: 'Database connection failed' });
  }
});

// Load all data
app.get('/api/data', requireApiKey, async (req, res) => {
  try {
    const [taex, prisma, kumpulan, pr, po, kkCurrent, kkCounter, prCounter, summaryData] = await Promise.all([
      query('SELECT * FROM taex_reservasi ORDER BY id'),
      query('SELECT * FROM prisma_reservasi ORDER BY id'),
      query('SELECT * FROM kumpulan_summary ORDER BY id'),
      query('SELECT * FROM sap_pr ORDER BY id'),
      query('SELECT * FROM sap_po ORDER BY id'),
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
      orderData:           [],
      poData:              po.rows.map(mapPO),
      kkData:              kkCurrent ? kkCurrent.data : [],
      kkCode:              kkCurrent ? kkCurrent.code : null,
      summaryData:         summaryData || [],
      kkCounter:           kkCounter || 0,
      prCounter:           prCounter || 0,
      lastUpdated:         new Date().toISOString(),
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal memuat data' }); }
});

// ── TAEX ──
app.get('/api/taex', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM taex_reservasi ORDER BY id'); res.json(rows.map(mapTaex)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data taex' }); }
});
app.post('/api/taex', requireApiKey, async (req, res) => {
  try {
    const r = req.body;
    const { rows } = await query(
      `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING id`,
      [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
       r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
       r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
       r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
       r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
       r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal menyimpan data' }); }
});
app.post('/api/taex/replace', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceTaex(c, rows));
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal replace data' }); }
});
app.post('/api/taex/append', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
          [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
           r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
           r.PR||null,r.Item||null,r.Qty_PR??null,r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
           r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
           r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
           r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
           r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null]
        );
      }
    });
    const { rows: all } = await query('SELECT * FROM taex_reservasi ORDER BY id');
    res.json({ ok: true, count: rows.length, data: all.map(mapTaex) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal append data' }); }
});
app.put('/api/taex', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceTaex(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal update data' }); }
});
// Upload Excel TA-ex via GCS
app.post('/api/taex/upload', requireApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    const gcsPath = await uploadToGCS(req.file.buffer, req.file.originalname);
    const result = await processExcelBatch(req.file.buffer, 'taex');
    res.json({ ok: true, ...result, gcsPath });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message || 'Gagal upload file taex' }); }
});

// ── PRISMA ──
app.get('/api/prisma', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM prisma_reservasi ORDER BY id'); res.json(rows.map(mapPrisma)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data prisma' }); }
});
app.put('/api/prisma', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePrisma(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal update data prisma' }); }
});
// Upload Excel PRISMA via GCS
app.post('/api/prisma/upload', requireApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    const gcsPath = await uploadToGCS(req.file.buffer, req.file.originalname);
    const result = await processExcelBatch(req.file.buffer, 'prisma');
    res.json({ ok: true, ...result, gcsPath });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message || 'Gagal upload file prisma' }); }
});

// ── KUMPULAN ──
app.get('/api/kumpulan', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM kumpulan_summary ORDER BY id'); res.json(rows.map(mapKumpulan)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data kumpulan' }); }
});
app.put('/api/kumpulan', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplaceKumpulan(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal update data kumpulan' }); }
});

// ── SAP PR ──
app.get('/api/pr', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM sap_pr ORDER BY id'); res.json(rows.map(mapSAP)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data SAP PR' }); }
});
app.post('/api/pr/replace', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePR(c, rows));
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal replace data SAP PR' }); }
});
app.post('/api/pr/append', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [r.Plant||null,r.PR||null,r.Item||null,r.Material||null,r.Material_Description||null,
           r.D||null,r.R||null,r.PGr||null,r.TrackingNo||null,
           r.Qty_PR??null,r.Un||null,r.Req_Date||null,
           r.Valn_price??null,r.PR_Curr||null,r.PR_Per??null,r.Release_Date||null,
           r.Tracking||null]
        );
      }
    });
    const { rows: all } = await query('SELECT * FROM sap_pr ORDER BY id');
    res.json({ ok: true, count: rows.length, data: all.map(mapSAP) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal append data SAP PR' }); }
});
app.put('/api/pr', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePR(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal update data SAP PR' }); }
});
// Upload Excel SAP PR via GCS
app.post('/api/pr/upload', requireApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    const gcsPath = await uploadToGCS(req.file.buffer, req.file.originalname);
    const result = await processExcelBatch(req.file.buffer, 'pr');
    res.json({ ok: true, ...result, gcsPath });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message || 'Gagal upload file SAP PR' }); }
});


// ── SAP PO ──
app.get('/api/po', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM sap_po ORDER BY id'); res.json(rows.map(mapPO)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data SAP PO' }); }
});
app.post('/api/po/replace', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePO(c, rows));
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal replace data SAP PO' }); }
});
app.post('/api/po/append', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      for (const r of rows) {
        await client.query(
          `INSERT INTO sap_po (plnt,purchreq,item,material,short_text,po,po_item,d,dci,pgr,doc_date,po_quantity,qty_delivered,deliv_date,oun,net_price,crcy,per)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [r.Plnt||null,r.Purchreq||null,r.Item||null,r.Material||null,r.Short_Text||null,
           r.PO||null,r.PO_Item||null,r.D||null,r.DCI||null,r.PGr||null,r.Doc_Date||null,
           r.PO_Quantity??null,r.Qty_Delivered??null,r.Deliv_Date||null,r.OUn||null,
           r.Net_Price??null,r.Crcy||null,r.Per??null]
        );
      }
    });
    const { rows: all } = await query('SELECT * FROM sap_po ORDER BY id');
    res.json({ ok: true, count: rows.length, data: all.map(mapPO) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal append data SAP PO' }); }
});
app.put('/api/po', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (c) => bulkReplacePO(c, rows));
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal update data SAP PO' }); }
});
// Upload Excel SAP PO via GCS
app.post('/api/po/upload', requireApiKey, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });
    const gcsPath = await uploadToGCS(req.file.buffer, req.file.originalname);
    const result = await processExcelBatch(req.file.buffer, 'po');
    res.json({ ok: true, ...result, gcsPath });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message || 'Gagal upload file SAP PO' }); }
});

// ── APP STATE ──
app.get('/api/state/:key', requireApiKey, async (req, res) => {
  try { res.json({ key: req.params.key, value: await getState(req.params.key) }); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat state' }); }
});
app.post('/api/state/:key', requireApiKey, async (req, res) => {
  try { await setState(req.params.key, req.body.value); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: 'Gagal menyimpan state' }); }
});

// ── RESET ALL ──
app.post('/api/reset', requireApiKey, async (req, res) => {
  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM taex_reservasi');
      await client.query('DELETE FROM prisma_reservasi');
      await client.query('DELETE FROM kumpulan_summary');
      await client.query('DELETE FROM sap_pr');
      await client.query('DELETE FROM sap_po');
      await client.query('DELETE FROM app_state');
      await client.query('ALTER SEQUENCE taex_reservasi_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE prisma_reservasi_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE kumpulan_summary_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE sap_pr_id_seq RESTART WITH 1');
      await client.query('ALTER SEQUENCE sap_po_id_seq RESTART WITH 1');
    });
    await migrate();
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal reset data' }); }
});

// ── BULK SAVE ──
app.post('/api/save', requireApiKey, async (req, res) => {
  try {
    const { taexData, prismaReservasiData, kumpulanData, prData, poData, kkData, kkCode, summaryData, kkCounter, prCounter } = req.body;
    await withTransaction(async (client) => {
      if (Array.isArray(taexData))            await bulkReplaceTaex(client, taexData);
      if (Array.isArray(prismaReservasiData)) await bulkReplacePrisma(client, prismaReservasiData);
      if (Array.isArray(kumpulanData))        await bulkReplaceKumpulan(client, kumpulanData);
      if (Array.isArray(prData))              await bulkReplacePR(client, prData);
      if (Array.isArray(poData))              await bulkReplacePO(client, poData);
    });
    if (kkData !== undefined || kkCode !== undefined) await setState('kk_current', { data: kkData||[], code: kkCode||null });
    if (summaryData !== undefined) await setState('summary_current', summaryData||[]);
    if (kkCounter !== undefined)   await setState('kk_counter', kkCounter);
    if (prCounter !== undefined)   await setState('pr_counter', prCounter);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal menyimpan data' }); }
});

// ── SERVE SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 PRISMA TA-ex System running on port ${PORT}`);
      console.log(`🐘 Database: PostgreSQL`);
      console.log(`🪣 GCS Bucket: ${BUCKET}`);
      console.log(`🔐 API Key: ${API_KEY ? 'AKTIF ✅' : 'TIDAK AKTIF ⚠️  (set API_KEY di env)'}`);
      console.log(`🌍 CORS Origin: ${ALLOWED_ORIGIN}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });