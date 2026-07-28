// Supabase API 키 설정 (추후 사용자 제공 키로 교체 예정)
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Supabase 클라이언트 초기화
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM 요소
const authModal = document.getElementById('auth-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const userProfile = document.getElementById('user-profile');
const userNameEl = document.getElementById('user-name');
const authError = document.getElementById('auth-error');
const navLoginBtn = document.getElementById('nav-login-btn');

let currentUser = null;

// 모달 제어
function openModal() { authModal.classList.remove('hidden'); }
function closeModal() { authModal.classList.add('hidden'); }

closeModalBtn.addEventListener('click', closeModal);
navLoginBtn.addEventListener('click', openModal);

// 방 만들기 탭 접근 제어
const tabCreate = document.getElementById('tab-create');
const tabSchedule = document.getElementById('tab-schedule');
const createUnauthMsg = document.getElementById('create-unauth-msg');
const createAuthSection = document.getElementById('create-auth-section');

tabCreate.addEventListener('click', (e) => {
    if (!currentUser) {
        e.preventDefault();
        openModal();
    }
});

tabSchedule.addEventListener('click', (e) => {
    if (!currentUser) {
        e.preventDefault();
        openModal();
    }
});

// 에러 메시지 표시
function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
    setTimeout(() => authError.classList.add('hidden'), 5000);
}

// UI 상태 업데이트
function updateUI(user) {
    currentUser = user;
    if (user) {
        // 로그인 상태
        navLoginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        
        // 이메일 또는 소셜 닉네임 표시
        const name = user.user_metadata?.name || user.email.split('@')[0];
        userNameEl.textContent = name;
        
        // 방 만들기 메뉴 활성화
        if(createAuthSection) createAuthSection.classList.remove('hidden');
        if(createUnauthMsg) createUnauthMsg.classList.add('hidden');
        
        closeModal();
    } else {
        // 로그아웃 상태
        navLoginBtn.classList.remove('hidden');
        userProfile.classList.add('hidden');
        
        // 방 만들기 메뉴 비활성화
        if(createAuthSection) createAuthSection.classList.add('hidden');
        if(createUnauthMsg) createUnauthMsg.classList.remove('hidden');
    }
}

// 초기 세션 확인
async function checkSession() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return;
    
    const { data: { session } } = await supabase.auth.getSession();
    updateUI(session?.user);

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUI(session?.user);
    });
}

// 이메일 로그인
document.getElementById('email-login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    
    if (!email || !password) return showError('이메일과 비밀번호를 입력해주세요.');
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showError(error.message);
});

// 이메일 회원가입
document.getElementById('email-signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    
    if (!email || !password) return showError('이메일과 비밀번호를 입력해주세요.');
    
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
        showError(error.message);
    } else {
        showError('회원가입 성공! 이메일을 확인하거나 로그인해주세요.', true);
        authError.style.color = 'var(--success-color)';
    }
});

// 소셜 로그인 공통 함수
async function signInWithProvider(provider) {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        return showError('Supabase 세팅이 아직 완료되지 않았습니다.');
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider });
    if (error) showError(error.message);
}

document.getElementById('google-login-btn').addEventListener('click', () => signInWithProvider('google'));
document.getElementById('kakao-login-btn').addEventListener('click', () => signInWithProvider('kakao'));

// 로그아웃
document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
});

// 비회원이 로그인 버튼 클릭
if(document.getElementById('back-to-login-btn')) {
    document.getElementById('back-to-login-btn').addEventListener('click', openModal);
}

checkSession();
