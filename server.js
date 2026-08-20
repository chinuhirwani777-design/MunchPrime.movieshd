const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================================
   BASIC SETTINGS
========================================= */

const PORT = process.env.PORT || 3000;

const publicDir = __dirname;
const videoDir = path.join(__dirname, "videos");
const posterDir = path.join(__dirname, "posters");
const dataDir = path.join(__dirname, "data");

const dbFile = path.join(dataDir, "videos.json");

/* =========================================
   CREATE FOLDERS
========================================= */

for (const folder of [videoDir, posterDir, dataDir]) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
}

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, "[]", "utf8");
}

/* =========================================
   MIDDLEWARE
========================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(publicDir));

/* =========================================
   STATIC POSTERS
========================================= */

app.use("/posters", express.static(posterDir));

/* =========================================
   DATABASE
========================================= */

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

/* =========================================
   AUTH
   PASSWORD LOGIN REMOVED
========================================= */

function auth(req, res, next) {
  // No password required
  next();
}

/* =========================================
   MULTER STORAGE
========================================= */

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    if (file.fieldname === "poster") {
      cb(null, posterDir);
    } else {
      cb(null, videoDir);
    }

  },

  filename: (req, file, cb) => {

    const ext =
      path.extname(file.originalname || "").toLowerCase();

    const originalName =
      path.basename(
        file.originalname || "file",
        ext
      );

    const safeName =
      originalName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 80);

    const filename =
      Date.now() +
      "_" +
      safeName +
      ext;

    cb(null, filename);

  }

});

/* =========================================
   MULTER UPLOAD
========================================= */

const upload = multer({

  storage: storage,

  limits: {
    fileSize: 8 * 1024 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {

    if (file.fieldname === "video") {

      const allowedVideos = [
        ".mp4",
        ".webm",
        ".mkv",
        ".mov",
        ".avi",
        ".m4v"
      ];

      const ext =
        path.extname(file.originalname || "")
          .toLowerCase();

      if (!allowedVideos.includes(ext)) {

        return cb(
          new Error(
            "Only MP4, WebM, MKV, MOV, AVI and M4V videos are allowed."
          )
        );

      }

    }

    if (file.fieldname === "poster") {

      const allowedPosters = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
      ];

      const ext =
        path.extname(file.originalname || "")
          .toLowerCase();

      if (!allowedPosters.includes(ext)) {

        return cb(
          new Error(
            "Only JPG, JPEG, PNG and WEBP posters are allowed."
          )
        );

      }

    }

    cb(null, true);

  }

});

/* =========================================
   HOME PAGE
========================================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "index.html")
  );

});

/* =========================================
   LOGIN API
   NO PASSWORD REQUIRED
========================================= */

app.post("/api/login", (req, res) => {

  res.json({
    ok: true,
    message: "Login successful"
  });

});

/* =========================================
   GET VIDEO LIST
========================================= */

app.get("/api/videos", auth, (req, res) => {

  try {

    const videos = readDB();

    const result = videos.map(video => ({

      ...video,

      url:
        "/api/stream/" +
        encodeURIComponent(video.id)

    }));

    res.json(result);

  } catch (error) {

    console.error("Get videos error:", error);

    res.status(500).json({
      ok: false,
      error: "Could not load videos"
    });

  }

});

/* =========================================
   UPLOAD VIDEO + POSTER
========================================= */

app.post(
  "/api/upload",
  auth,
  upload.fields([
    {
      name: "video",
      maxCount: 1
    },
    {
      name: "poster",
      maxCount: 1
    }
  ]),
  (req, res) => {

    try {

      const videoFile =
        req.files &&
        req.files.video &&
        req.files.video[0];

      const posterFile =
        req.files &&
        req.files.poster &&
        req.files.poster[0];

      if (!videoFile) {

        return res.status(400).json({
          ok: false,
          error: "No video selected"
        });

      }

      const title =
        String(
          req.body.title ||
          videoFile.originalname ||
          "Untitled Video"
        )
          .trim()
          .slice(0, 150);

      const videos = readDB();

      const video = {

        id: Date.now().toString(),

        title: title,

        filename: videoFile.filename,

        originalName:
          videoFile.originalname,

        size: videoFile.size,

        poster:
          posterFile
            ? "/posters/" + posterFile.filename
            : null,

        uploadedAt:
          new Date().toISOString()

      };

      videos.unshift(video);

      writeDB(videos);

      res.json({

        ok: true,

        message:
          "Video uploaded successfully",

        video: {

          ...video,

          url:
            "/api/stream/" +
            encodeURIComponent(video.id)

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

/* =========================================
   STREAM VIDEO
========================================= */

app.get(
  "/api/stream/:id",
  auth,
  (req, res) => {

    try {

      const id = req.params.id;

      const videos = readDB();

      const video =
        videos.find(
          item => item.id === id
        );

      if (!video) {

        return res
          .status(404)
          .send("Video not found");

      }

      const videoPath =
        path.join(
          videoDir,
          video.filename
        );

      if (!fs.existsSync(videoPath)) {

        return res
          .status(404)
          .send("Video file not found");

      }

      const stat =
        fs.statSync(videoPath);

      const fileSize = stat.size;

      const range =
        req.headers.range;

      /*
        NORMAL REQUEST
      */

      if (!range) {

        const ext =
          path.extname(video.filename)
            .toLowerCase();

        let contentType =
          "video/mp4";

        if (ext === ".webm") {
          contentType = "video/webm";
        }

        if (ext === ".mov") {
          contentType = "video/quicktime";
        }

        if (ext === ".m4v") {
          contentType = "video/x-m4v";
        }

        res.writeHead(200, {

          "Content-Length":
            fileSize,

          "Content-Type":
            contentType,

          "Accept-Ranges":
            "bytes"

        });

        return fs
          .createReadStream(videoPath)
          .pipe(res);

      }

      /*
        RANGE REQUEST
        FOR VIDEO SEEKING
      */

      const parts =
        range
          .replace(/bytes=/, "")
          .split("-");

      const start =
        parseInt(parts[0], 10);

      const requestedEnd =
        parts[1]
          ? parseInt(parts[1], 10)
          : fileSize - 1;

      const end =
        Math.min(
          requestedEnd,
          fileSize - 1
        );

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        start >= fileSize ||
        start > end
      ) {

        res.status(416).set({

          "Content-Range":
            `bytes */${fileSize}`

        });

        return res.end();

      }

      const chunkSize =
        end - start + 1;

      const ext =
        path.extname(video.filename)
          .toLowerCase();

      let contentType =
        "video/mp4";

      if (ext === ".webm") {
        contentType = "video/webm";
      }

      if (ext === ".mov") {
        contentType = "video/quicktime";
      }

      if (ext === ".m4v") {
        contentType = "video/x-m4v";
      }

      res.writeHead(206, {

        "Content-Range":
          `bytes ${start}-${end}/${fileSize}`,

        "Accept-Ranges":
          "bytes",

        "Content-Length":
          chunkSize,

        "Content-Type":
          contentType

      });

      fs
        .createReadStream(videoPath, {
          start: start,
          end: end
        })
        .pipe(res);

    } catch (error) {

      console.error(
        "Streaming error:",
        error
      );

      if (!res.headersSent) {

        res
          .status(500)
          .send("Streaming error");

      }

    }

  }
);

/* =========================================
   DELETE VIDEO
========================================= */

app.delete(
  "/api/videos/:id",
  auth,
  (req, res) => {

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

          error:
            "Video not found"

        });

      }

      const video =
        videos[index];

      /*
        DELETE VIDEO FILE
      */

      if (video.filename) {

        const videoPath =
          path.join(
            videoDir,
            video.filename
          );

        if (fs.existsSync(videoPath)) {

          fs.unlinkSync(videoPath);

        }

      }

      /*
        DELETE POSTER
      */

      if (video.poster) {

        const posterName =
          path.basename(
            video.poster
          );

        const posterPath =
          path.join(
            posterDir,
            posterName
          );

        if (fs.existsSync(posterPath)) {

          fs.unlinkSync(posterPath);

        }

      }

      /*
        DELETE DATABASE ENTRY
      */

      videos.splice(index, 1);

      writeDB(videos);

      res.json({

        ok: true,

        message:
          "Video deleted successfully"

      });

    } catch (error) {

      console.error(
        "Delete error:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Delete failed"

      });

    }

  }
);

/* =========================================
   HEALTH CHECK
========================================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      ok: true,

      website:
        "MunchPrime Movie Watch",

      status:
        "online"

    });

  }
);

/* =========================================
   ERROR HANDLER
========================================= */

app.use(
  (error, req, res, next) => {

    console.error(error);

    if (
      error instanceof
      multer.MulterError
    ) {

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
        "Server error"

    });

  }
);

/* =========================================
   START SERVER
========================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "================================="
    );
    console.log(
      "       MUNCHPRIME MOVIE WATCH"
    );
    console.log(
      "================================="
    );
    console.log(
      "Server running on port:",
      PORT
    );
    console.log(
      "Password login: DISABLED"
    );
    console.log(
      "Website is ready!"
    );
    console.log(
      "================================="
    );

  }
);
