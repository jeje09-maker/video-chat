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

    // Room Generation Logic
    const generateBtn = document.getElementById('generate-btn');
    const roomInfo = document.getElementById('room-info');
    const roomCodeSpan = document.getElementById('room-code');
    const startBtn = document.getElementById('start-btn');
    let currentRoomCode = '';

    function generateShortCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    generateBtn.addEventListener('click', () => {
        currentRoomCode = generateShortCode();
        roomCodeSpan.textContent = currentRoomCode;
        generateBtn.classList.add('hidden');
        roomInfo.classList.remove('hidden');
    });

    startBtn.addEventListener('click', () => {
        if(currentRoomCode) {
            window.location.href = `/videoChat/${currentRoomCode}/manager`;
        }
    });

    // Copy to Clipboard Logic
    const copyBtn = document.getElementById('copy-btn');
    const toast = document.getElementById('toast');

    copyBtn.addEventListener('click', () => {
        const inviteLink = `${window.location.origin}/videoChat/${currentRoomCode}/member`;
        navigator.clipboard.writeText(inviteLink).then(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        });
    });

    // Join Room Logic
    const joinBtn = document.getElementById('join-btn');
    const joinCodeInput = document.getElementById('join-code-input');
    const joinError = document.getElementById('join-error');

    joinBtn.addEventListener('click', () => {
        const code = joinCodeInput.value.trim();
        if (code) {
            window.location.href = `/videoChat/${code}/member`;
        } else {
            joinError.classList.remove('hidden');
            setTimeout(() => {
                joinError.classList.add('hidden');
            }, 2000);
        }
    });

    // Enter key support for join
    joinCodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
});
