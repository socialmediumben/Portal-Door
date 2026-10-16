// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    const controlsDiv = document.querySelector('.controls');
    const contentIdInput = document.getElementById('contentIdInput');
    const fetchMediaBtn = document.getElementById('fetchMediaBtn');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaDisplay = document.getElementById('mediaDisplay');
    const transitionVideo = document.getElementById('transitionVideo');

    // Relative paths for GitHub Pages compatibility
    const doorCloseVideoUrl = "static/videos/Door Close.webm";
    const doorOpenVideoUrl = "static/videos/Door Open.webm";

    let mediaDatabase = {};
    let isTransitioning = false;

    // Buffer for global NFC reader inputs (HID keyboard wedge)
    let nfcBuffer = "";
    let nfcTimeout = null;

    // --- Load media database directly from JSON file ---
    async function loadMediaDatabase() {
        try {
            console.log("Loading media database from media_data.json...");
            const response = await fetch('media_data.json');
            if (!response.ok) {
                throw new Error(`Failed to load media_data.json: HTTP ${response.status}`);
            }
            const mediaList = await response.json();
            mediaDatabase = {};
            mediaList.forEach(item => {
                if (item.id) {
                    mediaDatabase[String(item.id).trim()] = item;
                }
            });
            console.log(`Loaded ${Object.keys(mediaDatabase).length} media items.`);
            return true;
        } catch (error) {
            console.error("Error loading media_data.json:", error);
            mediaTitle.textContent = "Error loading media database.";
            mediaTitle.classList.add('visible');
            return false;
        }
    }

    // --- Function to play transition video ---
    function playTransition(videoPath) {
        return new Promise(resolve => {
            if (!videoPath) {
                console.warn("Transition video path is missing. Skipping transition.");
                resolve();
                return;
            }

            transitionVideo.src = videoPath;
            transitionVideo.currentTime = 0;
            transitionVideo.classList.add('active');

            // Safety timeout in case video file fails or stalls
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

            // 2. Fetch record from local database
            const data = mediaDatabase[cleanId];
            mediaDisplay.innerHTML = '';

            if (!data) {
                mediaTitle.textContent = `Media not found for ID: ${cleanId}`;
                mediaTitle.classList.add('visible');
                // Open door so screen isn't permanently locked
                await playTransition(doorOpenVideoUrl);
                return;
            }

            // Support either relative path inside static/ or absolute/external URLs
            const filePath = (data.file_path.startsWith('http://') || data.file_path.startsWith('https://'))
                ? data.file_path
                : `static/${data.file_path}`;

            // 3. Load media behind the closed door
            await new Promise((resolve, reject) => {
                if (data.type === 'image') {
                    const img = document.createElement('img');
                    img.src = filePath;
                    img.alt = data.title;
                    img.onload = () => {
                        mediaDisplay.appendChild(img);
                        resolve();
                    };
                    img.onerror = () => reject(new Error(`Failed to load image: ${data.title}`));
                } else if (data.type === 'video') {
                    const video = document.createElement('video');
                    video.src = filePath;
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
                } else {
                    reject(new Error(`Unknown media type: ${data.type}`));
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

    // --- Global Keydown Listener (Hotkeys + Seamless NFC scanner input) ---
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

        // Hotkey: ) reloads media_data.json
        if (event.key === ')') {
            event.preventDefault();
            reloadData();
            return;
        }

        // --- NFC Reader Support ---
        // If the manual input isn't active, capture keystrokes from NFC keyboard-emulation readers
        if (document.activeElement !== contentIdInput) {
            if (event.key === 'Enter') {
                if (nfcBuffer.trim()) {
                    const scannedId = nfcBuffer.trim();
                    nfcBuffer = "";
                    fetchMedia(scannedId);
                }
            } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
                // Accumulate digits/letters sent by scanner
                nfcBuffer += event.key;
                clearTimeout(nfcTimeout);
                // Clear buffer if scanning pauses for more than 500ms
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
