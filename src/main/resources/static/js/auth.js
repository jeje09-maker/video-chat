// Supabase API 키 설정 (추후 사용자 제공 키로 교체 예정)
const SUPABASE_URL = 'https://qhqgyipsvcsanghyvhau.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2SniaLTf89_tcZQJ-PmdZw_0XirZos3';

// Supabase 클라이언트 초기화
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM 요소
const authModal = document.getElementById('auth-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const userProfile = document.getElementById('user-profile');
const userNameEl = document.getElementById('user-name');
const authError = document.getElementById('auth-error');
const guestActions = document.getElementById('guest-actions');
const navLoginBtn = document.getElementById('nav-login-btn');
const navSignupBtn = document.getElementById('nav-signup-btn');

// 마이페이지 DOM
const mypageTrigger = document.getElementById('mypage-trigger');
const mypageModal = document.getElementById('mypage-modal');
const closeMypageBtn = document.getElementById('close-mypage-btn');
const mypageSaveBtn = document.getElementById('mypage-save-btn');
const mypageMessage = document.getElementById('mypage-message');
const mypageMicToggle = document.getElementById('mypage-mic-toggle');
const mypageVideoToggle = document.getElementById('mypage-video-toggle');
const mypageBgSelect = document.getElementById('mypage-bg-select');
const mypageRoomCount = document.getElementById('mypage-room-count');

// Auth Tabs
const authTabLogin = document.getElementById('auth-tab-login');
const authTabSignup = document.getElementById('auth-tab-signup');
const pwdConfirmInput = document.getElementById('password-confirm-input');
const emailActionBtn = document.getElementById('email-action-btn');

let currentUser = null;
let currentAuthMode = 'login'; // 'login' | 'signup'

document.addEventListener('DOMContentLoaded', () => {
    // 모달 제어
    function openModal(mode = 'login') {
        authModal.classList.remove('hidden');
        switchAuthTab(mode);
    }
    function closeModal() { authModal.classList.add('hidden'); }

    if(closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if(navLoginBtn) navLoginBtn.addEventListener('click', () => openModal('login'));
    if(navSignupBtn) navSignupBtn.addEventListener('click', () => openModal('signup'));
    
    // Auth 탭 전환 로직
    function switchAuthTab(mode) {
        currentAuthMode = mode;
        if(authError) authError.classList.add('hidden');
        
        if (mode === 'login') {
            if(authTabLogin) authTabLogin.classList.add('active');
            if(authTabSignup) authTabSignup.classList.remove('active');
            if(pwdConfirmInput) pwdConfirmInput.classList.add('hidden');
            if(emailActionBtn) emailActionBtn.textContent = '로그인';
        } else {
            if(authTabSignup) authTabSignup.classList.add('active');
            if(authTabLogin) authTabLogin.classList.remove('active');
            if(pwdConfirmInput) pwdConfirmInput.classList.remove('hidden');
            if(emailActionBtn) emailActionBtn.textContent = '회원가입';
        }
    }
    if(authTabLogin) authTabLogin.addEventListener('click', () => switchAuthTab('login'));
    if(authTabSignup) authTabSignup.addEventListener('click', () => switchAuthTab('signup'));

    // 방 만들기 탭 접근 제어
    if(tabCreate) {
        tabCreate.addEventListener('click', (e) => {
            if (!currentUser) {
                e.preventDefault();
                openModal('signup');
            }
        });
    }
    if(tabSchedule) {
        tabSchedule.addEventListener('click', (e) => {
            if (!currentUser) {
                e.preventDefault();
                openModal('login');
            }
        });
    }

    // 이메일 액션 (로그인/가입)
    if(emailActionBtn) {
        emailActionBtn.addEventListener('click', async () => {
            const email = document.getElementById('email-input').value;
            const password = document.getElementById('password-input').value;
            const passwordConfirm = pwdConfirmInput ? pwdConfirmInput.value : '';
            
            if (!email || !password) return showError('이메일과 비밀번호를 입력해주세요.');
            
            if (currentAuthMode === 'signup') {
                if (password !== passwordConfirm) return showError('비밀번호가 일치하지 않습니다.');
                
                const { data, error } = await supabase.auth.signUp({ 
                    email, 
                    password,
                    options: {
                        data: { mic: true, video: true, bg: 'none', room_count: 0 } // 초기 세팅
                    }
                });
                
                if (error) {
                    showError(error.message);
                } else {
                    showError('가입이 완료되었습니다!', true);
                    setTimeout(() => switchAuthTab('login'), 1500);
                }
            } else {
                // 로그인
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) showError(error.message);
            }
        });
    }

    // 소셜 로그인 공통 함수
    async function signInWithProvider(provider) {
        const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider });
        if (error) showError(error.message);
    }

    const googleBtn = document.getElementById('google-login-btn');
    const kakaoBtn = document.getElementById('kakao-login-btn');
    if(googleBtn) googleBtn.addEventListener('click', () => signInWithProvider('google'));
    if(kakaoBtn) kakaoBtn.addEventListener('click', () => signInWithProvider('kakao'));

    // 로그아웃
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
        });
    }

    // ----------------------------------------
    // 마이페이지 (user_metadata)
    // ----------------------------------------
    if(mypageTrigger) {
        mypageTrigger.addEventListener('click', async () => {
            if (!currentUser) return;
            
            const meta = currentUser.user_metadata || {};
            const roomCount = meta.room_count || 0;
            
            if(mypageRoomCount) mypageRoomCount.textContent = `${roomCount}회`;
            if(mypageMicToggle) mypageMicToggle.checked = meta.mic !== false;
            if(mypageVideoToggle) mypageVideoToggle.checked = meta.video !== false;
            if(mypageBgSelect) mypageBgSelect.value = meta.bg || 'none';
            
            if(mypageMessage) mypageMessage.classList.add('hidden');
            if(mypageModal) mypageModal.classList.remove('hidden');
        });
    }

    if(closeMypageBtn) {
        closeMypageBtn.addEventListener('click', () => {
            if(mypageModal) mypageModal.classList.add('hidden');
        });
    }

    if(mypageSaveBtn) {
        mypageSaveBtn.addEventListener('click', async () => {
            const mic = mypageMicToggle ? mypageMicToggle.checked : true;
            const video = mypageVideoToggle ? mypageVideoToggle.checked : true;
            const bg = mypageBgSelect ? mypageBgSelect.value : 'none';
            
            const { data, error } = await supabase.auth.updateUser({
                data: { mic: mic, video: video, bg: bg }
            });
            
            if (error) {
                if(mypageMessage) {
                    mypageMessage.textContent = error.message;
                    mypageMessage.style.color = 'var(--error-color)';
                }
            } else {
                currentUser = data.user;
                if(mypageMessage) {
                    mypageMessage.textContent = '설정이 저장되었습니다.';
                    mypageMessage.style.color = 'var(--success-color)';
                }
                setTimeout(() => { if(mypageModal) mypageModal.classList.add('hidden'); }, 1000);
            }
            if(mypageMessage) mypageMessage.classList.remove('hidden');
        });
    }
});

// 마이페이지에서 설정된 값을 index.js에서 활용할 수 있도록 노출
window.getUserSettings = function() {
    if(!currentUser) return { mic: true, video: true, bg: 'none' };
    const meta = currentUser.user_metadata || {};
    return {
        mic: meta.mic !== false,
        video: meta.video !== false,
        bg: meta.bg || 'none'
    };
};

// 방 개설 시 카운트 증가 함수 노출
window.incrementRoomCount = async function() {
    if(!currentUser) return;
    const meta = currentUser.user_metadata || {};
    const count = (meta.room_count || 0) + 1;
    
    const { data } = await supabase.auth.updateUser({
        data: { room_count: count }
    });
    if(data.user) currentUser = data.user;
};
