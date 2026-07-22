/**
 * virtual-background.js
 * 배경 선택 시에만 활성화 - 초기 스트림은 절대 건드리지 않음
 */

let bgType = 'none';
let bgImage = null;
let selfieSegmentation = null;
let hiddenVideo = null;
let canvasElement = null;
let canvasCtx = null;
let animationId = null;

/**
 * 배경 선택 버튼 클릭 시 호출
 * 직접 managerVideo의 srcObject를 교체하는 방식으로 동작
 */
window.setVirtualBackground = function(type) {
    const wasPipelineRunning = (bgType !== 'none');
    bgType = type;

    if (type !== 'none' && type !== 'blur') {
        bgImage = new Image();
        bgImage.crossOrigin = 'Anonymous';
        bgImage.src = type;
    } else {
        bgImage = null;
    }

    if (bgType === 'none') {
        // 원본 스트림 복원
        _restoreOriginalStream();
    } else {
        // 캔버스 파이프라인 시작
        if (!selfieSegmentation) initSegmentation();
        if (!wasPipelineRunning) {
            _startCanvasPipeline();
        }
    }
};

function _restoreOriginalStream() {
    if (!window.localStream) return;
    const mv = document.getElementById('managerVideo');
    if (mv) {
        mv.srcObject = window.localStream;
        mv.play().catch(() => {});
    }
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function initSegmentation() {
    if (typeof SelfieSegmentation === 'undefined') {
        setTimeout(initSegmentation, 500);
        return;
    }
    selfieSegmentation = new SelfieSegmentation({ locateFile: f =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(onResults);
}

function onResults(results) {
    if (!canvasCtx) return;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    canvasCtx.globalCompositeOperation = 'copy';
    canvasCtx.filter = 'blur(4px)';
    canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

    canvasCtx.globalCompositeOperation = 'source-out';
    if (bgType === 'blur') {
        canvasCtx.filter = 'blur(20px)';
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    } else if (bgImage && bgImage.complete) {
        canvasCtx.filter = 'none';
        canvasCtx.drawImage(bgImage, 0, 0, canvasElement.width, canvasElement.height);
    } else {
        canvasCtx.fillStyle = '#111';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.filter = 'none';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

async function _startCanvasPipeline() {
    if (!window.localStream) return;

    const videoTrack = window.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.autoplay = true;
        hiddenVideo.playsInline = true;
        hiddenVideo.muted = true;
        canvasElement = document.createElement('canvas');
        canvasCtx = canvasElement.getContext('2d');
    }

    const settings = videoTrack.getSettings();
    canvasElement.width  = settings.width  || 640;
    canvasElement.height = settings.height || 480;

    hiddenVideo.srcObject = new MediaStream([videoTrack]);
    await new Promise(resolve => {
        hiddenVideo.onloadeddata = resolve;
        hiddenVideo.play().catch(() => resolve());
    });

    const canvasStream = canvasElement.captureStream(30);
    window.localStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    // managerVideo에 캔버스 스트림으로 교체
    const mv = document.getElementById('managerVideo');
    if (mv) {
        mv.srcObject = canvasStream;
        mv.play().catch(() => {});
    }

    // 이전 애니메이션 중단
    if (animationId) cancelAnimationFrame(animationId);

    async function processFrame() {
        if (!hiddenVideo.paused && !hiddenVideo.ended && bgType !== 'none') {
            if (selfieSegmentation) {
                await selfieSegmentation.send({ image: hiddenVideo });
            } else {
                canvasCtx.drawImage(hiddenVideo, 0, 0, canvasElement.width, canvasElement.height);
            }
        } else if (bgType === 'none') {
            return; // 원본으로 복원됐으면 루프 종료
        }
        animationId = requestAnimationFrame(processFrame);
    }
    processFrame();
}
