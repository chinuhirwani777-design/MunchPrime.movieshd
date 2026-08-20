const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const VIDEO_DIR = path.join(ROOT, "videos");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "videos.json");

// ===============================
// CREATE FOLDERS
// ===============================

for (const dir of [VIDEO_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(ROOT));

// ===============================
// DATABASE
// ===============================

function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    const videos = JSON.parse(data);

    return Array.isArray(videos) ? videos : [];
  } catch (error) {
    console.error("Database read error:", error);
    return [];
  }
}

function writeDB(videos) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(videos, null, 2),
    "utf8"
  );
}

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// ===============================
// MULTER
// ===============================

const allowedExtensions = [
  ".mp4",
  ".webm",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v"
];

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, VIDEO_DIR);
  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname).toLowerCase();

    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);

    const filename =
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 8) +
      "_" +
      baseName +
      ext;

    cb(null, filename);
  }

});

const upload = multer({

  storage,

  limits: {
    fileSize: 8 * 1024 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    if (!allowedExtensions.includes(ext)) {

      return cb(
        new Error(
          "Only MP4, WebM, MKV, MOV, AVI and M4V videos are allowed."
        )
      );

    }

    cb(null, true);
  }

});

// ===============================
// GET MOVIES
// ===============================

app.get("/api/videos", (req, res) => {

  try {

    const videos = readDB();

    const result = videos.map(video => ({
      id: video.id,
      title: video.title,
      originalName: video.originalName,
      size: video.size,
      uploadedAt: video.uploadedAt,
      url: "/api/stream/" + encodeURIComponent(video.id)
    }));

    res.json(result);

  } catch (error) {

    console.error("GET VIDEOS ERROR:", error);

    res.status(500).json({
      ok: false,
      error: "Could not load movies"
    });

  }

});

// ===============================
// UPLOAD MOVIE
// ===============================

app.post(
  "/api/upload",
  upload.single("video"),
  (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          ok: false,
          error: "Please select a video."
        });

      }

      const title =
        (req.body.title || req.file.originalname)
          .trim()
          .slice(0, 150);

      const videos = readDB();

      const movie = {

        id:
          Date.now().toString() +
          "_" +
          Math.random().toString(36).slice(2, 8),

        title: title,

        filename: req.file.filename,

        originalName: req.file.originalname,

        size: req.file.size,

        uploadedAt: new Date().toISOString()

      };

      videos.unshift(movie);

      writeDB(videos);

      console.log("Movie uploaded:", movie.title);

      res.json({

        ok: true,

        message: "Movie uploaded successfully.",

        movie: {

          id: movie.id,

          title: movie.title,

          originalName: movie.originalName,

          size: movie.size,

          uploadedAt: movie.uploadedAt,

          url:
            "/api/stream/" +
            encodeURIComponent(movie.id)

        }

      });

    } catch (error) {

      console.error("UPLOAD ERROR:", error);

      res.status(500).json({

        ok: false,

        error: "Upload failed."

      });

    }

  }
);

// ===============================
// STREAM VIDEO
// ===============================

app.get("/api/stream/:id", (req, res) => {

  try {

    const id = req.params.id;

    const videos = readDB();

    const movie = videos.find(
      video => video.id === id
    );

    if (!movie) {

      return res
        .status(404)
        .send("Movie not found.");

    }

    const videoPath =
      path.join(VIDEO_DIR, movie.filename);

    if (!fs.existsSync(videoPath)) {

      return res
        .status(404)
        .send("Video file not found.");

    }

    const stat = fs.statSync(videoPath);

    const fileSize = stat.size;

    const ext =
      path.extname(movie.filename)
        .toLowerCase();

    const mimeTypes = {

      ".mp4": "video/mp4",

      ".webm": "video/webm",

      ".mkv": "video/x-matroska",

      ".mov": "video/quicktime",

      ".avi": "video/x-msvideo",

      ".m4v": "video/mp4"

    };

    const contentType =
      mimeTypes[ext] || "application/octet-stream";

    const range = req.headers.range;

    // =========================
    // NORMAL REQUEST
    // =========================

    if (!range) {

      res.writeHead(200, {

        "Content-Length": fileSize,

        "Content-Type": contentType,

        "Accept-Ranges": "bytes",

        "Cache-Control": "no-cache"

      });

      return fs
        .createReadStream(videoPath)
        .pipe(res);

    }

    // =========================
    // RANGE REQUEST
    // =========================

    const match =
      range.match(/bytes=(\d*)-(\d*)/);

    if (!match) {

      return res
        .status(416)
        .set({
          "Content-Range":
            `bytes */${fileSize}`
        })
        .end();

    }

    let start =
      match[1]
        ? parseInt(match[1], 10)
        : 0;

    let end =
      match[2]
        ? parseInt(match[2], 10)
        : fileSize - 1;

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      start >= fileSize
    ) {

      return res
        .status(416)
        .set({
          "Content-Range":
            `bytes */${fileSize}`
        })
        .end();

    }

    if (end >= fileSize) {
      end = fileSize - 1;
    }

    if (end < start) {

      return res
        .status(416)
        .set({
          "Content-Range":
            `bytes */${fileSize}`
        })
        .end();

    }

    const chunkSize =
      end - start + 1;

    res.writeHead(206, {

      "Content-Range":
        `bytes ${start}-${end}/${fileSize}`,

      "Accept-Ranges": "bytes",

      "Content-Length": chunkSize,

      "Content-Type": contentType,

      "Cache-Control": "no-cache"

    });

    fs
      .createReadStream(videoPath, {
        start,
        end
      })
      .pipe(res);

  } catch (error) {

    console.error("STREAM ERROR:", error);

    if (!res.headersSent) {
      res
        .status(500)
        .send("Streaming error.");
    }

  }

});

// ===============================
// DELETE MOVIE
// ===============================

app.delete("/api/videos/:id", (req, res) => {

  try {

    const id = req.params.id;

    const videos = readDB();

    const index = videos.findIndex(
      video => video.id === id
    );

    if (index === -1) {

      return res.status(404).json({

        ok: false,

        error: "Movie not found."

      });

    }

    const movie = videos[index];

    const videoPath =
      path.join(VIDEO_DIR, movie.filename);

    if (fs.existsSync(videoPath)) {

      fs.unlinkSync(videoPath);

    }

    videos.splice(index, 1);

    writeDB(videos);

    console.log("Movie deleted:", movie.title);

    res.json({

      ok: true,

      message: "Movie deleted successfully."

    });

  } catch (error) {

    console.error("DELETE ERROR:", error);

    res.status(500).json({

      ok: false,

      error: "Delete failed."

    });

  }

});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {

  res.json({

    ok: true,

    status: "online",

    website: "My Movie Watch"

  });

});

// ===============================
// 404 API
// ===============================

app.use("/api", (req, res) => {

  res.status(404).json({

    ok: false,

    error: "API route not found."

  });

});

// ===============================
// ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {

  console.error("SERVER ERROR:", error);

  if (error instanceof multer.MulterError) {

    return res.status(400).json({

      ok: false,

      error:
        "Upload error: " +
        error.message

    });

  }

  res.status(500).json({

    ok: false,

    error:
      error.message ||
      "Server error."

  });

});

// ===============================
// START
// ===============================

app.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("=================================");
  console.log("       MY MOVIE WATCH");
  console.log("=================================");
  console.log("Server running on port:", PORT);
  console.log("No password authentication");
  console.log("Movie upload: ENABLED");
  console.log("Movie streaming: ENABLED");
  console.log("Movie delete: ENABLED");
  console.log("=================================");
  console.log("");

});
