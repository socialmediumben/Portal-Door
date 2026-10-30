// static/script.js - Portal Door v6.3

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
    const cameraFitToggleBtn = document.getElementById('cameraFitToggleBtn');
    const scriptUrlInput = document.getElementById('scriptUrlInput');

    // Capture Modal Elements
    const captureModal = document.getElementById('captureModal');
    const captureCountdown = document.getElementById('captureCountdown');
    const captureFlash = document.getElementById('captureFlash');
    const captureCanvas = document.getElementById('captureCanvas');
    const captureSpinner = document.getElementById('captureSpinner');
    const captureQrOverlay = document.getElementById('captureQrOverlay');
    const captureQrImg = document.getElementById('captureQrImg');
    const captureDirectLink = document.getElementById('captureDirectLink');
    const backdropSelectorBar = document.getElementById('backdropSelectorBar');
    const captureConfirmHint = document.getElementById('captureConfirmHint');
    const captureInactivityBadge = document.getElementById('captureInactivityBadge');
    const captureTimerText = document.getElementById('captureTimerText');
    const captureLinkedBandsList = document.getElementById('captureLinkedBandsList');
    const tapbandHeaderHint = document.getElementById('tapbandHeaderHint');

    // Photobooth Media Gallery Modal Elements
    const photoboothGalleryModal = document.getElementById('photoboothGalleryModal');
    const galleryCardsGrid = document.getElementById('galleryCardsGrid');
    const galleryInactivityBadge = document.getElementById('galleryInactivityBadge');
    const galleryTimerText = document.getElementById('galleryTimerText');

    // Delete Confirmation Modal Elements
    const deleteModal = document.getElementById('deleteModal');
    const deleteCard = document.getElementById('deleteCard');
    const deleteItemTitle = document.getElementById('deleteItemTitle');
    const deleteItemId = document.getElementById('deleteItemId');
    const deleteItemSource = document.getElementById('deleteItemSource');
    const deleteStatusSpinner = document.getElementById('deleteStatusSpinner');
    const deleteConfirmHint = document.getElementById('deleteConfirmHint');
    const deleteInactivityBadge = document.getElementById('deleteInactivityBadge');
    const deleteTimerText = document.getElementById('deleteTimerText');

    // Neon One CRM Backend Proxy & Social Medium App
    const NEON_PROXY_URL = "https://neon-kiosk.onrender.com";
    const COMPANION_APP_PORTAL_URL = "https://app.socialmedium.space/portal-media";

    // --- Helper: Universal NFC / RFID Tap Card UID Normalization ---
    // Unifies 8-hex ("54dae65a"), 7-byte ("5A:E6:DA:54:25:41:89"), and decimal ("1423631962") to canonical decimal ID
    function normalizeNfcTapCard(raw) {
        if (!raw) return '';
        const clean = String(raw).trim();

        // 1. If it's already an 8-10 digit decimal number, return as-is
        if (/^\d{8,10}$/.test(clean)) {
            return clean;
        }

        // 2. 7-byte (or 4-byte) UID separated by colons, hyphens, or spaces (e.g. from phone "5A:E6:DA:54:25:41:89")
        const byteParts = clean.split(/[:\-\s]+/);
        if (byteParts.length >= 4 && byteParts.every(p => /^[0-9a-fA-F]{1,2}$/.test(p))) {
            const hex4Reverse = byteParts.slice(0, 4).reverse().map(p => p.padStart(2, '0')).join('');
            const dec = parseInt(hex4Reverse, 16);
            if (!isNaN(dec)) return dec.toString();
        }

        // 3. 14-hex character unspaced string (7 bytes from phone, e.g. "5AE6DA54254189")
        if (/^[0-9a-fA-F]{14}$/.test(clean)) {
            const b0 = clean.substring(0, 2);
            const b1 = clean.substring(2, 4);
            const b2 = clean.substring(4, 6);
            const b3 = clean.substring(6, 8);
            const dec = parseInt(b3 + b2 + b1 + b0, 16);
            if (!isNaN(dec)) return dec.toString();
        }

        // 4. 8-hex character string (e.g. Portal Door reader "54dae65a")
        if (/^[0-9a-fA-F]{8}$/.test(clean)) {
            const dec = parseInt(clean, 16);
            if (!isNaN(dec)) return dec.toString();
        }

        return clean;
    }

    // Google Sheet CSV export base URL (spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0)
    const GOOGLE_SHEET_BASE = "https://docs.google.com/spreadsheets/d/1vwXuw-TBYxUXKXUSipa2drArRNXZuKNwbXFhxcVbIc0/gviz/tq?tqx=out:csv";
    
    // Google Form configuration for legacy fallback
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
    let photoboothDatabase = {};
    let photoboothBackdrops = [];
    let isTransitioning = false;
    let isAtHomeScreen = true;
    let isShowingRegistration = false;
    let isShowingCertifications = false;
    let isMuted = false; // Default sound ON as requested
    let soundToastTimeout = null;

    // Photobooth Mode State
    let isPhotoboothActive = false;
    let isTogglingPhotobooth = false;
    let webcamStream = null;
    let selfieSegmentation = null;
    let isProcessingFrame = false;
    let photoboothAnimationId = null;
    let cameraFitMode = localStorage.getItem('portal_camera_fit') || 'contain'; // 'contain' (1:1 uncropped matching camera settings) or 'cover' (fill screen)

    // Capture State
    let isCountingDown = false;
    let isCaptureModalOpen = false;
    let isUploadingPhoto = false;
    let isPhotoUploaded = false;
    let capturedPersonCanvas = document.createElement('canvas');
    let selectedBackdropIndex = 0;
    let loadedBackdropImages = {};
    let activeSceneBackdrop = null; // Option "0 (Your Backdrop)" if not blocked by CORS
    let currentBackdropsList = []; // Merged list of available backdrops
    let captureInactivityInterval = null;
    let captureRemainingSeconds = 90; // 90 seconds timeout returning to home screen

    // Multi-member Tap Band Tagging State for Photobooth
    let taggedTapBands = []; // Array of { cardId: string, displayName: string }
    let captureNfcBuffer = '';
    let lastCaptureKeyTime = 0;
    let backdropDebounceTimer = null;

    // Photobooth Media Gallery State
    let isPhotoboothGalleryOpen = false;
    let galleryInactivityInterval = null;
    let galleryRemainingSeconds = 90; // 90 seconds timeout for backdrop gallery picker

    // Currently Active Media & Delete Confirmation State
    let currentPlayingMedia = null;
    let isDeleteConfirmOpen = false;
    let isDeletingMedia = false;
    let deleteInactivityInterval = null;
    let deleteRemainingSeconds = 30; // 30 seconds timeout for delete confirmation

    // Google Drive Web App Script URL (default configured from user deployment, overridable in Developer Mode)
    const DEFAULT_DRIVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw8sI54Tsza9NwwLd-Id3DgGBg69L4N0VxwSp9d3_dryLdSB5CvmPGtPpzt2uymKRjwcQ/exec";
    let driveScriptUrl = localStorage.getItem('portal_drive_script_url') || DEFAULT_DRIVE_SCRIPT_URL;
    if (scriptUrlInput) {
        scriptUrlInput.value = driveScriptUrl;
        scriptUrlInput.addEventListener('change', () => {
            driveScriptUrl = scriptUrlInput.value.trim() || DEFAULT_DRIVE_SCRIPT_URL;
            localStorage.setItem('portal_drive_script_url', driveScriptUrl);
            showToast("💾 Drive Script URL Saved!");
            console.log("[v5.1] Drive Script URL updated:", driveScriptUrl);
        });
    }

    // Audio tone generator for countdown beeps (loud and clear)
    function playBeep(frequency = 880, duration = 0.18, volume = 0.95, type = 'triangle') {
        if (isMuted) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, ctx.currentTime);
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (_) {}
    }

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

    // --- Camera Framing & Fit Mode Management (Preserves Camera's Own Framing & Zoom) ---
    function applyCameraFitMode() {
        if (!photoboothCanvas) return;
        if (cameraFitMode === 'cover') {
            photoboothCanvas.classList.remove('fit-contain');
            photoboothCanvas.classList.add('fit-cover');
            if (cameraFitToggleBtn) cameraFitToggleBtn.textContent = '📷 Fit: Fill Screen';
        } else {
            photoboothCanvas.classList.remove('fit-cover');
            photoboothCanvas.classList.add('fit-contain');
            if (cameraFitToggleBtn) cameraFitToggleBtn.textContent = '📷 Fit: Uncropped (1:1)';
        }
    }

    if (cameraFitToggleBtn) {
        applyCameraFitMode();
        cameraFitToggleBtn.addEventListener('click', () => {
            cameraFitMode = (cameraFitMode === 'cover') ? 'contain' : 'cover';
            localStorage.setItem('portal_camera_fit', cameraFitMode);
            applyCameraFitMode();
            showToast(cameraFitMode === 'cover' ? '📷 Camera: Fill Screen (Cover)' : '📷 Camera: Uncropped 1:1 (Contain)');
            console.log(`[v7.0] Camera fit mode set to: ${cameraFitMode}`);
        });
    }

    // --- Update Photobooth Canvas Visibility ---
    function updatePhotoboothVisibility() {
        if (!photoboothCanvas) return;
        const shouldBeVisible = isPhotoboothActive && !isAtHomeScreen && !isShowingRegistration && !isShowingCertifications && !isCaptureModalOpen;
        if (shouldBeVisible) {
            photoboothCanvas.classList.add('visible');
            applyCameraFitMode();
        } else {
            photoboothCanvas.classList.remove('visible');
            const ctx = photoboothCanvas.getContext('2d');
            ctx.clearRect(0, 0, photoboothCanvas.width, photoboothCanvas.height);
        }
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

        const activeVideo = mediaDisplay.querySelector('video');
        if (activeVideo) {
            activeVideo.muted = isMuted;
        }

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
        console.log(`[v5.1] Audio toggled: ${isMuted ? 'MUTED' : 'UNMUTED'}`);
    }

    // --- Fullscreen Toggle ---
    function toggleFullscreen() {
        const doc = document;
        const docEl = document.documentElement;
        const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

        if (!isFullscreen) {
            const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
            if (req) {
                req.call(docEl).then(() => {
                    showToast('⛶ Fullscreen ON');
                }).catch(err => {
                    console.warn(`Fullscreen error: ${err.message}`);
                });
            }
        } else {
            const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
            if (exit) {
                exit.call(doc).then(() => {
                    showToast('⛶ Fullscreen OFF');
                }).catch(err => {
                    console.warn(`Exit fullscreen error: ${err.message}`);
                });
            }
        }
    }

    // --- MediaPipe Selfie Segmentation Setup ---
    function initSelfieSegmentation() {
        if (typeof SelfieSegmentation === 'undefined') {
            console.warn("[v5.1] MediaPipe SelfieSegmentation not loaded yet.");
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
            console.log("[v5.1] MediaPipe SelfieSegmentation initialized successfully.");
            return selfieSegmentation;
        } catch (err) {
            console.error("[v5.1] Error initializing SelfieSegmentation:", err);
            return null;
        }
    }

    function onSelfieSegmentationResults(results) {
        try {
            if (!photoboothCanvas || !isPhotoboothActive) return;
            if (isAtHomeScreen || isShowingRegistration || isCaptureModalOpen) return;

            const ctx = photoboothCanvas.getContext('2d');

            if (photoboothCanvas.width !== results.image.width || photoboothCanvas.height !== results.image.height) {
                photoboothCanvas.width = results.image.width;
                photoboothCanvas.height = results.image.height;
            }

            ctx.save();
            ctx.clearRect(0, 0, photoboothCanvas.width, photoboothCanvas.height);
            ctx.drawImage(results.segmentationMask, 0, 0, photoboothCanvas.width, photoboothCanvas.height);
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(results.image, 0, 0, photoboothCanvas.width, photoboothCanvas.height);
            ctx.restore();
        } finally {
            isProcessingFrame = false;
        }
    }

    async function renderPhotoboothLoop() {
        if (!isPhotoboothActive) return;

        if (!isAtHomeScreen && !isShowingRegistration && !isCaptureModalOpen) {
            if (webcamVideo && webcamVideo.readyState >= 2 && !isProcessingFrame && selfieSegmentation) {
                isProcessingFrame = true;
                try {
                    await selfieSegmentation.send({ image: webcamVideo });
                } catch (err) {
                    console.warn("[v5.1] Frame segmentation error:", err);
                    isProcessingFrame = false;
                }
            }
        }

        photoboothAnimationId = requestAnimationFrame(renderPhotoboothLoop);
    }

    // --- Robust Webcam Stream Acquisition Preserving Camera's Native Framing & Resolution ---
    async function getWebcamMediaStream() {
        const constraintOptions = [
            // 1. High-resolution 1080p/4K preserving camera's native framing, zoom and aspect ratio
            { video: { width: { ideal: 1920, max: 3840 }, height: { ideal: 1080, max: 2160 } }, audio: false },
            // 2. High-quality 720p fallback
            { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
            // 3. Fallback generic video stream (most compatible)
            { video: true, audio: false }
        ];

        let lastErr = null;
        for (let attempt = 0; attempt < constraintOptions.length; attempt++) {
            try {
                // Ensure any previous tracks are completely released before requesting
                if (webcamStream) {
                    try { webcamStream.getTracks().forEach(t => t.stop()); } catch (_) {}
                    webcamStream = null;
                }

                const stream = await navigator.mediaDevices.getUserMedia(constraintOptions[attempt]);
                console.log(`[v5.8] Webcam stream acquired on attempt #${attempt + 1}.`);
                return stream;
            } catch (err) {
                lastErr = err;
                console.warn(`[v5.8] Webcam attempt #${attempt + 1} failed (${err.name}: ${err.message}). Retrying...`);

                // If user explicitly denied permissions, stop immediately
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    throw err;
                }

                // If Windows camera driver lock (NotReadableError) or device busy, wait 350ms before next try
                await new Promise(res => setTimeout(res, 350));
            }
        }
        throw lastErr;
    }

    // --- Photobooth Mode Toggle ---
    async function togglePhotobooth(forcedState) {
        if (isTogglingPhotobooth) {
            console.log("[v5.8] Photobooth toggle already in progress. Ignoring overlapping call.");
            return;
        }

        const targetState = (typeof forcedState === 'boolean') ? forcedState : !isPhotoboothActive;
        if (targetState === isPhotoboothActive) return;

        isTogglingPhotobooth = true;

        try {
            if (targetState) {
                initSelfieSegmentation();

                // Acquire webcam stream with automatic retries for NotReadableError
                webcamStream = await getWebcamMediaStream();
                webcamVideo.srcObject = webcamStream;

                await new Promise((resolve) => {
                    webcamVideo.onloadedmetadata = () => {
                        webcamVideo.play().then(resolve).catch(resolve);
                    };
                    setTimeout(() => {
                        webcamVideo.play().then(resolve).catch(resolve);
                    }, 500);
                });

                isPhotoboothActive = true;
                updatePhotoboothVisibility();

                if (photoboothToggleBtn) {
                    photoboothToggleBtn.textContent = '📸 Photo: ON';
                    photoboothToggleBtn.classList.add('active');
                }

                isProcessingFrame = false;
                renderPhotoboothLoop();

                showToast("Photo On");
                console.log("[v5.8] Photobooth Mode activated successfully.");
            } else {
                isPhotoboothActive = false;
                updatePhotoboothVisibility();

                if (photoboothAnimationId) {
                    cancelAnimationFrame(photoboothAnimationId);
                    photoboothAnimationId = null;
                }

                if (webcamStream) {
                    try { webcamStream.getTracks().forEach(track => track.stop()); } catch (_) {}
                    webcamStream = null;
                }

                if (webcamVideo) {
                    try {
                        webcamVideo.pause();
                        webcamVideo.srcObject = null;
                    } catch (_) {}
                }

                if (photoboothToggleBtn) {
                    photoboothToggleBtn.textContent = '📸 Photo: OFF';
                    photoboothToggleBtn.classList.remove('active');
                }

                showToast("Photo Off");
                console.log("[v5.8] Photobooth Mode deactivated.");
            }
        } catch (err) {
            console.error("[v5.8] Failed to start Photobooth camera:", err);
            showToast("⚠️ Camera Error: " + (err.name || "Access Denied"));
            isPhotoboothActive = false;
            updatePhotoboothVisibility();
            if (photoboothToggleBtn) {
                photoboothToggleBtn.textContent = '📸 Photo: OFF';
                photoboothToggleBtn.classList.remove('active');
            }
        } finally {
            isTogglingPhotobooth = false;
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
            console.warn(`[v5.1] No ID column found in ${sourceName} sheet.`);
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
            console.log(`[v5.1] Preview item clicked: ${item.id}`);
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

        devItems.forEach((item) => {
            devDatasetList.appendChild(createDatasetRow(item, 'Developer'));
        });

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

        // 1. Fetch Developer Tab
        try {
            console.log("[v5.1] Fetching 'Developer' tab from Google Sheets...");
            const devRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Developer&t=${Date.now()}`);
            if (devRes.ok) {
                const text = await devRes.text();
                developerDatabase = extractMediaFromRows(parseCSV(text), 'Developer');
                devLoaded = true;
                console.log(`[v5.1] Loaded ${Object.keys(developerDatabase).length} items from Developer tab.`);
            }
        } catch (err) {
            console.warn("[v5.1] Could not load 'Developer' tab:", err);
        }

        // 2. Fetch Users Tab
        try {
            console.log("[v5.1] Fetching 'Users' tab from Google Sheets...");
            const userRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Users&t=${Date.now()}`);
            if (userRes.ok) {
                const text = await userRes.text();
                userDatabase = extractMediaFromRows(parseCSV(text), 'Users');
                userLoaded = true;
                console.log(`[v5.1] Loaded ${Object.keys(userDatabase).length} items from Users tab.`);
            }
        } catch (err) {
            console.warn("[v5.1] Could not load 'Users' tab:", err);
        }

        // 3. Fetch Photobooth Backdrops Tab
        try {
            console.log("[v5.6] Fetching 'Photobooth' backdrops tab from Google Sheets...");
            const pbRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Photobooth&t=${Date.now()}`);
            if (pbRes.ok) {
                const text = await pbRes.text();
                photoboothDatabase = extractMediaFromRows(parseCSV(text), 'Photobooth');
                photoboothBackdrops = Object.values(photoboothDatabase);
                console.log(`[v5.6] Loaded ${photoboothBackdrops.length} Photobooth backdrops.`);
            }
        } catch (pbErr) {
            console.warn("[v5.6] Could not load 'Photobooth' tab:", pbErr);
        }

        // Fallback to local media_data.json if both tabs failed
        if (!devLoaded && !userLoaded) {
            try {
                console.log("[v5.1] Loading local fallback from media_data.json...");
                const response = await fetch('media_data.json');
                if (response.ok) {
                    const mediaList = await response.json();
                    developerDatabase = {};
                    mediaList.forEach(item => {
                        if (item.id) {
                            developerDatabase[String(item.id).trim()] = item;
                        }
                    });
                    console.log(`[v5.1] Loaded ${Object.keys(developerDatabase).length} items from media_data.json fallback.`);
                }
            } catch (jsonErr) {
                console.error("[v5.1] Failed to load local media_data.json fallback:", jsonErr);
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
        isAtHomeScreen = true;
        isShowingRegistration = false;
        isShowingCertifications = false;
        currentPlayingMedia = null;

        closeCaptureModal();
        closePhotoboothGalleryModal();
        closeDeleteConfirmModal();
        updatePhotoboothVisibility();

        mediaDisplay.innerHTML = '';
        const img = document.createElement('img');
        img.src = defaultClosedDoorUrl;
        img.alt = "Portal Door Closed";
        mediaDisplay.appendChild(img);
        console.log("[v6.0] Home Screen active (doors closed). System ready.");
    }

    // --- Return to Home Screen (triggered by '/' key) ---
    async function returnToHomeScreen() {
        if (isTransitioning) return;

        closeCaptureModal();
        closePhotoboothGalleryModal();
        closeDeleteConfirmModal();
        currentPlayingMedia = null;

        if (controlsDiv.classList.contains('visible')) {
            controlsDiv.classList.remove('visible');
        }

        if (isAtHomeScreen) {
            console.log("[v6.0] Already at Home Screen.");
            return;
        }

        if (photoboothCanvas) {
            photoboothCanvas.classList.remove('visible');
            const ctx = photoboothCanvas.getContext('2d');
            ctx.clearRect(0, 0, photoboothCanvas.width, photoboothCanvas.height);
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            console.log("[v5.1] Returning to Home Screen (closing doors)...");
            await playTransition(doorCloseVideoUrl);
            showHomeScreen();
        } catch (err) {
            console.error("[v5.1] Error returning to home screen:", err);
            showHomeScreen();
        } finally {
            transitionVideo.classList.remove('active');
            transitionVideo.pause();
            transitionVideo.currentTime = 0;
            isTransitioning = false;
        }
    }

    // --- Helper: Fetch Full Member Record from Neon One (CRM Single Source of Truth) ---
    async function fetchNeonOneMember(tapCard) {
        try {
            const cleanCard = String(tapCard).trim();
            if (!cleanCard) return null;
            const normalized = normalizeNfcTapCard(cleanCard);

            console.log(`[Neon One] Looking up full constituent record for Tap Card "${normalized}" (raw: "${cleanCard}")...`);
            let searchRes = await fetch(`${NEON_PROXY_URL}/api/v2/accounts/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    searchFields: [{ field: 'Tap Card', operator: 'EQUAL', value: normalized }],
                    outputFields: ['Account ID'],
                    pagination: { currentPage: 0, pageSize: 1 }
                })
            });

            let searchData = searchRes.ok ? await searchRes.json() : null;
            let accountId = searchData?.searchResults?.[0]?.['Account ID'];

            // Fallback: if not found with normalized decimal and normalized differs from cleanCard, try raw cleanCard
            if (!accountId && normalized !== cleanCard) {
                const fallbackRes = await fetch(`${NEON_PROXY_URL}/api/v2/accounts/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        searchFields: [{ field: 'Tap Card', operator: 'EQUAL', value: cleanCard }],
                        outputFields: ['Account ID'],
                        pagination: { currentPage: 0, pageSize: 1 }
                    })
                });
                if (fallbackRes.ok) {
                    const fallbackData = await fallbackRes.json();
                    accountId = fallbackData?.searchResults?.[0]?.['Account ID'];
                }
            }

            if (!accountId) return null;

            const accRes = await fetch(`${NEON_PROXY_URL}/api/v2/accounts/${accountId}`);
            if (!accRes.ok) return null;
            const accData = await accRes.json();

            const ind = accData.individualAccount;
            if (!ind) return null;

            const customFields = ind.accountCustomFields || [];
            const portalField = customFields.find(f => String(f.id) === "117" || (f.name || '').toLowerCase() === "portal media");
            const mediaUrl = (portalField?.value || '').trim();

            const contact = ind.primaryContact || {};
            const displayName = contact.preferredName || contact.firstName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Member';

            // Extract Certifications (Field 116)
            let certsList = [];
            const certField = customFields.find(f => String(f.id) === "116" || (f.name || '').toLowerCase() === "certifications");
            if (certField) {
                if (Array.isArray(certField.optionValues)) {
                    certsList = certField.optionValues.map(opt => opt.name || String(opt));
                } else if (certField.value) {
                    certsList = [String(certField.value)];
                }
            }

            let mediaType = 'video';
            if (getYouTubeVideoId(mediaUrl)) {
                mediaType = 'youtube';
            } else if (/\.(jpe?g|png|webp|gif)($|\?)/i.test(mediaUrl)) {
                mediaType = 'image';
            }

            return {
                id: normalized,
                title: `${displayName}'s Portal`,
                type: mediaType,
                file_path: mediaUrl,
                source: 'Neon One',
                displayName: displayName,
                certifications: certsList,
                membershipStatus: ind.accountCurrentMembershipStatus ? `${ind.accountCurrentMembershipStatus} Member` : 'Active Member'
            };
        } catch (err) {
            console.warn('[Portal-Door] Neon One lookup error:', err);
            return null;
        }
    }

    // --- Helper: Fetch Portal Media from Neon One (CRM Single Source of Truth) ---
    async function fetchNeonOnePortalMedia(tapCard) {
        const member = await fetchNeonOneMember(tapCard);
        if (member && member.file_path) {
            console.log(`[Neon One] Found active Portal Media for ${member.displayName} (Tap Card "${tapCard}"): ${member.file_path}`);
            return member;
        }
        return null;
    }

    // --- Render Registration Screen (QR code to Companion App with pre-filled ID) ---
    function renderRegistrationScreen(unregisteredId) {
        isShowingRegistration = true;
        isShowingCertifications = false;
        updatePhotoboothVisibility();

        const companionUrl = `${COMPANION_APP_PORTAL_URL}?card=${encodeURIComponent(unregisteredId)}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(companionUrl)}`;

        mediaDisplay.innerHTML = `
            <div class="registration-container">
                <span class="reg-badge">PORTAL MEDIA SETUP</span>
                <h2 class="reg-title">Set Up Your Portal Media</h2>
                <div class="reg-id-box">Tap Card: <span class="reg-id-val">${unregisteredId}</span></div>
                <div class="reg-qr-wrapper">
                    <img src="${qrApiUrl}" alt="Scan to set up key ${unregisteredId}" />
                </div>
                <div class="reg-instructions">
                    <div class="reg-step"><span class="reg-step-num">1.</span><span>Scan QR code with your phone camera</span></div>
                    <div class="reg-step"><span class="reg-step-num">2.</span><span>Paste a YouTube loop or image link</span></div>
                    <div class="reg-step"><span class="reg-step-num">3.</span><span>Tap Save in the app, then tap your card again!</span></div>
                </div>
                <a class="reg-direct-link" href="${companionUrl}" target="_blank" rel="noopener">Open Companion App</a>
                <div class="reg-hint">Press Backspace on keypad to return home</div>
            </div>
        `;
    }

    // --- Render Member Achievements & Certifications Screen (triggered by '/' key) ---
    function renderCertificationsScreen(memberData) {
        isShowingCertifications = true;
        isShowingRegistration = false;
        updatePhotoboothVisibility();

        const certs = memberData.certifications || [];
        const displayName = memberData.displayName || memberData.title?.replace("'s Portal", '') || 'Member';
        const cardId = memberData.id || 'Unknown';
        const status = memberData.membershipStatus || 'Active Member';

        let certsListHtml = '';
        let deduplicatedCount = certs.length;
        if (typeof SMCertifications !== 'undefined' && typeof SMCertifications.renderColorBadges === 'function') {
            certsListHtml = SMCertifications.renderColorBadges(certs);
            const grouped = SMCertifications.dedupeAndGroup(certs);
            deduplicatedCount = grouped.length;
        } else if (certs.length > 0) {
            certsListHtml = certs.map(c => `
                <div class="cert-item">
                    <span class="cert-check">✓</span>
                    <span class="cert-name">${c}</span>
                    <span class="cert-tag">Authorized</span>
                </div>
            `).join('');
        } else {
            certsListHtml = `<div class="cert-empty">No tool certifications recorded yet in Neon One.<br>Attend an equipment safety walkthrough to get certified!</div>`;
        }

        mediaDisplay.innerHTML = `
            <div class="certifications-container">
                <span class="cert-badge">MEMBER PASSPORT • NEON ONE SYNCED</span>
                <h2 class="cert-title">${displayName}</h2>
                <div class="cert-meta-row">
                    <span class="cert-tier">${status}</span>
                    <span class="cert-card-id">Card #${cardId}</span>
                </div>
                <div class="cert-section-label">Authorized Tool Certifications (${deduplicatedCount})</div>
                <div class="cert-list-box">
                    ${certsListHtml}
                </div>
                <div class="cert-footer-guide">
                    <span>Press <kbd>/</kbd> to resume Media</span>
                    <span>•</span>
                    <span>Press <kbd>Backspace</kbd> for Home</span>
                </div>
            </div>
        `;
    }

    // --- PHOTOBOOTH MEDIA OPTIONS GALLERY MODAL ---

    function updateGalleryInactivityUI() {
        if (galleryTimerText) {
            galleryTimerText.textContent = `${galleryRemainingSeconds}s`;
        }
        if (galleryInactivityBadge) {
            if (galleryRemainingSeconds <= 15) {
                galleryInactivityBadge.classList.add('urgent');
            } else {
                galleryInactivityBadge.classList.remove('urgent');
            }
        }
    }

    function startGalleryInactivityTimer() {
        clearGalleryInactivityTimer();
        galleryRemainingSeconds = 90;
        updateGalleryInactivityUI();

        galleryInactivityInterval = setInterval(async () => {
            galleryRemainingSeconds--;
            updateGalleryInactivityUI();

            if (galleryRemainingSeconds <= 0) {
                clearGalleryInactivityTimer();
                if (isPhotoboothGalleryOpen) {
                    console.log("[v5.6] 90s Photobooth gallery inactivity timeout reached.");
                    closePhotoboothGalleryModal();
                    if (!isAtHomeScreen) {
                        showToast("Returning Home");
                        await returnToHomeScreen();
                    }
                }
            }
        }, 1000);
    }

    function resetGalleryInactivityTimer() {
        if (isPhotoboothGalleryOpen) {
            startGalleryInactivityTimer();
        }
    }

    function clearGalleryInactivityTimer() {
        if (galleryInactivityInterval) {
            clearInterval(galleryInactivityInterval);
            galleryInactivityInterval = null;
        }
        if (galleryInactivityBadge) {
            galleryInactivityBadge.classList.remove('urgent');
        }
    }

    function openPhotoboothPickerModal() {
        if (isTransitioning || isCaptureModalOpen) return;
        isPhotoboothGalleryOpen = true;
        renderPhotoboothGalleryCards();
        if (photoboothGalleryModal) {
            photoboothGalleryModal.classList.add('active');
        }
        startGalleryInactivityTimer();
        console.log(`[v5.6] Photobooth Media Options modal opened (${photoboothBackdrops.length} options).`);
    }

    function closePhotoboothGalleryModal() {
        isPhotoboothGalleryOpen = false;
        clearGalleryInactivityTimer();
        if (photoboothGalleryModal) {
            photoboothGalleryModal.classList.remove('active');
        }
    }

    function renderPhotoboothGalleryCards() {
        if (!galleryCardsGrid) return;
        galleryCardsGrid.innerHTML = '';

        if (!photoboothBackdrops || photoboothBackdrops.length === 0) {
            galleryCardsGrid.innerHTML = '<div class="gallery-empty-state">No Photobooth backdrops loaded from Google Sheet yet.</div>';
            return;
        }

        photoboothBackdrops.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'gallery-card';
            const numKey = item.id || String(index + 1);
            card.title = `Press ${numKey} to choose "${item.title}"`;
            const resolvedUrl = normalizeMediaUrl(item.file_path, item.type);

            card.innerHTML = `
                <div class="gallery-thumb-wrapper">
                    <img class="gallery-thumb-img" src="${resolvedUrl}" alt="${item.title}" loading="lazy" onerror="this.src='static/images/Door Closed.png'" />
                    <div class="gallery-num-badge"><kbd>${numKey}</kbd></div>
                </div>
                <div class="gallery-info">
                    <span class="gallery-title">${item.title}</span>
                    <span class="gallery-num-tag">#${numKey}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                selectPhotoboothGalleryItem(item);
            });

            galleryCardsGrid.appendChild(card);
        });
    }

    async function selectPhotoboothGalleryItem(item) {
        closePhotoboothGalleryModal();
        showToast(`Backdrop: ${item.title}`);

        // Automatically activate Photobooth webcam mode so visitor is overlaid in portal
        if (!isPhotoboothActive) {
            await togglePhotobooth(true);
        }

        await playMediaData(item, item.id);
    }

    // --- DELETE CURRENT MEDIA CONFIRMATION MODAL (-) ---

    function updateDeleteInactivityUI() {
        if (deleteTimerText) {
            deleteTimerText.textContent = `${deleteRemainingSeconds}s`;
        }
        if (deleteInactivityBadge) {
            if (deleteRemainingSeconds <= 10) {
                deleteInactivityBadge.classList.add('urgent');
            } else {
                deleteInactivityBadge.classList.remove('urgent');
            }
        }
    }

    function clearDeleteInactivityTimer() {
        if (deleteInactivityInterval) {
            clearInterval(deleteInactivityInterval);
            deleteInactivityInterval = null;
        }
        if (deleteInactivityBadge) {
            deleteInactivityBadge.classList.remove('urgent');
        }
    }

    function startDeleteInactivityTimer() {
        clearDeleteInactivityTimer();
        deleteRemainingSeconds = 30;
        updateDeleteInactivityUI();

        deleteInactivityInterval = setInterval(() => {
            deleteRemainingSeconds--;
            updateDeleteInactivityUI();

            if (deleteRemainingSeconds <= 0) {
                clearDeleteInactivityTimer();
                if (isDeleteConfirmOpen) {
                    console.log("[v6.0] 30s Delete confirmation inactivity timeout reached. Canceling.");
                    closeDeleteConfirmModal();
                }
            }
        }, 1000);
    }

    function resetDeleteInactivityTimer() {
        if (isDeleteConfirmOpen && !isDeletingMedia) {
            deleteRemainingSeconds = 30;
            updateDeleteInactivityUI();
        }
    }

    function openDeleteConfirmModal() {
        if (isTransitioning || isCaptureModalOpen || isPhotoboothGalleryOpen || !currentPlayingMedia) return;

        pauseActiveMedia();

        isDeleteConfirmOpen = true;
        isDeletingMedia = false;

        if (deleteItemTitle) {
            deleteItemTitle.textContent = currentPlayingMedia.title || currentPlayingMedia.id;
        }
        if (deleteItemId) {
            deleteItemId.textContent = currentPlayingMedia.id;
        }
        if (deleteItemSource) {
            deleteItemSource.textContent = currentPlayingMedia.source ? `${currentPlayingMedia.source} Tab` : 'Spreadsheet';
        }
        if (deleteStatusSpinner) {
            deleteStatusSpinner.style.display = 'none';
        }
        if (deleteConfirmHint) {
            deleteConfirmHint.style.display = 'inline-flex';
        }

        if (deleteModal) {
            deleteModal.classList.add('active');
        }

        startDeleteInactivityTimer();
        console.log(`[v6.0] Delete confirmation prompt opened for item ID "${currentPlayingMedia.id}".`);
    }

    function closeDeleteConfirmModal() {
        isDeleteConfirmOpen = false;
        isDeletingMedia = false;
        clearDeleteInactivityTimer();

        if (deleteModal) {
            deleteModal.classList.remove('active');
        }

        if (!isAtHomeScreen && !isShowingRegistration) {
            resumeActiveMedia();
        }
    }

    async function confirmDeleteCurrentMedia() {
        if (!currentPlayingMedia || isDeletingMedia) return;
        isDeletingMedia = true;

        clearDeleteInactivityTimer();

        const mediaToDelete = { ...currentPlayingMedia };
        console.log(`[v6.0] Deleting media ID "${mediaToDelete.id}" (${mediaToDelete.title}) from spreadsheet...`);

        if (deleteStatusSpinner) {
            deleteStatusSpinner.style.display = 'flex';
        }
        if (deleteConfirmHint) {
            deleteConfirmHint.style.display = 'none';
        }

        // 1. Remove from local in-memory caches immediately
        if (developerDatabase[mediaToDelete.id]) {
            delete developerDatabase[mediaToDelete.id];
        }
        if (userDatabase[mediaToDelete.id]) {
            delete userDatabase[mediaToDelete.id];
        }
        if (photoboothDatabase[mediaToDelete.id]) {
            delete photoboothDatabase[mediaToDelete.id];
            photoboothBackdrops = Object.values(photoboothDatabase);
        }
        renderDatasetPreview();

        // 2. Send delete command to Google Apps Script Web App
        let deletedOnSheet = false;
        if (driveScriptUrl) {
            try {
                const response = await fetch(driveScriptUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'delete',
                        id: mediaToDelete.id,
                        source: mediaToDelete.source || '',
                        timestamp: new Date().toISOString()
                    })
                });
                const result = await response.json();
                console.log("[v6.2] Google Apps Script delete response:", result);
                if (result && result.status === 'success') {
                    deletedOnSheet = true;
                } else if (result && result.status === 'error') {
                    console.error("[v6.2] Google Apps Script error:", result.message);
                    if (String(result.message).includes("permission") || String(result.message).includes("SpreadsheetApp")) {
                        showToast("⚠️ Needs Permission! Open Apps Script & click Run on testAuthorization");
                    } else {
                        showToast(`⚠️ Delete failed: ${result.message}`);
                    }
                }
            } catch (err) {
                console.warn("[v6.2] Error sending delete request to Google Apps Script:", err);
                showToast("⚠️ Could not reach Apps Script endpoint.");
            }
        } else {
            console.warn("[v6.2] No driveScriptUrl configured. Deleted from local cache only.");
        }

        isDeletingMedia = false;
        closeDeleteConfirmModal();

        if (deletedOnSheet) {
            showToast(`🗑️ Deleted "${mediaToDelete.title || mediaToDelete.id}" from Sheet!`);
        }

        // Return to Home Screen (doors close)
        await returnToHomeScreen();
    }

    // --- Shared Core Media Rendering & Display Helper ---
    async function renderAndDisplayMedia(data, cleanId) {
        currentPlayingMedia = { ...data, id: cleanId };
        isShowingRegistration = false;
        isShowingCertifications = false;
        const rawPath = data.file_path || '';
        const ytId = getYouTubeVideoId(rawPath);
        const resolvedPath = normalizeMediaUrl(rawPath, data.type);
        console.log(`[v5.6] Playing item ID: ${cleanId} from [${data.source}], title: "${data.title}", type: "${data.type}", resolvedPath: "${resolvedPath}"`);

        await new Promise((resolve, reject) => {
            // CASE A: YouTube Video
            if (data.type === 'youtube' || ytId) {
                const videoId = ytId || rawPath.trim();
                console.log(`[v5.6] Embedding YouTube video ID: ${videoId} (Muted: ${isMuted})`);
                const iframe = document.createElement('iframe');
                iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${videoId}&enablejsapi=1`;
                iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                iframe.allowFullscreen = true;
                iframe.title = data.title || "YouTube scene";

                iframe.onload = () => {
                    console.log(`[v5.6] YouTube iframe loaded successfully.`);
                    setTimeout(resolve, 800);
                };
                iframe.onerror = (err) => {
                    console.error(`[v5.6] YouTube iframe error:`, err);
                    reject(new Error("Failed to load YouTube player"));
                };
                mediaDisplay.appendChild(iframe);

                setTimeout(() => {
                    console.log(`[v5.6] Safety timeout reached, opening door.`);
                    resolve();
                }, 3500);

            // CASE B: Image
            } else if (data.type === 'image') {
                const img = document.createElement('img');
                img.crossOrigin = "anonymous";
                img.alt = data.title;
                img.onload = () => {
                    mediaDisplay.appendChild(img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn("[v5.6] Image failed with CORS, falling back without CORS for display:", resolvedPath);
                    const fallback = document.createElement('img');
                    fallback.src = resolvedPath;
                    fallback.alt = data.title;
                    fallback.onload = () => {
                        mediaDisplay.appendChild(fallback);
                        resolve();
                    };
                    fallback.onerror = () => reject(new Error(`Failed to load image: ${data.title}`));
                };
                img.src = resolvedPath;

            // CASE C: Standard Video (MP4 / WebM / Google Drive stream)
            } else {
                const video = document.createElement('video');
                video.crossOrigin = "anonymous";
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
                    console.warn("[v5.6] Autoplay error:", error);
                    if (!video.muted) {
                        console.log("[v5.6] Attempting playback fallback to muted...");
                        video.muted = true;
                        video.play().then(resolve).catch(err2 => {
                            console.warn("[v5.6] Playback failed completely:", err2);
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                });

                video.onerror = () => {
                    if (video.crossOrigin) {
                        console.warn("[v5.6] Video failed with CORS, retrying without CORS:", resolvedPath);
                        video.removeAttribute('crossOrigin');
                        video.load();
                        return;
                    }
                    reject(new Error(`Failed to load video: ${data.title}`));
                };
            }
        });

        // Open doors to reveal media
        isAtHomeScreen = false;
        isShowingRegistration = false;

        updatePhotoboothVisibility();

        await playTransition(doorOpenVideoUrl);
    }

    // Play a media object directly (e.g. from Photobooth gallery or Developer mode)
    async function playMediaData(data, cleanId) {
        if (isTransitioning) {
            console.warn("Transition already in progress. Ignoring input.");
            return;
        }

        closeCaptureModal();
        closePhotoboothGalleryModal();

        if (photoboothCanvas) {
            photoboothCanvas.classList.remove('visible');
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            if (!isAtHomeScreen) {
                await playTransition(doorCloseVideoUrl);
            }

            mediaDisplay.innerHTML = '';
            await renderAndDisplayMedia(data, cleanId);

        } catch (error) {
            console.error('[v5.6] Error during media playback:', error);
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

    // --- Function to fetch and display media by ID ---
    async function fetchMedia(contentId) {
        if (isTransitioning) {
            console.warn("Transition already in progress. Ignoring input.");
            return;
        }

        closeCaptureModal();
        closePhotoboothGalleryModal();

        const cleanId = String(contentId).trim();
        // If Enter is pressed when search bar is empty, show Photobooth Media Options!
        if (!cleanId) {
            openPhotoboothPickerModal();
            return;
        }

        const normalizedId = normalizeNfcTapCard(cleanId);

        if (photoboothCanvas) {
            photoboothCanvas.classList.remove('visible');
        }

        isTransitioning = true;
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        try {
            // 1. Check Neon One CRM first as single source of truth for Tap Card Portal Media
            let data = await fetchNeonOnePortalMedia(normalizedId);
            if (!data && normalizedId !== cleanId) {
                data = await fetchNeonOnePortalMedia(cleanId);
            }

            // 2. Fallback to developerDatabase or photoboothDatabase if not set in Neon One
            if (!data) {
                data = developerDatabase[normalizedId] || photoboothDatabase[normalizedId] || userDatabase[normalizedId]
                    || developerDatabase[cleanId] || photoboothDatabase[cleanId] || userDatabase[cleanId];
            }

            // 3. Fallback to Google Sheet Users tab if not yet found
            if (!data) {
                try {
                    console.log(`[v6.8] Card "${normalizedId}" not in Neon One. Checking legacy Users sheet...`);
                    const freshRes = await fetch(`${GOOGLE_SHEET_BASE}&sheet=Users&t=${Date.now()}`);
                    if (freshRes.ok) {
                        const text = await freshRes.text();
                        userDatabase = extractMediaFromRows(parseCSV(text), 'Users');
                        data = userDatabase[normalizedId] || userDatabase[cleanId];
                        if (data) {
                            console.log(`[v6.8] Fallback match found in Users tab for ID "${normalizedId}"!`);
                            renderDatasetPreview();
                        }
                    }
                } catch (_) {}
            }

            if (!isAtHomeScreen) {
                await playTransition(doorCloseVideoUrl);
            }

            mediaDisplay.innerHTML = '';

            // CASE: UNREGISTERED CARD OR NO PORTAL MEDIA IN NEON ONE -> Open door to QR Code Registration!
            if (!data) {
                console.log(`[v6.8] Card "${normalizedId}" has no Portal Media in Neon One. Opening door to QR Code...`);
                renderRegistrationScreen(normalizedId);
                isAtHomeScreen = false;
                await playTransition(doorOpenVideoUrl);
                return;
            }

            // CASE: REGISTERED CARD WITH MEDIA -> Play media
            await renderAndDisplayMedia(data, normalizedId);

        } catch (error) {
            console.error('[v5.6] Error during media transition:', error);
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

    // --- PHOTOBOOTH CAPTURE & BACKDROP COMPOSITING ---

    // Load an image into memory with CORS support
    function preloadImage(url) {
        return new Promise((resolve) => {
            if (!url) return resolve(null);
            if (loadedBackdropImages[url] !== undefined) {
                return resolve(loadedBackdropImages[url]);
            }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                img._corsSafe = true;
                loadedBackdropImages[url] = img;
                resolve(img);
            };
            img.onerror = () => {
                console.warn("[v5.2] Backdrop image failed CORS anonymous loading:", url);
                // CRUCIAL: Do NOT load image without crossOrigin, as drawing non-CORS images
                // permanently taints the HTML5 canvas and prevents toDataURL export!
                loadedBackdropImages[url] = null;
                resolve(null);
            };
            img.src = url;
        });
    }

    // Renders the combined composite on #captureCanvas
    // --- Inactivity Timeout for Photobooth Capture Module (90 seconds live countdown) ---
    function updateInactivityBadgeUI() {
        if (captureTimerText) {
            captureTimerText.textContent = `${captureRemainingSeconds}s`;
        }
        if (captureInactivityBadge) {
            if (captureRemainingSeconds <= 15) {
                captureInactivityBadge.classList.add('urgent');
            } else {
                captureInactivityBadge.classList.remove('urgent');
            }
        }
    }

    function startCaptureInactivityTimer() {
        clearCaptureInactivityTimer();
        captureRemainingSeconds = 90;
        updateInactivityBadgeUI();

        captureInactivityInterval = setInterval(async () => {
            captureRemainingSeconds--;
            updateInactivityBadgeUI();

            if (captureRemainingSeconds <= 0) {
                clearCaptureInactivityTimer();
                if (isCaptureModalOpen) {
                    console.log("[v5.5] 90s Photobooth inactivity timeout reached. Returning to Home Screen.");
                    showToast("Returning Home");
                    closeCaptureModal();
                    await returnToHomeScreen();
                }
            }
        }, 1000);
    }

    function resetCaptureInactivityTimer() {
        if (isCaptureModalOpen) {
            startCaptureInactivityTimer();
        }
    }

    function clearCaptureInactivityTimer() {
        if (captureInactivityInterval) {
            clearInterval(captureInactivityInterval);
            captureInactivityInterval = null;
        }
        if (captureInactivityBadge) {
            captureInactivityBadge.classList.remove('urgent');
        }
    }

    // --- Media Playback Control for Photobooth Pause/Resume ---
    function pauseActiveMedia() {
        const video = mediaDisplay.querySelector('video');
        if (video && !video.paused) {
            video.pause();
            console.log("[v5.4] Paused active video playback for photo countdown.");
        }
        const iframe = mediaDisplay.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            console.log("[v5.4] Sent pause to active YouTube video for photo countdown.");
        }
    }

    function resumeActiveMedia() {
        if (isAtHomeScreen || isShowingRegistration) return;
        const video = mediaDisplay.querySelector('video');
        if (video && video.paused) {
            video.play().catch(e => console.warn("[v5.4] Failed to resume video:", e));
        }
        const iframe = mediaDisplay.querySelector('iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        }
    }

    // Capture current active media as Option "0 (Your Backdrop)" if not blocked by CORS
    function getActiveSceneBackdrop() {
        if (!mediaDisplay || isAtHomeScreen || isShowingRegistration) return null;

        // 1. Try capturing current frozen frame from HTML5 <video>
        const video = mediaDisplay.querySelector('video');
        if (video && video.videoWidth > 0 && video.videoHeight > 0) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1080;
                canvas.height = 1620;
                const ctx = canvas.getContext('2d');
                const ratio = Math.max(1080 / video.videoWidth, 1620 / video.videoHeight);
                const drawW = video.videoWidth * ratio;
                const drawH = video.videoHeight * ratio;
                ctx.drawImage(video, (1080 - drawW) / 2, (1620 - drawH) / 2, drawW, drawH);

                // Crucial test: verify canvas is origin-clean (not tainted by cross-origin video)
                const testDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                console.log("[v5.4] Successfully captured active video frame as Option '0 (Your Backdrop)'.");
                return {
                    id: '0',
                    title: 'Your Backdrop',
                    file_path: testDataUrl,
                    type: 'image',
                    isSceneBackdrop: true,
                    _cachedCanvas: canvas
                };
            } catch (err) {
                console.warn("[v5.4] Active video blocked by CORS for backdrop:", err);
            }
        }

        // 2. Try capturing from <img>
        const img = mediaDisplay.querySelector('img');
        if (img && img.complete && img.naturalWidth > 0) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1080;
                canvas.height = 1620;
                const ctx = canvas.getContext('2d');
                const ratio = Math.max(1080 / img.naturalWidth, 1620 / img.naturalHeight);
                const drawW = img.naturalWidth * ratio;
                const drawH = img.naturalHeight * ratio;
                ctx.drawImage(img, (1080 - drawW) / 2, (1620 - drawH) / 2, drawW, drawH);

                // Crucial test: verify canvas is origin-clean
                const testDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                console.log("[v5.4] Successfully captured active image as Option '0 (Your Backdrop)'.");
                return {
                    id: '0',
                    title: 'Your Backdrop',
                    file_path: testDataUrl,
                    type: 'image',
                    isSceneBackdrop: true,
                    _cachedCanvas: canvas
                };
            } catch (err) {
                console.warn("[v5.4] Active image blocked by CORS for backdrop:", err);
            }
        }

        console.log("[v5.4] Active media cannot be captured as backdrop (e.g. YouTube iframe or cross-origin).");
        return null;
    }

    // Renders the combined composite on #captureCanvas
    async function renderCompositeCapture() {
        if (!captureCanvas) return;
        const ctx = captureCanvas.getContext('2d');

        const width = 1080;
        const height = 1620; // 3:2 Portrait Aspect Ratio (1080x1620)
        if (captureCanvas.width !== width || captureCanvas.height !== height) {
            captureCanvas.width = width;
            captureCanvas.height = height;
        }

        ctx.clearRect(0, 0, width, height);

        // 1. Draw Backdrop
        let backdropDrawn = false;
        let backdropTitle = "Sci-Fi Portal";
        if (currentBackdropsList.length > 0 && currentBackdropsList[selectedBackdropIndex]) {
            const item = currentBackdropsList[selectedBackdropIndex];
            backdropTitle = item.title || "Portal";

            if (item.isSceneBackdrop && item._cachedCanvas) {
                // Pre-captured clean canvas frame
                ctx.drawImage(item._cachedCanvas, 0, 0, width, height);
                backdropDrawn = true;
            } else {
                const resolvedUrl = normalizeMediaUrl(item.file_path, item.type);
                const img = await preloadImage(resolvedUrl);
                if (img && img._corsSafe) {
                    // Draw image scaled to cover the portrait canvas
                    const hRatio = width / img.width;
                    const vRatio = height / img.height;
                    const ratio = Math.max(hRatio, vRatio);
                    const centerShiftX = (width - img.width * ratio) / 2;
                    const centerShiftY = (height - img.height * ratio) / 2;
                    ctx.drawImage(img, 0, 0, img.width, img.height, centerShiftX, centerShiftY, img.width * ratio, img.height * ratio);
                    backdropDrawn = true;
                } else if (img === null) {
                    console.warn(`[v5.4] Backdrop "${item.title}" blocked by host CORS policy. Using portal theme.`);
                }
            }
        }

        // Fallback backdrop gradient & sci-fi grid if image fails CORS or loading
        if (!backdropDrawn) {
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#020617');
            grad.addColorStop(0.5, '#0f172a');
            grad.addColorStop(1, '#0284c7');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            // Cyber grid lines
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.12)';
            ctx.lineWidth = 1.5;
            for (let x = 0; x < width; x += 80) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 0; y < height; y += 80) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Radial portal glow behind person (Brand colors: light blue + neon orange)
            const radial = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, 600);
            radial.addColorStop(0, 'rgba(0, 210, 255, 0.3)');
            radial.addColorStop(0.55, 'rgba(255, 107, 0, 0.22)');
            radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = radial;
            ctx.fillRect(0, 0, width, height);

            // Watermark indicating theme
            ctx.save();
            ctx.font = 'bold 36px Arial, sans-serif';
            ctx.fillStyle = 'rgba(255, 157, 66, 0.45)';
            ctx.shadowColor = 'rgba(255, 107, 0, 0.8)';
            ctx.shadowBlur = 8;
            ctx.textAlign = 'center';
            ctx.fillText(`PORTAL: ${backdropTitle.toUpperCase()}`, width / 2, height - 85);
            ctx.restore();
        }

        // 2. Draw Person Cutout on top (respecting cameraFitMode: uncropped 1:1 or fill)
        if (capturedPersonCanvas && capturedPersonCanvas.width > 0) {
            const hRatio = width / capturedPersonCanvas.width;
            const vRatio = height / capturedPersonCanvas.height;
            const ratio = (cameraFitMode === 'cover') ? Math.max(hRatio, vRatio) : Math.min(hRatio, vRatio);
            const drawW = capturedPersonCanvas.width * ratio;
            const drawH = capturedPersonCanvas.height * ratio;
            const centerShiftX = (width - drawW) / 2;
            const centerShiftY = height - drawH; // Anchor person to bottom of portrait frame
            ctx.drawImage(
                capturedPersonCanvas,
                0, 0, capturedPersonCanvas.width, capturedPersonCanvas.height,
                centerShiftX, centerShiftY, drawW, drawH
            );
        }

        // 3. Sci-Fi Portal Watermark
        ctx.save();
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowColor = 'rgba(0, 210, 255, 0.9)';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText('PORTAL DOOR PHOTOBOOTH', width / 2, height - 35);
        ctx.restore();
    }

    // Populate backdrop pills in the selector bar
    function renderBackdropSelectorPills() {
        if (!backdropSelectorBar) return;
        backdropSelectorBar.innerHTML = '';

        currentBackdropsList.forEach((item, index) => {
            const pill = document.createElement('div');
            pill.className = `backdrop-pill ${index === selectedBackdropIndex ? 'selected' : ''}`;
            const keyDigit = item.id === '0' ? '0' : String(item.id || (index + (activeSceneBackdrop ? 0 : 1)));
            const resolvedUrl = normalizeMediaUrl(item.file_path, item.type);
            const isCorsBlocked = !item.isSceneBackdrop && loadedBackdropImages[resolvedUrl] === null;
            const tag = isCorsBlocked ? ' ⚠️' : '';
            pill.innerHTML = `<kbd>${keyDigit}</kbd> <span>${item.title}${tag}</span>`;
            pill.addEventListener('click', () => {
                selectBackdrop(index);
            });
            backdropSelectorBar.appendChild(pill);
        });
    }

    function selectBackdrop(index) {
        if (index < 0 || index >= currentBackdropsList.length) return;
        selectedBackdropIndex = index;
        renderBackdropSelectorPills();
        renderCompositeCapture();
        resetCaptureInactivityTimer();

        const item = currentBackdropsList[index];
        if (!item.isSceneBackdrop) {
            const resolvedUrl = normalizeMediaUrl(item.file_path, item.type);
            if (loadedBackdropImages[resolvedUrl] === null) {
                showToast(`⚠️ "${item.title}" host blocks direct export. Cyber portal used!`);
            }
        }
        console.log(`[v5.4] Switched to backdrop #${index} (${item.title})`);
    }

    // --- HTML Sanitization Helper ---
    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- Render Tagged Tap Bands in Capture Modal ---
    function renderTaggedTapBandsUI() {
        if (!captureLinkedBandsList) return;
        captureLinkedBandsList.innerHTML = '';

        if (taggedTapBands.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'tapband-empty-hint';
            emptyEl.innerHTML = `<span class="tapband-pulse-dot"></span><span>Tap your Tap Band to link this photo to your account</span>`;
            captureLinkedBandsList.appendChild(emptyEl);
            if (tapbandHeaderHint) tapbandHeaderHint.textContent = "Tap member band(s) to view in app";
            return;
        }

        taggedTapBands.forEach(band => {
            const chip = document.createElement('div');
            chip.className = 'tapband-chip';
            chip.innerHTML = `
                <span class="chip-name">${escapeHtml(band.displayName)}</span>
                <span class="chip-id">(#${escapeHtml(band.cardId)})</span>
                <button type="button" class="chip-remove" title="Remove" aria-label="Remove member" onclick="window.removeTaggedTapBand('${escapeHtml(band.cardId)}')">&times;</button>
            `;
            captureLinkedBandsList.appendChild(chip);
        });

        const addMore = document.createElement('span');
        addMore.className = 'tapband-add-more-hint';
        addMore.innerHTML = `<span class="tapband-pulse-dot"></span> Tap another band to link together`;
        captureLinkedBandsList.appendChild(addMore);

        if (tapbandHeaderHint) {
            tapbandHeaderHint.textContent = `${taggedTapBands.length} member${taggedTapBands.length > 1 ? 's' : ''} linked`;
        }
    }

    // --- Add Tagged Tap Band (Multi-user Account Linking) ---
    async function addTaggedTapBand(rawCardId) {
        if (!rawCardId) return;
        const cleanCard = String(rawCardId).trim();
        const normalized = normalizeNfcTapCard(cleanCard);
        if (!normalized) return;

        // Check if already tagged
        if (taggedTapBands.some(b => b.cardId === normalized || b.cardId === cleanCard)) {
            playBeep(440, 0.1, 0.7, 'triangle');
            showToast("ℹ️ Tap Band already linked!");
            return;
        }

        // Pleasant positive chime
        playBeep(987, 0.12, 0.85, 'sine');
        setTimeout(() => playBeep(1318, 0.15, 0.9, 'sine'), 100);

        // Immediate responsive chip while resolving member details
        const tempEntry = { cardId: normalized, displayName: 'Member' };
        taggedTapBands.push(tempEntry);
        renderTaggedTapBandsUI();
        showToast("📡 Tap Band detected! Linking account...");

        try {
            // 1. Look up in Neon One CRM
            let member = await fetchNeonOneMember(normalized);
            if (!member && normalized !== cleanCard) {
                member = await fetchNeonOneMember(cleanCard);
            }

            // 2. Fallback to local datasets
            let name = member?.displayName;
            if (!name) {
                const local = developerDatabase[normalized] || photoboothDatabase[normalized] || userDatabase[normalized]
                           || developerDatabase[cleanCard] || photoboothDatabase[cleanCard] || userDatabase[cleanCard];
                if (local?.displayName) name = local.displayName;
                else if (local?.title) name = local.title.replace("'s Portal", '');
            }

            if (!name) name = `Member #${normalized}`;

            tempEntry.displayName = name;
            renderTaggedTapBandsUI();
            showToast(`✅ Linked ${name}!`);
        } catch (err) {
            console.warn("[v6.7] Error resolving member name for Tap Band:", err);
            renderTaggedTapBandsUI();
        }
    }

    // --- Remove Tagged Tap Band ---
    function removeTaggedTapBand(cardId) {
        taggedTapBands = taggedTapBands.filter(b => b.cardId !== cardId);
        playBeep(520, 0.1, 0.6, 'triangle');
        renderTaggedTapBandsUI();
    }
    window.removeTaggedTapBand = removeTaggedTapBand;

    // Close the capture modal and return to portal view
    function closeCaptureModal() {
        isCaptureModalOpen = false;
        isCountingDown = false;
        isUploadingPhoto = false;
        isPhotoUploaded = false;
        clearCaptureInactivityTimer();

        taggedTapBands = [];
        captureNfcBuffer = '';
        if (backdropDebounceTimer) {
            clearTimeout(backdropDebounceTimer);
            backdropDebounceTimer = null;
        }

        if (captureModal) captureModal.classList.remove('active');
        if (captureSpinner) captureSpinner.classList.remove('active');
        if (captureQrOverlay) captureQrOverlay.classList.remove('active');
        if (captureFlash) captureFlash.classList.remove('active');
        if (captureCountdown) {
            captureCountdown.classList.remove('active');
            captureCountdown.classList.remove('anim-pop');
        }

        updatePhotoboothVisibility();
        resumeActiveMedia();
    }

    // Start 5-4-3-2-1 Countdown and Snapshot
    async function startPhotoCountdown() {
        if (isCountingDown || isCaptureModalOpen) return;

        // Pause media immediately where it is
        pauseActiveMedia();

        // If photobooth is not on yet, turn it on first
        if (!isPhotoboothActive) {
            await togglePhotobooth(true);
        }

        isCountingDown = true;
        if (captureCountdown) {
            captureCountdown.classList.add('active');
        }

        function triggerCountdownPop(val) {
            if (!captureCountdown) return;
            captureCountdown.textContent = val;
            captureCountdown.classList.remove('anim-pop');
            void captureCountdown.offsetWidth; // Force reflow to re-trigger pop animation cleanly
            captureCountdown.classList.add('anim-pop');
        }

        let count = 5;
        triggerCountdownPop(count);
        playBeep(880, 0.18, 0.95, 'triangle');

        const timer = setInterval(async () => {
            count--;
            if (count > 0) {
                triggerCountdownPop(count);
                playBeep(880, 0.18, 0.95, 'triangle');
            } else {
                clearInterval(timer);
                if (captureCountdown) {
                    captureCountdown.classList.remove('active');
                    captureCountdown.classList.remove('anim-pop');
                }
                playBeep(1320, 0.4, 1.0, 'triangle'); // loud confirmation tone

                // Camera flash
                captureFlash.classList.add('active');
                setTimeout(() => {
                    captureFlash.classList.remove('active');
                }, 100);

                // Freeze person cutout from photoboothCanvas
                if (photoboothCanvas && photoboothCanvas.width > 0) {
                    capturedPersonCanvas.width = photoboothCanvas.width;
                    capturedPersonCanvas.height = photoboothCanvas.height;
                    const pCtx = capturedPersonCanvas.getContext('2d');
                    pCtx.clearRect(0, 0, capturedPersonCanvas.width, capturedPersonCanvas.height);
                    pCtx.drawImage(photoboothCanvas, 0, 0);
                }

                // Check and build available backdrops: Option 0 (Your Backdrop) if available
                activeSceneBackdrop = getActiveSceneBackdrop();
                if (activeSceneBackdrop) {
                    currentBackdropsList = [activeSceneBackdrop, ...photoboothBackdrops];
                } else {
                    currentBackdropsList = [...photoboothBackdrops];
                }
                selectedBackdropIndex = 0; // Automatically select Option 0 (or first available backdrop)

                isCountingDown = false;
                isCaptureModalOpen = true;
                isPhotoUploaded = false;

                // Open Capture Modal
                captureModal.classList.add('active');
                captureQrOverlay.classList.remove('active');
                captureSpinner.classList.remove('active');

                // Render backdrops and composite
                renderBackdropSelectorPills();
                await renderCompositeCapture();

                // Initialize Tap Band list with currently active media user (if applicable)
                taggedTapBands = [];
                if (currentPlayingMedia && currentPlayingMedia.id && !currentPlayingMedia.isSceneBackdrop) {
                    const primaryCard = normalizeNfcTapCard(currentPlayingMedia.id);
                    const primaryName = currentPlayingMedia.displayName || currentPlayingMedia.title?.replace("'s Portal", '') || `Member #${primaryCard}`;
                    taggedTapBands.push({ cardId: primaryCard, displayName: primaryName });
                }
                renderTaggedTapBandsUI();

                // Start 90-second inactivity timeout
                startCaptureInactivityTimer();

                console.log(`[v5.5] Photo captured. Backdrop selection ready (${currentBackdropsList.length} options).`);
            }
        }, 1000);
    }

    // Upload composite photo to Google Drive via Google Apps Script Web App
    async function uploadCaptureToGoogleDrive() {
        if (isUploadingPhoto || isPhotoUploaded) return;

        if (!captureCanvas) return;
        isUploadingPhoto = true;

        if (captureSpinner) {
            captureSpinner.classList.add('active');
        }

        let imageData = null;

        try {
            // 1. Get Base64 JPEG data from canvas
            try {
                imageData = captureCanvas.toDataURL('image/jpeg', 0.92);
            } catch (canvasErr) {
                console.error("[v5.3] Primary canvas toDataURL failed:", canvasErr);
                // Emergency clean canvas export: composite person cutout over gradient (1080x1620 portrait)
                try {
                    const cleanCanvas = document.createElement('canvas');
                    cleanCanvas.width = 1080;
                    cleanCanvas.height = 1620;
                    const cCtx = cleanCanvas.getContext('2d');
                    const grad = cCtx.createLinearGradient(0, 0, 1080, 1620);
                    grad.addColorStop(0, '#020617');
                    grad.addColorStop(0.5, '#0f172a');
                    grad.addColorStop(1, '#ff6b00');
                    cCtx.fillStyle = grad;
                    cCtx.fillRect(0, 0, 1080, 1620);
                    if (capturedPersonCanvas && capturedPersonCanvas.width > 0) {
                        const ratio = (cameraFitMode === 'cover')
                            ? Math.max(1080 / capturedPersonCanvas.width, 1620 / capturedPersonCanvas.height)
                            : Math.min(1080 / capturedPersonCanvas.width, 1620 / capturedPersonCanvas.height);
                        const drawW = capturedPersonCanvas.width * ratio;
                        const drawH = capturedPersonCanvas.height * ratio;
                        cCtx.drawImage(
                            capturedPersonCanvas,
                            (1080 - drawW) / 2,
                            1620 - drawH,
                            drawW,
                            drawH
                        );
                    }
                    imageData = cleanCanvas.toDataURL('image/jpeg', 0.92);
                    console.log("[v5.3] Emergency clean portrait canvas export generated successfully.");
                } catch (fallbackErr) {
                    console.error("[v5.3] Emergency canvas export failed:", fallbackErr);
                }
            }

            if (!imageData) {
                throw new Error("Failed to export image from canvas");
            }

            // 2. Check if Google Apps Script URL is configured
            if (!driveScriptUrl) {
                console.warn("[v5.2] No Google Apps Script URL configured in Developer Mode.");
                showToast("⚠️ Add Drive Script URL in Dev Mode");
                
                // Fallback: download locally on the device
                const link = document.createElement('a');
                link.download = `Portal_Photo_${Date.now()}.jpg`;
                link.href = imageData;
                link.click();

                // Show local download message on the QR overlay
                showLocalDownloadFallback(imageData);
                isUploadingPhoto = false;
                isPhotoUploaded = true;
                return;
            }

            console.log("[v5.3] Uploading photo to Google Drive via Apps Script...");

            // 3. POST image data to Google Apps Script Web App
            const response = await fetch(driveScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }, // Avoid CORS preflight on Apps Script
                body: JSON.stringify({
                    image: imageData,
                    timestamp: new Date().toISOString()
                })
            });

            const result = await response.json();
            console.log("[v5.3] Google Drive upload result:", result);

            if (result && (result.url || result.viewUrl)) {
                const targetUrl = result.url || result.viewUrl;
                const fileId = result.fileId || '';

                // Collect target card IDs from tagged Tap Bands (or fallback to active media / search input)
                let targetCardIds = taggedTapBands.map(b => b.cardId);
                if (targetCardIds.length === 0) {
                    const fallbackId = currentPlayingMedia?.id || contentIdInput.value.trim() || '';
                    if (fallbackId) targetCardIds.push(normalizeNfcTapCard(fallbackId));
                }
                if (targetCardIds.length === 0) {
                    targetCardIds.push('');
                }

                console.log(`[v6.7] Syncing capture photo to ${targetCardIds.length} linked member(s):`, targetCardIds);

                // Sync photo to Social Medium App backend proxy for EACH tagged Tap Band
                targetCardIds.forEach(cardId => {
                    try {
                        fetch(`${NEON_PROXY_URL}/api/portal-photos`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cardId: cardId,
                                url: targetUrl,
                                fileId: fileId,
                                timestamp: new Date().toISOString()
                            })
                        }).catch(err => console.warn(`[v6.7] Photo sync warning for card "${cardId}":`, err));
                    } catch (e) {}
                });

                showQrCodeForPhoto(targetUrl, targetCardIds);
                isPhotoUploaded = true;
                const memberCount = targetCardIds.filter(Boolean).length;
                showToast(`🚀 Saved for ${memberCount > 0 ? memberCount : 1} member(s)! Scan QR to open in app`);
            } else {
                throw new Error(result.message || "Upload did not return URL");
            }
        } catch (err) {
            console.error("[v5.3] Google Drive upload error:", err);
            showToast("⚠️ Drive Upload Error (Downloading locally)");

            // Fallback download using already-extracted imageData
            if (imageData) {
                const link = document.createElement('a');
                link.download = `Portal_Photo_${Date.now()}.jpg`;
                link.href = imageData;
                link.click();
                showLocalDownloadFallback(imageData);
            }
            isPhotoUploaded = true;
        } finally {
            if (captureSpinner) {
                captureSpinner.classList.remove('active');
            }
            isUploadingPhoto = false;
        }
    }

    // Display the QR Code pointing to the Social Medium App Portal Media module
    function showQrCodeForPhoto(fileUrl, cardIds) {
        if (!captureQrOverlay || !captureQrImg) return;

        const idsArray = Array.isArray(cardIds) ? cardIds : (cardIds ? [cardIds] : []);
        const primaryCardId = idsArray[0] || '';

        // Construct App URL pointing to the Portal Media module with card and photo
        const appParams = new URLSearchParams();
        if (primaryCardId) appParams.set('card', primaryCardId);
        if (fileUrl) appParams.set('newPhoto', fileUrl);

        const appUrl = `${COMPANION_APP_PORTAL_URL}?${appParams.toString()}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(appUrl)}`;

        captureQrImg.src = qrUrl;
        if (captureDirectLink) {
            captureDirectLink.href = appUrl;
            captureDirectLink.textContent = "Open in Social Medium App";
        }

        const qrHeading = captureQrOverlay.querySelector('.qr-heading');
        if (qrHeading) {
            if (taggedTapBands.length > 1) {
                qrHeading.textContent = `SAVED TO ${taggedTapBands.length} MEMBERS' ACCOUNTS!`;
            } else if (taggedTapBands.length === 1) {
                qrHeading.textContent = `SAVED TO ${taggedTapBands[0].displayName.toUpperCase()}'S ACCOUNT!`;
            } else {
                qrHeading.textContent = "YOUR PHOTO IS IN THE APP!";
            }
        }
        const qrSubtext = captureQrOverlay.querySelector('.qr-subtext');
        if (qrSubtext) {
            if (taggedTapBands.length > 1) {
                const names = taggedTapBands.map(b => b.displayName).join(' & ');
                qrSubtext.textContent = `Linked to ${names}. Either member can scan with their phone to view and download!`;
            } else {
                qrSubtext.textContent = "Scan with your phone to view & download in the app";
            }
        }

        captureQrOverlay.classList.add('active');
    }

    // Fallback if Drive Script is not configured yet
    function showLocalDownloadFallback(imageData) {
        if (!captureQrOverlay) return;
        const targetCardId = currentPlayingMedia?.id || contentIdInput.value.trim() || '';
        const appUrl = targetCardId
            ? `${COMPANION_APP_PORTAL_URL}?card=${encodeURIComponent(targetCardId)}`
            : COMPANION_APP_PORTAL_URL;

        if (captureDirectLink) {
            captureDirectLink.href = appUrl;
            captureDirectLink.textContent = "Open in Social Medium App";
        }
        const helpQr = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(appUrl)}`;
        if (captureQrImg) captureQrImg.src = helpQr;
        captureQrOverlay.classList.add('active');
    }

    // --- Trigger media fetch helper ---
    function triggerContentSearch() {
        const idToTrigger = contentIdInput.value.trim();
        if (idToTrigger) {
            const normalizedId = normalizeNfcTapCard(idToTrigger);
            contentIdInput.value = normalizedId;
            fetchMedia(normalizedId);
        } else {
            openPhotoboothPickerModal();
        }
    }

    // --- Manual input button listener & Enter key listener on contentIdInput ---
    fetchMediaBtn.addEventListener('click', triggerContentSearch);
    contentIdInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            triggerContentSearch();
        }
    });

    const fullscreenToggleBtn = document.getElementById('fullscreenToggleBtn');
    const refreshDataBtn = document.getElementById('refreshDataBtn');
    const hotkeyFullscreen = document.getElementById('hotkeyFullscreen');
    const hotkeyReload = document.getElementById('hotkeyReload');
    const hotkeyKeypadFullscreen = document.getElementById('hotkeyKeypadFullscreen');

    if (fullscreenToggleBtn) {
        fullscreenToggleBtn.addEventListener('click', () => {
            toggleFullscreen();
        });
    }

    if (hotkeyFullscreen) {
        hotkeyFullscreen.addEventListener('click', () => {
            toggleFullscreen();
        });
    }

    if (hotkeyKeypadFullscreen) {
        hotkeyKeypadFullscreen.addEventListener('click', () => {
            toggleFullscreen();
        });
    }

    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', () => {
            reloadData();
        });
    }

    if (hotkeyReload) {
        hotkeyReload.addEventListener('click', () => {
            reloadData();
        });
    }

    if (soundToggleBtn) {
        soundToggleBtn.addEventListener('click', () => {
            toggleSound();
        });
    }

    if (photoboothToggleBtn) {
        photoboothToggleBtn.addEventListener('click', () => {
            togglePhotobooth();
        });
    }

    // --- Data reload function ---
    async function reloadData() {
        showToast('🔄 Refreshing Portal Data...');
        mediaTitle.textContent = "Refreshing Data...";
        mediaTitle.classList.add('visible');
        try {
            const ok = await loadMediaDatabase();
            mediaTitle.textContent = ok ? "Data Refreshed! 🔄" : "Refresh Failed!";
            showToast(ok ? '✅ Portal Data Refreshed' : '⚠️ Refresh Failed');
        } catch (e) {
            mediaTitle.textContent = "Refresh Failed!";
            showToast('⚠️ Refresh Failed');
        }
        setTimeout(() => {
            mediaTitle.classList.remove('visible');
        }, 1500);
    }

    // --- Global Keypad & Keyboard Listener (Pure Keypad / NFC Navigation) ---
    document.addEventListener('keydown', (event) => {
        // --- 0. DELETE CONFIRMATION MODAL NAVIGATION ---
        if (isDeleteConfirmOpen) {
            resetDeleteInactivityTimer();

            // Enter confirms deletion
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmDeleteCurrentMedia();
                return;
            }

            // Backspace, /, or Esc cancels deletion and resumes media
            if (event.key === 'Backspace' || event.key === '/' || event.code === 'NumpadDivide' || event.code === 'Slash' || event.key === 'Escape') {
                event.preventDefault();
                closeDeleteConfirmModal();
                return;
            }

            // ( or FN+Esc toggles Fullscreen
            if (event.key === '(' || event.key === 'LaunchCalculator' || event.code === 'LaunchApp2') {
                event.preventDefault();
                toggleFullscreen();
                return;
            }

            return; // Ignore other keys while delete modal is open
        }

        // --- 1. CAPTURE MODAL ACTIVE NAVIGATION ---
        if (isCaptureModalOpen) {
            resetCaptureInactivityTimer();

            const now = Date.now();
            const timeSinceLastKey = now - lastCaptureKeyTime;
            lastCaptureKeyTime = now;

            // If more than 250ms elapsed between keys, reset NFC burst buffer
            if (timeSinceLastKey > 250) {
                captureNfcBuffer = '';
            }

            // Backspace or Esc closes the modal and resumes media (Home / Cancel key)
            if (event.key === 'Backspace' || event.key === '/' || event.code === 'NumpadDivide' || event.code === 'Slash' || event.key === 'Escape') {
                event.preventDefault();
                if (backdropDebounceTimer) {
                    clearTimeout(backdropDebounceTimer);
                    backdropDebounceTimer = null;
                }
                closeCaptureModal();
                return;
            }

            // ( or FN+Esc toggles Fullscreen
            if (event.key === '(' || event.key === 'LaunchCalculator' || event.code === 'LaunchApp2') {
                event.preventDefault();
                toggleFullscreen();
                return;
            }

            // Enter key: check if this is an NFC scan burst or a human Enter keypress
            if (event.key === 'Enter') {
                event.preventDefault();
                if (backdropDebounceTimer) {
                    clearTimeout(backdropDebounceTimer);
                    backdropDebounceTimer = null;
                }

                if (captureNfcBuffer.length >= 4 && timeSinceLastKey < 250) {
                    // NFC RFID scan burst completed!
                    const scannedCard = captureNfcBuffer.trim();
                    captureNfcBuffer = '';
                    console.log(`[v6.7] NFC Tap Band scanned in capture modal: "${scannedCard}"`);
                    addTaggedTapBand(scannedCard);
                    return;
                }

                // Deliberate human Enter press to confirm and save to Google Drive & App
                captureNfcBuffer = '';
                uploadCaptureToGoogleDrive();
                return;
            }

            // Buffer hex/alphanumeric characters for RFID/NFC Tap Band reader
            if (/^[0-9a-fA-F:\-\s]$/i.test(event.key)) {
                captureNfcBuffer += event.key;
            }

            // Backdrop switching (Keys 0-9):
            // Debounce by 85ms so that if this is an NFC scan starting with 0-9,
            // the subsequent character will arrive in < 40ms and cancel the switch!
            if (event.key >= '0' && event.key <= '9') {
                event.preventDefault();
                const keyVal = event.key;

                if (backdropDebounceTimer) {
                    clearTimeout(backdropDebounceTimer);
                }

                backdropDebounceTimer = setTimeout(() => {
                    backdropDebounceTimer = null;
                    // If buffer accumulated more characters, this was an NFC scan, so do NOT switch backdrop
                    if (captureNfcBuffer.length > 2) return;

                    if (keyVal === '0') {
                        if (activeSceneBackdrop) {
                            selectBackdrop(0);
                        }
                    } else {
                        const num = parseInt(keyVal, 10);
                        const targetIdx = activeSceneBackdrop ? num : (num - 1);
                        if (targetIdx < currentBackdropsList.length) {
                            selectBackdrop(targetIdx);
                        }
                    }
                }, 85);

                return;
            }

            return; // Ignore other keys while in capture modal
        }

        // --- 2. PHOTOBOOTH GALLERY MODAL ACTIVE NAVIGATION ---
        if (isPhotoboothGalleryOpen) {
            resetGalleryInactivityTimer();

            // Backspace, Enter, or Esc closes the gallery modal (Home / Cancel key)
            if (event.key === 'Backspace' || event.key === '/' || event.code === 'NumpadDivide' || event.code === 'Slash' || event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                closePhotoboothGalleryModal();
                return;
            }

            // ( or FN+Esc toggles Fullscreen
            if (event.key === '(' || event.key === 'LaunchCalculator' || event.code === 'LaunchApp2') {
                event.preventDefault();
                toggleFullscreen();
                return;
            }

            // Route number keys 0-9 to backdrop selection directly
            if (event.key >= '0' && event.key <= '9') {
                event.preventDefault();
                const matchedItem = photoboothBackdrops.find((b, idx) => 
                    String(b.id) === event.key || String(idx + 1) === event.key
                );
                if (matchedItem) {
                    selectPhotoboothGalleryItem(matchedItem);
                }
                return;
            }

            return; // Ignore other hotkeys while in gallery modal
        }

        // --- 3. GLOBAL PORTAL NAVIGATION ---

        // Hotkey: ( or FN+Esc (LaunchCalculator / LaunchApp2 / F11) toggles Fullscreen
        if (event.key === '(' || event.key === 'LaunchCalculator' || event.code === 'LaunchApp2' || event.key === 'F11') {
            event.preventDefault();
            toggleFullscreen();
            return;
        }

        // Hotkey: ) or F5 reloads Google Sheet / local database
        if (event.key === ')' || event.code === 'F5' || event.key === 'BrowserRefresh') {
            event.preventDefault();
            reloadData();
            return;
        }

        // Hotkey: Escape closes Dev Mode if open
        if (event.key === 'Escape') {
            if (controlsDiv.classList.contains('visible')) {
                event.preventDefault();
                controlsDiv.classList.remove('visible');
                return;
            }
        }

        // Hotkey: + (plus / add) starts Photobooth Photo Countdown & Capture
        if (event.key === '+' || event.code === 'NumpadAdd') {
            event.preventDefault();
            startPhotoCountdown();
            return;
        }

        // Hotkey: - (minus / subtract) brings up the QR code to change/set Portal Media on the companion app
        if (event.key === '-' || event.code === 'NumpadSubtract' || event.code === 'Minus') {
            event.preventDefault();
            const targetCardId = currentPlayingMedia?.id || contentIdInput.value.trim();
            if (targetCardId) {
                console.log(`[Hotkey -] Opening QR code to change media for card: ${targetCardId}`);
                renderRegistrationScreen(targetCardId);
                isAtHomeScreen = false;
            } else {
                mediaTitle.textContent = "Scan a Tap Card first to edit its media";
                mediaTitle.classList.add('visible');
                setTimeout(() => mediaTitle.classList.remove('visible'), 2500);
            }
            return;
        }

        // Hotkey: * (asterisk / multiply) toggles Photobooth Mode ON/OFF
        if (event.key === '*' || event.code === 'NumpadMultiply') {
            event.preventDefault();
            togglePhotobooth();
            return;
        }

        // Hotkey: . (dot / decimal point) toggles Sound ON/OFF
        if (event.key === '.' || event.code === 'NumpadDecimal') {
            event.preventDefault();
            toggleSound();
            return;
        }

        // Hotkey: Tab toggles Developer Mode
        if (event.key === 'Tab') {
            event.preventDefault();
            controlsDiv.classList.toggle('visible');
            if (controlsDiv.classList.contains('visible')) {
                console.log("[v5.1] Developer Mode opened.");
                renderDatasetPreview();
            } else {
                console.log("[v5.1] Developer Mode closed.");
            }
            return;
        }

        // Hotkey: / toggles Member Achievements / Certifications Screen
        if (event.key === '/' || event.code === 'NumpadDivide' || event.code === 'Slash') {
            event.preventDefault();

            // If already viewing certifications, toggle back to playing media (if available)
            if (isShowingCertifications) {
                isShowingCertifications = false;
                if (currentPlayingMedia && currentPlayingMedia.file_path) {
                    renderAndDisplayMedia(currentPlayingMedia, currentPlayingMedia.id);
                } else {
                    returnToHomeScreen();
                }
                return;
            }

            const targetCardId = currentPlayingMedia?.id || contentIdInput.value.trim();

            if (targetCardId) {
                if (currentPlayingMedia && currentPlayingMedia.id === targetCardId && currentPlayingMedia.certifications) {
                    renderCertificationsScreen(currentPlayingMedia);
                } else {
                    mediaDisplay.innerHTML = `
                        <div class="certifications-container">
                            <span class="cert-badge">NEON ONE LOOKUP</span>
                            <h2 class="cert-title">Loading Certifications...</h2>
                            <div class="reg-id-box">Card #${targetCardId}</div>
                            <div class="capture-spinner" style="margin: 20px auto;"></div>
                        </div>
                    `;
                    fetchNeonOneMember(targetCardId).then(member => {
                        if (member) {
                            renderCertificationsScreen(member);
                        } else {
                            renderCertificationsScreen({
                                id: targetCardId,
                                displayName: 'Member',
                                certifications: [],
                                membershipStatus: 'Unregistered Key'
                            });
                        }
                    });
                }
            } else {
                mediaTitle.textContent = "Scan a Tap Card to view certifications";
                mediaTitle.classList.add('visible');
                setTimeout(() => mediaTitle.classList.remove('visible'), 2500);
            }
            return;
        }

        // Hotkey: Backspace is the Home button (returns to Home Screen with closed doors & clears input)
        if (event.key === 'Backspace') {
            if (document.activeElement !== scriptUrlInput) {
                event.preventDefault();
                contentIdInput.value = '';
                contentIdInput.blur();
                isShowingCertifications = false;
                returnToHomeScreen();
                return;
            }
        }

        // Hotkey: Enter triggers Media Fetch / Lookup for scanned NFC card or typed ID
        if (event.key === 'Enter') {
            event.preventDefault();
            triggerContentSearch();
            return;
        }

        // Hex / Alphanumeric / Digits (0-9, a-f, A-F): Automatically route keystrokes into search bar
        if (/^[0-9a-fA-F]$/i.test(event.key)) {
            if (document.activeElement !== contentIdInput && document.activeElement !== scriptUrlInput) {
                event.preventDefault();
                contentIdInput.value += event.key;
            }
            return;
        }

        // Prevent other non-hex special characters if contentIdInput is focused (except control keys)
        if (document.activeElement === contentIdInput && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
            if (!/^[0-9a-fA-F:\-\s]$/i.test(event.key)) {
                event.preventDefault();
            }
        }
    });

    // Reset inactivity timer on screen touches or clicks inside modals
    if (captureModal) {
        captureModal.addEventListener('pointerdown', resetCaptureInactivityTimer);
    }
    if (photoboothGalleryModal) {
        photoboothGalleryModal.addEventListener('pointerdown', resetGalleryInactivityTimer);
    }
    if (deleteModal) {
        deleteModal.addEventListener('pointerdown', resetDeleteInactivityTimer);
    }

    // Initial startup
    console.log("Portal Door v6.1 initialized.");
    mediaTitle.classList.remove('visible');
    controlsDiv.classList.remove('visible');
    updateSoundUI();
    showHomeScreen();
    loadMediaDatabase();

    // Warm up MediaPipe in background after short delay so first webcam toggle doesn't lag
    setTimeout(() => {
        initSelfieSegmentation();
    }, 1200);
});
