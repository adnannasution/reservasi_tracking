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
      reservno             TEXT,
      cost_ctrs            TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE untuk migrasi DB yang sudah ada (aman jika kolom sudah ada)
  const newCols = [
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS reservno TEXT`,
    `ALTER TABLE taex_reservasi ADD COLUMN IF NOT EXISTS cost_ctrs TEXT`,
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
      plant                TEXT,
      equipment            TEXT,
      revision             TEXT,
      "order"              TEXT,
      reservno             TEXT,
      itm                  TEXT,
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

  // ALTER TABLE kumpulan_summary - migrasi untuk DB yang sudah ada
  const ksCols = [
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS equipment TEXT`,
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS revision TEXT`,
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS "order" TEXT`,
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS reservno TEXT`,
    `ALTER TABLE kumpulan_summary ADD COLUMN IF NOT EXISTS itm TEXT`,
  ];
  for (const sql of ksCols) { await query(sql); }

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
      s                    TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE sap_pr - migrasi untuk DB yang sudah ada
  const sapCols = [
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE sap_pr ADD COLUMN IF NOT EXISTS s TEXT`,
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
    CREATE TABLE IF NOT EXISTS work_order (
      id                 SERIAL PRIMARY KEY,
      plant              TEXT,
      "order"            TEXT,
      superior_order     TEXT,
      notification       TEXT,
      created_on         TEXT,
      description        TEXT,
      revision           TEXT,
      equipment          TEXT,
      system_status      TEXT,
      user_status        TEXT,
      funct_location     TEXT,
      location           TEXT,
      wbs_ord_header     TEXT,
      cost_center        TEXT,
      total_plan_cost    NUMERIC,
      total_act_cost     NUMERIC,
      planner_group      TEXT,
      main_work_ctr      TEXT,
      entry_by           TEXT,
      changed_by         TEXT,
      basic_start_date   TEXT,
      basic_finish_date  TEXT,
      actual_release     TEXT,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ALTER TABLE work_order — migrasi DB lama
  const woMigrations = [
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS plant TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS superior_order TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS notification TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS created_on TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS funct_location TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS location TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS wbs_ord_header TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS cost_center TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS total_plan_cost NUMERIC`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS total_act_cost NUMERIC`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS planner_group TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS main_work_ctr TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS entry_by TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS changed_by TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS basic_start_date TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS basic_finish_date TEXT`,
    `ALTER TABLE work_order ADD COLUMN IF NOT EXISTS actual_release TEXT`,
  ];
  for (const sql of woMigrations) { await query(sql); }

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
// ── HEADER ALIAS MAP untuk normalisasi kolom Excel (format baru → field internal) ──
const TAEX_HEADER_MAP = {
  // Plant
  'plpl': 'Plant', 'pl': 'Plant', 'plant': 'Plant',
  // Equipment
  'equipment': 'Equipment',
  // Order
  'order': 'Order',
  // Reservasi No
  'reserv.no.': 'Reservno', 'reserv no': 'Reservno', 'reservno': 'Reservno',
  'reserv_no': 'Reservno', 'reservation no': 'Reservno',
  // Revision
  'revision': 'Revision',
  // Material
  'material': 'Material',
  // Itm
  'itm': 'Itm', 'item no': 'Itm',
  // Material Description
  'material description': 'Material_Description',
  'material_description': 'Material_Description',
  // Qty Reqmts
  'reqmt qty': 'Qty_Reqmts', 'qty_reqmts': 'Qty_Reqmts',
  'reqmts qty': 'Qty_Reqmts', 'qty reqmts': 'Qty_Reqmts',
  // Qty Stock
  'qty_stock': 'Qty_Stock', 'qty stock': 'Qty_Stock', 'qty_stock_onhand': 'Qty_Stock',
  // PR
  'pr': 'PR', 'purchase req.no.': 'PR', 'purchreq': 'PR',
  // Item (PR Item)
  'item': 'Item', 'it': 'Item',
  // Qty PR
  'qty_pr': 'Qty_PR', 'qty pr': 'Qty_PR',
  // Cost Ctrs
  'cost ctrs': 'Cost_Ctrs', 'cost_ctrs': 'Cost_Ctrs', 'costctrs': 'Cost_Ctrs',
  'cost center': 'Cost_Ctrs', 'cost ctr': 'Cost_Ctrs',
  // SLoc
  'sloc': 'SLoc', 'storage location': 'SLoc',
  // Del
  'del': 'Del', 'deletion indicator': 'Del',
  // FIs
  'fis': 'FIs', 'fi': 'FIs',
  // Ict / ICt
  'ict': 'Ict', 'ic': 'Ict', 'ict.': 'Ict',
  // PG
  'pg': 'PG',
  // Recipient
  'recipient': 'Recipient',
  // Unloading Point
  'unloading point': 'Unloading_point', 'unloading_point': 'Unloading_point',
  // Reqmt Date
  'reqmt date': 'Reqmts_Date', 'reqmts date': 'Reqmts_Date',
  'reqmts_date': 'Reqmts_Date', 'requirements date': 'Reqmts_Date',
  // Qty f. avail.check
  'qty. f. avail.check': 'Qty_f_avail_check', 'qty_f_avail_check': 'Qty_f_avail_check',
  'qty f avail check': 'Qty_f_avail_check', 'qty avail': 'Qty_f_avail_check',
  // Qty Withdrawn
  'qty withdrawn': 'Qty_Withdrawn', 'qty_withdrawn': 'Qty_Withdrawn',
  // BUn / UoM
  'bun': 'UoM', 'uom': 'UoM', 'un': 'UoM', 'base unit': 'UoM',
  // G/L Acct
  'g/l acct': 'GL_Acct', 'gl_acct': 'GL_Acct', 'gl acct': 'GL_Acct',
  // Price / Res_Price
  'price': 'Res_Price', 'res_price': 'Res_Price', 'res price': 'Res_Price',
  // per / Res_per
  'per': 'Res_per', 'res_per': 'Res_per', 'res per': 'Res_per',
  // Crcy / Res_Curr
  'crcy': 'Res_Curr', 'res_curr': 'Res_Curr', 'currency': 'Res_Curr',
  // Legacy PO fields (tetap diterima, disimpan ke kolom yg ada)
  'po': 'PO', 'purchase order': 'PO',
  'po_date': 'PO_Date', 'po date': 'PO_Date',
  'qty_deliv': 'Qty_Deliv', 'qty deliv': 'Qty_Deliv',
  'delivery_date': 'Delivery_Date', 'delivery date': 'Delivery_Date',
};

function normalizeTaexRow(rawRow) {
  const out = {};
  for (const [rawKey, val] of Object.entries(rawRow)) {
    const normalized = TAEX_HEADER_MAP[rawKey.trim().toLowerCase()];
    if (normalized) out[normalized] = val;
    else out[rawKey] = val; // passthrough kolom yang tidak dikenal
  }
  return out;
}

const mapTaex = r => ({
  ID: r.id, Plant: r.plant, Equipment: r.equipment, Order: r.order, Revision: r.revision,
  Reservno: r.reservno,
  Material: r.material, Itm: r.itm, Material_Description: r.material_description,
  Qty_Reqmts: n(r.qty_reqmts), Qty_Stock: n(r.qty_stock),
  PR: r.pr, Item: r.item, Qty_PR: n(r.qty_pr),
  Cost_Ctrs: r.cost_ctrs,
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
  ID: r.id, Plant: r.plant, Equipment: r.equipment, Revision: r.revision,
  Order: r.order, Reservno: r.reservno, Itm: r.itm,
  Material: r.material, Material_Description: r.material_description,
  Qty_Req: n(r.qty_req), Qty_Stock: n(r.qty_stock),
  Qty_PR: n(r.qty_pr), Qty_To_PR: n(r.qty_to_pr), CodeTracking: r.code_tracking,
});
// ── SAP PR HEADER ALIAS MAP ──
const SAP_HEADER_MAP = {
  // Plant / Plnt
  'plnt': 'Plant', 'plant': 'Plant',
  // Purch.Req. / PR
  'purch.req.': 'PR', 'purch req': 'PR', 'purchreq': 'PR', 'pr': 'PR',
  'purchase req.no.': 'PR', 'purchase request': 'PR',
  // Item
  'item': 'Item',
  // Material
  'material': 'Material',
  // Material Description
  'material description': 'Material_Description',
  'material_description': 'Material_Description', 'short text': 'Material_Description',
  // D
  'd': 'D',
  // Rel / R
  'rel': 'R', 'r': 'R',
  // PGr
  'pgr': 'PGr', 'purch. group': 'PGr', 'purch group': 'PGr',
  // S
  's': 'S',
  // TrackingNo
  'trackingno': 'TrackingNo', 'tracking_no': 'TrackingNo', 'tracking no': 'TrackingNo',
  // Qty Requested
  'qty requested': 'Qty_PR', 'qty_pr': 'Qty_PR', 'qty_purchreq': 'Qty_PR',
  'qty purchreq': 'Qty_PR', 'quantity': 'Qty_PR',
  // Un
  'un': 'Un', 'uom': 'Un', 'unit': 'Un',
  // Req.Date
  'req.date': 'Req_Date', 'req date': 'Req_Date', 'req_date': 'Req_Date',
  'reqdate': 'Req_Date', 'requirements date': 'Req_Date',
  // Valn Price
  'valn price': 'Valn_price', 'valn_price': 'Valn_price', 'valuation price': 'Valn_price',
  // Crcy / PR_Curr
  'crcy': 'PR_Curr', 'pr_curr': 'PR_Curr', 'currency': 'PR_Curr', 'pr curr': 'PR_Curr',
  // Per / PR_Per
  'per': 'PR_Per', 'pr_per': 'PR_Per', 'pr per': 'PR_Per',
  // Release Dt
  'release dt': 'Release_Date', 'release_date': 'Release_Date', 'release date': 'Release_Date',
  'release dt.': 'Release_Date',
  // Tracking (legacy, tetap diterima)
  'tracking': 'Tracking',
};

function normalizeSapRow(rawRow) {
  const out = {};
  for (const [rawKey, val] of Object.entries(rawRow)) {
    const normalized = SAP_HEADER_MAP[rawKey.trim().toLowerCase()];
    if (normalized) out[normalized] = val;
    else out[rawKey] = val;
  }
  return out;
}

const mapSAP = r => ({
  ID: r.id, Plant: r.plant,
  PR: r.pr, Item: r.item,
  Material: r.material, Material_Description: r.material_description,
  D: r.d, R: r.r, PGr: r.pgr, S: r.s, TrackingNo: r.tracking_no,
  Qty_PR: n(r.qty_pr), Un: r.un, Req_Date: r.req_date,
  Valn_price: n(r.valn_price), PR_Curr: r.pr_curr, PR_Per: n(r.pr_per),
  Release_Date: r.release_date,
  Tracking: r.tracking,
});


// ── ORDER HEADER ALIAS MAP ──
const ORDER_HEADER_MAP_SRV = {
  'plant':'Plant','order':'Order',
  'superior order':'Superior_Order','superior_order':'Superior_Order',
  'notification':'Notification',
  'created on':'Created_On','created_on':'Created_On','createdon':'Created_On',
  'description':'Description','revision':'Revision','equipment':'Equipment',
  'system status':'System_Status','system_status':'System_Status',
  'user status':'User_Status','user_status':'User_Status',
  'functional loc.':'FunctLocation','functional loc':'FunctLocation',
  'functlocation':'FunctLocation','funct location':'FunctLocation',
  'funct. location':'FunctLocation','functional location':'FunctLocation',
  'location':'Location',
  'wbs ord. header':'WBS_Ord_header','wbs ord header':'WBS_Ord_header',
  'wbs_ord_header':'WBS_Ord_header','wbsordheader':'WBS_Ord_header',
  'cost center':'CostCenter','costcenter':'CostCenter','cost_center':'CostCenter',
  'totalplnndcosts':'Total_Plan_Cost','total plan cost':'Total_Plan_Cost',
  'total_plan_cost':'Total_Plan_Cost','total plnd costs':'Total_Plan_Cost',
  'total act.costs':'Total_Act_Cost','total act costs':'Total_Act_Cost',
  'total_act_cost':'Total_Act_Cost','totalactcosts':'Total_Act_Cost',
  'planner group':'Planner_Group','planner_group':'Planner_Group','plannergroup':'Planner_Group',
  'main workctr':'MainWorkCtr','main_workctr':'MainWorkCtr','mainworkctr':'MainWorkCtr',
  'main work ctr':'MainWorkCtr','main work center':'MainWorkCtr',
  'entered by':'Entry_by','enteredby':'Entry_by','entry_by':'Entry_by','entry by':'Entry_by',
  'changed by':'Changed_by','changedby':'Changed_by','changed_by':'Changed_by',
  'bas. start date':'Basic_start_date','bas start date':'Basic_start_date',
  'basic start date':'Basic_start_date','basic_start_date':'Basic_start_date',
  'basic fin. date':'Basic_finish_date','basic fin date':'Basic_finish_date',
  'basic finish date':'Basic_finish_date','basic_finish_date':'Basic_finish_date',
  'actual release':'Actual_Release','actual_release':'Actual_Release',
};

function normalizeOrderRow(rawRow) {
  const out = {};
  for (const [rawKey, val] of Object.entries(rawRow)) {
    const normalized = ORDER_HEADER_MAP_SRV[rawKey.trim().toLowerCase()];
    if (normalized) out[normalized] = val;
    else out[rawKey] = val;
  }
  return out;
}

const mapOrder = r => ({
  ID: r.id, Plant: r.plant, Order: r.order,
  Superior_Order: r.superior_order, Notification: r.notification,
  Created_On: r.created_on, Description: r.description,
  Revision: r.revision, Equipment: r.equipment,
  System_Status: r.system_status, User_Status: r.user_status,
  FunctLocation: r.funct_location, Location: r.location,
  WBS_Ord_header: r.wbs_ord_header, CostCenter: r.cost_center,
  Total_Plan_Cost: n(r.total_plan_cost), Total_Act_Cost: n(r.total_act_cost),
  Planner_Group: r.planner_group, MainWorkCtr: r.main_work_ctr,
  Entry_by: r.entry_by, Changed_by: r.changed_by,
  Basic_start_date: r.basic_start_date, Basic_finish_date: r.basic_finish_date,
  Actual_Release: r.actual_release,
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
// ─────────────────────────────────────────────
// BULK HELPERS — pakai batch INSERT supaya tidak timeout saat 90rb baris
// ─────────────────────────────────────────────
const CHUNK = 500; // rows per INSERT statement

async function bulkReplaceTaex(client, rows) {
  await client.query('DELETE FROM taex_reservasi');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const vals = [], params = [];
    batch.forEach((r, idx) => {
      const b = idx * 33;
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22},$${b+23},$${b+24},$${b+25},$${b+26},$${b+27},$${b+28},$${b+29},$${b+30},$${b+31},$${b+32},$${b+33})`);
      params.push(r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
        r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
        r.PR||null,r.Item||null,r.Qty_PR??null,r.Cost_Ctrs||null,
        r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
        r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
        r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
        r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
        r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null,
        r.Reservno||null);
    });
    await client.query(
      `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,cost_ctrs,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr,reservno) VALUES ${vals.join(',')}`,
      params
    );
  }
}
async function bulkReplacePrisma(client, rows) {
  await client.query('DELETE FROM prisma_reservasi');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const vals = [], params = [];
    batch.forEach((r, idx) => {
      const b = idx * 22;
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22})`);
      params.push(r.Plant||null,r.Equipment||null,r.Revision||null,r.Order||null,r.Reservno||null,r.Itm||null,
        r.Material||null,r.Material_Description||null,
        r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
        r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
        r.Qty_Reqmts||0,r.UoM||null,
        r.PR_Prisma||null,r.Item_Prisma||null,r.Qty_PR_Prisma??null,
        r.Qty_StockOnhand??null,r.CodeKertasKerja||null);
    });
    await client.query(
      `INSERT INTO prisma_reservasi (plant,equipment,revision,"order",reservno,itm,material,material_description,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_reqmts,uom,pr_prisma,item_prisma,qty_pr_prisma,qty_stock_onhand,code_kertas_kerja) VALUES ${vals.join(',')}`,
      params
    );
  }
}
async function bulkReplaceKumpulan(client, rows) {
  await client.query('DELETE FROM kumpulan_summary');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const vals = [], params = [];
    batch.forEach((r, idx) => {
      const b = idx * 13;
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`);
      params.push(r.Plant||null,r.Equipment||null,r.Revision||null,r.Order||null,r.Reservno||null,r.Itm||null,
        r.Material||null,r.Material_Description||null,
        r.Qty_Req||0,r.Qty_Stock||0,r.Qty_PR??null,r.Qty_To_PR??null,r.CodeTracking||null);
    });
    await client.query(
      `INSERT INTO kumpulan_summary (plant,equipment,revision,"order",reservno,itm,material,material_description,qty_req,qty_stock,qty_pr,qty_to_pr,code_tracking) VALUES ${vals.join(',')}`,
      params
    );
  }
}
async function bulkReplacePR(client, rows) {
  await client.query('DELETE FROM sap_pr');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const vals = [], params = [];
    batch.forEach((rawR, idx) => {
      const r = normalizeSapRow(rawR);
      const b = idx * 18;
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18})`);
      params.push(r.Plant||null,r.PR||null,r.Item||null,r.Material||null,r.Material_Description||null,
        r.D||null,r.R||null,r.PGr||null,r.S||null,r.TrackingNo||null,
        r.Qty_PR??null,r.Un||null,r.Req_Date||null,
        r.Valn_price??null,r.PR_Curr||null,r.PR_Per??null,r.Release_Date||null,
        r.Tracking||null);
    });
    await client.query(
      `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,s,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking) VALUES ${vals.join(',')}`,
      params
    );
  }
}

async function bulkReplacePO(client, rows) {
  await client.query('DELETE FROM sap_po');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const vals = [], params = [];
    batch.forEach((r, idx) => {
      const b = idx * 18;
      vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18})`);
      params.push(r.Plnt||null,r.Purchreq||null,r.Item||null,r.Material||null,r.Short_Text||null,
        r.PO||null,r.PO_Item||null,r.D||null,r.DCI||null,r.PGr||null,r.Doc_Date||null,
        r.PO_Quantity??null,r.Qty_Delivered??null,r.Deliv_Date||null,r.OUn||null,
        r.Net_Price??null,r.Crcy||null,r.Per??null);
    });
    await client.query(
      `INSERT INTO sap_po (plnt,purchreq,item,material,short_text,po,po_item,d,dci,pgr,doc_date,po_quantity,qty_delivered,deliv_date,oun,net_price,crcy,per) VALUES ${vals.join(',')}`,
      params
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

// ─────────────────────────────────────────────
// UPLOAD JOB PROGRESS — in-memory store per jobId
// ─────────────────────────────────────────────
const uploadJobs = new Map(); // jobId → { pct, msg, done, error }

function setJobProgress(jobId, pct, msg, done = false, error = null) {
  uploadJobs.set(jobId, { pct, msg, done, error, ts: Date.now() });
}

// Cleanup job lama (>10 menit)
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of uploadJobs) {
    if (job.ts < cutoff) uploadJobs.delete(id);
  }
}, 60_000);

// GET /api/upload-progress/:jobId — polling endpoint
app.get('/api/upload-progress/:jobId', requireApiKey, (req, res) => {
  const job = uploadJobs.get(req.params.jobId);
  if (!job) return res.json({ pct: 0, msg: 'Menunggu...', done: false });
  res.json(job);
});

// ─────────────────────────────────────────────
// UPLOAD EXCEL — server-side parse, no browser freeze
// POST /api/upload/:type  (type: taex | prisma | pr | po)
// Multipart form: field "file" = Excel file
// Returns: { jobId } immediately, client polls /api/upload-progress/:jobId
// ─────────────────────────────────────────────
app.post('/api/upload/:type', requireApiKey, upload.single('file'), (req, res) => {
  const type = req.params.type;
  if (!['taex','prisma','pr','po'].includes(type))
    return res.status(400).json({ error: 'Type tidak valid' });
  if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

  const jobId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  setJobProgress(jobId, 0, 'Membaca file Excel...');

  // Jalankan proses di background (tidak block response)
  res.json({ jobId });

  // Background processing
  (async () => {
    try {
      const buffer = req.file.buffer;

      setJobProgress(jobId, 5, 'Parsing Excel...');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        setJobProgress(jobId, 100, 'File kosong', true, 'File Excel kosong atau format tidak sesuai');
        return;
      }

      setJobProgress(jobId, 10, `Parsed ${rows.length.toLocaleString()} baris. Menyimpan ke database...`);

      // Upload ke GCS (tidak kritis, jalan paralel)
      uploadToGCS(buffer, req.file.originalname).catch(() => {});

      const BATCH = 500;
      const total = rows.length;
      let inserted = 0;

      // DELETE dulu di luar transaction batch supaya tidak lock lama
      const tableMap = { taex:'taex_reservasi', prisma:'prisma_reservasi', pr:'sap_pr', po:'sap_po' };
      await query(`DELETE FROM ${tableMap[type]}`);

      for (let i = 0; i < total; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);

        await withTransaction(async (client) => {
          const vals = [], params = [];

          if (type === 'taex') {
            batch.forEach((rawR, idx) => {
              const r = normalizeTaexRow(rawR);
              const b = idx * 33;
              vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22},$${b+23},$${b+24},$${b+25},$${b+26},$${b+27},$${b+28},$${b+29},$${b+30},$${b+31},$${b+32},$${b+33})`);
              params.push(r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
                r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
                r.PR||null,r.Item||null,r.Qty_PR??null,r.Cost_Ctrs||null,
                r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
                r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
                r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
                r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
                r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null,
                r.Reservno||null);
            });
            await client.query(
              `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,cost_ctrs,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr,reservno) VALUES ${vals.join(',')}`,
              params
            );
          }

          if (type === 'prisma') {
            batch.forEach((r, idx) => {
              const b = idx * 22;
              vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22})`);
              params.push(r.Plant||null,r.Equipment||null,r.Revision||null,r.Order||null,r.Reservno||null,r.Itm||null,
                r.Material||null,r.Material_Description||null,
                r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
                r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
                r.Qty_Reqmts||0,r.UoM||null,
                r.PR_Prisma||null,r.Item_Prisma||null,r.Qty_PR_Prisma??null,
                r.Qty_StockOnhand??null,r.CodeKertasKerja||null);
            });
            await client.query(
              `INSERT INTO prisma_reservasi (plant,equipment,revision,"order",reservno,itm,material,material_description,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_reqmts,uom,pr_prisma,item_prisma,qty_pr_prisma,qty_stock_onhand,code_kertas_kerja) VALUES ${vals.join(',')}`,
              params
            );
          }

          if (type === 'pr') {
            batch.forEach((rawR, idx) => {
              const r = normalizeSapRow(rawR);
              const b = idx * 18;
              vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18})`);
              params.push(r.Plant||null,r.PR||null,r.Item||null,r.Material||null,r.Material_Description||null,
                r.D||null,r.R||null,r.PGr||null,r.S||null,r.TrackingNo||null,
                r.Qty_PR??null,r.Un||null,r.Req_Date||null,
                r.Valn_price??null,r.PR_Curr||null,r.PR_Per??null,r.Release_Date||null,
                r.Tracking||null);
            });
            await client.query(
              `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,s,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking) VALUES ${vals.join(',')}`,
              params
            );
          }

          if (type === 'po') {
            batch.forEach((r, idx) => {
              const b = idx * 18;
              vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18})`);
              params.push(r.Plnt||null,r.Purchreq||null,r.Item||null,r.Material||null,r.Short_Text||r['Short Text']||null,
                r.PO||null,r.PO_Item||null,r.D||null,r.DCI||null,r.PGr||null,r.Doc_Date||r['Doc. Date']||null,
                r.PO_Quantity??r['PO Quantity']??null,r.Qty_Delivered??r['Qty Delivered']??null,
                r.Deliv_Date||r['Deliv. Date']||null,r.OUn||null,
                r.Net_Price??r['Net Price']??null,r.Crcy||null,r.Per??null);
            });
            await client.query(
              `INSERT INTO sap_po (plnt,purchreq,item,material,short_text,po,po_item,d,dci,pgr,doc_date,po_quantity,qty_delivered,deliv_date,oun,net_price,crcy,per) VALUES ${vals.join(',')}`,
              params
            );
          }
        });

        inserted += batch.length;
        const pct = 10 + Math.round((inserted / total) * 88);
        setJobProgress(jobId, pct, `Menyimpan... ${inserted.toLocaleString()} / ${total.toLocaleString()} baris`);
      }

      setJobProgress(jobId, 100, `✅ Selesai! ${total.toLocaleString()} baris tersimpan`, true);
      console.log(`✅ Upload ${type}: ${total} baris`);
    } catch (err) {
      console.error('Upload error:', err);
      setJobProgress(jobId, 100, '❌ ' + err.message, true, err.message);
    }
  })();
});

// Proses Excel per batch 500 baris — hemat memory (legacy, masih dipakai route lama)
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
      for (const rawR of batch) {
        const r = (type === 'taex') ? normalizeTaexRow(rawR) : rawR;
        if (type === 'taex') {
          await client.query(
            `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,cost_ctrs,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr,reservno)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`,
            [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
             r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
             r.PR||null,r.Item||null,r.Qty_PR??null,r.Cost_Ctrs||null,
             r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
             r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
             r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
             r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
             r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null,
             r.Reservno||null]
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
          const nr = normalizeSapRow(r);
          await client.query(
            `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,s,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [nr.Plant||null,nr.PR||null,nr.Item||null,nr.Material||null,nr.Material_Description||null,
             nr.D||null,nr.R||null,nr.PGr||null,nr.S||null,nr.TrackingNo||null,
             nr.Qty_PR??null,nr.Un||null,nr.Req_Date||null,
             nr.Valn_price??null,nr.PR_Curr||null,nr.PR_Per??null,nr.Release_Date||null,
             nr.Tracking||null]
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

app.use(express.json({ limit: '200mb' }));
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

// Load all data — paginated per tabel supaya tidak OOM
// Query params: page (default 1), limit (default 2000)
// Contoh: GET /api/data?page=1&limit=2000
app.get('/api/data', requireApiKey, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit) || 2000));
    const offset = (page - 1) * limit;

    const [taex, prisma, kumpulan, pr, po, order,
           taexCount, prismaCount, kumpulanCount, prCount, poCount,
           kkCurrent, kkCounter, prCounter, summaryData] = await Promise.all([
      query('SELECT * FROM taex_reservasi ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]),
      query('SELECT * FROM prisma_reservasi ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]),
      query('SELECT * FROM kumpulan_summary ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]),
      query('SELECT * FROM sap_pr ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]),
      query('SELECT * FROM sap_po ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]),
      query('SELECT * FROM work_order ORDER BY id'),
      query('SELECT COUNT(*) AS c FROM taex_reservasi'),
      query('SELECT COUNT(*) AS c FROM prisma_reservasi'),
      query('SELECT COUNT(*) AS c FROM kumpulan_summary'),
      query('SELECT COUNT(*) AS c FROM sap_pr'),
      query('SELECT COUNT(*) AS c FROM sap_po'),
      getState('kk_current'),
      getState('kk_counter'),
      getState('pr_counter'),
      getState('summary_current'),
    ]);

    res.json({
      // Data halaman ini
      taexData:            taex.rows.map(mapTaex),
      prismaReservasiData: prisma.rows.map(mapPrisma),
      kumpulanData:        kumpulan.rows.map(mapKumpulan),
      prData:              pr.rows.map(mapSAP),
      orderData:           order.rows.map(mapOrder),
      poData:              po.rows.map(mapPO),
      kkData:              kkCurrent ? kkCurrent.data : [],
      kkCode:              kkCurrent ? kkCurrent.code : null,
      summaryData:         summaryData || [],
      kkCounter:           kkCounter || 0,
      prCounter:           prCounter || 0,
      // Pagination meta — dipakai frontend untuk tahu apakah ada halaman berikutnya
      pagination: {
        page,
        limit,
        totalTaex:     parseInt(taexCount.rows[0].c),
        totalPrisma:   parseInt(prismaCount.rows[0].c),
        totalKumpulan: parseInt(kumpulanCount.rows[0].c),
        totalPR:       parseInt(prCount.rows[0].c),
        totalPO:       parseInt(poCount.rows[0].c),
        hasMore: offset + limit < Math.max(
          parseInt(taexCount.rows[0].c),
          parseInt(prismaCount.rows[0].c),
          parseInt(kumpulanCount.rows[0].c),
          parseInt(prCount.rows[0].c),
          parseInt(poCount.rows[0].c),
        ),
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal memuat data' }); }
});

// ─────────────────────────────────────────────
// AUDIT ENDPOINT — server-side JOIN taex vs prisma
// Pendekatan UNION ALL per kolom — tidak ada nested backtick
// GET /api/audit?page=1&limit=100&q=...&col=...
// ─────────────────────────────────────────────
const AUDIT_COLS_DEF = [
  { key: 'equipment',            label: 'Equipment',         numeric: false },
  { key: 'reservno',             label: 'Reserv.No.',        numeric: false },
  { key: 'revision',             label: 'Revision',          numeric: false },
  { key: 'material_description', label: 'Material Desc',     numeric: false },
  { key: 'qty_reqmts',           label: 'Reqmt Qty',         numeric: true  },
  { key: 'del',                  label: 'Del',               numeric: false },
  { key: 'fis',                  label: 'FIs',               numeric: false },
  { key: 'ict',                  label: 'ICt',               numeric: false },
  { key: 'pg',                   label: 'PG',                numeric: false },
  { key: 'uom',                  label: 'BUn',               numeric: false },
  { key: 'recipient',            label: 'Recipient',         numeric: false },
  { key: 'unloading_point',      label: 'Unloading Point',   numeric: false },
  { key: 'reqmts_date',          label: 'Reqmt Date',        numeric: false },
];

app.get('/api/audit', requireApiKey, async (req, res) => {
  try {
    const AUDIT_COLS = [
      { key: 'equipment',            label: 'Equipment' },
      { key: 'reservno',             label: 'Reserv.No.' },
      { key: 'revision',             label: 'Revision' },
      { key: 'material_description', label: 'Material Description' },
      { key: 'qty_reqmts',           label: 'Reqmt Qty', numeric: true },
      { key: 'del',                  label: 'Del' },
      { key: 'fis',                  label: 'FIs' },
      { key: 'ict',                  label: 'ICt' },
      { key: 'pg',                   label: 'PG' },
      { key: 'uom',                  label: 'BUn' },
      { key: 'recipient',            label: 'Recipient' },
      { key: 'unloading_point',      label: 'Unloading Point' },
      { key: 'reqmts_date',          label: 'Reqmt Date' },
    ];

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const q     = (req.query.q   || '').trim();
    const fCol  = (req.query.col || '').trim();

    // Validate fCol against allowed keys to prevent SQL injection
    const validCol = fCol && AUDIT_COLS.some(c => c.key === fCol) ? fCol : null;

    // Build WHERE for the JOIN query
    const params = [];
    const extraConds = [];
    if (q) {
      params.push(`%${q}%`);
      const pi = params.length;
      extraConds.push(`(t."order" ILIKE $${pi} OR t.material ILIKE $${pi} OR t.itm::text ILIKE $${pi})`);
    }
    const extraSQL = extraConds.length ? ' AND ' + extraConds.join(' AND ') : '';

    // Build per-column CASE SQL — simple SELECT with one column per row using UNION ALL
    // For each audited col: emit a row only when p.col IS DISTINCT FROM t.col
    const colSelects = AUDIT_COLS
      .filter(c => !validCol || c.key === validCol)
      .map(c => {
        const pVal = c.numeric
          ? `COALESCE(p.${c.key}::text, '')`
          : `COALESCE(p.${c.key}, '')`;
        const tVal = c.numeric
          ? `COALESCE(t.${c.key}::text, '')`
          : `COALESCE(t.${c.key}, '')`;
        return `
    SELECT t."order" AS order_val, t.material, t.itm,
           '${c.key}'   AS col_key,
           '${c.label}' AS col_label,
           ${pVal} AS val_prisma,
           ${tVal} AS val_taex
    FROM prisma_reservasi p
    JOIN taex_reservasi t
      ON p."order" = t."order" AND p.material = t.material AND p.itm = t.itm
    WHERE p.${c.key} IS DISTINCT FROM t.${c.key}${extraSQL}`;
      }).join(' UNION ALL ');

    // Count query
    const countSQL = `SELECT COUNT(*) AS c FROM (${colSelects}
) sub`;

    // Data query with pagination
    const dataSQL = `
    SELECT * FROM (${colSelects}
) sub
    ORDER BY order_val, material, itm, col_key
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    // Changed rows count (always all cols, no col filter)
    const allColDiff = AUDIT_COLS.map(c => `p.${c.key} IS DISTINCT FROM t.${c.key}`).join(' OR ');
    const changedSQL = `
    SELECT COUNT(DISTINCT (t."order", t.material, t.itm)) AS c
    FROM prisma_reservasi p
    JOIN taex_reservasi t
      ON p."order" = t."order" AND p.material = t.material AND p.itm = t.itm
    WHERE ${allColDiff}${extraSQL}`;

    const [countRes, dataRes, changedRes] = await Promise.all([
      query(countSQL, params),
      query(dataSQL, [...params, limit, (page - 1) * limit]),
      query(changedSQL, params),
    ]);

    res.json({
      data: dataRes.rows.map(r => ({
        Order:      r.order_val,
        Material:   r.material,
        Itm:        r.itm,
        col_key:    r.col_key,
        col_label:  r.col_label,
        val_prisma: r.val_prisma || null,
        val_taex:   r.val_taex   || null,
      })),
      pagination: {
        page, limit,
        total: parseInt(countRes.rows[0].c),
        totalPages: Math.ceil(parseInt(countRes.rows[0].c) / limit) || 1,
      },
      changedRows: parseInt(changedRes.rows[0].c),
    });
  } catch(e) {
    console.error('Audit error:', e);
    res.status(500).json({ error: 'Gagal audit: ' + e.message });
  }
});

// Endpoint tambahan: load satu tabel secara paginated (lebih efisien)
// GET /api/data/taex?page=1&limit=2000
const TABLE_CONFIG = {
  taex: {
    table: 'taex_reservasi', mapper: mapTaex,
    searchCols: ['material','material_description','"order"','equipment','pr','po','plant','itm','reservno','cost_ctrs'],
    filterMap: {
      pr: (v) => v ? { col: 'pr', val: v } : null,
      po: (v) => v==='with'    ? { col:"po IS NOT NULL AND po <> ''", raw:true }
               : v==='without' ? { col:"po IS NULL OR po = ''",      raw:true } : null,
    },
    sortableCols: new Set(['id','plant','equipment','"order"','revision','material','itm','material_description','qty_reqmts','qty_stock','pr','item','qty_pr','reservno','cost_ctrs','delivery_date','qty_f_avail_check','qty_withdrawn','res_price','res_per']),
  },
  prisma: {
    table: 'prisma_reservasi', mapper: mapPrisma,
    searchCols: ['material','material_description','"order"','equipment','plant','reservno','pr_prisma'],
    filterMap: {
      order: (v) => v ? { col: '"order"', val: v } : null,
    },
    sortableCols: new Set(['id','plant','equipment','"order"','material','qty_reqmts','pr_prisma','code_kertas_kerja']),
  },
  kumpulan: {
    table: 'kumpulan_summary', mapper: mapKumpulan,
    searchCols: ['material','material_description','"order"','equipment','code_tracking'],
    filterMap: {
      code_tracking: (v) => v ? { col: 'code_tracking', val: v } : null,
    },
    sortableCols: new Set(['id','plant','"order"','material','qty_req','qty_stock','code_tracking']),
  },
  pr: {
    table: 'sap_pr', mapper: mapSAP,
    searchCols: ['pr','material','material_description','plant','tracking','tracking_no'],
    filterMap: {},
    sortableCols: new Set(['id','plant','pr','material','qty_pr','req_date','release_date']),
  },
  po: {
    table: 'sap_po', mapper: mapPO,
    searchCols: ['po','purchreq','material','short_text','plnt'],
    filterMap: {},
    sortableCols: new Set(['id','plnt','po','purchreq','material','po_quantity','deliv_date','doc_date']),
  },
};

app.get('/api/data/:tabel', requireApiKey, async (req, res) => {
  const cfg = TABLE_CONFIG[req.params.tabel];
  if (!cfg) return res.status(404).json({ error: 'Tabel tidak ditemukan' });
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();

    const conditions = [], params = [];

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(`(${cfg.searchCols.map(c=>`${c}::text ILIKE $${idx}`).join(' OR ')})`);
    }

    for (const [key, buildFilter] of Object.entries(cfg.filterMap)) {
      const val = req.query[key];
      if (!val) continue;
      const f = buildFilter(val);
      if (!f) continue;
      if (f.raw) { conditions.push(f.col); }
      else { params.push(f.val); conditions.push(`${f.col} = $${params.length}`); }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'id ASC';
    const ob = (req.query.order_by || '').toLowerCase().replace(/[^a-z0-9_"]/g,'');
    const od = req.query.order_dir === 'desc' ? 'DESC' : 'ASC';
    if (ob && cfg.sortableCols.has(ob)) orderBy = `${ob} ${od}, id ASC`;

    const [data, count] = await Promise.all([
      query(`SELECT * FROM ${cfg.table} ${where} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]),
      query(`SELECT COUNT(*) AS c FROM ${cfg.table} ${where}`, params),
    ]);
    const total = parseInt(count.rows[0].c);
    res.json({
      data: data.rows.map(cfg.mapper),
      pagination: { page, limit, total, totalPages: Math.ceil(total/limit)||1, hasMore: offset+limit < total },
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal memuat data: ' + e.message }); }
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
      `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,cost_ctrs,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr,reservno)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33) RETURNING id`,
      [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
       r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
       r.PR||null,r.Item||null,r.Qty_PR??null,r.Cost_Ctrs||null,
       r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
       r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
       r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
       r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
       r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null,
       r.Reservno||null]
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
          `INSERT INTO taex_reservasi (plant,equipment,"order",revision,material,itm,material_description,qty_reqmts,qty_stock,pr,item,qty_pr,cost_ctrs,po,po_date,qty_deliv,delivery_date,sloc,del,fis,ict,pg,recipient,unloading_point,reqmts_date,qty_f_avail_check,qty_withdrawn,uom,gl_acct,res_price,res_per,res_curr,reservno)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)`,
          [r.Plant||null,r.Equipment||null,r.Order||null,r.Revision||null,r.Material||null,r.Itm||null,
           r.Material_Description||null,r.Qty_Reqmts||0,r.Qty_Stock||0,
           r.PR||null,r.Item||null,r.Qty_PR??null,r.Cost_Ctrs||null,
           r.PO||null,r.PO_Date||null,r.Qty_Deliv??null,r.Delivery_Date||null,
           r.SLoc||null,r.Del||null,r.FIs||null,r.Ict||null,r.PG||null,
           r.Recipient||null,r.Unloading_point||null,r.Reqmts_Date||null,
           r.Qty_f_avail_check??null,r.Qty_Withdrawn??null,
           r.UoM||null,r.GL_Acct||null,r.Res_Price??null,r.Res_per??null,r.Res_Curr||null,
           r.Reservno||null]
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
// DELETE single row by ID
app.delete('/api/taex/:id', requireApiKey, async (req, res) => {
  try {
    await query('DELETE FROM taex_reservasi WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal hapus data' }); }
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
// GET /api/prisma/meta — distinct orders & PGs for filters
app.get('/api/prisma/meta', requireApiKey, async (req, res) => {
  try {
    const [orders, pgs] = await Promise.all([
      query('SELECT DISTINCT "order" FROM prisma_reservasi WHERE "order" IS NOT NULL ORDER BY "order"'),
      query('SELECT DISTINCT pg FROM prisma_reservasi WHERE pg IS NOT NULL ORDER BY pg'),
    ]);
    res.json({ orders: orders.rows.map(r => r.order), pgs: pgs.rows.map(r => r.pg) });
  } catch(e) { res.status(500).json({ error: 'Gagal memuat meta prisma' }); }
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
          `INSERT INTO sap_pr (plant,pr,item,material,material_description,d,r,pgr,s,tracking_no,qty_pr,un,req_date,valn_price,pr_curr,pr_per,release_date,tracking)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [r.Plant||null,r.PR||null,r.Item||null,r.Material||null,r.Material_Description||null,
           r.D||null,r.R||null,r.PGr||null,r.S||null,r.TrackingNo||null,
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


// ── WORK ORDER ──
app.get('/api/order', requireApiKey, async (req, res) => {
  try { const { rows } = await query('SELECT * FROM work_order ORDER BY id'); res.json(rows.map(mapOrder)); }
  catch(e) { res.status(500).json({ error: 'Gagal memuat data Order' }); }
});
app.put('/api/order', requireApiKey, async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Body harus array' });
    await withTransaction(async (client) => {
      await client.query('DELETE FROM work_order');
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const vals = [], params = [];
        batch.forEach((rawR, idx) => {
          const r = normalizeOrderRow(rawR);
          const b = idx * 23;
          vals.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22},$${b+23})`);
          params.push(
            r.Plant||null, r.Order ? String(r.Order) : null,
            r.Superior_Order||null, r.Notification||null, r.Created_On||null,
            r.Description||null, r.Revision||null, r.Equipment||null,
            r.System_Status||null, r.User_Status!=null?String(r.User_Status):null,
            r.FunctLocation||null, r.Location||null, r.WBS_Ord_header||null,
            r.CostCenter||null,
            r.Total_Plan_Cost!=null&&r.Total_Plan_Cost!==''?parseFloat(r.Total_Plan_Cost):null,
            r.Total_Act_Cost!=null&&r.Total_Act_Cost!==''?parseFloat(r.Total_Act_Cost):null,
            r.Planner_Group||null, r.MainWorkCtr||null,
            r.Entry_by||null, r.Changed_by||null,
            r.Basic_start_date||null, r.Basic_finish_date||null, r.Actual_Release||null
          );
        });
        await client.query(
          `INSERT INTO work_order (plant,"order",superior_order,notification,created_on,description,revision,equipment,system_status,user_status,funct_location,location,wbs_ord_header,cost_center,total_plan_cost,total_act_cost,planner_group,main_work_ctr,entry_by,changed_by,basic_start_date,basic_finish_date,actual_release) VALUES ${vals.join(',')}`,
          params
        );
      }
    });
    res.json({ ok: true, count: rows.length });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Gagal simpan data Order: ' + e.message }); }
});
app.delete('/api/order/:id', requireApiKey, async (req, res) => {
  try {
    await query('DELETE FROM work_order WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Gagal hapus data Order' }); }
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