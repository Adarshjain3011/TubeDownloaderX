require("dotenv").config({ path: "../.env" });
const TelegramBot = require("node-telegram-bot-api");
const { sql } = require("./db");
const fs = require("fs");
const queue = require("./queue");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

var NGROK_BASE_URL = null;

setTimeout(async () => {
    console.log(`Setting NGROK Base URL from cache!`);
    NGROK_BASE_URL = await queue.cache.get("NGROK_BASE_URL");
}, 3000);

// Function to escape Markdown special characters
const escapeMarkdown = (text) => {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
};

// Function to validate YouTube URLs
const isValidURL = (video_url) => {
    return video_url.startsWith("https://youtube.com") ||
           video_url.startsWith("https://youtu.be") ||
           video_url.startsWith("https://www.youtube.com");
};

// Subscription to listen for completed downloads
queue.subscriber.subscribe("download_complete", (video_id) => {
    console.log("✅ Received 'download_complete' event for video_id:", video_id);

    sql.query(`SELECT * FROM big_file_urls WHERE uuid = ?`, [video_id], (error, data) => {
        if (error) {
            console.error("❌ Database Query Error:", error);
            return;
        }

        if (!data || data.length === 0) {
            console.error("❌ No data found for video_id:", video_id);
            return;
        }

        const filePath = data[0].FILE_NAME.replace(/\\/g, "/"); // Convert Windows path format
        console.log("📁 File Path:", filePath);

        if (!fs.existsSync(filePath)) {
            console.error("❌ File does not exist:", filePath);
            bot.sendMessage(data[0].CHAT_ID, "⚠️ Sorry, the file is not available for download.");
            return;
        }

        const file_size = fs.statSync(filePath).size;
        const downloadURL = `${NGROK_BASE_URL}/video?video_id=${data[0].UUID}`;
        const caption = `🎬 *Your video is ready!*\n\n⏬ [Download Video](${downloadURL})\n⚠️ *Note:* This link is temporary, download ASAP!`;

        if (file_size > 50000000) {
            bot.sendMessage(data[0].CHAT_ID, escapeMarkdown(caption), { parse_mode: "MarkdownV2" });
        } else {
            bot.sendDocument(data[0].CHAT_ID, filePath, { caption: escapeMarkdown(caption), parse_mode: "MarkdownV2" });
        }
    });
});

// Subscription for NGROK updates
queue.subscriber.subscribe("NGROK_BASE_URL_UPDATED", (updated_base_url) => {
    console.log(`🔄 NGROK Base URL Updated!`);
    NGROK_BASE_URL = updated_base_url;
});

// Handle user messages
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text?.trim();
    const { first_name = "User", username = "Anonymous" } = msg.from;

    console.log("📩 Received Message:", `Chat ID: ${chatId}, Text: ${messageText}`);

    if (!messageText) return;

    switch (messageText.toLowerCase()) {
        case "/start":
            bot.sendMessage(chatId, `👋 Hello *${first_name}*! Welcome to the *YouTube Downloader Bot*.\n\n🎥 *Send me a YouTube link, and I'll download it for you!*`, { parse_mode: "Markdown" });
            break;

        case "/help":
            bot.sendMessage(chatId, "🆘 *Help Menu*\n\n🔹 *To download a video:* Send me a valid YouTube URL.\n🔹 */status* - Check the download status.\n🔹 */about* - Learn more about this bot.", { parse_mode: "Markdown" });
            break;

        case "/about":
            bot.sendMessage(chatId, "ℹ️ *YouTube Downloader Bot*\n\n⚡ Developed to download YouTube videos easily. Just send a link and get your video!\n\n💻 *Created by:* @yourusername", { parse_mode: "Markdown" });
            break;

        case "/status":
            bot.sendMessage(chatId, "⏳ Checking your download status... (Feature coming soon!)");
            break;

        default:
            if (isValidURL(messageText)) {
                bot.sendMessage(chatId, "⏳ *Downloading your video... Please wait!*", { parse_mode: "Markdown" });

                if (queue) {
                    await queue.push(JSON.stringify({
                        video_url: messageText,
                        name: first_name,
                        username,
                        chat_id: chatId
                    }));
                }
            } else {
                bot.sendMessage(chatId, "⚠️ *Invalid URL!* Please send a valid YouTube link.", { parse_mode: "Markdown" });
            }
            break;
    }
});
