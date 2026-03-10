// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// State Management
let currentUser = null; // { role: 'student'|'teacher', id: number, name: string, email: string }
let currentSessionId = null;
let currentQuizState = {
    sessionId: null,
    totalQuestions: 5,
    currentQuestion: 1,
    score: 0,
    active: false
};

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    checkHealth();
    checkStoredUser();
});

function initializeApp() {
    updateTimestamps();
}

function setupEventListeners() {
    // Auth tabs
    document.getElementById('studentLoginTab').addEventListener('click', () => switchAuthTab('studentLogin'));
    document.getElementById('studentSignupTab').addEventListener('click', () => switchAuthTab('studentSignup'));
    document.getElementById('teacherLoginTab').addEventListener('click', () => switchAuthTab('teacherLogin'));

    // Auth buttons
    document.getElementById('studentLoginBtn').addEventListener('click', handleStudentLogin);
    document.getElementById('studentSignupBtn').addEventListener('click', handleStudentSignup);
    document.getElementById('teacherLoginBtn').addEventListener('click', handleTeacherLogin);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Quiz mode
    document.getElementById('startQuizBtn').addEventListener('click', startQuizSession);
    document.getElementById('submitAnswerBtn').addEventListener('click', submitAnswer);
    document.getElementById('skipQuestionBtn').addEventListener('click', skipQuestion);
    document.getElementById('endQuizBtn').addEventListener('click', endQuizSession);

    // Teacher dashboard refresh
    document.getElementById('refreshStruggling').addEventListener('click', loadStrugglingStudents);
    document.getElementById('threshold').addEventListener('change', loadStrugglingStudents);
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    if (tab === 'studentLogin') {
        document.getElementById('studentLoginTab').classList.add('active');
        document.getElementById('studentLoginForm').classList.add('active');
    } else if (tab === 'studentSignup') {
        document.getElementById('studentSignupTab').classList.add('active');
        document.getElementById('studentSignupForm').classList.add('active');
    } else {
        document.getElementById('teacherLoginTab').classList.add('active');
        document.getElementById('teacherLoginForm').classList.add('active');
    }
}

function checkStoredUser() {
    const saved = localStorage.getItem('user');
    if (saved) {
        currentUser = JSON.parse(saved);
        if (currentUser.role === 'student') {
            document.getElementById('studentSignupName').value = currentUser.name || '';
            document.getElementById('studentSignupEmail').value = currentUser.email || '';
            document.getElementById('studentLoginEmail').value = currentUser.email || '';
        }
        hideAuthModal();
        setupUIForRole();
    } else {
        showAuthModal();
    }
}

function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'none';
}

function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'block';
}

function handleLogout() {
    localStorage.removeItem('user');
    currentUser = null;
    currentSessionId = null;
    currentQuizState = {
        sessionId: null,
        totalQuestions: 5,
        currentQuestion: 1,
        score: 0,
        active: false
    };
    window.currentQuestionData = null;
    
    // Reset UI
    document.getElementById('quizSetup').style.display = 'block';
    document.getElementById('activeQuiz').style.display = 'none';
    document.getElementById('quizResults').style.display = 'none';
    
    showAuthModal();
    showToast('Logged out successfully', 'success');
}

// ============= STUDENT AUTH =============
async function handleStudentLogin() {
    const email = document.getElementById('studentLoginEmail').value.trim();
    if (!email) {
        showToast('Please enter your email', 'warning');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'User', email })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Login failed');
        currentUser = {
            role: 'student',
            id: data.student_id,
            name: '',
            email: email
        };
        localStorage.setItem('user', JSON.stringify(currentUser));
        hideAuthModal();
        showToast('Login successful!', 'success');
        setupUIForRole();
    } catch (error) {
        showToast('Login failed: ' + error.message, 'error');
    }
}

async function handleStudentSignup() {
    const name = document.getElementById('studentSignupName').value.trim();
    const email = document.getElementById('studentSignupEmail').value.trim();
    if (!name || !email) {
        showToast('Please enter name and email', 'warning');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/student/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Signup failed');
        currentUser = {
            role: 'student',
            id: data.student_id,
            name: name,
            email: email
        };
        localStorage.setItem('user', JSON.stringify(currentUser));
        hideAuthModal();
        showToast('Account created! Welcome!', 'success');
        setupUIForRole();
    } catch (error) {
        showToast('Signup failed: ' + error.message, 'error');
    }
}

// ============= TEACHER AUTH =============
async function handleTeacherLogin() {
    const email = document.getElementById('teacherEmail').value.trim();
    const password = document.getElementById('teacherPassword').value.trim();
    if (!email || !password) {
        showToast('Please enter email and password', 'warning');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Login failed');
        currentUser = {
            role: 'teacher',
            id: data.teacher_id,
            name: data.name,
            email: email
        };
        localStorage.setItem('user', JSON.stringify(currentUser));
        hideAuthModal();
        showToast('Teacher login successful!', 'success');
        setupUIForRole();
        loadTeacherDashboard();
    } catch (error) {
        showToast('Login failed: ' + error.message, 'error');
    }
}

// ============= UI SETUP BASED ON ROLE =============
function setupUIForRole() {
    const modeSelector = document.getElementById('modeSelector');
    if (currentUser.role === 'student') {
        // Show student modes: Progress and Quiz
        modeSelector.innerHTML = `
            <button class="mode-btn active" data-mode="progress" id="progressModeBtn">
                <i class="fas fa-chart-line"></i> <span>Student Progress</span>
            </button>
            <button class="mode-btn" data-mode="quiz" id="quizModeBtn">
                <i class="fas fa-graduation-cap"></i> <span>Teacher Quiz</span>
            </button>
        `;
        document.getElementById('progressModeBtn').addEventListener('click', () => switchMode('progress'));
        document.getElementById('quizModeBtn').addEventListener('click', () => switchMode('quiz'));
        switchMode('progress');
        loadStudentProgress();
    } else {
        // Teacher mode: only Teacher Dashboard
        modeSelector.innerHTML = `
            <button class="mode-btn active" data-mode="teacherDashboard" id="teacherDashboardBtn">
                <i class="fas fa-chalkboard"></i> <span>Teacher Dashboard</span>
            </button>
        `;
        document.getElementById('teacherDashboardBtn').addEventListener('click', () => switchMode('teacherDashboard'));
        switchMode('teacherDashboard');
    }
}

function switchMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mode-panel').forEach(panel => panel.classList.remove('active'));
    if (mode === 'progress') {
        document.getElementById('progressModeBtn').classList.add('active');
        document.getElementById('progressMode').classList.add('active');
    } else if (mode === 'quiz') {
        document.getElementById('quizModeBtn').classList.add('active');
        document.getElementById('quizMode').classList.add('active');
    } else if (mode === 'teacherDashboard') {
        document.getElementById('teacherDashboardBtn').classList.add('active');
        document.getElementById('teacherDashboardMode').classList.add('active');
    }
}

// ============= STUDENT PROGRESS =============
async function loadStudentProgress() {
    if (!currentUser || currentUser.role !== 'student') return;
    const studentId = currentUser.id;
    const loadingEl = document.getElementById('progressLoading');
    const contentEl = document.getElementById('progressContent');
    const emptyEl = document.getElementById('progressEmpty');
    
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    emptyEl.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/student/progress/${studentId}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        loadingEl.style.display = 'none';
        
        if (data.progress.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }
        
        let html = `<table class="progress-table"><thead><tr><th>Topic</th><th>Questions</th><th>Correct</th><th>Score</th></tr></thead><tbody>`;
        data.progress.forEach(item => {
            let scoreClass = 'score-low';
            if (item.average_score >= 80) scoreClass = 'score-high';
            else if (item.average_score >= 60) scoreClass = 'score-medium';
            html += `<tr><td>${item.topic || 'General'}</td><td>${item.total_questions}</td><td>${item.correct_answers}</td><td><span class="score-badge ${scoreClass}">${item.average_score.toFixed(1)}%</span></td></tr>`;
        });
        html += `</tbody></table>`;
        contentEl.innerHTML = html;
        contentEl.style.display = 'block';
    } catch (error) {
        console.error('Error loading progress:', error);
        loadingEl.style.display = 'none';
        showToast('Failed to load progress data', 'error');
    }
}

// ============= TEACHER DASHBOARD =============
async function loadTeacherDashboard() {
    await loadStrugglingStudents();
    await loadHardestTopic();
}

async function loadStrugglingStudents() {
    const threshold = document.getElementById('threshold').value || 50;
    const loading = document.getElementById('strugglingLoading');
    const content = document.getElementById('strugglingContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/struggling-students?threshold=${threshold}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        loading.style.display = 'none';
        
        if (data.students.length === 0) {
            content.innerHTML = '<p>No struggling students found.</p>';
            return;
        }
        
        let html = `<table class="struggling-table"><thead><tr><th>Name</th><th>Email</th><th>Avg Score</th></tr></thead><tbody>`;
        data.students.forEach(s => {
            html += `<tr><td>${s.name || 'N/A'}</td><td>${s.email}</td><td><span class="score-badge score-low">${s.overall_avg.toFixed(1)}%</span></td></tr>`;
        });
        html += `</tbody></table>`;
        content.innerHTML = html;
    } catch (error) {
        console.error('Error loading struggling students:', error);
        loading.style.display = 'none';
        content.innerHTML = '<p class="error">Failed to load data.</p>';
    }
}

async function loadHardestTopic() {
    const loading = document.getElementById('hardestLoading');
    const content = document.getElementById('hardestContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/hardest-topic`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        loading.style.display = 'none';
        
        if (!data || !data.topic) {
            content.innerHTML = '<p>No topic data available.</p>';
            return;
        }
        
        content.innerHTML = `
            <div class="hardest-topic-result">
                <div class="topic">${data.topic}</div>
                <div class="score">${data.avg_score.toFixed(1)}%</div>
                <p>average score</p>
            </div>
        `;
    } catch (error) {
        console.error('Error loading hardest topic:', error);
        loading.style.display = 'none';
        content.innerHTML = '<p class="error">Failed to load data.</p>';
    }
}

// ============= QUIZ MODE =============
async function startQuizSession() {
    if (!currentUser || currentUser.role !== 'student') {
        showToast('Please log in as a student', 'warning');
        handleLogout();
        return;
    }
    const numQuestions = document.getElementById('numQuestions').value;
    const subjectSelect = document.getElementById('subjectSelect');
    const topic = subjectSelect.value;
    const loadingId = showLoading('Starting quiz session...');
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_id: currentUser.id,
                num_questions: parseInt(numQuestions),
                topic: topic || null
            })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        currentSessionId = data.session_id;
        currentQuizState = {
            sessionId: data.session_id,
            totalQuestions: data.total_questions,
            currentQuestion: 1,
            score: 0,
            active: true
        };
        document.getElementById('quizSetup').style.display = 'none';
        document.getElementById('activeQuiz').style.display = 'block';
        document.getElementById('quizResults').style.display = 'none';
        document.getElementById('totalQuestions').textContent = data.total_questions;
        document.getElementById('currentScore').textContent = '0';
        updateQuizProgress();
        await getNextQuestion();
        removeLoading(loadingId);
        showToast('Quiz started! Good luck!', 'success');
    } catch (error) {
        console.error('Error starting quiz:', error);
        removeLoading(loadingId);
        showToast('Failed to start quiz. Please try again.', 'error');
    }
}

async function getNextQuestion() {
    if (!currentSessionId) return;
    const loadingId = showLoading('Loading next question...');
    hideNextQuestionButton();
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/next/${currentSessionId}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        document.getElementById('questionText').textContent = data.question;
        document.getElementById('questionSource').querySelector('span').textContent = data.source;
        document.getElementById('currentQuestionNum').textContent = data.question_number;
        window.currentQuestionData = data;
        document.getElementById('answerInput').value = '';
        document.getElementById('feedbackCard').style.display = 'none';
        document.getElementById('answerInput').disabled = false;
        document.getElementById('submitAnswerBtn').disabled = false;
        document.getElementById('skipQuestionBtn').disabled = false;
        removeLoading(loadingId);
    } catch (error) {
        console.error('Error getting next question:', error);
        removeLoading(loadingId);
        showToast('Failed to load question. Please try again.', 'error');
    }
}

async function submitAnswer() {
    const answer = document.getElementById('answerInput').value.trim();
    if (!answer) {
        showToast('Please enter an answer', 'warning');
        return;
    }
    if (!currentSessionId || !window.currentQuestionData) {
        showToast('No active question', 'error');
        return;
    }
    document.getElementById('submitAnswerBtn').disabled = true;
    document.getElementById('skipQuestionBtn').disabled = true;
    const loadingId = showLoading('Checking your answer...');
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_answer: answer
            })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        currentQuizState.score = data.score;
        document.getElementById('currentScore').textContent = data.score;
        currentQuizState.currentQuestion = data.question_number;
        updateQuizProgress();
        showFeedback(data);
        showNextQuestionButton();
        removeLoading(loadingId);
    } catch (error) {
        console.error('Error submitting answer:', error);
        removeLoading(loadingId);
        showToast('Failed to submit answer. Please try again.', 'error');
        document.getElementById('submitAnswerBtn').disabled = false;
        document.getElementById('skipQuestionBtn').disabled = false;
    }
}

async function skipQuestion() {
    if (!currentSessionId || !window.currentQuestionData) {
        showToast('No active question', 'error');
        return;
    }
    document.getElementById('submitAnswerBtn').disabled = true;
    document.getElementById('skipQuestionBtn').disabled = true;
    const loadingId = showLoading('Skipping question...');
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_answer: "I don't know"
            })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        currentQuizState.score = data.score;
        document.getElementById('currentScore').textContent = data.score;
        currentQuizState.currentQuestion = data.question_number;
        updateQuizProgress();
        showFeedback(data);
        showNextQuestionButton();
        removeLoading(loadingId);
    } catch (error) {
        console.error('Error skipping question:', error);
        removeLoading(loadingId);
        showToast('Failed to skip question. Please try again.', 'error');
        document.getElementById('submitAnswerBtn').disabled = false;
        document.getElementById('skipQuestionBtn').disabled = false;
    }
}

function showFeedback(data) {
    const feedbackCard = document.getElementById('feedbackCard');
    feedbackCard.className = `feedback-card ${data.correct ? 'correct' : 'incorrect'}`;
    let feedbackHTML = `
        <div class="feedback-header ${data.correct ? 'correct' : 'incorrect'}">
            <i class="fas ${data.correct ? 'fa-check-circle' : 'fa-times-circle'}"></i>
            <span>${data.correct ? 'Correct!' : 'Not quite right'}</span>
        </div>
    `;
    if (!data.correct) {
        feedbackHTML += `
            <div class="correct-answer">
                <strong>Correct answer:</strong> ${data.correct_answer}
            </div>
        `;
    }
    feedbackHTML += `<div class="feedback-text">${data.feedback}</div>`;
    feedbackCard.innerHTML = feedbackHTML;
    feedbackCard.style.display = 'block';
    feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('answerInput').disabled = true;
    document.getElementById('submitAnswerBtn').disabled = true;
    document.getElementById('skipQuestionBtn').disabled = true;
    if (currentQuizState.currentQuestion >= currentQuizState.totalQuestions) {
        setTimeout(() => showEndSessionButton(), 500);
    } else {
        showNextQuestionButton();
    }
}

function showNextQuestionButton() {
    const container = document.getElementById('nextQuestionContainer');
    if (container) {
        container.style.display = 'block';
        const btn = document.getElementById('nextQuestionBtn');
        if (btn) {
            btn.removeEventListener('click', handleNextQuestion);
            btn.addEventListener('click', handleNextQuestion);
        }
    }
}

function hideNextQuestionButton() {
    document.getElementById('nextQuestionContainer').style.display = 'none';
}

async function handleNextQuestion() {
    hideNextQuestionButton();
    document.getElementById('feedbackCard').style.display = 'none';
    document.getElementById('answerInput').disabled = false;
    document.getElementById('answerInput').value = '';
    document.getElementById('submitAnswerBtn').disabled = false;
    document.getElementById('skipQuestionBtn').disabled = false;
    await getNextQuestion();
}

function showEndSessionButton() {
    const container = document.getElementById('nextQuestionContainer');
    if (container) {
        container.innerHTML = `
            <button id="endQuizAfterLastBtn" class="danger-btn">
                <i class="fas fa-check-circle"></i>
                See Results
            </button>
        `;
        container.style.display = 'block';
        document.getElementById('endQuizAfterLastBtn').addEventListener('click', endQuizSession);
    }
}

function updateQuizProgress() {
    const progress = (currentQuizState.currentQuestion / currentQuizState.totalQuestions) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

async function endQuizSession() {
    if (!currentSessionId) {
        resetQuiz();
        return;
    }
    const loadingId = showLoading('Calculating your results...');
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/end/${currentSessionId}`, { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        showQuizResults(data);
        currentSessionId = null;
        window.currentQuestionData = null;
        removeLoading(loadingId);
    } catch (error) {
        console.error('Error ending quiz:', error);
        removeLoading(loadingId);
        showQuizResults({
            final_score: currentQuizState.score,
            total_questions: currentQuizState.totalQuestions,
            percentage: (currentQuizState.score / currentQuizState.totalQuestions) * 100,
            encouragement: "Great effort! Keep learning!"
        });
    }
}

function showQuizResults(data) {
    document.getElementById('activeQuiz').style.display = 'none';
    document.getElementById('quizResults').style.display = 'block';
    const percentage = data.percentage || (data.final_score / data.total_questions * 100);
    const score = data.final_score || data.score;
    const total = data.total_questions || data.total;
    let circleColor = '#ef4444';
    if (percentage >= 80) circleColor = '#10b981';
    else if (percentage >= 60) circleColor = '#f59e0b';
    else if (percentage >= 40) circleColor = '#6366f1';
    const resultsHTML = `
        <div class="results-card">
            <h2>Quiz Complete! 🎓</h2>
            <div class="score-circle">
                <svg width="150" height="150">
                    <circle cx="75" cy="75" r="70" fill="none" stroke="#e5e7eb" stroke-width="10" />
                    <circle cx="75" cy="75" r="70" fill="none" stroke="${circleColor}" stroke-width="10"
                        stroke-linecap="round"
                        stroke-dasharray="${2 * Math.PI * 70}"
                        stroke-dashoffset="${2 * Math.PI * 70 * (1 - percentage / 100)}"
                        transform="rotate(-90 75 75)" />
                </svg>
                <div class="score-text">${Math.round(percentage)}%</div>
            </div>
            <div class="score-details">
                <h3>${score}/${total} correct</h3>
                <p class="encouragement">${data.encouragement || getEncouragementMessage(percentage)}</p>
            </div>
            <div class="results-actions">
                <button class="primary-btn" id="newQuizBtn"><i class="fas fa-redo"></i> New Quiz</button>
                <button class="secondary-btn" id="shareResultsBtn"><i class="fas fa-share"></i> Share Results</button>
            </div>
        </div>
    `;
    document.getElementById('quizResults').innerHTML = resultsHTML;
    document.getElementById('newQuizBtn').addEventListener('click', resetQuiz);
    document.getElementById('shareResultsBtn').addEventListener('click', shareResults);
}

function getEncouragementMessage(percentage) {
    if (percentage >= 90) return "🏆 Outstanding! You're a star student!";
    if (percentage >= 80) return "🌟 Excellent work! You really know your stuff!";
    if (percentage >= 70) return "📚 Great job! Keep up the good work!";
    if (percentage >= 60) return "👍 Good effort! Practice makes perfect!";
    if (percentage >= 50) return "💪 You're making progress! Keep learning!";
    return "🌱 Every mistake is a chance to learn. Try again!";
}

function resetQuiz() {
    document.getElementById('quizSetup').style.display = 'block';
    document.getElementById('activeQuiz').style.display = 'none';
    document.getElementById('quizResults').style.display = 'none';
    currentSessionId = null;
    currentQuizState = {
        sessionId: null,
        totalQuestions: 5,
        currentQuestion: 1,
        score: 0,
        active: false
    };
    window.currentQuestionData = null;
    document.getElementById('numQuestions').value = 5;
    document.getElementById('subjectSelect').value = '';
}

function shareResults() {
    const score = currentQuizState.score;
    const total = currentQuizState.totalQuestions;
    const percentage = Math.round((score / total) * 100);
    const shareText = `I scored ${score}/${total} (${percentage}%) on my AI Learning System quiz! 🎓`;
    if (navigator.share) {
        navigator.share({ title: 'My Quiz Results', text: shareText, url: window.location.href })
            .catch(() => copyToClipboard(shareText));
    } else {
        copyToClipboard(shareText);
    }
}

// ============= UTILITY FUNCTIONS =============

function showLoading(message) {
    const id = 'loading-' + Date.now();
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast loading';
    toast.innerHTML = `<div class="spinner"></div><span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    return id;
}

function removeLoading(id) {
    const toast = document.getElementById(id);
    if (toast) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }
}

function showToast(message, type = 'info') {
    const id = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = `toast ${type}`;
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Results copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Could not copy to clipboard', 'error');
    });
}

function updateTimestamps() {
    const now = new Date();
    document.querySelectorAll('.timestamp').forEach(el => {
        el.textContent = now.toLocaleTimeString();
    });
}

async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            const data = await response.json();
            document.getElementById('docCount').textContent = data.documents_count || '?';
            document.getElementById('connectionStatus').className = 'status-badge';
        } else {
            throw new Error('Health check failed');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        document.getElementById('connectionStatus').className = 'status-badge offline';
        document.getElementById('connectionStatus').querySelector('span').textContent = 'Disconnected';
        document.getElementById('connectionStatus').querySelector('i').style.color = '#ef4444';
        showToast('Cannot connect to server. Please check if backend is running.', 'error');
    }
}