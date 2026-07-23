document.addEventListener("DOMContentLoaded", function () {
    const memberVideosContainer = document.getElementById("memberVideosContainer");
    const videoContainer = document.getElementById("videoContainer");

    function updateGrid() {
        const isSpeaker = document.body.classList.contains('layout-speaker');
        const currentSlots = memberVideosContainer.children.length;
        
        if (isSpeaker) {
            // 발표자 모드에서는 멤버 패널 내부의 단순 세로 배치
            videoContainer.style.gridTemplateColumns = '';
            videoContainer.style.gridTemplateRows = '';
            
            memberVideosContainer.style.gridTemplateColumns = '1fr';
            memberVideosContainer.style.gridTemplateRows = `repeat(${currentSlots}, minmax(150px, auto))`;
        } else {
            // 타일 모드에서는 전체 컨테이너가 그리드
            memberVideosContainer.style.gridTemplateColumns = '';
            memberVideosContainer.style.gridTemplateRows = '';

            const totalParticipants = currentSlots + 1; // 멤버들 + 방장(1명)
            let columns = 1;
            let rows = 1;

            if (totalParticipants === 1) { columns = 1; rows = 1; }
            else if (totalParticipants === 2) {
                if (window.innerHeight > window.innerWidth) {
                    columns = 1; rows = 2;
                } else {
                    columns = 2; rows = 1;
                }
            }
            else if (totalParticipants === 3 || totalParticipants === 4) { columns = 2; rows = 2; }
            else if (totalParticipants === 5 || totalParticipants === 6) { columns = 3; rows = 2; }
            else if (totalParticipants >= 7 && totalParticipants <= 9) { columns = 3; rows = 3; }
            else { columns = 4; rows = 3; } // 10명 이상

            videoContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
            videoContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        }
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
