document.addEventListener("DOMContentLoaded", function () {
    const memberVideosContainer = document.getElementById("memberVideosContainer");

    function updateGrid() {
        const currentSlots = memberVideosContainer.children.length;
        if (currentSlots === 0) return;

        const containerWidth = memberVideosContainer.clientWidth;
        const containerHeight = memberVideosContainer.clientHeight;
        const aspectRatio = containerWidth / containerHeight || 1;

        let columns = Math.ceil(Math.sqrt(currentSlots * aspectRatio));
        let rows = Math.ceil(currentSlots / columns);

        memberVideosContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        memberVideosContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    }

    function createVideoSlot(sessionId) {
        const videoWrapper = document.createElement("div");
        videoWrapper.classList.add("video-wrapper");
        videoWrapper.id = "wrapper-" + sessionId;

        const videoElement = document.createElement("video");
        videoElement.classList.add("memberVideo");
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.id = sessionId;

        const overlayElement = document.createElement("div");
        overlayElement.classList.add("overlay");
        overlayElement.style.width = "100%";
        overlayElement.style.height = "100%";
        overlayElement.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        overlayElement.style.border = "2px solid rgba(0, 0, 0, 0.8)";
        overlayElement.style.position = "absolute";
        overlayElement.style.display = "none";

        videoWrapper.appendChild(overlayElement);
        videoWrapper.appendChild(videoElement);

        memberVideosContainer.appendChild(videoWrapper);
        updateGrid();

        return { videoWrapper, videoElement };
    }

    window.createVideoSlot = createVideoSlot;
    window.updateGrid = updateGrid;
    window.addEventListener("resize", updateGrid);
});
