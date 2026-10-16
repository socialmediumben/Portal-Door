// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    const controlsDiv = document.querySelector('.controls');
    const contentIdInput = document.getElementById('contentIdInput');
    const fetchMediaBtn = document.getElementById('fetchMediaBtn');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaDisplay = document.getElementById('mediaDisplay');
    const transitionVideo = document.getElementById('transitionVideo');

    // Google Sheet CSV export link
    const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/gviz/tq?tqx=out:csv";

    // Transition animations (relative paths for GitHub Pages)
    const doorCloseVideoUrl = "static/videos/Door Close.webm";
    const doorOpenVideoUrl = "static/videos/Door Open.webm";

    let mediaDatabase = {};
    let isTransitioning = false;

    // Buffer for global NFC reader inputs (HID keyboard wedge)
    let nfcBuffer = "";
    let nfcTimeout = null;

    // --- Helper: Robust CSV parser ---
    function parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if ((char === '\r' || char === '\n') && !insideQuotes) {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentCell.trim());
                if (currentRow.some(c => c !== '')) rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell.trim());
            if (currentRow.some(c => c !== '')) rows.push(currentRow);
        }
        return rows;
    }

    // --- Helper: Extract YouTube ID ---
    function getYouTubeVideoId(url) {
        if (!url) return null;
        const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
        return match ? match[1] : null;
    }

    // --- Helper: Normalize Google Drive & Relative URLs ---
    function normalizeMediaUrl(url) {
        if (!url) return '';
        let clean = url.trim();

        // Convert Google Drive share link to direct download/stream link
        const driveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
            return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        }

        // Relative local path fallback
        if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('static/')) {
            return `static/${clean}`;
        }
        return clean;
    }

    // --- Load media database (Google Sheet with JSON fallback) ---
    async function loadMediaDatabase() {
        let loadedFromSheet = false;

        // 1. Try Google Sheets CSV
        if (GOOGLE_SHEET_CSV_URL) {
            try {
                console.log("Attempting to fetch dataset from Google Sheets...");
                const response = await fetch(GOOGLE_SHEET_CSV_URL);
                if (response.ok) {
                    const csvText = await response.text();
                    const rows = parseCSV(csvText);

                    if (rows.length >= 2) {
                        const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                        const idIdx = headers.indexOf('id');
                        const titleIdx = headers.indexOf('title');
                        const typeIdx = headers.indexOf('type');
                        const pathIdx = headers.indexOf('filepath') !== -1 ? headers.indexOf('filepath') : headers.indexOf('path');

                        if (idIdx !== -1) {
                            const newDb = {};
                            for (let i = 1; i < rows.length; i++) {
                                const row = rows[i];
                                const rawId = row[idIdx];
                                if (!rawId) continue;

                                const id = String(rawId).trim();
                                const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim() : id;
                                const rawPath = pathIdx !== -1 && row[pathIdx] ? row[pathIdx].trim() : '';
                                let type = typeIdx !== -1 && row[typeIdx] ? row[typeIdx].trim().toLowerCase() : '';

                                // Auto-detect type if omitted
                                if (!type) {
                                    if (getYouTubeVideoId(rawPath)) type = 'youtube';
                                    else if (/\.(jpe?g|png|webp|gif)$/i.test(rawPath)) type = 'image';
                                    else type = 'video';
                                }

                                newDb[id] = { id, title, type, file_path: rawPath };
                            }
                            mediaDatabase = newDb;
                            loadedFromSheet = true;
                            console.log(`Loaded ${Object.keys(mediaDatabase).length} media items from Google Sheets.`);
                            return true;
                        }
                    }
                }
            } catch (sheetErr) {
                console.warn("Could not load from Google Sheets (will try local fallback):", sheetErr);
            }
        }

        // 2. Fallback to local media_data.json
        if (!loadedFromSheet) {
            try {
                console.log("Loading local fallback from media_data.json...");
                const response = await fetch('media_data.json');
                if (response.ok) {
                    const mediaList = await response.json();
                    mediaDatabase = {};
                    mediaList.forEach(item => {
                        if (item.id) {
                            mediaDatabase[String(item.id).trim()] = item;
                        }
                    });
                    console.log(`Loaded ${Object.keys(mediaDatabase).length} items from media_data.json.`);
                    return true;
                }
            } catch (jsonErr) {
                console.error("Failed to load local media_data.json fallback:", jsonErr);
            }
        }

        return loadedFromSheet;
    }

    // --- Function to play transition video ---
    function playTransition(videoPath) {
        return new Promise(resolve => {
            if (!videoPath) {
                resolve();
                return;
            }

            transitionVideo.src = videoPath;
            transitionVideo.currentTime = 0;
            transitionVideo.classList.add('active');

            let timeout = setTimeout(() => {
                console.warn(`Transition timed out for ${videoPath}`);
                resolve();
            }, 8000);

            transitionVideo.onended = () => {
                clearTimeout(timeout);
                transitionVideo.onended = null;
                resolve();
            };

            transitionVideo.play().catch(error => {
                clearTimeout(timeout);
                console.warn(`Transition video playback failed for ${videoPath}:`, error);
                transitionVideo.classList.remove('active');
                transitionVideo.onended = null;
                resolve();
            });
        });
    }

    // --- Function to fetch and display media ---
    async function fetchMedia(contentId) {
        if (isTransitioning) {
            console.warn("Transition already in progress. Ignoring input.");
            return;
        }

        const cleanId = String(contentId).trim();
        if (!cleanId) {
            mediaTitle.textContent = 'Please enter a Content ID.';
            mediaTitle.classList.add('visible');
            return;
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            // 1. Play door closing animation
            await playTransition(doorCloseVideoUrl);

            // 2. Check record in database
            const data = mediaDatabase[cleanId];
            mediaDisplay.innerHTML = '';

            if (!data) {
                mediaTitle.textContent = `Media not found for ID: ${cleanId}`;
                mediaTitle.classList.add('visible');
                await playTransition(doorOpenVideoUrl);
                return;
            }

            const rawPath = data.file_path || '';
            const ytId = getYouTubeVideoId(rawPath);
            const resolvedPath = normalizeMediaUrl(rawPath);

            // 3. Load media behind the closed door
            await new Promise((resolve, reject) => {
                // CASE A: YouTube Video
                if (data.type === 'youtube' || ytId) {
                    const videoId = ytId || rawPath;
                    const iframe = document.createElement('iframe');
                    // Embedded chromeless autoplay & loop
                    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
                    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                    iframe.allowFullscreen = true;

                    // Reveal door after iframe loads + small buffer delay
                    iframe.onload = () => {
                        setTimeout(resolve, 800);
                    };
                    iframe.onerror = () => reject(new Error("Failed to load YouTube player"));
                    mediaDisplay.appendChild(iframe);

                    // Safety timeout in case YouTube buffers slowly
                    setTimeout(resolve, 3500);

                // CASE B: Image
                } else if (data.type === 'image') {
                    const img = document.createElement('img');
                    img.src = resolvedPath;
                    img.alt = data.title;
                    img.onload = () => {
                        mediaDisplay.appendChild(img);
                        resolve();
                    };
                    img.onerror = () => reject(new Error(`Failed to load image: ${data.title}`));
                    mediaDisplay.appendChild(img);

                // CASE C: Standard Video (MP4 / WebM / Google Drive stream)
                } else {
                    const video = document.createElement('video');
                    video.src = resolvedPath;
                    video.controls = false;
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = true;
                    video.playsInline = true;

                    mediaDisplay.appendChild(video);
                    video.load();

                    video.play().then(() => {
                        resolve();
                    }).catch(error => {
                        console.warn("Autoplay blocked:", error);
                        video.controls = true;
                        mediaTitle.textContent = `${data.title} (Click to play)`;
                        mediaTitle.classList.add('visible');
                        video.addEventListener('click', function _listener() {
                            video.play().then(() => {
                                mediaTitle.classList.remove('visible');
                                video.removeEventListener('click', _listener);
                            });
                        });
                        resolve();
                    });

                    video.onerror = () => reject(new Error(`Failed to load video: ${data.title}`));
                }
            });

            // 4. Play door opening animation to reveal new media
            await playTransition(doorOpenVideoUrl);

        } catch (error) {
            console.error('Error during media transition:', error);
            mediaTitle.textContent = error.message || 'Error loading media.';
            mediaTitle.classList.add('visible');
            await playTransition(doorOpenVideoUrl);
        } finally {
            transitionVideo.classList.remove('active');
            transitionVideo.pause();
            transitionVideo.currentTime = 0;
            isTransitioning = false;
        }
    }

    // --- Manual input event listeners ---
    fetchMediaBtn.addEventListener('click', () => {
        fetchMedia(contentIdInput.value);
    });

    contentIdInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            fetchMedia(contentIdInput.value);
        }
    });

    // --- Data reload function ---
    async function reloadData() {
        const ok = await loadMediaDatabase();
        mediaTitle.textContent = ok ? "Data Refreshed!" : "Refresh Failed!";
        mediaTitle.classList.add('visible');
        setTimeout(() => {
            mediaTitle.classList.remove('visible');
        }, 1500);
    }

    // --- Global Keydown Listener (Hotkeys + Background NFC Scanner) ---
    document.addEventListener('keydown', (event) => {
        // Hotkey: Tab toggles the manual input bar
        if (event.key === 'Tab') {
            event.preventDefault();
            controlsDiv.classList.toggle('visible');
            if (controlsDiv.classList.contains('visible')) {
                contentIdInput.focus();
            }
            return;
        }

        // Hotkey: ( toggles Fullscreen
        if (event.key === '(') {
            event.preventDefault();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn(`Fullscreen error: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
            return;
        }

        // Hotkey: ) reloads Google Sheet / local database
        if (event.key === ')') {
            event.preventDefault();
            reloadData();
            return;
        }

        // --- NFC Reader Support ---
        // If manual input isn't active, capture keystrokes from NFC keyboard-emulation readers
        if (document.activeElement !== contentIdInput) {
            if (event.key === 'Enter') {
                if (nfcBuffer.trim()) {
                    const scannedId = nfcBuffer.trim();
                    nfcBuffer = "";
                    fetchMedia(scannedId);
                }
            } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
                nfcBuffer += event.key;
                clearTimeout(nfcTimeout);
                nfcTimeout = setTimeout(() => {
                    nfcBuffer = "";
                }, 500);
            }
        }
    });

    // Initial startup
    mediaTitle.classList.remove('visible');
    controlsDiv.classList.remove('visible');
    loadMediaDatabase();
});
