if (window.blockWebRTC) {
    throw new Error("WebRTC initialization blocked until name is provided.");
}

const path = window.location.pathname;
const roomId = path.split('/')[2];  // 방번호
const myType = path.split('/')[3];  // 회원 or 관리자

const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

// 이름 매핑을 저장하는 전역 객체
window.userNames = {};
window.myUserName = userName;

let mySessionId = '';
let peerConnections = {};  // 각 방의 PeerConnection 관리
let signalingQueues = {};  // 각 PeerConnection Offer/Answer 처리를 위한 큐 관리 객체
let sentIceCandidates = new Set();  // 중복된 ICE 후보 전송 방지용

window.localStream = null;
// member-panel.js 보다 먼저 초기화해서 타이밍 문제 방지
window.members = window.members || [];

// WebSocket 연결
const socketNameParam = userName ? `?name=${encodeURIComponent(userName)}` : '';
const socket = new WebSocket(`wss://${location.host}/ws/${roomId}/${myType}${socketNameParam}`);

socket.onopen = () => {
    console.log('WebSocket 연결 성공');
    setInterval(sendHeartbeat, 15000); // 15초
};

socket.onclose = () => {
    console.log('WebSocket 연결 종료');
};

// WebSocket 연결 유지 (heartbeat)
function sendHeartbeat() {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({event: "heartbeat"}));
    }
}

// 카메라 및 마이크 권한 변경을 감지하여 상태가 바뀌면 페이지를 새로고침하는 함수
async function checkPermissionChanges() {
    try {
        let lastCameraState = (await navigator.permissions.query({name: "camera"})).state;
        let lastMicState = (await navigator.permissions.query({name: "microphone"})).state;

        setInterval(async () => {
            try {
                const cameraState = (await navigator.permissions.query({name: "camera"})).state;
                const micState = (await navigator.permissions.query({name: "microphone"})).state;

                if (cameraState !== lastCameraState || micState !== lastMicState) {
                    location.reload();
                }

                lastCameraState = cameraState;
                lastMicState = micState;
            } catch (e) {}
        }, 1000); // 1초마다 체크
    } catch (e) {
        console.warn("권한 변경 감지 기능이 이 브라우저에서 지원되지 않습니다.");
    }
}

checkPermissionChanges().then(() => {
    console.log("카메라 또는 마이크 권한 변경 감지됨. 페이지 새로고침 완료.");
});

// WebSocket 메시지 수신 시
socket.onmessage = async (event) => {

    try {
        const message = JSON.parse(event.data);

        if (!window.localStream) {

            if(message.event === 'first-join') {

                try {
                    window.localStream = await getMediaStream();
                    console.log('[first-join] 스트림 취득 완료. 트랙:', window.localStream.getTracks().map(t => t.kind + ':' + t.readyState));

                } catch (error) {
                    window.localStream = new MediaStream();
                    console.error("미디어 스트림 설정 실패:", error);
                }

                // 관리자 화면 생성 (managerVideo 엘리먼트가 있으면 방장 화면 띄움)
                if (document.getElementById('managerVideo')) addManagerVideo(window.localStream);

                // 멤버 화면 생성 (멤버일 경우 멤버 패널에도 띄움)
                if (myType === 'member') addMemberVideo(message.sessionId, window.localStream);
            }
        }

        switch (message.event) {
            case 'first-join':
                if (message.userName) window.userNames[message.sessionId] = message.userName;
                await handleJoinMember(message.sessionId);
                break;

            case 'join-member':
                if (message.userName) window.userNames[message.sessionId] = message.userName;
                await createPeerConnection(message.sessionId, message.type, message.event);
                break;

            case 'offer':
                if (message.userName) window.userNames[message.sessionId] = message.userName;
                await handleOffer(message.sessionId, message.sdp, message.type, message.event);
                break;

            case 'answer':
                if (message.userName) window.userNames[message.sessionId] = message.userName;
                await handleAnswer(message.sessionId, message.sdp);
                break;

            case 'ice-candidate':
                await handleIceCandidate(message.sessionId, message.candidate);
                break;

            case 'left-member':
                await removeMemberVideo(message.sessionId);
                break;

            case 'microphone':
                await handleMicrophone(message.sessionId, message.isEnabled);
                break;

            case 'kick':
                await handleKick(message.sessionId);
                break;

            case 'refresh':
                await handleRefresh(message.sessionId);
                break;

            case 'change-name':
                if (message.userName) {
                    window.userNames[message.sessionId] = message.userName;
                    updateVideoLabel(message.sessionId);
                    if (typeof window.updateMemberList === "function") {
                        window.updateMemberList();
                    }
                }
                break;

            case 'chat':
                if (message.userName) window.userNames[message.sessionId] = message.userName;
                if (typeof window.receiveChatMessage === 'function') {
                    window.receiveChatMessage(message.sessionId, message.message);
                }
                break;

            default:
                console.log('알 수 없는 메시지 이벤트:', event);
                break;
        }
    } catch (error) {
        console.error('미디어 장치 접근 오류', error);
    }
};

async function getMediaStream() {
    try {
        // 카메라, 마이크 디바이스 장치 조회
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        const hasAudio = devices.some(device => device.kind === "audioinput");

        // 기본값 설정 : 검은 화면 & 무음 트랙
        let videoStream = new MediaStream([createBlackVideoTrack()]);
        let audioStream = new MediaStream([createSilentAudioTrack()]);

        // 카메라, 마이크 디바이스 권한 확인
        const camPermissions = await checkCamPermissions();
        console.log(`[카메라 권한 상태] ${camPermissions.camera}`);

        const micPermissions = await checkMicPermissions();
        console.log(`[마이크 권한 상태] ${micPermissions.microphone}`);

        // 카메라 권한 확인 및 카메라 가져오기.
        if ("granted" === camPermissions.camera || "prompt" === camPermissions.camera) {
            if (videoDevices.length > 0) {
                videoStream = await navigator.mediaDevices.getUserMedia({
                    video: myType === 'manager'
                        ? {width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {max: 30}}
                        : {width: {ideal: 1040}, height: {ideal: 600}, frameRate: {max: 15}}
                    //: {width: {ideal: 160}, height: {ideal: 120}, frameRate: {max: 10}}
                });
            } else {
                console.warn("사용 가능한 카메라가 없습니다. 빈 화면을 반환합니다.");
            }
        } else {
            alert("카메라 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.");
        }

        // 마이크 권한 확인 및 마이크 가져오기.
        if ("granted" === micPermissions.microphone || "prompt" === micPermissions.microphone) {
            if (hasAudio) {
                audioStream = await navigator.mediaDevices.getUserMedia({audio: true});
                // 오디오 트랙 비활성화 (음소거)
                audioStream.getAudioTracks().forEach(track => {
                    if (myType === 'manager') {
                        track.enabled = true;
                    } else {
                        track.enabled = false;
                    }
                });
            } else {
                console.warn("사용 가능한 마이크가 없습니다. 무음 트랙을 반환합니다.");
            }
        } else {
            alert("마이크 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.");
        }

        // 비디오 + 오디오 트랙을 하나의 스트림으로 합치기
        const combinedStream = new MediaStream();
        videoStream.getTracks().forEach(track => combinedStream.addTrack(track));
        audioStream.getTracks().forEach(track => combinedStream.addTrack(track));

        // virtual-background는 사용자가 직접 배경을 선택할 때만 활성화.
        // 초기 스트림은 항상 원본 카메라 스트림을 그대로 반환.
        return combinedStream;

    } catch (error) {
        console.error("미디어 스트림 가져오기 실패:", error);
        return new MediaStream([createBlackVideoTrack(), createSilentAudioTrack()]);
    }
}

// 카메라 허용 여부 판단 ("granted" = 허용됨, "denied" = 차단됨, "prompt" = 요청 전)
async function checkCamPermissions() {
    try {
        const camPermission = await navigator.permissions.query({name: "camera"});
        return {
            camera: camPermission.state
        };
    } catch (e) {
        return { camera: "prompt" }; // 지원하지 않는 브라우저 대응
    }
}

// 마이크 허용 여부 판단 ("granted" = 허용됨, "denied" = 차단됨, "prompt" = 요청 전)
async function checkMicPermissions() {
    try {
        const micPermission = await navigator.permissions.query({name: "microphone"});
        return {
            microphone: micPermission.state,
        };
    } catch (e) {
        return { microphone: "prompt" }; // 지원하지 않는 브라우저 대응
    }
}

// 검은 화면을 위한 비디오 트랙 생성
function createBlackVideoTrack() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.captureStream().getVideoTracks()[0];
}

// 무음 오디오 트랙 생성
function createSilentAudioTrack() {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const gainNode = audioContext.createGain();

    gainNode.gain.value = 0; // 볼륨을 0으로 설정해서 무음으로 만듦
    gainNode.connect(destination);

    const source = audioContext.createBufferSource(); // 빈 오디오 버퍼 소스 생성
    source.connect(gainNode);
    source.start();

    return destination.stream.getAudioTracks()[0];
}

// 관리자 화면 생성 - 카메라 스트림을 managerVideo에 직접 연결
function addManagerVideo(localStream) {
    const managerVideo = document.getElementById('managerVideo');
    if (!managerVideo) { console.error('[addManagerVideo] managerVideo 엘리먼트를 찾을 수 없습니다.'); return; }
    managerVideo.srcObject = localStream;
    // 자동재생 정책 대응: muted + play() 강제 호출
    managerVideo.muted = true;
    managerVideo.play().catch(e => console.warn('[addManagerVideo] play() 실패:', e));
    console.log('[addManagerVideo] srcObject 연결 완료. 트랙:', localStream.getTracks().map(t => t.kind + ':' + t.readyState + ':enabled=' + t.enabled));
    
    // 로컬 유저도 썸네일에 추가 및 기본 선택
    if (mySessionId) {
        addMemberVideo(mySessionId, localStream);
        selectMainVideo(mySessionId, localStream);
    } else {
        // mySessionId가 아직 없다면 생성될 때 추가됨
        setTimeout(() => {
            if (mySessionId) {
                addMemberVideo(mySessionId, localStream);
                selectMainVideo(mySessionId, localStream);
            }
        }, 1000);
    }
}

// 썸네일 클릭 시 메인 비디오를 교체하는 함수
function selectMainVideo(sessionId, stream) {
    // 모든 썸네일 테두리 초기화
    document.querySelectorAll('.video-wrapper').forEach(wrapper => {
        wrapper.classList.remove('selected-thumbnail');
    });
    
    // 선택된 썸네일에 초록색 테두리 추가
    const selectedWrapper = document.getElementById('wrapper-' + sessionId);
    if (selectedWrapper) {
        selectedWrapper.classList.add('selected-thumbnail');
    }
    
    // 발표자 모드일 경우 메인 비디오 소스 교체
    if (document.body.classList.contains('layout-speaker')) {
        const managerVideo = document.getElementById('managerVideo');
        if (managerVideo) {
            managerVideo.srcObject = stream;
            // 내 화면을 보면 muted true, 남의 화면이면 false (다만 WebRTC에서 받은 stream에 오디오가 있을 수 있음)
            if (stream === window.localStream) {
                managerVideo.muted = true;
            } else {
                managerVideo.muted = false;
            }
            managerVideo.play().catch(() => {});
        }
    }
}

// 멤버 화면 생성 + 멤버 이름 노출 + 멤버 리스트에 이름 추가
function addMemberVideo(sessionId, stream) {
    console.log(`[멤버화면생성] ${sessionId}`);

    // 이미 존재하는지 확인
    if (document.getElementById("wrapper-" + sessionId)) return;

    if (typeof window.createVideoSlot !== "function") {
        console.warn("createVideoSlot 함수가 준비되지 않았습니다.");
        return;
    }

    const { videoWrapper, videoElement } = window.createVideoSlot(sessionId);
    videoElement.srcObject = stream;

    // 내(로컬) 스트림일 경우 하울링 방지 및 브라우저 자동 재생 정책을 위해 음소거
    if (stream === window.localStream) {
        videoElement.muted = true;
    }

    // 항상 새로운 `label`을 생성하여 추가
    const label = document.createElement("span");
    label.classList.add("video-label");
    label.id = "label-" + sessionId;
    label.innerText = getDisplayName(sessionId);
    label.style.cursor = "pointer";
    label.title = "이름 변경하기";
    label.addEventListener("click", (e) => {
        e.stopPropagation();
        promptChangeName(sessionId);
    });
    videoWrapper.appendChild(label); // `video-wrapper` 안에 추가

    // 클릭 시 메인 비디오로 설정
    videoWrapper.addEventListener("click", () => {
        selectMainVideo(sessionId, stream);
    });

    // 멤버리스트에 사용자 추가 (중복 방지) : member-panel.js의 members 배열에 추가
    if (!window.members.includes(sessionId)) {
        window.members.push(sessionId);

        // 목록 업데이트 실행 (UI 반영)
        if (typeof window.updateMemberList === "function") {
            window.updateMemberList();
        }
    }
}

// 클릭한 비디오를 모달에 표시하는 기존 함수는 더 이상 사용하지 않지만 화면 공유 등에서 쓸 수 있으니 남겨두거나 삭제 가능
// 현재는 썸네일 클릭 시 selectMainVideo가 호출됩니다.

// 클릭한 비디오를 모달에서 제거하고 오버레이를 비활성화하는 함수
function closeVideoModal() {
    const memberVideoModal = document.getElementById("memberVideoModal");

    document.getElementById('videoModalSessionId').value = '';

    memberVideoModal.classList.remove("show"); // 애니메이션 효과 제거
    setTimeout(() => {
        memberVideoModal.style.display = "none"; // 애니메이션 끝난 후 숨기기
        const videoModal = document.getElementById("videoModal");
        videoModal.srcObject = null; // 300ms 후에 실행
    }, 300);

    // 우측 멤버 카메라 오버레이 숨김 처리
    const overlayElements = document.querySelectorAll(".overlay");
    overlayElements.forEach(overlayElement => {
        overlayElement.style.display = "none";
    });

    sendMicrophone(false);
}

// left-member 수신 (멤버 화면 제거 + 멤버 이름 제거 + 멤버 리스트에 이름 삭제)
async function removeMemberVideo(sessionId) {
    console.log(`[사용자 퇴장] ${sessionId}`);

    let videoModalSessionId = document.getElementById('videoModalSessionId').value
    if(videoModalSessionId === sessionId) {
            alert(`[${sessionId}]님이 퇴장하였습니다.`);
            closeVideoModal();
    }

    if (peerConnections[sessionId]) {
        peerConnections[sessionId].close();
        delete peerConnections[sessionId];
    }

    // 원격 비디오 삭제
    const remoteVideoWrapper = document.getElementById("wrapper-" + sessionId);
    if (remoteVideoWrapper) {
        remoteVideoWrapper.remove(); // 동적으로 래퍼 자체를 삭제
        
        if (typeof window.updateGrid === "function") {
            window.updateGrid();
        }
    }

    // 멤버리스트에서 사용자 제거 (member-panel.js의 members 배열에서 제거)
    if (window.members.includes(sessionId)) {
        window.members = window.members.filter(member => member !== sessionId);

        // 목록 업데이트 실행 (UI 반영)
        if (typeof window.updateMemberList === "function") {
            window.updateMemberList();
        }
    }
}

// PeerConnection 생성 및 설정
async function createPeerConnection(sessionId, type, event) {
    console.log('[PeerConnection] 생성');
    console.log(`event : ${event} / type : ${type} / sessionId : ${sessionId}`);

    if (peerConnections[sessionId]) {
        return;

    } else {
        console.log(`[사용자 접속] ${sessionId}`);
    }

    const peerConnection = new RTCPeerConnection({
        iceServers: [
            {urls: "stun:stun.l.google.com:19302"},
            {urls: "stun:stun1.l.google.com:19302"},
            {urls: "stun:stun2.l.google.com:19302"} // 구글 STUN 서버
        ],
        iceTransportPolicy: "all" // "ready" 대신 "all"로 설정하여 P2P 연결 우선
    });

    // 비트레이트 제한 설정
    peerConnection.onnegotiationneeded = async () => {
        const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
        if (!sender) return;

        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];

        await sender.setParameters(params);
    };

    // 내 로컬 미디어 트랙(비디오/오디오)을 `peerConnection`에 추가 (상대방과 공유할 트랙 설정)
    window.localStream.getTracks().forEach(track => peerConnection.addTrack(track, window.localStream));

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            const candidateStr = JSON.stringify(event.candidate);
            if (!sentIceCandidates.has(candidateStr)) {
                sentIceCandidates.add(candidateStr);
                sendIceCandidate(sessionId, event.candidate);
            }
        }
    };

    const addedStreams = new Set(); // 중복 방지용 Set

    peerConnection.ontrack = (event) => {
        if (!addedStreams.has(event.streams[0].id)) {
            addedStreams.add(event.streams[0].id);

            const stream = event.streams[0];
            
            // 모든 사람(방장 포함)을 썸네일에 추가
            addMemberVideo(sessionId, stream);

            // 관리자 화면 수신 시 (내가 멤버일 때)
            if (type === 'manager') {
                // 관리자 영상을 메인 화면으로 설정
                selectMainVideo(sessionId, stream);

                // 오디오 태그를 따로 생성해서 관리자 소리 재생
                const audioElement = new Audio();
                audioElement.srcObject = stream;
                audioElement.autoplay = true;
                audioElement.play();
            }

        } else {
            console.log("중복된 ontrack 실행 방지됨.");
        }
    };

    peerConnections[sessionId] = peerConnection;

    if (event === 'join-member') {
        await createOffer(sessionId);
    }
}

// join-member 수신
async function handleJoinMember(sessionId) {
    console.log('[first-join] 수신');
    if (sessionId) {
        console.log('[first-join] sessionId : ', sessionId);
        mySessionId = sessionId;
        
        // 내 로컬 레이블 및 이름 설정
        if (myType === 'manager') {
            window.userNames[mySessionId] = window.myUserName + " (방장)";
        } else {
            window.userNames[mySessionId] = window.myUserName;
        }
        if (myType === 'manager') {
            const managerVideoContainer = document.querySelector('.manager-video-container');
            if (managerVideoContainer && !document.getElementById("label-" + mySessionId)) {
                const label = document.createElement("span");
                label.classList.add("video-label");
                label.id = "label-" + mySessionId;
                label.innerText = window.myUserName + " (나)";
                label.style.cursor = "pointer";
                label.title = "이름 변경하기";
                label.addEventListener("click", (e) => {
                    e.stopPropagation();
                    promptChangeName(mySessionId);
                });
                managerVideoContainer.appendChild(label);
            }
        }
        
        socket.send(JSON.stringify({
            event: 'join-member',
            sessionId: sessionId,
            userName: window.myUserName
        }));
    }
}

// Offer 전송
async function createOffer(sessionId) {
    console.log('[offer] 전송')
    if (!peerConnections[sessionId]) return;
    const peerConnection = peerConnections[sessionId];

    // 현재 signalingState 체크
    if (peerConnection.signalingState !== "stable") {
        console.warn(`Offer 생성 건너뜀: signalingState=${peerConnection.signalingState}`);
        return;
    }

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.send(JSON.stringify({
            event: 'offer',
            sdp: JSON.stringify(offer),
            sessionId: mySessionId,
            recipientSessionId: sessionId,
            userName: window.myUserName
        }));

    } catch (error) {
        console.error("createOffer 프로세스 처리 중 오류 발생:", error);
    }
}

// Offer 수신
async function handleOffer(sessionId, offerSdp, type, event) {
    console.log('[offer] 수신')

    // 새로 들어온 멤버 입장에서의 화면 생성 (offer 받은 후 생성)
    if (!peerConnections[sessionId]) {
        await createPeerConnection(sessionId, type, event);
    }

    if (!signalingQueues[sessionId]) {
        signalingQueues[sessionId] = new SignalingQueue();
    }

    await signalingQueues[sessionId].enqueue(async () => {
        const peerConnection = peerConnections[sessionId];

        try {
            const parsedOffer = new RTCSessionDescription(JSON.parse(offerSdp));
            await peerConnection.setRemoteDescription(parsedOffer);

            let retryCount = 0;
            while (peerConnection.signalingState !== "stable" && retryCount < 10) { // 10번 이상 반복 안 함
                console.log(`signalingState 대기 중... (${peerConnection.signalingState})`);
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
                retryCount++;
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await sendAnswer(sessionId, answer); // answer 전송

        } catch (error) {
            console.error("handleOffer 프로세스 처리 중 오류 발생:", error);
        }
    });
}

// Answer 수신
async function handleAnswer(sessionId, answerSdp) {
    console.log('[answer] 수신')

    if (!peerConnections[sessionId]) {
        console.warn(`PeerConnection 없음: ${sessionId}`);
        return;
    }

    if (!signalingQueues[sessionId]) {
        signalingQueues[sessionId] = new SignalingQueue();
    }

    await signalingQueues[sessionId].enqueue(async () => {
        const peerConnection = peerConnections[sessionId];

        if (peerConnection.signalingState === "stable") {
            console.warn(`setRemoteDescription 호출 안 함 (이미 stable 상태)`);
            return;
        }

        try {
            const parsedAnswer = new RTCSessionDescription(JSON.parse(answerSdp));
            await peerConnection.setRemoteDescription(parsedAnswer);
        } catch (error) {
            console.error("Answer 설정 중 오류 발생:", error);
        }
    });
}

// answer 전송
async function sendAnswer(sessionId, answer) {
    console.log('[answer] 전송')
    socket.send(JSON.stringify({
        event: 'answer',
        sdp: JSON.stringify(answer),
        sessionId: mySessionId,
        recipientSessionId: sessionId,
        userName: window.myUserName
    }));
}

// ice-candidate 전송
function sendIceCandidate(sessionId, candidate) {
    console.log('[ice-candidate] 전송')
    socket.send(JSON.stringify({
        event: 'ice-candidate',
        candidate: JSON.stringify(candidate),
        sessionId: mySessionId,
        recipientSessionId: sessionId
    }));
}

// ice-candidate 수신
async function handleIceCandidate(sessionId, candidate) {
    console.log('[ice-candidate] 수신')
    const peerConnection = peerConnections[sessionId];

    try {
        const parsedCandidate = new RTCIceCandidate(JSON.parse(candidate));
        await peerConnection.addIceCandidate(parsedCandidate);
    } catch (error) {
        console.error("ICE 후보 처리 중 오류 발생:", error);
    }
}

// microphone 전송
function sendMicrophone(value) {
    console.log('[microphone] 전송')

    const sessionId = document.getElementById('videoModalSessionId').value;
    if (sessionId) {

        const microphoneControlBtn = document.getElementById('microphoneControlBtn');

        let isEnabled;

        // 모달 창 닫기
        if (value === false) {
            microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-false.png')";
            document.getElementById('microphoneIsEnabled').value = 'false';
            isEnabled = 'false';

            // inEnabled 토글 처리
        } else {
            isEnabled = document.getElementById('microphoneIsEnabled').value;
            if (isEnabled === 'false') {
                microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-true.png')";
                document.getElementById('microphoneIsEnabled').value = 'true';
                isEnabled = 'true';

            } else if (isEnabled === 'true') {
                microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-false.png')";
                document.getElementById('microphoneIsEnabled').value = 'false';
                isEnabled = 'false';

            } else {
                console.log('isEnabled 값이 없습니다.');
                return;
            }
        }

        socket.send(JSON.stringify({
            event: 'microphone',
            isEnabled: isEnabled,
            sessionId: mySessionId,
            recipientSessionId: sessionId
        }));

    } else {
        console.log('[microphone] sessionId 값이 없습니다.')
    }
}

// microphone 수신
async function handleMicrophone(sessionId, isEnabled) {
    console.log('[microphone] 수신');

    if (peerConnections[sessionId]) {
        console.log('[microphone] isEnabled : ', isEnabled);
        window.localStream.getAudioTracks().forEach(track => {
            if (isEnabled === 'true') {
                track.enabled = true;
            } else if (isEnabled === 'false') {
                track.enabled = false;
            }
        });
    }
}

// kick 수신
async function handleKick(sessionId) {
    console.log('[kick] 수신');

    if (peerConnections[sessionId]) {
        window.location.href = `/videoChat/${roomId}/kickedOut`;
    }
}

// refresh 수신
async function handleRefresh(sessionId) {
    console.log('[refresh] 수신');

    if (peerConnections[sessionId]) {
        window.location.reload();
    }
}

// WebRTC Offer/Answer 처리를 순차적으로 실행하는 Queue
class SignalingQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    async enqueue(task) {
        this.queue.push(task);
        await this.processQueue();
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            await task();  // 작업 실행
        }
        this.processing = false;
    }
}

// 마이크 켜기/끄기 기능
function toggleAudio() {
    if (window.localStream) {
        const audioTracks = window.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const track = audioTracks[0];
            track.enabled = !track.enabled;
            const btn  = document.getElementById('toggleAudioBtn');
            const icon = document.getElementById('audioIcon');
            if (icon) {
                icon.innerText = track.enabled ? 'mic' : 'mic';
            }
            if (btn) {
                btn.classList.toggle('btn-muted', !track.enabled);
            }
        }
    }
}
window.toggleAudio = toggleAudio;

// 카메라 켜기/끄기 기능
function toggleCamera() {
    if (window.localStream) {
        const videoTracks = window.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            const track = videoTracks[0];
            track.enabled = !track.enabled;
            const btn  = document.getElementById('toggleCameraBtn');
            const icon = document.getElementById('cameraIcon');
            if (icon) {
                icon.innerText = track.enabled ? 'videocam' : 'videocam';
            }
            if (btn) {
                btn.classList.toggle('btn-muted', !track.enabled);
            }
        }
    }
}
window.toggleCamera = toggleCamera;

// 이름 변경 관련 함수
function getDisplayName(sessionId) {
    if (window.userNames[sessionId]) {
        return window.userNames[sessionId];
    }
    const lastUnderscoreIndex = sessionId.lastIndexOf('_');
    return lastUnderscoreIndex !== -1 ? sessionId.substring(0, lastUnderscoreIndex) : sessionId;
}

function updateVideoLabel(sessionId) {
    const label = document.getElementById("label-" + sessionId);
    if (label) {
        label.innerText = getDisplayName(sessionId);
    }
}
window.updateVideoLabel = updateVideoLabel;

function promptChangeName(sessionId) {
    // 본인의 이름만 바꿀 수 있도록
    if (sessionId !== mySessionId && sessionId !== '나 (방장)') return;

    const currentName = getDisplayName(sessionId).replace(" (나)", "");
    const newName = prompt("변경할 이름을 입력하세요:", currentName);
    
    if (newName && newName.trim() !== "" && newName !== currentName) {
        window.myUserName = newName.trim();
        window.userNames[mySessionId] = window.myUserName;
        if (sessionId === '나 (방장)') {
            window.userNames['나 (방장)'] = window.myUserName + " (나)";
        }
        updateVideoLabel(mySessionId);
        
        if (typeof window.updateMemberList === "function") {
            window.updateMemberList();
        }

        socket.send(JSON.stringify({
            event: 'change-name',
            sessionId: mySessionId,
            userName: window.myUserName
        }));
    }
}

// 초대 링크 복사 기능
function copyInviteLink() {
    const rId = window.location.pathname.split("/")[2];
    const inviteUrl = window.location.origin + "/videoChat/" + rId + "/member";
    navigator.clipboard.writeText(inviteUrl).then(() => {
        alert("채팅방 초대 링크가 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V) 하여 사람들을 초대하세요.\n" + inviteUrl);
    }).catch(err => {
        console.error("초대 링크 복사 실패", err);
        alert("초대 링크 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    });
}
window.copyInviteLink = copyInviteLink;

// ---------------------- 채팅 기능 ----------------------
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    // 화면에 내 메시지 표시
    appendChatMessage("나", msg, true);
    input.value = '';

    // 서버로 전송
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            event: 'chat',
            sessionId: mySessionId || "나",
            message: msg
        }));
    }
}
window.sendChatMessage = sendChatMessage;

function receiveChatMessage(senderId, msg) {
    appendChatMessage(senderId, msg, false);
}
window.receiveChatMessage = receiveChatMessage;

function appendChatMessage(sender, msg, isMe) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.style.maxWidth = "80%";
    div.style.padding = "8px 12px";
    div.style.borderRadius = "8px";
    div.style.marginBottom = "5px";
    div.style.wordBreak = "break-word";
    
    if (isMe) {
        div.style.alignSelf = "flex-end";
        div.style.backgroundColor = "#007bff";
        div.style.color = "white";
        div.innerHTML = `<span>${msg}</span>`;
    } else {
        div.style.alignSelf = "flex-start";
        div.style.backgroundColor = "#f0f0f0";
        div.style.color = "#333";
        div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ice-candidate 수신
async function handleIceCandidate(sessionId, candidate) {
    console.log('[ice-candidate] 수신')
    const peerConnection = peerConnections[sessionId];

    try {
        const parsedCandidate = new RTCIceCandidate(JSON.parse(candidate));
        await peerConnection.addIceCandidate(parsedCandidate);
    } catch (error) {
        console.error("ICE 후보 처리 중 오류 발생:", error);
    }
}

// microphone 전송
function sendMicrophone(value) {
    console.log('[microphone] 전송')

    const sessionId = document.getElementById('videoModalSessionId').value;
    if (sessionId) {

        const microphoneControlBtn = document.getElementById('microphoneControlBtn');

        let isEnabled;

        // 모달 창 닫기
        if (value === false) {
            microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-false.png')";
            document.getElementById('microphoneIsEnabled').value = 'false';
            isEnabled = 'false';

            // inEnabled 토글 처리
        } else {
            isEnabled = document.getElementById('microphoneIsEnabled').value;
            if (isEnabled === 'false') {
                microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-true.png')";
                document.getElementById('microphoneIsEnabled').value = 'true';
                isEnabled = 'true';

            } else if (isEnabled === 'true') {
                microphoneControlBtn.style.backgroundImage = "url('/images/mic-enabled-false.png')";
                document.getElementById('microphoneIsEnabled').value = 'false';
                isEnabled = 'false';

            } else {
                console.log('isEnabled 값이 없습니다.');
                return;
            }
        }

        socket.send(JSON.stringify({
            event: 'microphone',
            isEnabled: isEnabled,
            sessionId: mySessionId,
            recipientSessionId: sessionId
        }));

    } else {
        console.log('[microphone] sessionId 값이 없습니다.')
    }
}

// microphone 수신
async function handleMicrophone(sessionId, isEnabled) {
    console.log('[microphone] 수신');

    if (peerConnections[sessionId]) {
        console.log('[microphone] isEnabled : ', isEnabled);
        window.localStream.getAudioTracks().forEach(track => {
            if (isEnabled === 'true') {
                track.enabled = true;
            } else if (isEnabled === 'false') {
                track.enabled = false;
            }
        });
    }
}

// kick 수신
async function handleKick(sessionId) {
    console.log('[kick] 수신');

    if (peerConnections[sessionId]) {
        window.location.href = `/videoChat/${roomId}/kickedOut`;
    }
}

// refresh 수신
async function handleRefresh(sessionId) {
    console.log('[refresh] 수신');

    if (peerConnections[sessionId]) {
        window.location.reload();
    }
}



// 초대 링크 복사 기능
function copyInviteLink() {
    const rId = window.location.pathname.split("/")[2];
    const inviteUrl = window.location.origin + "/videoChat/" + rId + "/member";
    navigator.clipboard.writeText(inviteUrl).then(() => {
        alert("채팅방 초대 링크가 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V) 하여 사람들을 초대하세요.\n" + inviteUrl);
    }).catch(err => {
        console.error("초대 링크 복사 실패", err);
        alert("초대 링크 복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
    });
}
window.copyInviteLink = copyInviteLink;

// ---------------------- 채팅 기능 ----------------------
function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    // 화면에 내 메시지 표시
    appendChatMessage("나", msg, true);
    input.value = '';

    // 서버로 전송
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            event: 'chat',
            sessionId: mySessionId || "나",
            message: msg
        }));
    }
}
window.sendChatMessage = sendChatMessage;

function receiveChatMessage(senderId, msg) {
    appendChatMessage(senderId, msg, false);
}
window.receiveChatMessage = receiveChatMessage;

function appendChatMessage(sender, msg, isMe) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.style.maxWidth = "80%";
    div.style.padding = "8px 12px";
    div.style.borderRadius = "8px";
    div.style.marginBottom = "5px";
    div.style.wordBreak = "break-word";
    
    if (isMe) {
        div.style.alignSelf = "flex-end";
        div.style.backgroundColor = "rgba(0, 123, 255, 0.8)";
        div.style.color = "white";
        div.innerHTML = `<span>${msg}</span>`;
    } else {
        div.style.alignSelf = "flex-start";
        div.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
        div.style.color = "white";
        div.innerHTML = `<span style="font-size: 0.8em; color: rgba(255,255,255,0.7); margin-bottom: 3px; display: block; font-weight: bold;">${sender}</span><span>${msg}</span>`;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
window.appendChatMessage = appendChatMessage;

// ---------------------- 뷰 모드 및 패널 토글 기능 ----------------------
window.toggleViewMode = function() {
    const isSpeaker = document.body.classList.contains('layout-speaker');
    const icon = document.getElementById('viewIcon');
    const panel = document.getElementById('memberVideosContainer');
    
    if (isSpeaker) {
        document.body.classList.remove('layout-speaker');
        panel.classList.remove('show');
        if (icon) icon.innerText = 'fullscreen';
        setTimeout(() => {
            if (typeof window.updateGrid === 'function') window.updateGrid();
        }, 100);
    } else {
        document.body.classList.add('layout-speaker');
        if (icon) icon.innerText = 'grid_view';
    }
};

window.toggleMemberVideoPanel = function() {
    // 이 기능은 발표자 모드(layout-speaker)일 때만 유효함
    if (!document.body.classList.contains('layout-speaker')) {
        alert("타일 보기 모드에서는 이미 모든 영상이 화면에 표시되고 있습니다.");
        return;
    }
    
    const panel = document.getElementById('memberVideosContainer');
    if (!panel) return;
    
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
};
