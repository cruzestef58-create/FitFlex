const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = 4000;
const DB_FILE = path.join(__dirname, 'fitflex-db.json');

// ── DB helpers ──────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, tokens: {} }));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Simple hash ─────────────────────────────────────
function hash(str) {
  return crypto.createHash('sha256').update(str + 'fitflex_salt').digest('hex');
}
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Auth middleware ─────────────────────────────────
function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  const db = readDB();
  const username = db.tokens[token];
  if (!username) return res.status(401).json({ error: 'Token invalide' });
  req.username = username;
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve frontend

// ── REGISTER ────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
  if (username.length < 2) return res.status(400).json({ error: 'Pseudo trop court' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court' });

  const db = readDB();
  const u = username.toLowerCase().trim();
  if (db.users[u]) return res.status(409).json({ error: 'Pseudo déjà pris' });

  db.users[u] = {
    pwd: hash(password),
    profile: null,
    workouts: [],
    weight: [],
    createdAt: new Date().toISOString()
  };
  const token = genToken();
  db.tokens[token] = u;
  writeDB(db);
  res.json({ ok: true, token, username: u });
});

// ── LOGIN ────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  const db = readDB();
  const u = username.toLowerCase().trim();
  const user = db.users[u];
  if (!user) return res.status(401).json({ error: 'Compte introuvable' });
  if (user.pwd !== hash(password)) return res.status(401).json({ error: 'Mot de passe incorrect' });

  const token = genToken();
  db.tokens[token] = u;
  writeDB(db);
  res.json({ ok: true, token, username: u, user: sanitize(user) });
});

// ── GET USER DATA ────────────────────────────────────
app.get('/api/user', auth, (req, res) => {
  const db = readDB();
  const user = db.users[req.username];
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json({ ok: true, username: req.username, user: sanitize(user) });
});

// ── SAVE USER DATA ───────────────────────────────────
app.put('/api/user', auth, (req, res) => {
  const { profile, workouts, weight } = req.body;
  const db = readDB();
  const user = db.users[req.username];
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  if (profile !== undefined) user.profile = profile;
  if (workouts !== undefined) user.workouts = workouts;
  if (weight !== undefined) user.weight = weight;
  db.users[req.username] = user;
  writeDB(db);
  res.json({ ok: true });
});

// ── LOGOUT ───────────────────────────────────────────
app.post('/api/logout', auth, (req, res) => {
  const token = req.headers['x-token'];
  const db = readDB();
  delete db.tokens[token];
  writeDB(db);
  res.json({ ok: true });
});

// ── HEALTH ───────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true, version: 1 }));

function sanitize(user) {
  const { pwd, ...safe } = user;
  return safe;
}

// ── START ────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(ifaces)) {
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) { localIP = info.address; break; }
    }
  }
  console.log(`\n🔥 FitFlex Server running`);
  console.log(`   Local  : http://localhost:${PORT}`);
  console.log(`   Réseau : http://${localIP}:${PORT}  ← ouvre ça sur ton iPhone\n`);
});
