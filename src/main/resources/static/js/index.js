document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggle = document.getElementById('checkbox');
    const currentTheme = localStorage.getItem('theme') || 'light';

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.checked = true;
    }

    themeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    });

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target') + '-content';
            document.getElementById(targetId).classList.add('active');
        });
    });

    function generateShortCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    // Toast Helper
    const toast = document.getElementById('toast');
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Room Generation Logic (Immediate)
    const generateBtn = document.getElementById('generate-btn');
    const roomInfo = document.getElementById('room-info');
    const roomCodeSpan = document.getElementById('room-code');
    const startBtn = document.getElementById('start-btn');
    let currentRoomCode = '';

    if(generateBtn) {
        generateBtn.addEventListener('click', () => {
            currentRoomCode = generateShortCode();
            roomCodeSpan.textContent = currentRoomCode;
            generateBtn.classList.add('hidden');
            roomInfo.classList.remove('hidden');
        });
    }

    if(startBtn) {
        startBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('create-name-input');
            const name = nameInput ? nameInput.value.trim() : '';
            const createError = document.getElementById('create-error');
            
            if (currentRoomCode && name) {
                window.location.href = `/videoChat/${currentRoomCode}/manager?name=${encodeURIComponent(name)}`;
            } else if (!name) {
                if (createError) {
                    createError.classList.remove('hidden');
                    setTimeout(() => createError.classList.add('hidden'), 2000);
                }
            }
        });
    }

    const copyBtn = document.getElementById('copy-btn');
    if(copyBtn) {
        copyBtn.addEventListener('click', () => {
            const inviteLink = `${window.location.origin}/videoChat/${currentRoomCode}/member`;
            navigator.clipboard.writeText(inviteLink).then(() => {
                showToast('초대 링크가 복사되었습니다!');
            });
        });
    }

    // Schedule Room Logic (New Feature)
    const scheduleBtn = document.getElementById('schedule-btn');
    const scheduleInfo = document.getElementById('schedule-info');
    const scheduleLinkSpan = document.getElementById('schedule-link');
    let scheduledCode = '';

    if(scheduleBtn) {
        scheduleBtn.addEventListener('click', () => {
            const timeInput = document.getElementById('schedule-time').value;
            if(!timeInput) {
                alert("예약할 날짜와 시간을 먼저 선택해주세요.");
                return;
            }
            scheduledCode = generateShortCode();
            const inviteLink = `${window.location.origin}/videoChat/${scheduledCode}/member`;
            scheduleLinkSpan.textContent = inviteLink;
            scheduleBtn.classList.add('hidden');
            scheduleInfo.classList.remove('hidden');
        });
    }

    const copyScheduleBtn = document.getElementById('copy-schedule-btn');
    if(copyScheduleBtn) {
        copyScheduleBtn.addEventListener('click', () => {
            const inviteLink = `${window.location.origin}/videoChat/${scheduledCode}/member`;
            navigator.clipboard.writeText(inviteLink).then(() => {
                showToast('예약 링크가 클립보드에 복사되었습니다!');
            });
        });
    }

    // Join Room Logic
    const joinBtn = document.getElementById('join-btn');
    const joinCodeInput = document.getElementById('join-code-input');
    const joinError = document.getElementById('join-error');

    if(joinBtn) {
        joinBtn.addEventListener('click', () => {
            const code = joinCodeInput.value.trim();
            const nameInput = document.getElementById('join-name-input');
            const name = nameInput ? nameInput.value.trim() : '';
            
            if (code && name) {
                window.location.href = `/videoChat/${code}/member?name=${encodeURIComponent(name)}`;
            } else {
                joinError.textContent = "코드와 이름을 모두 입력해주세요!";
                joinError.classList.remove('hidden');
                setTimeout(() => joinError.classList.add('hidden'), 2000);
            }
        });
    }

    if(joinCodeInput) {
        joinCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('join-name-input').focus();
        });
    }

    const joinNameInput = document.getElementById('join-name-input');
    if(joinNameInput) {
        joinNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinBtn.click();
        });
    }
});
