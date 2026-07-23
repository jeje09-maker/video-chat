document.addEventListener("DOMContentLoaded", function () {
    const toggleMemberListPanelBtn = document.getElementById("toggleMemberListPanel");
    const closeMemberListPanelBtn = document.getElementById("closeMemberListPanel");
    const memberListPanel = document.getElementById("memberListPanel");

    // 현재 접속 중인 멤버 리스트 (전역 변수)
    window.members = [];

    // 멤버 목록을 화면에 표시하는 함수
    window.updateMemberList = function () {
        const memberList = document.getElementById("memberList");
        memberList.innerHTML = "";
        window.members.forEach(member => {
            const li = document.createElement("li");
            
            // 이름 표시 (userNames 맵핑 활용)
            const nameSpan = document.createElement("span");
            nameSpan.textContent = window.userNames && window.userNames[member] ? window.userNames[member] : member;
            nameSpan.style.flexGrow = "1";
            nameSpan.style.whiteSpace = "nowrap";
            nameSpan.style.overflow = "hidden";
            nameSpan.style.textOverflow = "ellipsis";
            li.appendChild(nameSpan);

            // 방장인 경우에만 버튼 표시
            if (myType === 'manager') {
                const btnContainer = document.createElement("div");
                btnContainer.style.display = "flex";
                btnContainer.style.gap = "6px";

                // 본인이 아닌 경우에만 강퇴/새로고침 버튼 표시
                if (member !== window.mySessionId) {
                    const kickButton = document.createElement("button");
                    kickButton.textContent = "강퇴";
                    kickButton.className = "member-action-btn kick-btn";
                    kickButton.addEventListener("click", () => kickMember(member));

                    const refreshButton = document.createElement("button");
                    refreshButton.textContent = "새로고침";
                    refreshButton.className = "member-action-btn refresh-btn";
                    refreshButton.addEventListener("click", () => refreshMember(member));

                    btnContainer.appendChild(refreshButton);
                    btnContainer.appendChild(kickButton);
                }
                
                li.appendChild(btnContainer);
            }

            memberList.appendChild(li);
        });
    };

    // 멤버 강퇴하기
    function kickMember(sessionId) {

        if (confirm(`[${sessionId}]님을 강퇴하시겠습니까?`)) {
            socket.send(JSON.stringify({
                event: 'kick',
                sessionId: mySessionId,
                recipientSessionId: sessionId
            }));
        }

        clearVideoBorders();
    }

    // 멤버 강제 새로고침
    function refreshMember(sessionId) {

        if (confirm(`[${sessionId}]님의 화면을 새로고침 하시겠습니까?`)) {
            socket.send(JSON.stringify({
                event: 'refresh',
                sessionId: mySessionId,
                recipientSessionId: sessionId
            }));
        }

        clearVideoBorders();
    }

    // 'memberVideo' 클래스를 가진 모든 video 태그의 테두리 스타일을 초기화하는 함수
    function clearVideoBorders() {
        setTimeout(function() {
            let videos = document.querySelectorAll('.memberVideo');
            videos.forEach(video => {
                video.style.border = '';
                video.style.position = '';
                video.style.zIndex = '';
            });
        }, 100);
    }

    // 버튼 클릭 시 패널 열고 닫기 (toggle)
    toggleMemberListPanelBtn.addEventListener("click", function () {
        memberListPanel.classList.toggle("show");
    });

    // 닫기 버튼 클릭 시 패널 숨기기
    closeMemberListPanelBtn.addEventListener("click", function () {
        memberListPanel.classList.remove("show");
    });
});
