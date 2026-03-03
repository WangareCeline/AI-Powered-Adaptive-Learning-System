// API Configuration
const API_BASE_URL = 'http://localhost:8000'; // Change this to your backend URL

// State Management
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
});

function initializeApp() {
    // Set current date for any time displays
    updateTimestamps();
    
    // Load any saved state
    loadSavedState();
}

function setupEventListeners() {
    // Mode switching
    document.getElementById('askModeBtn').addEventListener('click', () => switchMode('ask'));
    document.getElementById('quizModeBtn').addEventListener('click', () => switchMode('quiz'));
    
    // Ask mode
    document.getElementById('askButton').addEventListener('click', askQuestion);
    document.getElementById('questionInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askQuestion();
        }
    });
    
    // Quiz mode
    document.getElementById('startQuizBtn').addEventListener('click', startQuizSession);
    document.getElementById('submitAnswerBtn').addEventListener('click', submitAnswer);
    document.getElementById('skipQuestionBtn').addEventListener('click', skipQuestion);
    document.getElementById('endQuizBtn').addEventListener('click', endQuizSession);
}

function switchMode(mode) {
    // Update buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${mode}ModeBtn`).classList.add('active');
    
    // Update panels
    document.querySelectorAll('.mode-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`${mode}Mode`).classList.add('active');
}

// ============= ASK MODE FUNCTIONS =============

async function askQuestion() {
    const questionInput = document.getElementById('questionInput');
    const question = questionInput.value.trim();
    
    if (!question) {
        showToast('Please enter a question', 'warning');
        return;
    }
    
    // Add user message to chat
    addMessageToChat('user', question);
    
    // Clear input
    questionInput.value = '';
    
    // Show loading
    const loadingId = showLoading('Thinking...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Remove loading
        removeLoading(loadingId);
        
        // Add assistant message to chat
        addMessageToChat('assistant', data.answer, data.sources);
        
    } catch (error) {
        console.error('Error asking question:', error);
        removeLoading(loadingId);
        showToast('Failed to get answer. Please try again.', 'error');
        addMessageToChat('assistant', 'Sorry, I encountered an error. Please try again.');
    }
}

function addMessageToChat(sender, message, sources = []) {
    const chatContainer = document.getElementById('chatContainer');
    const template = document.getElementById('messageTemplate');
    
    const messageElement = template.content.cloneNode(true);
    const messageDiv = messageElement.querySelector('.chat-message');
    
    // Set avatar based on sender
    const avatar = messageDiv.querySelector('.message-avatar i');
    if (sender === 'user') {
        messageDiv.classList.add('user');
        avatar.className = 'fas fa-user';
        messageDiv.querySelector('.message-sender').textContent = 'You';
    } else {
        avatar.className = 'fas fa-robot';
        messageDiv.querySelector('.message-sender').textContent = 'AI Assistant';
    }
    
    // Set time
    const now = new Date();
    messageDiv.querySelector('.message-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Set message
    messageDiv.querySelector('.message-text').textContent = message;
    
    // Add sources if any
    if (sources && sources.length > 0) {
        const sourcesContainer = messageDiv.querySelector('.message-sources');
        sources.forEach(source => {
            const sourceTag = document.createElement('span');
            sourceTag.className = 'source-tag';
            sourceTag.innerHTML = `<i class="fas fa-book"></i> ${source}`;
            sourcesContainer.appendChild(sourceTag);
        });
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ============= QUIZ MODE FUNCTIONS =============

async function startQuizSession() {
    const numQuestions = document.getElementById('numQuestions').value;
    const topic = document.getElementById('topicInput').value.trim();
    
    // Show loading
    const loadingId = showLoading('Starting quiz session...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                num_questions: parseInt(numQuestions),
                topic: topic || null
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Store session info
        currentSessionId = data.session_id;
        currentQuizState = {
            sessionId: data.session_id,
            totalQuestions: data.total_questions,
            currentQuestion: 1,
            score: 0,
            active: true
        };
        
        // Update UI
        document.getElementById('quizSetup').style.display = 'none';
        document.getElementById('activeQuiz').style.display = 'block';
        document.getElementById('quizResults').style.display = 'none';
        
        // Update progress display
        document.getElementById('totalQuestions').textContent = data.total_questions;
        document.getElementById('currentScore').textContent = '0';
        updateQuizProgress();
        
        // Get first question
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
    
    // Show loading
    const loadingId = showLoading('Loading next question...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/next/${currentSessionId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update UI with question
        document.getElementById('questionText').textContent = data.question;
        document.getElementById('questionSource').querySelector('span').textContent = data.source;
        document.getElementById('currentQuestionNum').textContent = data.question_number;
        
        // Store question context (will be needed for answer submission)
        window.currentQuestionData = data;
        
        // Clear previous feedback and answer
        document.getElementById('answerInput').value = '';
        document.getElementById('feedbackCard').style.display = 'none';
        
        // Enable submit button
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
    
    // Disable submit button to prevent double submission
    document.getElementById('submitAnswerBtn').disabled = true;
    document.getElementById('skipQuestionBtn').disabled = true;
    
    // Show loading
    const loadingId = showLoading('Checking your answer...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_answer: answer
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update score
        currentQuizState.score = data.score;
        document.getElementById('currentScore').textContent = data.score;
        
        // Update progress
        currentQuizState.currentQuestion = data.question_number;
        updateQuizProgress();
        
        // Show feedback
        showFeedback(data);
        
        // ✅ FIXED: REMOVED THE AUTOMATIC TIMEOUT THAT MOVED TO NEXT QUESTION
        // Just show the feedback, don't auto-advance
        
        // Re-enable the "Next Question" button (we'll add this)
        showNextQuestionButton();
        
        removeLoading(loadingId);
        
    } catch (error) {
        console.error('Error submitting answer:', error);
        removeLoading(loadingId);
        showToast('Failed to submit answer. Please try again.', 'error');
        
        // Re-enable buttons
        document.getElementById('submitAnswerBtn').disabled = false;
        document.getElementById('skipQuestionBtn').disabled = false;
    }
}

async function skipQuestion() {
    if (!currentSessionId || !window.currentQuestionData) {
        showToast('No active question', 'error');
        return;
    }
    
    // Disable buttons
    document.getElementById('submitAnswerBtn').disabled = true;
    document.getElementById('skipQuestionBtn').disabled = true;
    
    // Show loading
    const loadingId = showLoading('Skipping question...');
    
    try {
        // Submit a skip (empty answer)
        const response = await fetch(`${API_BASE_URL}/teacher/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_answer: "I don't know"  // This will trigger the skip behavior
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update score (might be 0 for skip)
        currentQuizState.score = data.score;
        document.getElementById('currentScore').textContent = data.score;
        
        // Update progress
        currentQuizState.currentQuestion = data.question_number;
        updateQuizProgress();
        
        // Show feedback with correct answer
        showFeedback(data);
        
        removeLoading(loadingId);
        
        // ✅ FIXED: REMOVED THE AUTOMATIC TIMEOUT
        // Just show the feedback, don't auto-advance
        
        // Show the "Next Question" button
        showNextQuestionButton();
        
    } catch (error) {
        console.error('Error skipping question:', error);
        removeLoading(loadingId);
        showToast('Failed to skip question. Please try again.', 'error');
        
        // Re-enable buttons
        document.getElementById('submitAnswerBtn').disabled = false;
        document.getElementById('skipQuestionBtn').disabled = false;
    }
}

function showFeedback(data) {
    const feedbackCard = document.getElementById('feedbackCard');
    
    // Set card class based on correctness
    feedbackCard.className = `feedback-card ${data.correct ? 'correct' : 'incorrect'}`;
    
    // Build feedback HTML
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
    
    feedbackHTML += `
        <div class="feedback-text">
            ${data.feedback}
        </div>
    `;
    
    feedbackCard.innerHTML = feedbackHTML;
    feedbackCard.style.display = 'block';
    
    // Scroll feedback into view
    feedbackCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    
    // Show loading
    const loadingId = showLoading('Calculating your results...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/end/${currentSessionId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Display results
        showQuizResults(data);
        
        // Clear session
        currentSessionId = null;
        window.currentQuestionData = null;
        
        removeLoading(loadingId);
        
    } catch (error) {
        console.error('Error ending quiz:', error);
        removeLoading(loadingId);
        
        // Show results with local data
        showQuizResults({
            final_score: currentQuizState.score,
            total_questions: currentQuizState.totalQuestions,
            percentage: (currentQuizState.score / currentQuizState.totalQuestions) * 100,
            encouragement: "Great effort! Keep learning!"
        });
    }
}

function showQuizResults(data) {
    // Hide active quiz, show results
    document.getElementById('activeQuiz').style.display = 'none';
    document.getElementById('quizResults').style.display = 'block';
    
    // Calculate percentage
    const percentage = data.percentage || (data.final_score / data.total_questions * 100);
    const score = data.final_score || data.score;
    const total = data.total_questions || data.total;
    
    // Determine circle color
    let circleColor = '#ef4444'; // red for < 40%
    if (percentage >= 80) circleColor = '#10b981'; // green for >= 80%
    else if (percentage >= 60) circleColor = '#f59e0b'; // orange for >= 60%
    else if (percentage >= 40) circleColor = '#6366f1'; // blue for >= 40%
    
    // Build results HTML
    const resultsHTML = `
        <div class="results-card">
            <h2>Quiz Complete! 🎓</h2>
            
            <div class="score-circle">
                <svg width="150" height="150">
                    <circle
                        cx="75"
                        cy="75"
                        r="70"
                        fill="none"
                        stroke="#e5e7eb"
                        stroke-width="10"
                    />
                    <circle
                        cx="75"
                        cy="75"
                        r="70"
                        fill="none"
                        stroke="${circleColor}"
                        stroke-width="10"
                        stroke-linecap="round"
                        stroke-dasharray="${2 * Math.PI * 70}"
                        stroke-dashoffset="${2 * Math.PI * 70 * (1 - percentage / 100)}"
                        transform="rotate(-90 75 75)"
                    />
                </svg>
                <div class="score-text">
                    ${Math.round(percentage)}%
                </div>
            </div>
            
            <div class="score-details">
                <h3>${score}/${total} correct</h3>
                <p class="encouragement">${data.encouragement || getEncouragementMessage(percentage)}</p>
            </div>
            
            <div class="results-actions">
                <button class="primary-btn" id="newQuizBtn">
                    <i class="fas fa-redo"></i>
                    New Quiz
                </button>
                <button class="secondary-btn" id="shareResultsBtn">
                    <i class="fas fa-share"></i>
                    Share Results
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('quizResults').innerHTML = resultsHTML;
    
    // Add event listeners to new buttons
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
    // Reset UI
    document.getElementById('quizSetup').style.display = 'block';
    document.getElementById('activeQuiz').style.display = 'none';
    document.getElementById('quizResults').style.display = 'none';
    
    // Reset state
    currentSessionId = null;
    currentQuizState = {
        sessionId: null,
        totalQuestions: 5,
        currentQuestion: 1,
        score: 0,
        active: false
    };
    window.currentQuestionData = null;
    
    // Reset inputs
    document.getElementById('numQuestions').value = 5;
    document.getElementById('topicInput').value = '';
}

function shareResults() {
    const score = currentQuizState.score;
    const total = currentQuizState.totalQuestions;
    const percentage = Math.round((score / total) * 100);
    
    const shareText = `I scored ${score}/${total} (${percentage}%) on my AI Learning System quiz! 🎓`;
    
    // Try to use Web Share API if available
    if (navigator.share) {
        navigator.share({
            title: 'My Quiz Results',
            text: shareText,
            url: window.location.href
        }).catch(() => {
            // Fallback to clipboard
            copyToClipboard(shareText);
        });
    } else {
        // Fallback to clipboard
        copyToClipboard(shareText);
    }
}

// ============= UTILITY FUNCTIONS =============

function showLoading(message) {
    const id = 'loading-' + Date.now();
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast loading';
    toast.innerHTML = `
        <div class="spinner"></div>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Show toast
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
    
    // Add icon based on type
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-exclamation-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove after 3 seconds
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
    // Update any timestamps in the UI
    const now = new Date();
    document.querySelectorAll('.timestamp').forEach(el => {
        el.textContent = now.toLocaleTimeString();
    });
}

function loadSavedState() {
    // Load any saved state from localStorage
    const saved = localStorage.getItem('quizState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            // Restore state if needed
        } catch (e) {
            console.error('Error loading saved state:', e);
        }
    }
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

// Add some CSS for toasts (these will be added dynamically)
const style = document.createElement('style');
style.textContent = `
    .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        color: #1f2937;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        gap: 10px;
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s ease;
        z-index: 1000;
        max-width: 350px;
    }
    
    .toast.show {
        transform: translateY(0);
        opacity: 1;
    }
    
    .toast.success {
        background: #10b981;
        color: white;
    }
    
    .toast.error {
        background: #ef4444;
        color: white;
    }
    
    .toast.warning {
        background: #f59e0b;
        color: white;
    }
    
    .toast.info {
        background: #3b82f6;
        color: white;
    }
    
    .toast.loading {
        background: #6366f1;
        color: white;
    }
    
    .spinner {
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 1s ease-in-out infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;

document.head.appendChild(style);