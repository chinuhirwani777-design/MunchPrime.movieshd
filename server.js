const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================
// DIRECTORIES
// =====================================

const ROOT_DIR = __dirname;

const VIDEO_DIR = path.join(ROOT_DIR, "videos");
const POSTER_DIR = path.join(ROOT_DIR, "posters");
const DATA_DIR = path.join(ROOT_DIR, "data");

const DB_FILE = path.join(DATA_DIR, "videos.json");

// =====================================
// CREATE DIRECTORIES
// =====================================

for (const dir of [
  VIDEO_DIR,
  POSTER_DIR,
  DATA_DIR
]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
      recursive: true
    });
  }
}

// =====================================
// CREATE DATABASE
// =====================================

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    "[]",
    "utf8"
  );
}

// =====================================
// MIDDLEWARE
// =====================================

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

// Website files
app.use(
  express.static(ROOT_DIR)
);

// Video files
app.use(
  "/videos",
  express.static(VIDEO_DIR)
);

// Poster files
app.use(
  "/posters",
  express.static(POSTER_DIR)
);

// =====================================
// DATABASE
// =====================================

function readDB() {

  try {

    const data =
      fs.readFileSync(
        DB_FILE,
        "utf8"
      );

    const json =
      JSON.parse(data);

    if (!Array.isArray(json)) {
      return [];
    }

    return json;

  } catch (error) {

    console.error(
      "Database read error:",
      error
    );

    return [];

  }

}

function writeDB(data) {

  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

}

// =====================================
// HOME PAGE
// =====================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      ROOT_DIR,
      "index.html"
    )
  );

});

// =====================================
// FILE TYPES
// =====================================

const videoExtensions = [
  ".mp4",
  ".webm",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v"
];

const posterExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp"
];

// =====================================
// MULTER STORAGE
// =====================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {

    if (file.fieldname === "poster") {

      cb(
        null,
        POSTER_DIR
      );

    } else {

      cb(
        null,
        VIDEO_DIR
      );

    }

  },

  filename: (req, file, cb) => {

    const ext =
      path
        .extname(
          file.originalname
        )
        .toLowerCase();

    const base =
      path
        .basename(
          file.originalname,
          ext
        )
        .replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        )
        .slice(
          0,
          70
        );

    const filename =
      Date.now() +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 8) +
      "_" +
      base +
      ext;

    cb(
      null,
      filename
    );

  }

});

// =====================================
// MULTER
// =====================================

const upload = multer({

  storage,

  limits: {

    // 8 GB maximum video
    fileSize:
      8 *
      1024 *
      1024 *
      1024

  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    const ext =
      path
        .extname(
          file.originalname
        )
        .toLowerCase();

    // VIDEO
    if (
      file.fieldname === "video"
    ) {

      if (
        !videoExtensions.includes(
          ext
        )
      ) {

        return cb(
          new Error(
            "Invalid video format."
          )
        );

      }

      return cb(
        null,
        true
      );

    }

    // POSTER
    if (
      file.fieldname === "poster"
    ) {

      if (
        !posterExtensions.includes(
          ext
        )
      ) {

        return cb(
          new Error(
            "Thumbnail must be JPG, JPEG, PNG or WEBP."
          )
        );

      }

      return cb(
        null,
        true
      );

    }

    cb(
      new Error(
        "Invalid upload field."
      )
    );

  }

});

// =====================================
// GET MOVIES
// =====================================

app.get(
  "/api/videos",
  (req, res) => {

    try {

      const videos =
        readDB();

      const result =
        videos.map(
          video => ({

            id:
              video.id,

            title:
              video.title,

            filename:
              video.filename,

            originalName:
              video.originalName,

            size:
              video.size,

            poster:
              video.poster || null,

            uploadedAt:
              video.uploadedAt,

            url:
              "/api/stream/" +
              encodeURIComponent(
                video.id
              )

          })
        );

      res.json(result);

    } catch (error) {

      console.error(
        "GET MOVIES ERROR:",
        error
      );

      res.status(500).json({

        ok: false,

        error:
          "Could not load movies."

      });

    }

  }
);

// =====================================
// UPLOAD VIDEO + THUMBNAIL
// =====================================

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

      const videoFile =
        req.files &&
        req.files.video &&
        req.files.video[0];

      const posterFile =
        req.files &&
        req.files.poster &&
        req.files.poster[0];

      // VIDEO REQUIRED
      if (!videoFile) {

        return res.status(400).json({

          ok: false,

          error:
            "Please select a video."

        });

      }

      const title =
        (
          req.body.title ||
          videoFile.originalname
        )
          .trim()
          .slice(
            0,
            150
          );

      const videos =
        readDB();

      const id =
        Date.now().toString() +
        "_" +
        Math.random()
          .toString(36)
          .slice(2, 8);

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

        posterFilename:
          posterFile
            ? posterFile.filename
            : null,

        uploadedAt:
          new Date()
            .toISOString()

      };

      videos.unshift(movie);

      writeDB(videos);

      console.log(
        "Movie uploaded:",
        movie.title
      );

      res.json({

        ok: true,

        message:
          "Movie uploaded successfully.",

        movie: {

          id:
            movie.id,

          title:
            movie.title,

          originalName:
            movie.originalName,

          size:
            movie.size,

          poster:
            movie.poster,

          uploadedAt:
            movie.uploadedAt,

          url:
            "/api/stream/" +
            encodeURIComponent(
              movie.id
            )

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

// =====================================
// STREAM VIDEO
// =====================================

app.get(
  "/api/stream/:id",
  (req, res) => {

    try {

      const id =
        req.params.id;

      const videos =
        readDB();

      const movie =
        videos.find(
          item =>
            item.id === id
        );

      if (!movie) {

        return res
          .status(404)
          .send(
            "Movie not found."
          );

      }

      const videoPath =
        path.join(
          VIDEO_DIR,
          movie.filename
        );

      if (
        !fs.existsSync(
          videoPath
        )
      ) {

        return res
          .status(404)
          .send(
            "Video file not found."
          );

      }

      const stat =
        fs.statSync(
          videoPath
        );

      const fileSize =
        stat.size;

      const ext =
        path
          .extname(
            movie.filename
          )
          .toLowerCase();

      const mimeTypes = {

        ".mp4":
          "video/mp4",

        ".webm":
          "video/webm",

        ".mkv":
          "video/x-matroska",

        ".mov":
          "video/quicktime",

        ".avi":
          "video/x-msvideo",

        ".m4v":
          "video/mp4"

      };

      const contentType =
        mimeTypes[ext] ||
        "application/octet-stream";

      const range =
        req.headers.range;

      // =================================
      // NORMAL VIDEO REQUEST
      // =================================

      if (!range) {

        res.writeHead(
          200,
          {

            "Content-Length":
              fileSize,

            "Content-Type":
              contentType,

            "Accept-Ranges":
              "bytes",

            "Cache-Control":
              "no-cache"

          }
        );

        return fs
          .createReadStream(
            videoPath
          )
          .pipe(res);

      }

      // =================================
      // RANGE REQUEST
      // =================================

      const match =
        range.match(
          /bytes=(\d*)-(\d*)/
        );

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
          ? parseInt(
              match[1],
              10
            )
          : 0;

      let end =
        match[2]
          ? parseInt(
              match[2],
              10
            )
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

      if (
        end >= fileSize
      ) {

        end =
          fileSize - 1;

      }

      if (
        end < start
      ) {

        return res
          .status(416)
          .set({

            "Content-Range":
              `bytes */${fileSize}`

          })
          .end();

      }

      const chunkSize =
        end -
        start +
        1;

      res.writeHead(
        206,
        {

          "Content-Range":
            `bytes ${start}-${end}/${fileSize}`,

          "Accept-Ranges":
            "bytes",

          "Content-Length":
            chunkSize,

          "Content-Type":
            contentType,

          "Cache-Control":
            "no-cache"

        }
      );

      fs
        .createReadStream(
          videoPath,
          {
            start,
            end
          }
        )
        .pipe(res);

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );

      if (
        !res.headersSent
      ) {

        res
          .status(500)
          .send(
            "Streaming error."
          );

      }

    }

  }
);

// =====================================
// DELETE MOVIE
// =====================================

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

      if (
        index === -1
      ) {

        return res
          .status(404)
          .json({

            ok: false,

            error:
              "Movie not found."

          });

      }

      const movie =
        videos[index];

      // DELETE VIDEO
      if (
        movie.filename
      ) {

        const videoPath =
          path.join(
            VIDEO_DIR,
            movie.filename
          );

        if (
          fs.existsSync(
            videoPath
          )
        ) {

          fs.unlinkSync(
            videoPath
          );

        }

      }

      // DELETE POSTER
      if (
        movie.posterFilename
      ) {

        const posterPath =
          path.join(
            POSTER_DIR,
            movie.posterFilename
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

      videos.splice(
        index,
        1
      );

      writeDB(
        videos
      );

      console.log(
        "Movie deleted:",
        movie.title
      );

      res.json({

        ok: true,

        message:
          "Movie and thumbnail deleted."

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

// =====================================
// HEALTH CHECK
// =====================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      ok: true,

      status:
        "online",

      website:
        "My Movie Watch"

    });

  }
);

// =====================================
// API 404
// =====================================

app.use(
  "/api",
  (req, res) => {

    res.status(404).json({

      ok: false,

      error:
        "API route not found."

    });

  }
);

// =====================================
// ERROR HANDLER
// =====================================

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

      return res
        .status(400)
        .json({

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

  }
);

// =====================================
// START SERVER
// =====================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "          MY MOVIE WATCH"
    );
    console.log(
      "===================================="
    );
    console.log(
      "Server running on port:",
      PORT
    );
    console.log(
      "Password: DISABLED"
    );
    console.log(
      "Video upload: ENABLED"
    );
    console.log(
      "Thumbnail upload: ENABLED"
    );
    console.log(
      "Video streaming: ENABLED"
    );
    console.log(
      "Delete: ENABLED"
    );
    console.log(
      "===================================="
    );
    console.log("");

  }
);
