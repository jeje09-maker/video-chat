let bgType = 'none'; // 'none', 'blur', 'url...'
let bgImage = null;
let selfieSegmentation = null;
let activeOriginalStream = null;
let activeCanvasStream = null;
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let animationId = null;

window.setVirtualBackground = function(type) {
    bgType = type;
    if (type !== 'none' && type !== 'blur') {
        bgImage = new Image();
        bgImage.crossOrigin = "Anonymous";
        bgImage.src = type;
    } else {
        bgImage = null;
    }
    
    if (bgType !== 'none' && !selfieSegmentation) {
        initSegmentation();
    }
};

function initSegmentation() {
    if (typeof SelfieSegmentation === 'undefined') {
        console.warn("SelfieSegmentation is not loaded yet.");
        setTimeout(initSegmentation, 500);
        return;
    }
    selfieSegmentation = new SelfieSegmentation({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
    }});
    selfieSegmentation.setOptions({
        modelSelection: 1, // 0 for general, 1 for landscape (faster)
    });
    selfieSegmentation.onResults(onResults);
}

function onResults(results) {
    if (!canvasCtx) return;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw segmentation mask (white where person is, black for background)
    canvasCtx.globalCompositeOperation = 'copy';
    canvasCtx.filter = 'blur(4px)'; // soften edges
    canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);

    // We want the background to be drawn where the mask is black (source-out)
    canvasCtx.globalCompositeOperation = 'source-out';
    if (bgType === 'blur') {
        canvasCtx.filter = 'blur(20px)';
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    } else if (bgImage && bgImage.complete) {
        canvasCtx.filter = 'none';
        canvasCtx.drawImage(bgImage, 0, 0, canvasElement.width, canvasElement.height);
    } else {
        canvasCtx.fillStyle = '#C0C0C0'; // fallback gray
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    // Finally draw the original person over the mask (destination-over)
    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.filter = 'none';
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    canvasCtx.restore();
}

window.processVirtualBackground = async function(stream) {
    activeOriginalStream = stream;
    
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        
        canvasElement = document.createElement('canvas');
        canvasCtx = canvasElement.getContext('2d');
    }
    
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return stream; // No video track to process
    
    const settings = videoTrack.getSettings();
    canvasElement.width = settings.width || 640;
    canvasElement.height = settings.height || 480;
    
    videoElement.srcObject = new MediaStream([videoTrack]);
    
    await new Promise((resolve) => {
        videoElement.onloadeddata = () => resolve();
    });

    activeCanvasStream = canvasElement.captureStream(30); // 30 FPS
    
    // add audio track back if exists
    stream.getAudioTracks().forEach(t => activeCanvasStream.addTrack(t));

    if (!selfieSegmentation && bgType !== 'none') {
        initSegmentation();
    }
    
    async function processFrame() {
        if (!activeCanvasStream || videoElement.paused || videoElement.ended) {
            animationId = requestAnimationFrame(processFrame);
            return;
        }

        if (bgType === 'none') {
            // Just draw the original video frame
            canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        } else if (selfieSegmentation) {
            // Wait for segmentation
            await selfieSegmentation.send({image: videoElement});
        }
        
        animationId = requestAnimationFrame(processFrame);
    }
    
    if (animationId) cancelAnimationFrame(animationId);
    processFrame();

    return activeCanvasStream;
};
