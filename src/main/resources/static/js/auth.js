// Supabase API 키 설정 (추후 사용자 제공 키로 교체 예정)
const SUPABASE_URL = 'https://qhqgyipsvcsanghyvhau.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2SniaLTf89_tcZQJ-PmdZw_0XirZos3';

// Supabase 클라이언트 초기화
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAuthMode = 'login'; // 'login' | 'signup'

document.addEventListener('DOMContentLoaded', () => {
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
    const mypageProfileUrl = document.getElementById('mypage-profile-url');
    const mypageVideoOffSelect = document.getElementById('mypage-video-off-select');
    const mypageRoomCount = document.getElementById('mypage-room-count');

    // Auth Tabs
    const authTabLogin = document.getElementById('auth-tab-login');
    const authTabSignup = document.getElementById('auth-tab-signup');
    const pwdConfirmInput = document.getElementById('password-confirm-input');
    const emailActionBtn = document.getElementById('email-action-btn');
    const tabCreate = document.getElementById('tab-create');
    const tabSchedule = document.getElementById('tab-schedule');
    // 모달 제어
    function openModal(mode = 'login') {
        authModal.classList.remove('hidden');
        switchAuthTab(mode);
    }
    function closeModal() { authModal.classList.add('hidden'); }
    
    window.openModal = openModal;
    window.closeModal = closeModal;

    function showError(msg, isSuccess = false) {
        if(authError) {
            authError.textContent = msg;
            authError.style.color = isSuccess ? 'var(--success-color)' : 'var(--error-color)';
            authError.classList.remove('hidden');
        }
    }

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
                
                const { data, error } = await supabaseClient.auth.signUp({ 
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
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) showError(error.message);
            }
        });
    }

    // 소셜 로그인 공통 함수
    async function signInWithProvider(provider) {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({ 
            provider: provider,
            options: {
                redirectTo: window.location.origin
            }
        });
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
            await supabaseClient.auth.signOut();
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
            if(mypageProfileUrl) {
                const url = meta.avatar_url || meta.picture || '';
                mypageProfileUrl.value = url;
                const mypageProfilePreview = document.getElementById('mypage-profile-preview');
                if(mypageProfilePreview) mypageProfilePreview.src = url || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';
            }
            if(mypageVideoOffSelect) mypageVideoOffSelect.value = meta.video_off_mode || 'profile';
            
            if(mypageMessage) mypageMessage.classList.add('hidden');
            if(mypageModal) mypageModal.classList.remove('hidden');
        });
    }

    const mypageUploadBtn = document.getElementById('mypage-upload-btn');
    const mypageProfileUpload = document.getElementById('mypage-profile-upload');
    const mypageProfilePreview = document.getElementById('mypage-profile-preview');

    if (mypageUploadBtn && mypageProfileUpload) {
        mypageUploadBtn.addEventListener('click', () => {
            mypageProfileUpload.click();
        });

        mypageProfileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    canvas.width = 150;
                    canvas.height = 150;
                    
                    const minSize = Math.min(img.width, img.height);
                    const startX = (img.width - minSize) / 2;
                    const startY = (img.height - minSize) / 2;
                    
                    ctx.drawImage(img, startX, startY, minSize, minSize, 0, 0, 150, 150);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    if(mypageProfileUrl) mypageProfileUrl.value = dataUrl;
                    if(mypageProfilePreview) mypageProfilePreview.src = dataUrl;
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (mypageProfileUrl) {
        mypageProfileUrl.addEventListener('input', (e) => {
            if(mypageProfilePreview) {
                mypageProfilePreview.src = e.target.value || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';
            }
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
            const avatarUrl = mypageProfileUrl ? mypageProfileUrl.value : '';
            const videoOffMode = mypageVideoOffSelect ? mypageVideoOffSelect.value : 'profile';
            
            const { data, error } = await supabaseClient.auth.updateUser({
                data: { mic: mic, video: video, bg: bg, avatar_url: avatarUrl, video_off_mode: videoOffMode }
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

    async function updateUI() {
        const adminBtn = document.getElementById('nav-admin-btn');
        if (currentUser) {
            if(guestActions) guestActions.style.display = 'none';
            if(userProfile) userProfile.style.display = 'flex';
            if(userNameEl) {
                const meta = currentUser.user_metadata || {};
                const email = currentUser.email;
                userNameEl.textContent = meta.name || meta.full_name || (email ? email.split('@')[0] : '사용자');
                
                const profileImg = document.getElementById('nav-profile-img');
                if(profileImg) {
                    profileImg.src = meta.avatar_url || meta.picture || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png';
                }
            }
            // 관리자(수퍼관리자 포함)만 버튼 표시
            if (adminBtn) {
                try {
                    const emailToCheck = currentUser.email || '';
                    const res = await fetch(`/api/users/check-permission?email=${encodeURIComponent(emailToCheck)}`);
                    const data = await res.json();
                    adminBtn.style.display = data.isAdmin ? 'inline-block' : 'none';
                } catch(e) {
                    console.error('관리자 권한 확인 실패:', e);
                    adminBtn.style.display = 'none';
                }
            }
        } else {
            if(guestActions) guestActions.style.display = 'flex';
            if(userProfile) userProfile.style.display = 'none';
            if(userNameEl) userNameEl.textContent = '';
            if(adminBtn) adminBtn.style.display = 'none';
        }
    }

    async function syncUserToBackend(user) {
        if (!user || !user.email) return;
        const meta = user.user_metadata || {};
        const name = meta.name || meta.full_name || user.email.split('@')[0];
        try {
            await fetch('/api/users/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email, name: name })
            });
        } catch (e) {
            console.error("Backend sync failed", e);
        }
    }

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        currentUser = session ? session.user : null;
        if (event === 'SIGNED_IN') {
            closeModal();
            await syncUserToBackend(currentUser); // 백엔드 동기화 완료 후 UI 업데이트
        }
        await updateUI();
    });

    supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
        currentUser = session ? session.user : null;
        if (currentUser) {
            await syncUserToBackend(currentUser); // 백엔드 동기화 완료 후 UI 업데이트
        }
        await updateUI();
    });
});

// 마이페이지에서 설정된 값을 index.js에서 활용할 수 있도록 노출
window.getUserSettings = function() {
    if(!currentUser) return { mic: true, video: true, bg: 'none', video_off_mode: 'profile' };
    const meta = currentUser.user_metadata || {};
    return {
        mic: meta.mic !== false,
        video: meta.video !== false,
        bg: meta.bg || 'none',
        video_off_mode: meta.video_off_mode || 'profile',
        avatar_url: meta.avatar_url || meta.picture || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png'
    };
};

// 방 개설 시 카운트 증가 함수 노출
window.incrementRoomCount = async function() {
    if(!currentUser) return;
    const meta = currentUser.user_metadata || {};
    const count = (meta.room_count || 0) + 1;
    
    const { data } = await supabaseClient.auth.updateUser({
        data: { room_count: count }
    });
    if(data.user) currentUser = data.user;
};
