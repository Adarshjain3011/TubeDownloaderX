require("dotenv").config({ path: "../.env" });
const url = require("url");
const http = require("http");
const ngrok = require("@ngrok/ngrok");
const redis = require("redis");
const { sql } = require("./db");
const fs = require("fs");

let NGROK_BASE_URL = "";
let cache = null, publisher = null;

// ✅ Move NGROK_AUTHTOKEN into a proper variable
const NGROK_AUTHTOKEN=process.env.NGROK_AUTHTOKEN;

console.log("NGROK_AUTHTOKEN",NGROK_AUTHTOKEN);

(async () => {
    try {
        cache = redis.createClient();
        publisher = redis.createClient();

        await cache.connect();
        await publisher.connect();

        cache.on("error", (error) => {
            console.error(`Redis Error: ${error}`);
        });

        console.log("✅ Redis connected successfully!");
    } catch (error) {
        console.error("❌ Redis connection failed:", error);
    }
})();

// Create web server
const server = http.createServer((req, res) => {
    console.log("Request received:", req.url);
    const requestedURL = req.url;

    if (requestedURL.startsWith("/video")) {
        const parsedUrl = url.parse(requestedURL, true);
        const { video_id } = parsedUrl.query;

        if (!video_id) {
            return res.end("Invalid video ID");
        }

        sql.query("SELECT file_name FROM big_file_urls WHERE uuid = ?", [video_id], (err, data) => {
            if (err) {
                console.error("❌ SQL Error:", err);
                return res.end("Something went wrong!");
            }

            if (data.length === 1) {
                const videoPath = data[0].file_name;

                fs.stat(videoPath, (err, stats) => {
                    if (err) {
                        console.error("❌ Error reading video file:", err);
                        res.statusCode = 500;
                        return res.end("Internal Server Error");
                    }

                    // Set headers
                    res.writeHead(200, {
                        "Content-Type": "video/mp4",
                        "Content-Length": stats.size,
                    });

                    const videoStream = fs.createReadStream(videoPath);
                    videoStream.pipe(res);
                });
            } else {
                console.log("⚠️ Video not found:", data);
                return res.end("Video not found!");
            }
        });
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
});

server.listen(8080, () => console.log("🚀 Node.js web server is running on port 8080..."));

// ✅ Ensure NGROK_AUTHTOKEN is defined before using it
if (!NGROK_AUTHTOKEN) {
    console.error("❌ Ngrok Auth Token is missing! Please add it to your .env file.");
} else {
    ngrok.connect({ addr: 8080, authtoken: NGROK_AUTHTOKEN })
        .then((listener) => {
            NGROK_BASE_URL = listener.url();
            cache.set("NGROK_BASE_URL", NGROK_BASE_URL);
            publisher.publish("NGROK_BASE_URL_UPDATED", NGROK_BASE_URL);
            console.log(`🌍 Ngrok tunnel established at: ${NGROK_BASE_URL}`);
        })
        .catch((err) => console.error("❌ Ngrok connection failed:", err));
}
