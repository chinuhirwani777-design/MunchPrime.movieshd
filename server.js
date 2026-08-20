const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.SITE_PASSWORD || "friends123";

const publicDir = path.join(__dirname, "public");
const videoDir = path.join(__dirname, "videos");
const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "videos.json");

for (const d of [videoDir, dataDir]) fs.mkdirSync(d, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "[]");

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(publicDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, videoDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 * 1024 }
});

function readDB() { return JSON.parse(fs.readFileSync(dbFile, "utf8")); }
function writeDB(x) { fs.writeFileSync(dbFile, JSON.stringify(x, null, 2)); }

function auth(req, res, next) {
  const pass = req.headers["x-site-password"];
  if (pass !== PASSWORD) return res.status(401).json({error:"Wrong password"});
  next();
}

app.post("/api/login", (req,res) => {
  res.json({ok: req.body.password === PASSWORD});
});

app.get("/api/videos", auth, (req,res) => {
  res.json(readDB().map(v => ({...v, url:"/api/stream/"+v.id})));
});

app.post("/api/upload", auth, upload.single("video"), (req,res) => {
  if (!req.file) return res.status(400).json({error:"No video selected"});
  const db=readDB();
  const item={
    id:req.file.filename,
    title:req.body.title || req.file.originalname,
    filename:req.file.filename,
    originalName:req.file.originalname,
    size:req.file.size,
    createdAt:new Date().toISOString()
  };
  db.unshift(item); writeDB(db);
  res.json(item);
});

app.delete("/api/videos/:id", auth, (req,res) => {
  const db=readDB();
  const item=db.find(v=>v.id===req.params.id);
  if(!item) return res.status(404).json({error:"Not found"});
  const file=path.join(videoDir,item.filename);
  if(fs.existsSync(file)) fs.unlinkSync(file);
  writeDB(db.filter(v=>v.id!==req.params.id));
  res.json({ok:true});
});

// Range streaming support so users can seek through large videos.
app.get("/api/stream/:id", auth, (req,res) => {
  const item=readDB().find(v=>v.id===req.params.id);
  if(!item) return res.sendStatus(404);
  const file=path.join(videoDir,item.filename);
  if(!fs.existsSync(file)) return res.sendStatus(404);

  const stat=fs.statSync(file);
  const range=req.headers.range;
  const ext=path.extname(file).toLowerCase();
  const mime={".mp4":"video/mp4",".webm":"video/webm",".ogg":"video/ogg"}[ext] || "application/octet-stream";

  if(!range){
    res.writeHead(200, {"Content-Length":stat.size,"Content-Type":mime,"Accept-Ranges":"bytes"});
    return fs.createReadStream(file).pipe(res);
  }
  const [startS,endS]=range.replace("bytes=","").split("-");
  const start=parseInt(startS,10);
  const end=endS ? parseInt(endS,10) : stat.size-1;
  const chunk=end-start+1;
  res.writeHead(206,{
    "Content-Range":`bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges":"bytes",
    "Content-Length":chunk,
    "Content-Type":mime
  });
  fs.createReadStream(file,{start,end}).pipe(res);
});

app.listen(PORT,()=>console.log(`Movie Watch running at http://localhost:${PORT}`));
