const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const VIDEO_DIR = path.join(ROOT, "videos");
const POSTER_DIR = path.join(ROOT, "posters");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "videos.json");

// =========================
// FOLDERS
// =========================

for (const dir of [VIDEO_DIR, POSTER_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

// =========================
// MIDDLEWARE
// =========================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(ROOT));
app.use("/videos", express.static(VIDEO_DIR));
app.use("/posters", express.static(POSTER_DIR));

// =========================
// DATABASE
// =========================

function readDB() {
  try {
    const data = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(data);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("DB READ ERROR:", error);
    return [];
  }
}

function writeDB(data) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

// =========================
// MULTER
// =========================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    if (file.fieldname === "poster") {
      cb(null, POSTER_DIR);
    } else {
      cb(null, VIDEO_DIR);
    }

  },

  filename: (req, file, cb) => {

    const ext = path.extname(file.originalname).toLowerCase();

    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);

    const filename =
      Date.now() +
      "_" +
      base +
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

    // VIDEO
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
        path.extname(file.originalname).toLowerCase();

      if (!allowedVideos.includes(ext)) {
        return cb(
          new Error(
            "Unsupported video format."
          )
        );
      }

      return cb(null, true);
    }

    // THUMBNAIL
    if (file.fieldname === "poster") {

      const allowedImages = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
      ];

      const ext =
        path.extname(file.originalname).toLowerCase();

      if (!allowedImages.includes(ext)) {
        return cb(
          new Error(
            "Thumbnail must be JPG, JPEG, PNG or WEBP."
          )
        );
      }

      return cb(null, true);
    }

    cb(null, true);
  }

});

// =========================
// HOME
// =========================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(ROOT, "index.html")
  );
});

// =========================
// GET VIDEOS
// =========================

app.get("/api/videos", (req, res) => {

  const videos = readDB();

  const result = videos.map(video => ({

    ...video,

    url:
      "/api/stream/" +
      encodeURIComponent(video.id)

  }));

  res.json(result);
});

// =========================
// UPLOAD
// =========================

app.post(
  "/api/upload",

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

      console.log("UPLOAD BODY:", req.body);
      console.log(
        "UPLOAD FILES:",
        req.files
      );

      const videoFile =
        req.files?.video?.[0];

      const posterFile =
        req.files?.poster?.[0];

      // VIDEO REQUIRED
      if (!videoFile) {

        return res.status(400).json({
          ok: false,
          error: "Please select a video."
        });

      }

      // TITLE
      const title =
        String(
          req.body.title ||
          videoFile.originalname ||
          "Untitled Movie"
        )
          .trim()
          .slice(0, 200);

      const id =
        Date.now().toString();

      const movie = {

        id,

        title,

        filename:
          videoFile.filename,

        originalName:
          videoFile.originalname,

        size:
          videoFile.size,

        poster:
          posterFile
            ? "/posters/" +
              posterFile.filename
            : null,

        uploadedAt:
          new Date().toISOString()

      };

      const videos = readDB();

      videos.unshift(movie);

      writeDB(videos);

      console.log(
        "UPLOAD SUCCESS:",
        movie
      );

      res.json({

        ok: true,

        message:
          "Movie uploaded successfully.",

        video: {

          ...movie,

          url:
            "/api/stream/" +
            encodeURIComponent(id)

        }

      });

    } catch (error) {

      console.error(
        "UPLOAD ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          error.message ||
          "Upload failed."

      });

    }

  }
);

// =========================
// STREAM VIDEO
// =========================

app.get(
  "/api/stream/:id",
  (req, res) => {

    try {

      const id =
        req.params.id;

      const videos =
        readDB();

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
          VIDEO_DIR,
          video.filename
        );

      if (!fs.existsSync(videoPath)) {

        return res
          .status(404)
          .send(
            "Video file not found"
          );

      }

      const stat =
        fs.statSync(videoPath);

      const fileSize =
        stat.size;

      const ext =
        path
          .extname(video.filename)
          .toLowerCase();

      const mimeTypes = {

        ".mp4":
          "video/mp4",

        ".webm":
          "video/webm",

        ".m4v":
          "video/mp4",

        ".mov":
          "video/quicktime",

        ".avi":
          "video/x-msvideo",

        ".mkv":
          "video/x-matroska"

      };

      const contentType =
        mimeTypes[ext] ||
        "video/mp4";

      const range =
        req.headers.range;

      // NORMAL REQUEST
      if (!range) {

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

      // RANGE REQUEST
      const parts =
        range
          .replace(/bytes=/, "")
          .split("-");

      const start =
        parseInt(parts[0], 10);

      const end =
        parts[1]
          ? parseInt(parts[1], 10)
          : fileSize - 1;

      if (
        Number.isNaN(start) ||
        start < 0 ||
        start >= fileSize
      ) {

        res.status(416);

        res.setHeader(
          "Content-Range",
          `bytes */${fileSize}`
        );

        return res.end();

      }

      const safeEnd =
        Math.min(
          end,
          fileSize - 1
        );

      const chunkSize =
        safeEnd - start + 1;

      res.writeHead(206, {

        "Content-Range":
          `bytes ${start}-${safeEnd}/${fileSize}`,

        "Accept-Ranges":
          "bytes",

        "Content-Length":
          chunkSize,

        "Content-Type":
          contentType

      });

      fs
        .createReadStream(
          videoPath,
          {
            start,
            end: safeEnd
          }
        )
        .pipe(res);

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );

      res
        .status(500)
        .send("Streaming error");

    }

  }
);

// =========================
// DELETE VIDEO
// =========================

app.delete(
  "/api/videos/:id",
  (req, res) => {

    try {

      const id =
        req.params.id;

      const videos =
        readDB();

      const index =
        videos.findIndex(
          video =>
            video.id === id
        );

      if (index === -1) {

        return res.status(404).json({

          ok: false,

          error:
            "Movie not found."

        });

      }

      const video =
        videos[index];

      // DELETE VIDEO FILE
      const videoPath =
        path.join(
          VIDEO_DIR,
          video.filename
        );

      if (
        fs.existsSync(videoPath)
      ) {

        fs.unlinkSync(
          videoPath
        );

      }

      // DELETE POSTER
      if (video.poster) {

        const posterName =
          path.basename(
            video.poster
          );

        const posterPath =
          path.join(
            POSTER_DIR,
            posterName
          );

        if (
          fs.existsSync(
            posterPath
          )
        ) {

          fs.unlinkSync(
            posterPath
          );

        }

      }

      videos.splice(index, 1);

      writeDB(videos);

      res.json({

        ok: true,

        message:
          "Movie deleted."

      });

    } catch (error) {

      console.error(
        "DELETE ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Delete failed."

      });

    }

  }
);

// =========================
// HEALTH
// =========================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      ok: true,

      status: "online",

      website:
        "My Movie Watch"

    });

  }
);

// =========================
// ERROR HANDLER
// =========================

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );

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

// =========================
// START
// =========================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "================================"
    );
    console.log(
      "      MY MOVIE WATCH"
    );
    console.log(
      "================================"
    );
    console.log(
      "Server running on port:",
      PORT
    );
    console.log(
      "No password required"
    );
    console.log(
      "Thumbnail upload enabled"
    );
    console.log(
      "Title upload enabled"
    );
    console.log(
      "================================"
    );

  }
);
