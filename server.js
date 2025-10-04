require("dotenv").config();
const fastify = require("fastify")({ logger: true });
const path = require("path");
const os = require("os");
const { Pool } = require("pg");

// Database config จาก .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// สร้างตารางถ้ายังไม่มี
async function createTablesIfNotExists() {
  const queryLogs = `
  CREATE TABLE IF NOT EXISTS station_logs (
    id SERIAL PRIMARY KEY,
    actual NUMERIC DEFAULT 0,
    alarm_1 NUMERIC,
    alarm_2 NUMERIC,
    station TEXT,
    remark TEXT DEFAULT '0',
    detail TEXT,
    status TEXT,
    userlog TEXT,
    created_at TIMESTAMP DEFAULT now()
    )
  `;
  const queryThresholds = `
    CREATE TABLE IF NOT EXISTS station_thresholds (
      id SERIAL PRIMARY KEY,
      alarm_1 NUMERIC,
      alarm_2 NUMERIC,
      station TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `;
  await pool.query(queryLogs);
  await pool.query(queryThresholds);
  console.log("✅ ตรวจสอบตาราง station_logs และ station_thresholds แล้ว");
}

// สร้างตาราง users และเพิ่มข้อมูลเริ่มต้น
async function createUsersTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      firstname TEXT NOT NULL,
      lastname TEXT NOT NULL,
      position TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    )
  `;
  await pool.query(query);
}

async function seedUsers() {
  const users = [
    {
      username: "admin",
      password: "1234",
      firstname: "สมชาย",
      lastname: "ใจดี",
      position: "ผู้ดูแลระบบ",
    },
    {
      username: "user1",
      password: "abcd",
      firstname: "สมหญิง",
      lastname: "สุขสวัสดิ์",
      position: "พนักงาน",
    },
    {
      username: "user2",
      password: "5678",
      firstname: "สมศักดิ์",
      lastname: "แสนดี",
      position: "ผู้จัดการ",
    },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO users (username, password, firstname, lastname, position)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, u.password, u.firstname, u.lastname, u.position]
    );
  }
  console.log("✅ Users seeded into database");
}

// Static folder
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
  decorateReply: true,
});

// serve node_modules
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "node_modules"),
  prefix: "/modules/",
  decorateReply: false,
});

// API แสดง Jude
fastify.get("/api/station-status/:station", async (request, reply) => {
  const { station } = request.params;

  try {
    const query = `
      SELECT actual, alarm_1, alarm_2
      FROM station_logs
      WHERE station = $1
        AND remark <> '1'
      ORDER BY created_at DESC
      LIMIT 1;
    `;

    const locationName = station;

    const { rows } = await pool.query(query, [locationName]);

    if (rows.length === 0) {
      return reply.status(404).send({ error: "ไม่พบข้อมูล" });
    }

    const { actual, alarm_1, alarm_2 } = rows[0];
    const actualNum = Number(actual);
    const alarm1Num = Number(alarm_1);
    const alarm2Num = Number(alarm_2);

    let statusClass = "bg-success";

    if (actualNum >= alarm1Num) {
      statusClass = "bg-danger";
    } else if (actualNum >= alarm2Num) {
      statusClass = "bg-warning";
    }

    return reply.send({
      actual: actualNum,
      alarm_1: alarm1Num,
      alarm_2: alarm2Num,
      statusClass,
    });
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: error.message });
  }
});

// ดึงเฉพาะ station
fastify.get("/api/station/:station", async (req, reply) => {
  const { station } = req.params;
  const { rows } = await pool.query(
    "SELECT * FROM station_logs WHERE station = $1 ORDER BY id DESC",
    [station]
  );
  return rows;
});

fastify.post("/api/station-log", async (request, reply) => {
  try {
    const { seconds, alarm_1, alarm_2, station, status, userlog } =
      request.body;

    console.log("Insert log:", {
      seconds,
      alarm_1,
      alarm_2,
      station,
      status,
      userlog,
    });

    const query = `
      INSERT INTO station_logs (actual, alarm_1, alarm_2, station, status,userlog)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [seconds, alarm_1, alarm_2, station, status, userlog];
    const result = await pool.query(query, values);

    return { success: true, data: result.rows[0] };
  } catch (err) {
    console.error(err);
    return reply.status(500).send({ error: "Insert failed" });
  }
});

// API update remark
fastify.post("/api/station-remark/:id", async (req, reply) => {
  const { id } = req.params;
  const { detail } = req.body;

  await pool.query(
    `UPDATE station_logs 
     SET remark = '1', detail = $1 
     WHERE id = $2`,
    [detail, id]
  );

  return { success: true };
});

// API แสดง Threshold
fastify.get("/api/station-threshold/:station", async (request, reply) => {
  const { station } = request.params;

  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const query = `
      SELECT alarm_1, alarm_2 
      FROM station_thresholds
      WHERE station = $1
        AND DATE(created_at) = $2
      LIMIT 1
    `;
    const { rows } = await pool.query(query, [station, today]);

    if (rows.length > 0) {
      return reply.send(rows[0]);
    } else {
      return reply.status(404).send({ error: "ไม่พบข้อมูล" });
    }
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: error.message });
  }
});

// API บันทึก Threshold
fastify.post("/api/station-threshold", async (request, reply) => {
  const { station, alarm_1, alarm_2 } = request.body;

  if (!station || alarm_1 == null || alarm_2 == null) {
    return reply.status(400).send({ error: "Missing required fields" });
  }

  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const checkQuery = `
      SELECT id FROM station_thresholds 
      WHERE station = $1 
        AND DATE(created_at) = $2
      LIMIT 1
    `;

    const { rows } = await pool.query(checkQuery, [station, today]);

    if (rows.length > 0) {
      const updateQuery = `
        UPDATE station_thresholds
        SET alarm_1 = $1, alarm_2 = $2, created_at = NOW()
        WHERE id = $3
      `;
      await pool.query(updateQuery, [alarm_1, alarm_2, rows[0].id]);
      return reply.send({ status: "updated", id: rows[0].id });
    } else {
      const insertQuery = `
        INSERT INTO station_thresholds (alarm_1, alarm_2, station)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const result = await pool.query(insertQuery, [alarm_1, alarm_2, station]);
      return reply.send({ status: "created", id: result.rows[0].id });
    }
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: error.message });
  }
});

// API Login
fastify.post("/login", async (request, reply) => {
  const { username, password } = request.body;
  try {
    const res = await pool.query(
      `SELECT firstname, lastname, position FROM users WHERE username=$1 AND password=$2`,
      [username, password]
    );
    if (res.rows.length > 0) {
      return {
        success: true,
        firstname: res.rows[0].firstname,
        lastname: res.rows[0].lastname,
        position: res.rows[0].position,
      };
    }
    return { success: false, message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ success: false, error: err.message });
  }
});

// หน้า index
fastify.get("/", async (request, reply) => {
  return reply.sendFile("index.html");
});

// helper ดึง IP เครื่อง
function getLocalIPv4() {
  const nets = os.networkInterfaces();
  let results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

let stationStatuses = {};

fastify.post("/api/station/status", async (request, reply) => {
  const { station, seconds, alarm1, alarm2, statusClass } = request.body;
  stationStatuses[station] = { seconds, alarm1, alarm2, statusClass };
  return { success: true };
});

// API สำหรับดึงสถานะทั้งหมด
fastify.get("/api/station/status", async () => {
  return stationStatuses;
});

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 3000;

// start server
const start = async () => {
  try {
    await createTablesIfNotExists();
    await createUsersTable();
    await seedUsers();

    await fastify.listen({ port: PORT, host: HOST });
    const localIPs = getLocalIPv4();
    console.log(`Server running:`);
    console.log(`Local: http://127.0.0.1:${PORT}`);
    localIPs.forEach((ip) => console.log(`Network: http://${ip}:${PORT}`));
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
