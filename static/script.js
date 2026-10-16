// static/script.js - Portal Door v4.0

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
    const devDatasetTitle = document.getElementById('devDatasetTitle');
    const photoboothToggleBtn = document.getElementById('photoboothToggleBtn');
    const photoboothCanvas = document.getElementById('photoboothCanvas');
    const webcamVideo = document.getElementById('webcamVideo');

    // Google Sheet CSV export base URL (spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0)
    const GOOGLE_SHEET_BASE = "https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/gviz/tq?tqx=out:csv";
    
    // Google Form configuration for public registration
    const GOOGLE_FORM_BASE_URL = "https://docs.google.com/forms/d/e/1FAIpQLScFQcRKtZrXRn6aq8VsziutGSDhlWCKP0TImaFJ1df7h8w3ew/viewform";
    const GOOGLE_FORM_ID_ENTRY = "entry.1513595288"; // Field ID for pre-filling card ID
    const GOOGLE_FORM_SHORT_URL = "https://forms.gle/GBZC6SYXSZS1ZFjM8";

    // Transition animations (relative paths for GitHub Pages)
    const doorCloseVideoUrl = "static/videos/Door Close.webm";
    const doorOpenVideoUrl = "static/videos/Door Open.webm";
    const defaultClosedDoorUrl = "static/images/Door Closed.png";

    // Datasets & Portal State
    let developerDatabase = {};
    let userDatabase = {};
    let isTransitioning = false;
    let isAtHomeScreen = true;
    let isMuted = false; // Default sound ON as requested
    let soundToastTimeout = null;

    // Buffer for global NFC reader inputs (HID keyboard wedge)
    let nfcBuffer = "";
    let nfcTimeout = null;

    // Photobooth Mode State
    let isPhotoboothActive = false;
    let webcamStream = null;
    let selfieSegmentation = null;
    let isProcessingFrame = false;
    let photoboothAnimationId = null;

    // --- On-screen Toast Notification ---
    function showToast(message) {
        if (!soundToast) return;
        soundToast.textContent = message;
        soundToast.classList.add('visible');
        clearTimeout(soundToastTimeout);
        soundToastTimeout = setTimeout(() => {
            soundToast.classList.remove('visible');
        }, 1800);
    }

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

        showToast(isMuted ? '🔇 Sound: OFF' : '🔊 Sound: ON');
        console.log(`[v4.0] Audio toggled: ${isMuted ? 'MUTED' : 'UNMUTED'}`);
    }

    // --- MediaPipe Selfie Segmentation Setup ---
    function initSelfieSegmentation() {
        if (typeof SelfieSegmentation === 'undefined') {
            console.warn("[v4.0] MediaPipe SelfieSegmentation not loaded yet.");
            return null;
        }
        if (selfieSegmentation) return selfieSegmentation;

        try {
            selfieSegmentation = new SelfieSegmentation({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
            });
            selfieSegmentation.setOptions({
                modelSelection: 1, // landscape model (high accuracy)
                selfieMode: true   // automatically flips video for natural mirror view
            });
            selfieSegmentation.onResults(onSelfieSegmentationResults);
            console.log("[v4.0] MediaPipe SelfieSegmentation initialized successfully.");
            return selfieSegmentation;
        } catch (err) {
            console.error("[v4.0] Error initializing SelfieSegmentation:", err);
            return null;
        }
    }

    function onSelfieSegmentationResults(results) {
        if (!photoboothCanvas || !isPhotoboothActive) return;
        const ctx = photoboothCanvas.getContext('2d');

        // Match canvas internal resolution to incoming video feed
        if (photoboothCanvas.width !== results.image.width || photoboothCanvas.height !== results.image.height) {
            photoboothCanvas.width = results.image.width;
            photoboothCanvas.height = results.image.height;
        }

        ctx.save();
        ctx.clearRect(0, 0, photoboothCanvas.width, photoboothCanvas.height);

        // 1. Draw the segmentation mask (human silhouette)
        ctx.drawImage(results.segmentationMask, 0, 0, photoboothCanvas.width, photoboothCanvas.height);

        // 2. Composite: only draw the camera frame where the mask was drawn
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(results.image, 0, 0, photoboothCanvas.width, photoboothCanvas.height);

        ctx.restore();
        isProcessingFrame = false;
    }

    async function renderPhotoboothLoop() {
        if (!isPhotoboothActive) return;

        if (webcamVideo && webcamVideo.readyState >= 2 && !isProcessingFrame && selfieSegmentation) {
            isProcessingFrame = true;
            try {
                await selfieSegmentation.send({ image: webcamVideo });
            } catch (err) {
                console.warn("[v4.0] Frame segmentation error:", err);
                isProcessingFrame = false;
            }
        }

        photoboothAnimationId = requestAnimationFrame(renderPhotoboothLoop);
    }

    // --- Photobooth Mode Toggle ---
    async function togglePhotobooth(forcedState) {
        const targetState = (typeof forcedState === 'boolean') ? forcedState : !isPhotoboothActive;

        if (targetState === isPhotoboothActive) return;

        if (targetState) {
            // Activating Photobooth
            showToast("📸 Initializing Camera & AI...");
            try {
                initSelfieSegmentation();

                webcamStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: "user"
                    },
                    audio: false
                });

                webcamVideo.srcObject = webcamStream;
                await webcamVideo.play();

                isPhotoboothActive = true;
                if (photoboothCanvas) {
                    photoboothCanvas.classList.add('active');
                }

                if (photoboothToggleBtn) {
                    photoboothToggleBtn.textContent = '📸 Photo: ON';
                    photoboothToggleBtn.classList.add('active');
                }

                isProcessingFrame = false;
                renderPhotoboothLoop();

                showToast("📸 Photobooth Mode: ON");
                console.log("[v4.0] Photobooth Mode activated.");
            } catch (err) {
                console.error("[v4.0] Failed to start Photobooth camera:", err);
                showToast("⚠️ Camera Error: " + (err.name || "Access Denied"));
                isPhotoboothActive = false;
                if (photoboothToggleBtn) {
                    photoboothToggleBtn.textContent = '📸 Photo: OFF';
                    photoboothToggleBtn.classList.remove('active');
                }
            }
        } else {
            // Deactivating Photobooth
            isPhotoboothActive = false;

            if (photoboothAnimationId) {
                cancelAnimationFrame(photoboothAnimationId);
                photoboothAnimationId = null;
            }

            if (webcamStream) {
                webcamStream.getTracks().forEach(track => track.stop());
                webcamStream = null;
            }

            if (webcamVideo) {
                webcamVideo.pause();
                webcamVideo.srcObject = null;
            }

            if (photoboothCanvas) {
                photoboothCanvas.classList.remove('active');
                const ctx = photoboothCanvas.getContext('2d');
                ctx.clearRect(0, 0, photoboothCanvas.width, photoboothCanvas.height);
            }

            if (photoboothToggleBtn) {
                photoboothToggleBtn.textContent = '📸 Photo: OFF';
                photoboothToggleBtn.classList.remove('active');
            }

            showToast("📸 Photobooth Mode: OFF");
            console.log("[v4.0] Photobooth Mode deactivated.");
        }
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

        const driveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/) ||
                           clean.match(/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/);
        if (driveMatch && driveMatch[1]) {
            if (type === 'image') {
                return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
            }
            return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        }

        if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('static/')) {
            return `static/${clean}`;
        }
        return clean;
    }

    // --- Helper: Map CSV rows into database object ---
    function extractMediaFromRows(rows, sourceName) {
        const db = {};
        if (!rows || rows.length < 2) return db;

        let idIdx = -1, titleIdx = -1, typeIdx = -1, pathIdx = -1;
        for (let i = 0; i < rows[0].length; i++) {
            const norm = rows[0][i].toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['id', 'contentid', 'cardid', 'uid'].includes(norm)) idIdx = i;
            else if (['title', 'name'].includes(norm)) titleIdx = i;
            else if (['type', 'mediatype'].includes(norm)) typeIdx = i;
            else if (norm.includes('path') || norm.includes('file') || norm.includes('url') || norm.includes('link') || norm.includes('media')) pathIdx = i;
        }

        if (idIdx === -1) {
            console.warn(`[v4.0] No ID column found in ${sourceName} sheet.`);
            return db;
        }

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rawId = row[idIdx];
            if (!rawId) continue;

            const id = String(rawId).trim();
            const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim() : id;
            const rawPath = pathIdx !== -1 && row[pathIdx] ? row[pathIdx].trim() : '';
            let type = typeIdx !== -1 && row[typeIdx] ? row[typeIdx].trim().toLowerCase() : '';

            if (type.includes('youtube')) type = 'youtube';
            else if (type.includes('image') || type.includes('photo')) type = 'image';
            else if (type.includes('video')) type = 'video';
            else if (!type) {
                if (getYouTubeVideoId(rawPath)) type = 'youtube';
                else if (/\.(jpe?g|png|webp|gif)($|\?)/i.test(rawPath)) type = 'image';
                else type = 'video';
            }

            db[id] = { id, title, type, file_path: rawPath, source: sourceName };
        }

        return db;
    }

    // --- Helper: Create preview row element ---
    function createDatasetRow(item, sourceTag) {
        const row = document.createElement('div');
        row.className = 'dev-dataset-item';
        row.title = `Click to test ID: ${item.id} (${item.source || sourceTag})`;

        const badgeClass = item.type === 'youtube' ? 'badge-youtube' : (item.type === 'image' ? 'badge-image' : 'badge-video');

        row.innerHTML = `
            <span class="dev-item-id">${item.id}</span>
            <span class="dev-item-name" title="${item.title || item.file_path}">${item.title || item.file_path || 'Untitled'}</span>
            <span class="dev-item-badge ${badgeClass}">${item.type || 'media'}</span>
        `;

        row.addEventListener('click', () => {
            console.log(`[v4.0] Preview item clicked: ${item.id}`);
            contentIdInput.value = item.id;
            fetchMedia(item.id);
        });

        return row;
    }

    // --- Render Dataset Preview in Developer Mode ---
    function renderDatasetPreview() {
        if (!devDatasetList) return;

        const devItems = Object.values(developerDatabase);
        const userItems = Object.values(userDatabase);

        if (devDatasetTitle) {
            devDatasetTitle.textContent = `Developer Tab (${devItems.length} items):`;
        }

        if (devItems.length === 0 && userItems.length === 0) {
            devDatasetList.innerHTML = '<div class="dev-dataset-empty">No items loaded. Check Google Sheet link or internet.</div>';
            return;
        }

        devDatasetList.innerHTML = '';

        // 1. Render FULL dataset from Developer tab
        devItems.forEach((item) => {
            devDatasetList.appendChild(createDatasetRow(item, 'Developer'));
        });

        // 2. Render User-submitted items below
        if (userItems.length > 0) {
            const userDivider = document.createElement('div');
            userDivider.className = 'dev-dataset-header';
            userDivider.style.marginTop = '10px';
            userDivider.innerHTML = `
                <span>Users Tab (${userItems.length} submissions):</span>
                <span class="dev-dataset-subtext">From Google Form</span>
            `;
            devDatasetList.appendChild(userDivider);

            userItems.forEach((item) => {
                devDatasetList.appendChild(createDatasetRow(item, 'Users'));
            });
        }
    }

    // --- Load media database from Google Sheet tabs ---
    async function loadMediaDatabase() {
        let devLoaded = false;
        let userLoaded = false;

        // Fetch Developer Tab
        try {
            console.log("[v4.0] Fetching 'Developer' tab from Google Sheets...");
            const devRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Developer&t=${Date.now()}`);
            if (devRes.ok) {
                const text = await devRes.text();
                developerDatabase = extractMediaFromRows(parseCSV(text), 'Developer');
                devLoaded = true;
                console.log(`[v4.0] Loaded ${Object.keys(developerDatabase).length} items from Developer tab.`);
            }
        } catch (err) {
            console.warn("[v4.0] Could not load 'Developer' tab:", err);
        }

        // Fetch Users Tab
        try {
            console.log("[v4.0] Fetching 'Users' tab from Google Sheets...");
            const userRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Users&t=${Date.now()}`);
            if (userRes.ok) {
                const text = await userRes.text();
                userDatabase = extractMediaFromRows(parseCSV(text), 'Users');
                userLoaded = true;
                console.log(`[v4.0] Loaded ${Object.keys(userDatabase).length} items from Users tab.`);
            }
        } catch (err) {
            console.warn("[v4.0] Could not load 'Users' tab:", err);
        }

        // Fallback to local media_data.json if both tabs failed
        if (!devLoaded && !userLoaded) {
            try {
                console.log("[v4.0] Loading local fallback from media_data.json...");
                const response = await fetch('media_data.json');
                if (response.ok) {
                    const mediaList = await response.json();
                    developerDatabase = {};
                    mediaList.forEach(item => {
                        if (item.id) {
                            developerDatabase[String(item.id).trim()] = item;
                        }
                    });
                    console.log(`[v4.0] Loaded ${Object.keys(developerDatabase).length} items from media_data.json fallback.`);
                }
            } catch (jsonErr) {
                console.error("[v4.0] Failed to load local media_data.json fallback:", jsonErr);
            }
        }

        renderDatasetPreview();
        return devLoaded || userLoaded;
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
        console.log("[v4.0] Home Screen active (doors closed). System ready.");
    }

    // --- Return to Home Screen (triggered by Escape key) ---
    async function returnToHomeScreen() {
        if (isTransitioning) return;

        if (controlsDiv.classList.contains('visible')) {
            controlsDiv.classList.remove('visible');
        }

        if (isAtHomeScreen) {
            console.log("[v4.0] Already at Home Screen.");
            return;
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            console.log("[v4.0] Returning to Home Screen (closing doors)...");
            await playTransition(doorCloseVideoUrl);
            showHomeScreen();
        } catch (err) {
            console.error("[v4.0] Error returning to home screen:", err);
            showHomeScreen();
        } finally {
            transitionVideo.classList.remove('active');
            transitionVideo.pause();
            transitionVideo.currentTime = 0;
            isTransitioning = false;
        }
    }

    // --- Render Registration Screen (QR code to Google Form with pre-filled ID) ---
    function renderRegistrationScreen(unregisteredId) {
        const prefilledFormUrl = `${GOOGLE_FORM_BASE_URL}?usp=pp_url&${GOOGLE_FORM_ID_ENTRY}=${encodeURIComponent(unregisteredId)}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(prefilledFormUrl)}`;

        mediaDisplay.innerHTML = `
            <div class="registration-container">
                <span class="reg-badge">NEW PORTAL KEY DETECTED</span>
                <h2 class="reg-title">Register Your Key</h2>
                <div class="reg-id-box">Card ID: <span class="reg-id-val">${unregisteredId}</span></div>
                <div class="reg-qr-wrapper">
                    <img src="${qrApiUrl}" alt="Scan to register key ${unregisteredId}" />
                </div>
                <div class="reg-instructions">
                    <div class="reg-step"><span class="reg-step-num">1.</span><span>Scan QR code with your phone camera</span></div>
                    <div class="reg-step"><span class="reg-step-num">2.</span><span>Choose Title, Type & paste YouTube or Image link</span></div>
                    <div class="reg-step"><span class="reg-step-num">3.</span><span>Submit form, then tap your card again!</span></div>
                </div>
                <a class="reg-direct-link" href="${prefilledFormUrl}" target="_blank" rel="noopener">Open Form in Browser</a>
                <div class="reg-hint">Press Esc on keypad to return home</div>
            </div>
        `;
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
            // 1. Check if ID exists in Users or Developer tab
            let data = userDatabase[cleanId] || developerDatabase[cleanId];

            if (!data) {
                try {
                    console.log(`[v4.0] Card "${cleanId}" not in memory. Checking Users sheet for fresh submissions...`);
                    const freshRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Users&t=${Date.now()}`);
                    if (freshRes.ok) {
                        const text = await freshRes.text();
                        userDatabase = extractMediaFromRows(parseCSV(text), 'Users');
                        data = userDatabase[cleanId];
                        if (data) {
                            console.log(`[v4.0] Fresh submission found in Users tab for ID "${cleanId}"!`);
                            renderDatasetPreview();
                        }
                    }
                } catch (_) {}
            }

            // 2. Play door closing animation if currently open
            if (!isAtHomeScreen) {
                await playTransition(doorCloseVideoUrl);
            }

            mediaDisplay.innerHTML = '';

            // 3. CASE: UNREGISTERED CARD -> Open door to QR Code Registration Screen!
            if (!data) {
                console.log(`[v4.0] Card "${cleanId}" is unregistered. Opening door to QR Code...`);
                renderRegistrationScreen(cleanId);
                isAtHomeScreen = false;
                await playTransition(doorOpenVideoUrl);
                return;
            }

            // 4. CASE: REGISTERED CARD -> Play media
            const rawPath = data.file_path || '';
            const ytId = getYouTubeVideoId(rawPath);
            const resolvedPath = normalizeMediaUrl(rawPath, data.type);
            console.log(`[v4.0] Playing card ID: ${cleanId} from [${data.source}], title: "${data.title}", type: "${data.type}", resolvedPath: "${resolvedPath}"`);

            await new Promise((resolve, reject) => {
                // CASE A: YouTube Video
                if (data.type === 'youtube' || ytId) {
                    const videoId = ytId || rawPath.trim();
                    console.log(`[v4.0] Embedding YouTube video ID: ${videoId} (Muted: ${isMuted})`);
                    const iframe = document.createElement('iframe');
                    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
                    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                    iframe.allowFullscreen = true;
                    iframe.title = data.title || "YouTube scene";

                    iframe.onload = () => {
                        console.log(`[v4.0] YouTube iframe loaded successfully.`);
                        setTimeout(resolve, 800);
                    };
                    iframe.onerror = (err) => {
                        console.error(`[v4.0] YouTube iframe error:`, err);
                        reject(new Error("Failed to load YouTube player"));
                    };
                    mediaDisplay.appendChild(iframe);

                    // Safety timeout in case YouTube buffers slowly
                    setTimeout(() => {
                        console.log(`[v4.0] Safety timeout reached, opening door.`);
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
                        console.warn("[v4.0] Autoplay error:", error);
                        if (!video.muted) {
                            console.log("[v4.0] Attempting playback fallback to muted...");
                            video.muted = true;
                            video.play().then(resolve).catch(err2 => {
                                console.warn("[v4.0] Playback failed completely:", err2);
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    });

                    video.onerror = () => reject(new Error(`Failed to load video: ${data.title}`));
                }
            });

            // 5. Play door opening animation to reveal media
            isAtHomeScreen = false;
            await playTransition(doorOpenVideoUrl);

        } catch (error) {
            console.error('[v4.0] Error during media transition:', error);
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

    // Photobooth toggle button in Developer Mode
    if (photoboothToggleBtn) {
        photoboothToggleBtn.addEventListener('click', () => {
            togglePhotobooth();
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
                console.log("[v4.0] Developer Mode opened.");
                renderDatasetPreview();
                contentIdInput.focus();
            } else {
                console.log("[v4.0] Developer Mode closed.");
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

        // Hotkey: * (asterisk / multiply) toggles Photobooth Mode ON/OFF
        if (event.key === '*' || event.code === 'NumpadMultiply') {
            if (document.activeElement !== contentIdInput) {
                event.preventDefault();
                togglePhotobooth();
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
    console.log("Portal Door v4.0 initialized.");
    mediaTitle.classList.remove('visible');
    controlsDiv.classList.remove('visible');
    updateSoundUI();
    showHomeScreen();
    loadMediaDatabase();
});
