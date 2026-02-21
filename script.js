// Global App State
window.MeetApp = {
    meetingId: "",
    isHost: false,
    guestId: "",
    currentUserName: "You"
};

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const landingPage = document.getElementById('landing-page');
    const meetingRoom = document.getElementById('meeting-room');
    const nameEntryPage = document.getElementById('name-entry-page');
    const waitingRoom = document.getElementById('waiting-room');

    const newMeetingBtn = document.getElementById('new-meeting-btn');
    const joinBtn = document.getElementById('join-btn');

    // Room Buttons
    const micBtn = document.getElementById('mic-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const screenShareBtn = document.getElementById('screen-share-btn');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const headerCopyLinkBtn = document.getElementById('header-copy-link');

    // Menu Items
    const menuHandRaise = document.getElementById('menu-hand-raise');
    const menuParticipants = document.getElementById('menu-participants');
    const menuChat = document.getElementById('menu-chat');
    const menuEmojis = document.getElementById('menu-emojis');
    const menuLock = document.getElementById('menu-lock');

    const moreMenu = document.getElementById('more-menu');
    const meetingIdDisplay = document.getElementById('meeting-id-display');
    const closeChatBtn = document.getElementById('close-chat');

    const chatSidebar = document.getElementById('chat-sidebar');
    const chatInput = document.getElementById('chat-input');
    const sendMsgBtn = document.getElementById('send-msg-btn');
    const chatMessages = document.getElementById('chat-messages');

    const localVideo = document.getElementById('local-video');
    const emojiToggle = document.getElementById('emoji-toggle');
    const emojiPanel = document.getElementById('emoji-panel');
    const emojiBtns = document.querySelectorAll('.emoji-btn');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const sidePanes = document.querySelectorAll('.sidebar-pane');

    const videoGrid = document.getElementById('video-grid');
    const participantCount = document.getElementById('participant-count');
    const participantsList = document.getElementById('participants-list');

    const userNameInput = document.getElementById('user-name-input');
    const requestJoinBtn = document.getElementById('request-join-btn');

    const admissionNotification = document.getElementById('admission-notification');
    const admissionMessage = document.getElementById('admission-message');
    const admitBtn = document.getElementById('admit-btn');
    const denyBtn = document.getElementById('deny-btn');
    const meetingCodeInput = document.getElementById('meeting-code');

    // State
    let isMicOn = true;
    let isCameraOn = true;
    let isScreenSharing = false;
    let isHandRaised = false;
    let localStream = null;
    let isHost = false;
    let meetingId = "";
    let guestId = "";
    let currentUserName = "You";
    let participants = [{ name: "You (Host)", id: "self", avatar: "Y" }];
    let isMeetingLocked = false;

    // ============================================================
    // SOCKET.IO - For real-time signaling across devices
    // ============================================================
    if (typeof io === 'undefined') {
        console.error('Socket.io client not loaded!');
        alert('CRITICAL: Socket.io failed to load. Please check your internet or reload.');
        return;
    }

    const socket = io({
        transports: ['websocket'],
        upgrade: false
    });

    socket.on('connect', () => {
        console.log('[Socket] Connected!', socket.id);
        const dot = document.getElementById('socket-status-dot');
        if (dot) {
            dot.classList.remove('disconnected');
            dot.classList.add('connected');
        }
        showToast("Connected to server ✅");

        // CRITICAL: Re-join room on every connection/reconnection
        if (meetingId) {
            console.log(`[Socket] Re-joining room: ${meetingId}`);
            socket.emit('join-room', meetingId);
        }
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Disconnected.');
        const dot = document.getElementById('socket-status-dot');
        if (dot) {
            dot.classList.remove('connected');
            dot.classList.add('disconnected');
        }
    });

    const setupSocket = (id) => {
        console.log(`[Socket] Setting up listeners for room: ${id}`);
        socket.emit('join-room', id);

        // Update Role UI
        const roleHeader = document.getElementById('meeting-id-header');
        if (roleHeader && isHost) {
            roleHeader.title = "You are the Host (👑)";
            roleHeader.innerHTML += " <small style='color:var(--primary)'>(Host 👑)</small>";
        }

        // Listen for JOIN_REQUEST
        socket.off('join-request').on('join-request', (msg) => {
            console.log('[Socket] Incoming join request:', msg);

            if (isHost && msg.guestId !== guestId) {
                console.log('[Host] Showing prompt for guest:', msg.guestName);
                showToast(`Admission request: ${msg.guestName}`);
                showAdmissionPrompt(msg.guestId, msg.guestName, msg.socketId);
            }
        });

        // Listen for ADMISSION_DECISION
        socket.off('admission-decision').on('admission-decision', (msg) => {
            console.log('[Socket] Incoming admission decision:', msg);
            if (msg.admitted) {
                showToast("Admitted! Joining meeting...");
                enterMeetingRoom();
            } else {
                showToast("Host denied admission.");
                setTimeout(() => {
                    window.location.href = window.location.href.split('?')[0];
                }, 2000);
            }
        });

        // Chat & Emojis
        socket.off('chat-message').on('chat-message', (msg) => {
            addMessage(msg.sender, msg.text);
        });

        socket.off('participant-joined').on('participant-joined', (msg) => {
            spawnMockParticipants(0, msg.guestName || 'Guest');
            showToast(`${msg.guestName || 'Guest'} has joined!`);
        });
    };

    // ============================================================
    // ADMISSION PROMPT (shown to host)
    // ============================================================
    const showAdmissionPrompt = (gId, gName, gSocketId) => {
        // Ensure element exists
        const prompt = document.getElementById('admission-notification');
        if (!prompt) {
            console.error('Admission notification element not found!');
            return;
        }

        console.log(`[Host] ACTIVATING prompt for: ${gName}`);
        admissionMessage.innerText = `${gName} wants to join`;
        prompt.classList.add('active');

        admitBtn.onclick = () => handleAdmission(true, gId, gName, gSocketId);
        denyBtn.onclick = () => handleAdmission(false, gId, gName, gSocketId);
    };

    const handleAdmission = (admit, targetGuestId, guestName, targetGuestSocketId) => {
        console.log(`[Host] Decision for ${targetGuestId}: ${admit ? 'ADMIT' : 'DENY'}`);
        admissionNotification.classList.remove('active');

        // Send decision via Socket.io
        socket.emit('admission-decision', {
            meetingId: meetingId,
            guestId: targetGuestId,
            admitted: admit,
            guestSocketId: targetGuestSocketId
        });

        if (admit) {
            spawnMockParticipants(0, guestName || 'Guest');
            showToast(`${guestName || 'Guest'} has joined!`);
        } else {
            showToast("Request denied.");
        }
    };

    // ============================================================
    // CORE NAVIGATION
    // ============================================================
    const init = () => {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlMeetingId = urlParams.get('id');
            const role = urlParams.get('role');

            updateTime();
            setInterval(updateTime, 1000);

            if (urlMeetingId) {
                meetingId = urlMeetingId.toLowerCase().trim();
                updateMeetingIdUI(meetingId);
                window.MeetApp.meetingId = meetingId;

                if (meetingCodeInput) meetingCodeInput.value = meetingId;

                if (role === 'host') {
                    isHost = true;
                    window.MeetApp.isHost = true;
                    startMeeting(true);
                } else if (role === 'guest') {
                    isHost = false;
                    // Generate a unique guestId for this session
                    guestId = 'g_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                    window.MeetApp.guestId = guestId;
                    console.log(`[Guest] My guestId: ${guestId}`);
                    setupSocket(meetingId);
                    showPage(nameEntryPage);
                } else {
                    showPage(landingPage);
                }
            } else {
                showPage(landingPage);
            }
        } catch (err) {
            console.error("Initialization error:", err);
        }
    };

    const showPage = (page) => {
        [landingPage, meetingRoom, nameEntryPage, waitingRoom].forEach(p => p.classList.remove('active'));
        page.classList.add('active');
    };

    const generateMeetingId = () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const seg = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `${seg(3)}-${seg(4)}-${seg(3)}`;
    };

    const updateMeetingIdUI = (id) => {
        const headerId = document.getElementById('meeting-id-header');
        const footerId = document.getElementById('meeting-id-footer');
        if (headerId) headerId.innerText = id;
        if (footerId) footerId.innerText = id;
    };

    const createMeeting = () => {
        meetingId = generateMeetingId();
        window.MeetApp.meetingId = meetingId;

        try {
            const newUrl = `${window.location.href.split('?')[0]}?id=${meetingId}&role=host`;
            window.history.pushState({ path: newUrl }, '', newUrl);
        } catch (e) {
            console.warn("pushState failed:", e);
        }

        updateMeetingIdUI(meetingId);
        isHost = true;
        window.MeetApp.isHost = true;
        startMeeting(true);
    };

    const joinMeetingRequest = () => {
        const code = meetingCodeInput ? meetingCodeInput.value.trim() : '';
        if (!code) { showToast("Please enter a meeting code."); return; }

        // Extract just the ID if a full URL was pasted
        let id = code;
        if (code.includes('?')) {
            try {
                const params = new URLSearchParams(code.split('?')[1]);
                id = params.get('id') || code;
            } catch (e) { id = code; }
        }

        const base = window.location.href.split('?')[0];
        window.location.href = `${base}?id=${id}&role=guest`;
    };

    const startMeeting = async (asHost) => {
        console.log(`[Meeting] Starting room. asHost: ${asHost}, meetingId: ${meetingId}`);
        showPage(meetingRoom);

        // ALWAYS setup socket FIRST so signaling is not blocked by camera/mic permission
        setupSocket(meetingId);

        const nameTag = document.querySelector('.name-tag');
        if (nameTag) {
            nameTag.innerText = asHost ? "You (Host 👑)" : currentUserName;
            if (asHost) nameTag.style.color = "var(--primary)";
        }

        // Start camera in background without blocking signaling
        initCamera();
        updateControlButtons();

        if (asHost) {
            console.log('[Host] Meeting ready. Signaling active.');
        }
    };

    const requestAdmission = () => {
        currentUserName = (userNameInput ? userNameInput.value.trim() : '') || "Guest";
        window.MeetApp.currentUserName = currentUserName;
        showPage(waitingRoom);

        console.log(`[Guest] Requesting admission as "${currentUserName}" (${guestId}) for room ${meetingId}`);

        const sendRequest = () => {
            if (waitingRoom.classList.contains('active')) {
                console.log('[Guest] Emitting join-request retry...');
                socket.emit('join-request', {
                    meetingId: meetingId,
                    guestId: guestId,
                    guestName: currentUserName
                });
            }
        };

        // Emit immediately
        sendRequest();
        showToast("Join request sent! Waiting for host...");

        // RETRY every 5 seconds if still in waiting room
        const retryInterval = setInterval(() => {
            if (!waitingRoom.classList.contains('active')) {
                clearInterval(retryInterval);
            } else {
                sendRequest();
            }
        }, 5000);
    };

    const enterMeetingRoom = () => {
        if (waitingRoom.classList.contains('active')) {
            startMeeting(false);
        }
    };

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    if (newMeetingBtn) newMeetingBtn.addEventListener('click', createMeeting);
    if (joinBtn) joinBtn.addEventListener('click', joinMeetingRequest);
    if (requestJoinBtn) requestJoinBtn.addEventListener('click', requestAdmission);

    // Fallback event listeners for admit/deny (in case onclick isn't set yet)
    if (admitBtn) admitBtn.addEventListener('click', () => {
        if (!admitBtn.onclick) {
            console.warn('[Host] admitBtn clicked but no handler set');
        }
    });
    if (denyBtn) denyBtn.addEventListener('click', () => {
        if (!denyBtn.onclick) {
            console.warn('[Host] denyBtn clicked but no handler set');
        }
    });

    if (moreOptionsBtn) {
        moreOptionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('active');
        });
    }

    document.addEventListener('click', () => {
        if (moreMenu) moreMenu.classList.remove('active');
    });

    if (menuParticipants) {
        menuParticipants.addEventListener('click', () => {
            chatSidebar.classList.add('active');
            const pt = document.getElementById('participants-tab');
            if (pt) pt.click();
        });
    }

    if (menuChat) {
        menuChat.addEventListener('click', () => {
            chatSidebar.classList.add('active');
            const ct = document.getElementById('chat-tab');
            if (ct) ct.click();
        });
    }

    if (menuEmojis) menuEmojis.addEventListener('click', () => emojiPanel.classList.toggle('active'));

    if (menuLock) {
        menuLock.addEventListener('click', () => {
            isMeetingLocked = !isMeetingLocked;
            menuLock.innerHTML = isMeetingLocked
                ? '<i class="fas fa-unlock"></i> Unlock Meeting'
                : '<i class="fas fa-lock"></i> Lock Meeting';
            showToast(isMeetingLocked ? "Meeting locked." : "Meeting unlocked.");
        });
    }

    const shareMeeting = async () => {
        const params = `?id=${meetingId}&role=guest`;
        const shareUrl = `${window.location.href.split('?')[0]}${params}`;

        const fullLinkLabel = document.getElementById('full-meeting-link');
        if (fullLinkLabel) fullLinkLabel.value = shareUrl;

        try {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Meeting link copied!");
        } catch (err) {
            // Fallback: show the URL
            prompt("Copy this link:", shareUrl);
        }
    };

    if (headerCopyLinkBtn) headerCopyLinkBtn.addEventListener('click', shareMeeting);
    if (meetingIdDisplay) meetingIdDisplay.addEventListener('click', shareMeeting);

    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (localStream) localStream.getTracks().forEach(t => t.stop());
            socket.disconnect();
            window.location.href = window.location.href.split('?')[0];
        });
    }

    // ============================================================
    // CAMERA & AUDIO
    // ============================================================
    const initCamera = async () => {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
                localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
                localStream.getVideoTracks().forEach(t => t.enabled = isCameraOn);
            }
        } catch (err) {
            console.warn("Camera/mic not available:", err.message);
        }
    };

    const toggleMic = () => {
        isMicOn = !isMicOn;
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
        updateControlButtons();
    };

    const toggleCamera = () => {
        isCameraOn = !isCameraOn;
        if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = isCameraOn);
        updateControlButtons();
    };

    const updateControlButtons = () => {
        if (micBtn) {
            micBtn.classList.toggle('off', !isMicOn);
            const icon = micBtn.querySelector('i');
            if (icon) icon.className = isMicOn ? 'fas fa-microphone' : 'fas fa-microphone-slash';
        }
        if (cameraBtn) {
            cameraBtn.classList.toggle('off', !isCameraOn);
            const icon = cameraBtn.querySelector('i');
            if (icon) icon.className = isCameraOn ? 'fas fa-video' : 'fas fa-video-slash';
        }
    };

    if (micBtn) micBtn.addEventListener('click', toggleMic);
    if (cameraBtn) cameraBtn.addEventListener('click', toggleCamera);

    // ============================================================
    // SCREEN SHARING
    // ============================================================
    const toggleScreenShare = async () => {
        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                if (localVideo) localVideo.srcObject = screenStream;
                isScreenSharing = true;
                if (screenShareBtn) screenShareBtn.classList.add('active');
                screenStream.getVideoTracks()[0].onended = stopScreenSharing;
            } catch (err) {
                console.error("Screen share error:", err);
            }
        } else {
            stopScreenSharing();
        }
    };

    const stopScreenSharing = () => {
        if (localVideo) localVideo.srcObject = localStream;
        isScreenSharing = false;
        if (screenShareBtn) screenShareBtn.classList.remove('active');
    };

    if (screenShareBtn) screenShareBtn.addEventListener('click', toggleScreenShare);

    // ============================================================
    // HAND RAISE
    // ============================================================
    if (menuHandRaise) {
        menuHandRaise.addEventListener('click', () => {
            isHandRaised = !isHandRaised;
            menuHandRaise.classList.toggle('active', isHandRaised);
            const hi = document.querySelector('.hand-indicator');
            if (hi) hi.classList.toggle('active', isHandRaised);
        });
    }

    // ============================================================
    // SIDEBAR TABS
    // ============================================================
    if (closeChatBtn) closeChatBtn.addEventListener('click', () => chatSidebar.classList.toggle('active'));

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            sidePanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const pane = document.getElementById(btn.dataset.tab);
            if (pane) pane.classList.add('active');
        });
    });

    // ============================================================
    // CHAT & EMOJIS
    // ============================================================
    if (emojiToggle) emojiToggle.addEventListener('click', () => emojiPanel.classList.toggle('active'));

    emojiBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (chatInput) chatInput.value += btn.innerText;
            if (chatInput) chatInput.focus();
            emojiPanel.classList.remove('active');
        });
    });

    const sendMessage = () => {
        const text = chatInput ? chatInput.value.trim() : '';
        if (text) {
            addMessage(currentUserName, text);
            // Broadcast to others via socket
            socket.emit('chat-message', {
                meetingId: meetingId,
                sender: currentUserName,
                text: text
            });
            if (chatInput) chatInput.value = '';
            emojiPanel.classList.remove('active');
        }
    };

    const addMessage = (sender, text) => {
        if (!chatMessages) return;
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        let processedText = text
            .replace(/(💃|🕺)/g, '<span class="animate-dance">$1</span>')
            .replace(/(🎊|🥳)/g, '<span class="animate-pulse">$1</span>');
        msgDiv.innerHTML = `
            <div class="sender">${sender}</div>
            <div class="text">${processedText}</div>
        `;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    window.replyTo = (sender) => {
        if (chatInput) { chatInput.value = `@${sender} `; chatInput.focus(); }
    };

    if (sendMsgBtn) sendMsgBtn.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // ============================================================
    // MOCK PARTICIPANTS
    // ============================================================
    const spawnMockParticipants = (count, specificName = null) => {
        const names = specificName ? [specificName] : ["Alice", "Bob", "Charlie", "Diana"];
        const iterations = specificName ? 1 : count;

        for (let i = 0; i < iterations; i++) {
            const name = names[i % names.length];
            const p = { name, id: `p-${Date.now()}-${i}`, avatar: name[0].toUpperCase() };
            participants.push(p);

            if (videoGrid) {
                const card = document.createElement('div');
                card.className = 'video-card';
                card.innerHTML = `
                    <div class="avatar" style="width:80px;height:80px;font-size:2rem;">${p.avatar}</div>
                    <div class="name-tag">${name}</div>
                `;
                videoGrid.appendChild(card);
            }

            if (participantsList) {
                const item = document.createElement('div');
                item.className = 'participant-item';
                item.innerHTML = `
                    <div class="avatar">${p.avatar}</div>
                    <div class="p-name">${name}</div>
                    <div class="p-controls">
                        <i class="fas fa-microphone"></i>
                        <i class="fas fa-video"></i>
                    </div>
                `;
                participantsList.appendChild(item);
            }
        }
        if (participantCount) participantCount.innerText = participants.length;
    };

    // ============================================================
    // UTILITIES
    // ============================================================
    const showToast = (msg) => {
        const toast = document.createElement('div');
        toast.className = 'copy-feedback';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    };

    const updateTime = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeDisp = document.getElementById('time-display');
        const roomTime = document.getElementById('room-time');
        if (timeDisp) timeDisp.innerText = timeStr;
        if (roomTime) roomTime.innerText = timeStr;
    };

    // IP setter (for phone joining)
    const pcIpInput = document.getElementById('pc-ip-input');
    const setIpBtn = document.getElementById('set-ip-btn');
    if (setIpBtn && pcIpInput) {
        setIpBtn.addEventListener('click', () => {
            const ip = pcIpInput.value.trim();
            if (ip) {
                try { localStorage.setItem('custom_base_url', ip.startsWith('http') ? ip : `http://${ip}`); } catch (e) { }
                showToast("IP saved!");
            }
        });
    }

    // ============================================================
    // START
    // ============================================================
    init();
});
