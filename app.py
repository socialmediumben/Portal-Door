# app.py

from flask import Flask, render_template, jsonify, send_from_directory
import json
import os

app = Flask(__name__)

# --- Load MEDIA_DATABASE from local file ---
MEDIA_DATABASE = {}

def load_media_data_from_file():
    """Loads media data from a local JSON file."""
    global MEDIA_DATABASE
    try:
        with open('media_data.json', 'r') as f:
            media_list = json.load(f)
            MEDIA_DATABASE = {item['id']: item for item in media_list}
        print("Successfully loaded media data from local file.")
    except FileNotFoundError:
        print("Error: media_data.json not found.")
        MEDIA_DATABASE = {}
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from media_data.json: {e}")
        MEDIA_DATABASE = {}

load_media_data_from_file()

# --- Routes ---

@app.route('/')
def index():
    """Renders the main HTML page for the media viewer."""
    return render_template('index.html')

@app.route('/media/<string:content_id>')
def get_media(content_id):
    """
    API endpoint to retrieve media information based on content_id.
    Returns JSON with media details or an error message if not found.
    """
    media_info = MEDIA_DATABASE.get(content_id)
    if media_info:
        # The file path is already a local path relative to the static folder.
        return jsonify(media_info)
    else:
        return jsonify({"error": "Media not found"}), 404

@app.route('/static/<path:filename>')
def serve_static(filename):
    """
    Serves static files (images, videos, CSS, JS) from the 'static' directory.
    """
    return send_from_directory(app.static_folder, filename)

@app.route('/refresh_data', methods=['POST'])
def refresh_data():
    """
    Endpoint to trigger a refresh of the media data from the local file.
    Accessible via a POST request.
    """
    print("Refresh request received. Reloading media data...")
    load_media_data_from_file()
    return jsonify({"status": "success", "message": "Media data refreshed."})

if __name__ == '__main__':
    app.run(debug=True)
