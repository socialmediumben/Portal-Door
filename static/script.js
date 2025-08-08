// media_viewer/static/script.js

document.addEventListener('DOMContentLoaded', () => {
    const controlsDiv = document.querySelector('.controls');
    const contentIdInput = document.getElementById('contentIdInput');
    const fetchMediaBtn = document.getElementById('fetchMediaBtn');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaDisplay = document.getElementById('mediaDisplay');
    const transitionVideo = document.getElementById('transitionVideo');

    // Store fetched transition video paths as they are now static on the thumb drive.
    let doorCloseVideoUrl = "/static/videos/Door Close.webm";
    let doorOpenVideoUrl = "/static/videos/Door Open.webm";

    // --- Function to play transition video ---
    async function playTransition(videoPath) {
        return new Promise(resolve => {
            if (!videoPath) {
                console.warn("Transition video path is missing. Skipping transition.");
                resolve();
                return;
            }
            transitionVideo.src = videoPath;
            transitionVideo.currentTime = 0;
            transitionVideo.classList.add('active');
            
            transitionVideo.onended = () => {
                transitionVideo.onended = null;
                resolve();
            };

            transitionVideo.play().catch(error => {
                console.warn(`Transition video autoplay blocked for ${videoPath}:`, error);
                transitionVideo.classList.remove('active');
                transitionVideo.onended = null;
                resolve();
            });
        });
    }

    // --- Function to fetch and display media ---
    async function fetchMedia(contentId) {
        contentIdInput.value = '';
        mediaTitle.classList.remove('visible');

        if (doorCloseVideoUrl) {
            await playTransition(doorCloseVideoUrl);
        } else {
            console.warn("Door Close video URL not available. Skipping closing transition.");
        }

        mediaDisplay.innerHTML = '';
        mediaTitle.textContent = `Loading media for ID: ${contentId}...`;
        mediaTitle.classList.add('visible');

        try {
            const response = await fetch(`/media/${contentId}`);
            const data = await response.json();

            if (response.ok) {
                // The filePath is now always a local path, so simplify this logic.
                const filePath = `/static/${data.file_path}`;

                const mediaLoadedPromise = new Promise((resolve, reject) => {
                    if (data.type === 'image') {
                        const img = document.createElement('img');
                        img.src = filePath;
                        img.alt = data.title;
                        img.onload = () => {
                            mediaDisplay.appendChild(img);
                            resolve();
                        };
                        img.onerror = () => {
                            reject(new Error(`Error loading image: ${data.title}`));
                        };
                        mediaDisplay.appendChild(img);
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
                            console.log("Video autoplayed successfully.");
                            resolve();
                        }).catch(error => {
                            console.warn("Autoplay was prevented:", error);
                            video.controls = true;
                            mediaTitle.textContent = `${data.title} (Autoplay blocked, click to play)`;
                            mediaTitle.classList.add('visible');
                            video.addEventListener('click', function _listener() {
                                video.play().then(() => {
                                    mediaTitle.classList.remove('visible');
                                    video.removeEventListener('click', _listener);
                                }).catch(err => {
                                    console.error("Manual play also failed:", err);
                                });
                            });
                            resolve();
                        });

                        video.onerror = () => {
                            reject(new Error(`Error loading video: ${data.title}`));
                        };
                        mediaDisplay.appendChild(video);
                    } else {
                        reject(new Error('Unknown media type.'));
                    }
                });

                await mediaLoadedPromise;
                mediaTitle.classList.remove('visible');

            } else {
                mediaTitle.textContent = data.error || `Error fetching media for ID: ${contentId}.`;
                mediaTitle.classList.add('visible');
                mediaDisplay.innerHTML = '';
            }
        } catch (error) {
            console.error('Network error or problem fetching media:', error);
            mediaTitle.textContent = 'Failed to load media (network error or invalid ID).';
            mediaTitle.classList.add('visible');
            mediaDisplay.innerHTML = '';
        }

        if (mediaDisplay.querySelector('img, video') && doorOpenVideoUrl) {
             await playTransition(doorOpenVideoUrl);
             transitionVideo.classList.remove('active');
             transitionVideo.pause();
             transitionVideo.currentTime = 0;
        } else {
            console.warn("Door Open transition skipped due to no media loaded or URL missing.");
            transitionVideo.classList.remove('active');
            transitionVideo.pause();
            transitionVideo.currentTime = 0;
        }
    }

    // Event listener for the manual input button
    fetchMediaBtn.addEventListener('click', () => {
        const contentId = contentIdInput.value.trim();
        if (contentId) {
            fetchMedia(contentId);
        } else {
            // Replaced alert with a message box on the UI
            mediaTitle.textContent = 'Please enter a Content ID.';
            mediaTitle.classList.add('visible');
        }
    });

    // Event listener for Enter key in the manual input (for keyboard-like scanners)
    contentIdInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const contentId = contentIdInput.value.trim();
            if (contentId) {
                fetchMedia(contentId);
            } else {
                // Replaced alert with a message box on the UI
                mediaTitle.textContent = 'Please enter a Content ID.';
                mediaTitle.classList.add('visible');
            }
        }
    });

    // Function to trigger data refresh on the server
    async function refreshServerData() {
        try {
            console.log("Sending refresh request to server...");
            const response = await fetch('/refresh_data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (response.ok) {
                console.log("Server refresh response:", data.message);
                mediaTitle.textContent = "Data Refreshed!";
                mediaTitle.classList.add('visible');
                setTimeout(() => {
                    mediaTitle.classList.remove('visible');
                }, 1500);
            } else {
                console.error("Server refresh failed:", data.message);
                mediaTitle.textContent = `Refresh Error: ${data.message}`;
                mediaTitle.classList.add('visible');
            }
        } catch (error) {
            console.error("Network error during server refresh:", error);
            mediaTitle.textContent = "Network Error: Could not refresh data.";
            mediaTitle.classList.add('visible');
        }
    }

    // Global keydown listener
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            controlsDiv.classList.toggle('visible');
            if (controlsDiv.classList.contains('visible')) {
                contentIdInput.focus();
            }
        } else if (event.key === '(') { // Hotkey for Full Screen
            event.preventDefault();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn(`Error attempting to enable full-screen mode: ${err.message} (Perhaps not allowed by browser security policy?)`);
                });
            } else {
                document.exitFullscreen();
            }
        } else if (event.key === ')') { // Hotkey for Data Refresh
            event.preventDefault();
            refreshServerData();
        }
    });

    // Initial state: Hide title on page load
    mediaTitle.classList.remove('visible');
    // Initial state: Hide controls on page load
    controlsDiv.classList.remove('visible');
});
