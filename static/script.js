// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    const controlsDiv = document.querySelector('.controls');
    const contentIdInput = document.getElementById('contentIdInput');
    const fetchMediaBtn = document.getElementById('fetchMediaBtn');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaDisplay = document.getElementById('mediaDisplay');
    const transitionVideo = document.getElementById('transitionVideo');
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    const soundToast = document.getElementById('soundToast');
    const devDatasetList = document.getElementById('devDatasetList');

    // Google Sheet CSV export link
    const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/gviz/tq?tqx=out:csv";

    // Transition animations (relative paths for GitHub Pages)
    const doorCloseVideoUrl = "static/videos/Door Close.webm";
    const doorOpenVideoUrl = "static/videos/Door Open.webm";
    const defaultClosedDoorUrl = "static/images/Door Closed.png";

    let mediaDatabase = {};
    let isTransitioning = false;
    let isAtHomeScreen = true;
    let isMuted = false; // Default sound ON as requested
    let soundToastTimeout = null;

    // Buffer for global NFC reader inputs (HID keyboard wedge)
    let nfcBuffer = "";
    let nfcTimeout = null;

    // --- Sound Management ---
    function updateSoundUI() {
        if (soundToggleBtn) {
            soundToggleBtn.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            soundToggleBtn.classList.toggle('muted', isMuted);
        }
    }

    function toggleSound(forcedState) {
        if (typeof forcedState === 'boolean') {
            isMuted = forcedState;
        } else {
            isMuted = !isMuted;
        }

        updateSoundUI();

        // 1. Update native HTML5 video if playing
        const activeVideo = mediaDisplay.querySelector('video');
        if (activeVideo) {
            activeVideo.muted = isMuted;
        }

        // 2. Update YouTube iframe if playing (via YouTube IFrame API postMessage)
        const activeIframe = mediaDisplay.querySelector('iframe');
        if (activeIframe && activeIframe.contentWindow) {
            const ytCommand = isMuted ? 'mute' : 'unMute';
            activeIframe.contentWindow.postMessage(JSON.stringify({
                event: 'command',
                func: ytCommand,
                args: []
            }), '*');
        }

        // 3. Show floating toast notification on screen
        if (soundToast) {
            soundToast.textContent = isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
            soundToast.classList.add('visible');
            clearTimeout(soundToastTimeout);
            soundToastTimeout = setTimeout(() => {
                soundToast.classList.remove('visible');
            }, 1500);
        }

        console.log(`[v2.5] Audio toggled: ${isMuted ? 'MUTED' : 'UNMUTED'}`);
    }

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
        const clean = String(url).trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
        const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    // --- Helper: Normalize Google Drive & Relative URLs ---
    function normalizeMediaUrl(url, type) {
        if (!url) return '';
        let clean = url.trim();

        // Convert Google Drive share link
        const driveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
            if (type === 'image') {
                return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
            }
            return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        }

        // Relative local path fallback
        if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('static/')) {
            return `static/${clean}`;
        }
        return clean;
    }

    // --- Render Dataset Preview in Developer Mode (First 10 items) ---
    function renderDatasetPreview() {
        if (!devDatasetList) return;

        const items = Object.values(mediaDatabase).slice(0, 10);
        if (items.length === 0) {
            devDatasetList.innerHTML = '<div class="dev-dataset-empty">No items loaded. Check Google Sheet link or internet.</div>';
            return;
        }

        devDatasetList.innerHTML = '';
        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'dev-dataset-item';
            row.title = `Click to test ID: ${item.id}`;

            const badgeClass = item.type === 'youtube' ? 'badge-youtube' : (item.type === 'image' ? 'badge-image' : 'badge-video');

            row.innerHTML = `
                <span class="dev-item-id">${item.id}</span>
                <span class="dev-item-name" title="${item.title || item.file_path}">${item.title || item.file_path || 'Untitled'}</span>
                <span class="dev-item-badge ${badgeClass}">${item.type || 'media'}</span>
            `;

            row.addEventListener('click', () => {
                console.log(`[v2.5] Preview item clicked: ${item.id}`);
                contentIdInput.value = item.id;
                fetchMedia(item.id);
            });

            devDatasetList.appendChild(row);
        });
    }

    // --- Load media database (Google Sheet with JSON fallback) ---
    async function loadMediaDatabase() {
        let loadedFromSheet = false;

        // 1. Try Google Sheets CSV
        if (GOOGLE_SHEET_CSV_URL) {
            try {
                console.log("[v2.5] Fetching dataset from Google Sheets...");
                const response = await fetch(GOOGLE_SHEET_CSV_URL);
                if (response.ok) {
                    const csvText = await response.text();
                    const rows = parseCSV(csvText);

                    if (rows.length >= 2) {
                        let idIdx = -1, titleIdx = -1, typeIdx = -1, pathIdx = -1;
                        for (let i = 0; i < rows[0].length; i++) {
                            const norm = rows[0][i].toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (['id', 'contentid', 'cardid', 'uid'].includes(norm)) idIdx = i;
                            else if (['title', 'name'].includes(norm)) titleIdx = i;
                            else if (['type', 'mediatype'].includes(norm)) typeIdx = i;
                            else if (norm.includes('path') || norm.includes('file') || norm.includes('url') || norm.includes('link') || norm.includes('media')) pathIdx = i;
                        }

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
                                    else if (/\.(jpe?g|png|webp|gif)($|\?)/i.test(rawPath)) type = 'image';
                                    else type = 'video';
                                }

                                newDb[id] = { id, title, type, file_path: rawPath };
                                console.log(`[v2.5] Registered card "${id}": title="${title}", type="${type}", path="${rawPath}"`);
                            }
                            mediaDatabase = newDb;
                            loadedFromSheet = true;
                            console.log(`[v2.5] Successfully loaded ${Object.keys(mediaDatabase).length} media items from Google Sheets.`);
                            renderDatasetPreview();
                            return true;
                        }
                    }
                }
            } catch (sheetErr) {
                console.warn("[v2.5] Could not load from Google Sheets (will try local fallback):", sheetErr);
            }
        }

        // 2. Fallback to local media_data.json
        if (!loadedFromSheet) {
            try {
                console.log("[v2.5] Loading local fallback from media_data.json...");
                const response = await fetch('media_data.json');
                if (response.ok) {
                    const mediaList = await response.json();
                    mediaDatabase = {};
                    mediaList.forEach(item => {
                        if (item.id) {
                            mediaDatabase[String(item.id).trim()] = item;
                        }
                    });
                    console.log(`[v2.5] Loaded ${Object.keys(mediaDatabase).length} items from media_data.json.`);
                    renderDatasetPreview();
                    return true;
                }
            } catch (jsonErr) {
                console.error("[v2.5] Failed to load local media_data.json fallback:", jsonErr);
            }
        }

        renderDatasetPreview();
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

    // --- Home Screen: Display closed doors when nothing is active ---
    function showHomeScreen() {
        mediaDisplay.innerHTML = '';
        const img = document.createElement('img');
        img.src = defaultClosedDoorUrl;
        img.alt = "Portal Door Closed";
        mediaDisplay.appendChild(img);
        isAtHomeScreen = true;
        console.log("[v2.5] Home Screen active (doors closed). System ready.");
    }

    // --- Return to Home Screen (triggered by Escape key) ---
    async function returnToHomeScreen() {
        if (isTransitioning) return;

        // Close Developer Mode if open
        if (controlsDiv.classList.contains('visible')) {
            controlsDiv.classList.remove('visible');
        }

        if (isAtHomeScreen) {
            console.log("[v2.5] Already at Home Screen.");
            return;
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            console.log("[v2.5] Returning to Home Screen (closing doors)...");
            await playTransition(doorCloseVideoUrl);
            showHomeScreen();
        } catch (err) {
            console.error("[v2.5] Error returning to home screen:", err);
            showHomeScreen();
        } finally {
            transitionVideo.classList.remove('active');
            transitionVideo.pause();
            transitionVideo.currentTime = 0;
            isTransitioning = false;
        }
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
            // 1. Play door closing animation ONLY if the doors are not already closed
            if (!isAtHomeScreen) {
                await playTransition(doorCloseVideoUrl);
            }

            // 2. Check record in database
            const data = mediaDatabase[cleanId];
            mediaDisplay.innerHTML = '';

            if (!data) {
                mediaTitle.textContent = `Media not found for ID: ${cleanId}`;
                mediaTitle.classList.add('visible');
                showHomeScreen();
                return;
            }

            const rawPath = data.file_path || '';
            const ytId = getYouTubeVideoId(rawPath);
            const resolvedPath = normalizeMediaUrl(rawPath, data.type);
            console.log(`[v2.5] Playing card ID: ${cleanId}, title: "${data.title}", type: "${data.type}", resolvedPath: "${resolvedPath}"`);

            // 3. Load media behind the closed door
            await new Promise((resolve, reject) => {
                // CASE A: YouTube Video
                if (data.type === 'youtube' || ytId) {
                    const videoId = ytId || rawPath.trim();
                    console.log(`[v2.5] Embedding YouTube video ID: ${videoId} (Muted: ${isMuted})`);
                    const iframe = document.createElement('iframe');
                    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
                    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                    iframe.allowFullscreen = true;
                    iframe.title = data.title || "YouTube scene";

                    iframe.onload = () => {
                        console.log(`[v2.5] YouTube iframe loaded successfully.`);
                        setTimeout(resolve, 800);
                    };
                    iframe.onerror = (err) => {
                        console.error(`[v2.5] YouTube iframe error:`, err);
                        reject(new Error("Failed to load YouTube player"));
                    };
                    mediaDisplay.appendChild(iframe);

                    // Safety timeout in case YouTube buffers slowly
                    setTimeout(() => {
                        console.log(`[v2.5] Safety timeout reached, opening door.`);
                        resolve();
                    }, 3500);

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
                    video.muted = isMuted;
                    video.playsInline = true;

                    mediaDisplay.appendChild(video);
                    video.load();

                    video.play().then(() => {
                        resolve();
                    }).catch(error => {
                        console.warn("[v2.5] Autoplay error:", error);
                        // If unmuted playback was blocked by browser policy, fallback to muted to keep door opening
                        if (!video.muted) {
                            console.log("[v2.5] Attempting playback fallback to muted...");
                            video.muted = true;
                            video.play().then(resolve).catch(err2 => {
                                console.warn("[v2.5] Playback failed completely:", err2);
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    });

                    video.onerror = () => reject(new Error(`Failed to load video: ${data.title}`));
                }
            });

            // 4. Play door opening animation to reveal new media
            isAtHomeScreen = false;
            await playTransition(doorOpenVideoUrl);

        } catch (error) {
            console.error('Error during media transition:', error);
            mediaTitle.textContent = error.message || 'Error loading media.';
            mediaTitle.classList.add('visible');
            showHomeScreen();
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

    // Sound toggle button in Developer Mode
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            toggleSound();
        });
    }

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
        // Hotkey: Tab toggles Developer Mode
        if (event.key === 'Tab') {
            event.preventDefault();
            controlsDiv.classList.toggle('visible');
            if (controlsDiv.classList.contains('visible')) {
                console.log("[v2.5] Developer Mode opened.");
                renderDatasetPreview();
                contentIdInput.focus();
            } else {
                console.log("[v2.5] Developer Mode closed.");
            }
            return;
        }

        // Hotkey: Escape returns to Home Screen (closed doors)
        if (event.key === 'Escape') {
            event.preventDefault();
            returnToHomeScreen();
            return;
        }

        // Hotkey: . (dot / decimal point) toggles Sound ON/OFF
        if (event.key === '.' || event.code === 'NumpadDecimal') {
            if (document.activeElement !== contentIdInput) {
                event.preventDefault();
                toggleSound();
                return;
            }
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
    console.log("Portal Door v2.5 initialized.");
    mediaTitle.classList.remove('visible');
    controlsDiv.classList.remove('visible');
    updateSoundUI();
    showHomeScreen();
    loadMediaDatabase();
});
