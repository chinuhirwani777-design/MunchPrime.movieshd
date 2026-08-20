const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

// Render ka PORT automatically use hoga
const PORT = process.env.PORT || 3000;

// Website password
const PASSWORD = process.env.SITE_PASSWORD || "friends123";

// Folders
const publicDir = __dirname;
const videoDir = path.join(__dirname, "videos");
const dataDir = path.join(__dirname, "data");
const dbFile = path.join(dataDir, "videos.json");

// Folders automatically create karo
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, "[]", "utf8");
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Website files
app.use(express.static(publicDir));

// =========================
// HOME PAGE
// =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =========================
// DATABASE FUNCTIONS
// =========================
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
  } catch (error) {
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), "utf8");
}

// =========================
// LOGIN
// =========================
app.post("/api/login", (req, res) => {
  const password = req.body.password || "";

  if (password === PASSWORD) {
    return res.json({
      ok: true,
      message: "Login successful"
    });
  }

  res.status(401).json({
    ok: false,
    error: "Wrong password"
  });
});

// =========================
// AUTH CHECK
// =========================
function auth(req, res, next) {
  const pass = req.headers["x-site-password"];

  if (pass !== PASSWORD) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

// =========================
// MULTER STORAGE
// =========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoDir);
  },

  filename: (req, file, cb) => {
    const original = file.originalname || "video";
    const safeName = original.replace(/[^a-zA-Z0-9.-]/g, "");

    cb(null, Date.now() + "-" + safeName);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 8 * 1024 * 1024 * 1024
  }
});

// =========================
// GET VIDEO LIST
// =========================
app.get("/api/videos", auth, (req, res) => {
  const videos = readDB();

  res.json(
    videos.map(video => ({
      ...video,
      url: "/api/stream/" + video.id
    }))
  );
});

// =========================
// UPLOAD VIDEO
// =========================
app.post(
  "/api/upload",
  auth,
  upload.single("video"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "No video selected"
      });
    }

    const videos = readDB();

    const video = {
      id: Date.now().toString(),
      title: req.body.title || req.file.originalname,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    videos.push(video);
    writeDB(videos);

    res.json({
      ok: true,
      message: "Video uploaded successfully",
      video: {
        ...video,
        url: "/api/stream/" + video.id
      }
    });
  }
);

// =========================
// STREAM VIDEO
// =========================
app.get("/api/stream/:id", auth, (req, res) => {

  const videos = readDB();

  const video = videos.find(v => v.id === req.params.id);

  if (!video) {
    return res.status(404).send("Video not found");
  }

  const videoPath = path.join(videoDir, video.filename);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).send("Video file not found");
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;

  const range = req.headers.range;

  // Normal request
  if (!range) {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes"
    });

    fs.createReadStream(videoPath).pipe(res);
    return;
  }

  // Range request for video seeking
  const parts = range.replace(/bytes=/, "").split("-");

  const start = parseInt(parts[0], 10);
  const end = parts[1]
    ? parseInt(parts[1], 10)
    : fileSize - 1;

  const chunkSize = end - start + 1;

  const stream = fs.createReadStream(videoPath, {
    start,
    end
  });

  res.writeHead(206, {
   "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": "video/mp4"
  });

  stream.pipe(res);
});

// =========================
// DELETE VIDEO
// =========================
app.delete("/api/videos/:id", auth, (req, res) => {

  const videos = readDB();

  const index = videos.findIndex(v => v.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      error: "Video not found"
    });
  }

  const video = videos[index];
  const videoPath = path.join(videoDir, video.filename);

  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
  }

  videos.splice(index, 1);
  writeDB(videos);

  res.json({
    ok: true,
    message: "Video deleted"
  });
});

// =========================
// ERROR HANDLER
// =========================
app.use((err, req, res, next) => {

  console.error(err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: "Upload error: " + err.message
    });
  }

  res.status(500).json({
    error: "Server error"
  });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("MunchPrime Movie Server Started");
  console.log("Port:", PORT);
  console.log("Website is ready");
  console.log("=================================");
});
