import redis
import json
import os
import uuid
import mysql.connector
import yt_dlp
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Redis connection
queue = redis.Redis(host='localhost', port=6379, decode_responses=True)

# YouTube download path
publicYtDownloadPath = os.path.join(os.getcwd(), "downloads")

os.makedirs(publicYtDownloadPath, exist_ok=True)  # Ensure download directory exists

def log(id, chat_id, file_path, name, username):
    try:
        mydb = mysql.connector.connect(
            host=os.getenv("DB_HOSTNAME"),
            user=os.getenv("DB_USERNAME"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_DATABASE"),
            auth_plugin=os.getenv("DB_AUTH_PLUGIN")
        )

        statement = "INSERT INTO big_file_urls(UUID, CHAT_ID, FILE_NAME, NAME, USERNAME) VALUES(%s, %s, %s, %s, %s)"
        data = (id, chat_id, file_path, name, username)
        
        cur = mydb.cursor()
        cur.execute(statement, data)
        mydb.commit()
        cur.close()
        mydb.close()
        
        return True
    except mysql.connector.Error as my_error:
        print("Database Error:", my_error)
        return False

while True:
    try:
        # Get data from Redis queue
        response = queue.brpop("youtube_download_queue")
        if not response:
            continue
        
        data = json.loads(response[1])
        print("Processing:", data)

        video_url = data["video_url"]
        name = data["name"]
        username = data["username"]
        chat_id = data["chat_id"]

        # Generate unique filename
        id = str(uuid.uuid4())
        output_template = os.path.join(publicYtDownloadPath, f"{id}.%(ext)s")
        
        ydl_opts = {
            'format': 'best',
            'outtmpl': output_template
        }
        
        # Download YouTube video
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            file_path = ydl.prepare_filename(info)

        print("Download complete:", file_path)

        # Save to database
        if log(id, chat_id, file_path, name, username):
            queue.publish('download_complete', id)
        else:
            print("Unable to update DB!")

    except Exception as e:
        print("Error:", e)
