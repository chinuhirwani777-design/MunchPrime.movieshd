const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================
   BASIC SETTINGS
========================= */

const PORT = process.env.PORT || 3000;


const publicDir = __dirname;
const videoDir = path.join(__dirname, "videos");
const dataDir = path.join(__dirname, "data");

const dbFile = path.join(dataDir, "videos.json");

/* =========================
   CREATE FOLDERS
========================= */

for (const folder of [videoDir, dataDir]) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
}

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, "[]", "utf8");
}

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(publicDir));

/* =========================
   DATABASE
========================= */

function readDB() {
  try {
    const data = fs.readFileSync(dbFile, "utf8");
    const json = JSON.parse(data);

    return Array.isArray(json) ? json : [];
  } catch (error) {
    console.error("Database read error:", error);
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(
    dbFile,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* =========================
   AUTHENTICATION
========================= */


/* =========================
   FILE UPLOAD
========================= */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, videoDir);
  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname);

    const safeName =
      path.basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 80);

    const filename =
      Date.now() +
      "_" +
      safeName +
      ext.toLowerCase();

    cb(null, filename);
  }
});

const upload = multer({

  storage,

  limits: {
    fileSize: 8 * 1024 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const allowed = [
      ".mp4",
      ".webm",
      ".mkv",
      ".mov",
      ".avi",
      ".m4v"
    ];

    const ext =
      path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      return cb(
        new Error(
          "Only MP4, WebM, MKV, MOV, AVI and M4V videos are allowed."
        )
      );
    }

    cb(null, true);
  }

});

/* =========================
   HOME PAGE
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {

  const password = req.body.password || "";

  if (password === PASSWORD) {

    return res.json({
      ok: true,
      message: "Login successful"
    });

  }

  return res.status(401).json({
    ok: false,
    error: "Wrong password"
  });

});

/* =========================
   GET MOVIE LIST
========================= */

app.get("/api/videos", auth, (req, res) => {

  const videos = readDB();

  const result = videos.map(video => ({
    ...video,
    url: `/api/stream/${encodeURIComponent(video.id)}`
  }));

  res.json(result);

});

/* =========================
   UPLOAD VIDEO
========================= */

app.post(
  "/api/upload",
  auth,
  upload.single("video"),
  (req, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: "No video selected"
        });
      }

      const title =
        (req.body.title || req.file.originalname)
          .trim()
          .slice(0, 150);

      const videos = readDB();

      const video = {

        id: Date.now().toString(),

        title,

        filename: req.file.filename,

        originalName: req.file.originalname,

        size: req.file.size,

        uploadedAt: new Date().toISOString()

      };

      videos.unshift(video);

      writeDB(videos);

      res.json({

        ok: true,

        message: "Video uploaded successfully",

        video: {
          ...video,
          url: `/api/stream/${encodeURIComponent(video.id)}`
        }

      });

    } catch (error) {

      console.error("Upload error:", error);

      res.status(500).json({
        ok: false,
        error: "Upload failed"
      });

    }

  }
);

/* =========================
   STREAM VIDEO
========================= */

app.get("/api/stream/:id", auth, (req, res) => {

  try {

    const id = req.params.id;

    const videos = readDB();

    const video = videos.find(
      item => item.id === id
    );

    if (!video) {
      return res.status(404).send("Video not found");
    }

    const videoPath =
      path.join(videoDir, video.filename);

    if (!fs.existsSync(videoPath)) {
      return res.status(404).send("Video file not found");
    }

    const stat =
      fs.statSync(videoPath);

    const fileSize = stat.size;

    const range = req.headers.range;

    /* NORMAL REQUEST */

    if (!range) {

      res.writeHead(200, {

        "Content-Length": fileSize,

        "Content-Type": "video/mp4",

        "Accept-Ranges": "bytes",

        "Cache-Control": "public, max-age=3600"

      });

      return fs
        .createReadStream(videoPath)
        .pipe(res);

    }

    /* RANGE REQUEST */

    const parts =
      range.replace(/bytes=/, "").split("-");

    const start =
      parseInt(parts[0], 10);

    const end =
      parts[1]
        ? parseInt(parts[1], 10)
        : fileSize - 1;

    if (
      Number.isNaN(start) ||
      start >= fileSize ||
      end >= fileSize
    ) {

      res.status(416).set({
        "Content-Range":
          `bytes */${fileSize}`
      });

      return res.end();

    }

    const chunkSize =
      end - start + 1;

    res.writeHead(206, {

      "Content-Range":
        `bytes ${start}-${end}/${fileSize}`,

      "Accept-Ranges": "bytes",

      "Content-Length": chunkSize,

      "Content-Type": "video/mp4",

      "Cache-Control": "public, max-age=3600"

    });

    fs
      .createReadStream(videoPath, {
        start,
        end
      })
      .pipe(res);

  } catch (error) {

    console.error("Streaming error:", error);

    res.status(500).send("Streaming error");

  }

});

/* =========================
   DELETE VIDEO
========================= */

app.delete("/api/videos/:id", auth, (req, res) => {

  try {

    const id = req.params.id;

    const videos = readDB();

    const index =
      videos.findIndex(
        video => video.id === id
      );

    if (index === -1) {

      return res.status(404).json({
        ok: false,
        error: "Video not found"
      });

    }

    const video = videos[index];

    const videoPath =
      path.join(videoDir, video.filename);

    /* DELETE FILE */

    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    /* DELETE DATABASE ENTRY */

    videos.splice(index, 1);

    writeDB(videos);

    res.json({

      ok: true,

      message: "Video deleted successfully"

    });

  } catch (error) {

    console.error("Delete error:", error);

    res.status(500).json({
      ok: false,
      error: "Delete failed"
    });

  }

});

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {

  res.json({
    ok: true,
    website: "My Movie Watch",
    status: "online"
  });

});

/* =========================
   ERROR HANDLER
========================= */

app.use((error, req, res, next) => {

  console.error(error);

  if (error instanceof multer.MulterError) {

    return res.status(400).json({
      ok: false,
      error: "Upload error: " + error.message
    });

  }

  res.status(500).json({
    ok: false,
    error: error.message || "Server error"
  });

});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("================================");
  console.log("       MY MOVIE WATCH");
  console.log("================================");
  console.log("Server running on port:", PORT);
  console.log("Website is ready!");
  console.log("================================");

});// Middleware
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
  const PASSWORD = process.env.SITE_PASSWORD || "friends123";

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

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "poster") {
      cb(null, posterDir);
    } else {
      cb(null, videoDir);
    }
  },

  filename: (req, file, cb) => {
    const original = file.originalname || "file";
    const safeName = original.replace(/[^a-zA-Z0-9.-]/g, "");

    cb(null, Date.now() + "-" + safeName);
  }
});

const upload = multer({
  storage: mediaStorage,

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
// UPLOAD VIDEO + POSTER
// =========================
app.post(
  "/api/upload",
  auth,
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "poster", maxCount: 1 }
  ]),
  (req, res) => {

    const videoFile = req.files?.video?.[0];
    const posterFile = req.files?.poster?.[0];

    if (!videoFile) {
      return res.status(400).json({
        error: "No video selected"
      });
    }

    const videos = readDB();

    const video = {
      id: Date.now().toString(),
      title: req.body.title || videoFile.originalname,
      filename: videoFile.filename,
      originalName: videoFile.originalname,
      size: videoFile.size,
      poster: posterFile ? "/posters/" + posterFile.filename : null,
      uploadedAt: new Date().toISOString()
    };

    videos.push(video);
    writeDB(videos);

    res.json({
      ok: true,
      message: "Video and poster uploaded successfully",
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
app.get('/api/stream/:id', (req, res) => {

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
