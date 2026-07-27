/**
 * recording.js
 * 방장(manager) 전용 녹화 / 녹음 기능
 *
 * - 녹화: 메인 영상(managerVideo) + 전체 참가자 오디오 합성 → WebM 다운로드
 * - 녹음: 전체 참가자 오디오만 합성 → WebM(Opus) 다운로드
 */

(function () {
    /* ───────────────── 상태 ───────────────── */
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordingMode = null;   // 'video' | 'audio' | null
    let timerInterval = null;
    let elapsedSeconds = 0;

    /* ───────────────── AudioContext (모든 원격 오디오 믹싱) ───────────────── */
    let audioCtx = null;
    let mixDestination = null;

    function getAudioContext() {
        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new AudioContext();
            mixDestination = audioCtx.createMediaStreamDestination();
        }
        return { audioCtx, mixDestination };
    }

    /**
     * document.body 안에 있는 모든 remote-audio-* 엘리먼트의 스트림을
     * AudioContext로 끌어와 하나의 MediaStream으로 믹싱합니다.
     * 로컬 마이크(window.localStream)도 포함합니다.
     */
    function buildMixedAudioStream() {
        const { audioCtx, mixDestination } = getAudioContext();

        // 로컬 마이크 추가
        if (window.localStream) {
            const localAudioTracks = window.localStream.getAudioTracks();
            if (localAudioTracks.length > 0) {
                const localSource = audioCtx.createMediaStreamSource(
                    new MediaStream(localAudioTracks)
                );
                localSource.connect(mixDestination);
            }
        }

        // 원격 오디오 엘리먼트 추가 (remote-audio-<sessionId>)
        document.querySelectorAll('audio[id^="remote-audio-"]').forEach(audioEl => {
            if (audioEl.srcObject && audioEl.srcObject.getAudioTracks().length > 0) {
                try {
                    const remoteSource = audioCtx.createMediaStreamSource(audioEl.srcObject);
                    remoteSource.connect(mixDestination);
                } catch (e) {
                    console.warn('[recording] 원격 오디오 소스 연결 실패:', e);
                }
            }
        });

        return mixDestination.stream;
    }

    /* ───────────────── MediaRecorder 시작 ───────────────── */
    function startRecording(mode) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.warn('[recording] 이미 녹화/녹음 중입니다.');
            return;
        }

        recordingMode = mode;
        recordedChunks = [];

        let stream;

        if (mode === 'video') {
            // ── 영상+오디오: managerVideo 캔버스 캡처 + 믹싱 오디오
            const managerVideo = document.getElementById('managerVideo');
            if (!managerVideo) {
                alert('메인 비디오를 찾을 수 없습니다.');
                return;
            }

            // 비디오 스트림 (captureStream 지원 여부 체크)
            let videoStream;
            if (typeof managerVideo.captureStream === 'function') {
                videoStream = managerVideo.captureStream(30);
            } else if (typeof managerVideo.mozCaptureStream === 'function') {
                videoStream = managerVideo.mozCaptureStream(30);
            } else {
                alert('이 브라우저는 영상 캡처를 지원하지 않습니다. 녹음만 사용해 주세요.');
                return;
            }

            const mixedAudio = buildMixedAudioStream();
            stream = new MediaStream([
                ...videoStream.getVideoTracks(),
                ...mixedAudio.getAudioTracks()
            ]);

        } else if (mode === 'audio') {
            // ── 오디오만
            stream = buildMixedAudioStream();
            if (stream.getAudioTracks().length === 0) {
                alert('녹음할 오디오 트랙이 없습니다. 마이크 권한을 확인해주세요.');
                return;
            }
        } else {
            return;
        }

        // MIME 타입 선택
        const mimeType = mode === 'video'
            ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm')
            : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');

        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e) {
            console.error('[recording] MediaRecorder 생성 실패:', e);
            alert('녹화기를 시작할 수 없습니다: ' + e.message);
            return;
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = handleRecordingStop;

        mediaRecorder.start(1000); // 1초 단위 청크
        console.log('[recording] ' + mode + ' 녹화 시작');

        startTimer();
        updateUI(true, mode);
    }

    /* ───────────────── MediaRecorder 정지 ───────────────── */
    function stopRecording() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        mediaRecorder.stop();
        stopTimer();
        updateUI(false, null);
    }

    /* ───────────────── 파일 저장 ───────────────── */
    function handleRecordingStop() {
        if (recordedChunks.length === 0) {
            alert('저장할 데이터가 없습니다.');
            return;
        }

        const ext = recordingMode === 'video' ? 'webm' : 'webm';
        const mimeType = recordingMode === 'video' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(recordedChunks, { type: mimeType });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = 'recording-' + timestamp + '.' + ext;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);

        recordedChunks = [];
        recordingMode = null;
        console.log('[recording] 파일 저장 완료:', filename);
    }

    /* ───────────────── 타이머 ───────────────── */
    function startTimer() {
        elapsedSeconds = 0;
        const el = document.getElementById('recordingTimer');
        if (el) el.textContent = '00:00';

        timerInterval = setInterval(function() {
            elapsedSeconds++;
            const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            const ss = String(elapsedSeconds % 60).padStart(2, '0');
            if (el) el.textContent = mm + ':' + ss;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        elapsedSeconds = 0;
    }

    /* ───────────────── UI 업데이트 ───────────────── */
    function updateUI(isRecording, mode) {
        const indicator = document.getElementById('recordingIndicator');
        const timer     = document.getElementById('recordingTimer');
        const recBtn    = document.getElementById('toggleRecordBtn');
        const recIcon   = document.getElementById('recordIcon');
        const audBtn    = document.getElementById('toggleAudioRecordBtn');
        const audIcon   = document.getElementById('audioRecordIcon');

        if (isRecording) {
            if (indicator) { indicator.style.display = 'inline-block'; indicator.classList.add('recording-blink'); }
            if (timer)     { timer.style.display = 'inline'; timer.textContent = '00:00'; }

            if (mode === 'video') {
                if (recBtn)  recBtn.classList.add('btn-recording');
                if (recIcon) recIcon.style.color = '#ff4757';
                if (audBtn)  audBtn.disabled = true;
            } else {
                if (audBtn)  audBtn.classList.add('btn-recording');
                if (audIcon) audIcon.style.color = '#ff4757';
                if (recBtn)  recBtn.disabled = true;
            }
        } else {
            if (indicator) { indicator.style.display = 'none'; indicator.classList.remove('recording-blink'); }
            if (timer)     { timer.style.display = 'none'; timer.textContent = '00:00'; }

            if (recBtn)  { recBtn.classList.remove('btn-recording'); recBtn.disabled = false; }
            if (recIcon) recIcon.style.color = '';
            if (audBtn)  { audBtn.classList.remove('btn-recording'); audBtn.disabled = false; }
            if (audIcon) audIcon.style.color = '';
        }
    }

    /* ───────────────── 토글 핸들러 ───────────────── */
    function toggleVideoRecord() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            stopRecording();
        } else {
            startRecording('video');
        }
    }

    function toggleAudioRecord() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            stopRecording();
        } else {
            startRecording('audio');
        }
    }

    /* ───────────────── 전역 노출 ───────────────── */
    window.toggleVideoRecord = toggleVideoRecord;
    window.toggleAudioRecord = toggleAudioRecord;

})();
