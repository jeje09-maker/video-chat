let bgType = 'none'; // 'none', 'blur', 'url...'
let bgImage = null;
let selfieSegmentation = null;
let activeOriginalStream = null;
let activeCanvasStream = null;
let hiddenVideo = null;
let canvasElement = null;
let canvasCtx = null;
let animationId = null;

// 배경 선택 시 즉시 전환
window.setVirtualBackground = function(type) {
    bgType = type;
    if (type !== 'none' && type !== 'blur') {
        bgImage = new Image();
        bgImage.crossOrigin = 'Anonymous';
        bgImage.src = type;
    } else {
        bgImage = null;
    }

    if (bgType !== 'none') {
        // 배경 효과가 필요하면 캔버스 파이프라인 시작
        if (!activeCanvasStream && activeOriginalStream) {
            _startCanvasPipeline(activeOriginalStream).then(cs => {
                // managerVideo 에 재연결
                const mv = document.getElementById('managerVideo');
                if (mv) mv.srcObject = cs;
            });
        }
        if (!selfieSegmentation) initSegmentation();
    } else {
        // 원본으로 복원
        if (activeOriginalStream) {
            const mv = document.getElementById('managerVideo');
            if (mv) mv.srcObject = activeOriginalStream;
        }
    }
};

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
        canvasCtx.fillStyle = '#222';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.filter = 'none';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

async function _startCanvasPipeline(stream) {
    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.autoplay = true;
        hiddenVideo.playsInline = true;
        hiddenVideo.muted = true;

        canvasElement = document.createElement('canvas');
        canvasCtx = canvasElement.getContext('2d');
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return stream;

    const settings = videoTrack.getSettings();
    canvasElement.width  = settings.width  || 640;
    canvasElement.height = settings.height || 480;

    hiddenVideo.srcObject = new MediaStream([videoTrack]);
    await new Promise(resolve => { hiddenVideo.onloadeddata = resolve; });

    activeCanvasStream = canvasElement.captureStream(30);
    stream.getAudioTracks().forEach(t => activeCanvasStream.addTrack(t));

    async function processFrame() {
        if (hiddenVideo.paused || hiddenVideo.ended) {
            animationId = requestAnimationFrame(processFrame);
            return;
        }
        if (bgType === 'none') {
            canvasCtx.drawImage(hiddenVideo, 0, 0, canvasElement.width, canvasElement.height);
        } else if (selfieSegmentation) {
            await selfieSegmentation.send({ image: hiddenVideo });
        }
        animationId = requestAnimationFrame(processFrame);
    }

    if (animationId) cancelAnimationFrame(animationId);
    processFrame();

    return activeCanvasStream;
}

// getMediaStream() 이 호출하는 진입점 – bgType이 none이면 원본 스트림을 그냥 돌려줌
window.processVirtualBackground = async function(stream) {
    activeOriginalStream = stream;

    if (bgType === 'none') {
        // 배경 없음: 캔버스 파이프라인 없이 원본 스트림 직접 반환
        return stream;
    }

    return await _startCanvasPipeline(stream);
};
