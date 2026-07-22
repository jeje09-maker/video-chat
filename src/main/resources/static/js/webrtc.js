const path = window.location.pathname;
const roomId = path.split("/")[2];  // 방번호
const myType = path.split("/")[3];  // 회원 or 관리자

let mySessionId = '';
let peerConnections = {};  // 각 방의 PeerConnection 관리
let signalingQueues = {};  // 각 PeerConnection Offer/Answer 처리를 위한 큐 관리 객체
let sentIceCandidates = new Set();  // 중복된 ICE 후보 전송 방지용

window.localStream = null;

// WebSocket 연결
const socket = new WebSocket(`wss://${location.host}/ws/${roomId}/${myType}`);

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

                } catch (error) {

                    window.localStream = new MediaStream(); // 빈 스트림 반환
                    console.error("미디어 스트림 설정 실패:", error);
                }

                // 관리자 화면 생성
                if (myType === 'manager') addManagerVideo(window.localStream);

                // 멤버 화면 생성
                if (myType === 'member') addMemberVideo(message.sessionId, window.localStream);
            }
        }

        switch (message.event) {
            case 'first-join':
                await handleJoinMember(message.sessionId);
                break;

            case 'join-member':
                await createPeerConnection(message.sessionId, message.type, message.event);
                break;

            case 'offer':
                await handleOffer(message.sessionId, message.sdp, message.type, message.event);
                break;

            case 'answer':
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

            case 'chat':
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
        let combinedStream = new MediaStream();
        videoStream.getTracks().forEach(track => combinedStream.addTrack(track));
        audioStream.getTracks().forEach(track => combinedStream.addTrack(track));

        if (typeof window.processVirtualBackground === 'function') {
            combinedStream = await window.processVirtualBackground(combinedStream);
        }

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

// 관리자 화면 생성
function addManagerVideo(localStream) {
    const managerVideo = document.getElementById("managerVideo");
    managerVideo.srcObject = localStream;
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
    label.innerText = sessionId;
    videoWrapper.appendChild(label); // `video-wrapper` 안에 추가

    // 클릭한 비디오를 모달에 표시하는 이벤트 리스너 추가
    if(myType === 'manager') {
        videoElement.addEventListener("click", () => showVideoModal(videoElement));
        videoElement.style.cursor = 'pointer';

        // 마우스를 올렸을 때 테두리 추가
        videoElement.addEventListener("mouseenter", () => {
            videoElement.style.border = '2px solid #007bff';
            videoElement.style.position = 'relative';
            videoElement.style.zIndex = '10';
        });

        videoElement.addEventListener("mouseleave", () => {
            videoElement.style.border = '';
            videoElement.style.position = '';
            videoElement.style.zIndex = '';
        });
    }

    // 멤버리스트에 사용자 추가 (중복 방지) : member-panel.js의 members 배열에 추가
    if (!window.members.includes(sessionId)) {
        window.members.push(sessionId);

        // 목록 업데이트 실행 (UI 반영)
        if (typeof window.updateMemberList === "function") {
            window.updateMemberList();
        }
    }
}

// 클릭한 비디오를 모달에 표시하고 오버레이를 활성화하는 함수
function showVideoModal(emptyVideoSlot) {
    console.log(`비디오 ${emptyVideoSlot.id} 클릭.`);

    // 모달에서 사용할 세션 ID를 설정
    document.getElementById('videoModalSessionId').value = emptyVideoSlot.id;

    // 비디오 삽입
    const videoModal = document.getElementById('videoModal');
    videoModal.srcObject = emptyVideoSlot.srcObject;

    // 멤버 비디오 모달 열기
    const memberVideoModal = document.getElementById("memberVideoModal");
    memberVideoModal.style.display = "flex";
    setTimeout(() => memberVideoModal.classList.add("show"), 10); // 약간의 지연 후 애니메이션 적용

    // 우측 멤버 카메라 오버레이를 보이게 설정
    document.querySelectorAll(".overlay").forEach(overlayElement => {
        overlayElement.style.display = "block";
    });
}

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

            // 관리자 화면 생성
            if (type === 'manager') {
                const managerVideo = document.getElementById("managerVideo");
                const stream = event.streams[0];
                managerVideo.srcObject = stream;

                // 오디오 태그를 따로 생성해서 관리자 소리 재생
                const audioElement = new Audio();
                audioElement.srcObject = stream;
                audioElement.autoplay = true;
                audioElement.play();
            }

            // 멤버 화면 생성
            if (type === 'member') {
                addMemberVideo(sessionId, event.streams[0]);
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
        socket.send(JSON.stringify({
            event: 'join-member',
            sessionId: sessionId
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
            recipientSessionId: sessionId
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
        recipientSessionId: sessionId
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

// 카메라 켜기/끄기 기능
function toggleCamera() {
    if (window.localStream) {
        const videoTracks = window.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            const track = videoTracks[0];
            track.enabled = !track.enabled; // 상태 반전

            const btn = document.getElementById("toggleCameraBtn");
            if (btn) {
                // 필요 시 이미지/텍스트 변경 (현재는 텍스트로 처리)
                btn.innerText = track.enabled ? "카메라 끄기" : "카메라 켜기";
            }
        }
    }
}
window.toggleCamera = toggleCamera;

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
        div.style.backgroundColor = "#e9ecef";
        div.style.color = "black";
        div.innerHTML = `<span style="font-size: 0.8em; color: #555; margin-bottom: 3px; display: block; font-weight: bold;">${sender}</span><span>${msg}</span>`;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
window.appendChatMessage = appendChatMessage;
