from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag_services import (
    ask,
    start_quiz_session,
    get_next_question,
    submit_answer_for_current,
    end_quiz_session
)
from typing import Optional, List
import uuid

app = FastAPI(title="AI-Powered Adaptive Learning System API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= In-memory session store =============
sessions = {}

# ============= REQUEST/RESPONSE MODELS =============

class QuestionRequest(BaseModel):
    question: str

class QuestionResponse(BaseModel):
    answer: str
    sources: list

# Teacher flow models
class StartSessionRequest(BaseModel):
    num_questions: Optional[int] = 5
    topic: Optional[str] = None

class StartSessionResponse(BaseModel):
    session_id: str
    message: str
    total_questions: int
    topic: Optional[str]

class TeacherQuestionResponse(BaseModel):
    session_id: str
    question_number: int
    total_questions: int
    question_id: str
    question: str
    source: str

class AnswerSubmissionRequest(BaseModel):
    session_id: str
    user_answer: str

class AnswerSubmissionResponse(BaseModel):
    session_id: str
    question_number: int
    total_questions: int
    correct: bool
    correct_answer: str
    feedback: str
    score: int
    session_active: bool
    next_question_available: bool

class SessionEndResponse(BaseModel):
    session_id: str
    final_score: int
    total_questions: int
    percentage: float
    message: str
    encouragement: str

class SessionStatusResponse(BaseModel):
    session_id: str
    active: bool
    current_question_number: int
    total_questions: int
    score: int
    topic: Optional[str]

# ============= BASIC ENDPOINTS =============

@app.get("/")
def root():
    return {
        "message": "AI-Powered Adaptive Learning System API",
        "status": "running"
    }

@app.post("/ask", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest):
    try:
        answer, sources = ask(request.question)
        return QuestionResponse(answer=answer, sources=sources)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============= TEACHER FLOW ENDPOINTS =============

@app.post("/teacher/start", response_model=StartSessionResponse)
def start_session(request: StartSessionRequest):
    try:
        session_id = str(uuid.uuid4())
        session_data = start_quiz_session(
            session_id=session_id,
            num_questions=request.num_questions,
            topic=request.topic
        )
        # Store session
        sessions[session_id] = session_data
        return StartSessionResponse(
            session_id=session_id,
            message="🎓 Quiz session started!",
            total_questions=session_data["total_questions"],
            topic=session_data.get("topic")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/teacher/next/{session_id}", response_model=TeacherQuestionResponse)
def get_next_question_endpoint(session_id: str):
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[session_id]
        
        # Check if session is complete
        if session["questions_answered"] >= session["total_questions"]:
            raise HTTPException(status_code=400, detail="No more questions")
        
        # Get next question (this updates session["questions_answered"] and returns question data)
        question_data = get_next_question(session)
        
        if "error" in question_data:
            raise HTTPException(status_code=500, detail=question_data["error"])
        
        # Store current question in session for later answer submission
        session["current_question"] = question_data
        
        return TeacherQuestionResponse(
            session_id=session_id,
            question_number=question_data["question_number"],
            total_questions=session["total_questions"],
            question_id=question_data["question_id"],
            question=question_data["question"],
            source=question_data["source"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/teacher/submit", response_model=AnswerSubmissionResponse)
def submit_answer(request: AnswerSubmissionRequest):
    try:
        if request.session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[request.session_id]
        
        if "current_question" not in session:
            raise HTTPException(status_code=400, detail="No active question")
        
        # Submit answer
        result = submit_answer_for_current(session, request.user_answer)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        # Compute session active and next question available
        questions_answered = len(session.get("questions", []))
        total = session["total_questions"]
        session_active = questions_answered < total
        next_available = session_active and questions_answered < total
        
        return AnswerSubmissionResponse(
            session_id=request.session_id,
            question_number=result["question_number"],
            total_questions=total,
            correct=result["correct"],
            correct_answer=result["correct_answer"],
            feedback=result["feedback"],
            score=result["score"],
            session_active=session_active,
            next_question_available=next_available
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/teacher/end/{session_id}", response_model=SessionEndResponse)
def end_session(session_id: str):
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions.pop(session_id)  # remove session
        result = end_quiz_session(session)
        
        return SessionEndResponse(
            session_id=session_id,
            final_score=result["score"],
            total_questions=result["total"],
            percentage=result["percentage"],
            message="Session ended",
            encouragement=result["encouragement"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/teacher/status/{session_id}", response_model=SessionStatusResponse)
def get_session_status(session_id: str):
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[session_id]
        return SessionStatusResponse(
            session_id=session_id,
            active=session.get("active", True),
            current_question_number=session.get("current_question_number", 0),
            total_questions=session["total_questions"],
            score=session["score"],
            topic=session.get("topic")
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    try:
        from rag_services import collection
        doc_count = collection.count()
        return {"status": "healthy", "documents_count": doc_count}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}