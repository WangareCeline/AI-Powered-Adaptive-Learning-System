import os
import numpy as np
import chromadb
import random
from groq import Groq
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from typing import List, Tuple, Dict, Optional
import time

load_dotenv()

# Initialize models and clients
model = SentenceTransformer("BAAI/bge-small-en-v1.5")
client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_collection("Adaptive_Learning_System_Documents")
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def normalize_embeddings(embeddings):
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    return (embeddings/norms).tolist()

def retrieve_context(question: str, n_results: int = 3):
    """Retrieve relevant context for a given question"""
    query_embedding = model.encode([question])
    query_embedding = normalize_embeddings(query_embedding)

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=n_results
    )

    docs = results['documents'][0]
    metadatas = results["metadatas"][0]
    
    context = "\n\n".join(docs)
    sources = list({meta["source"] for meta in metadatas})
    
    return context, sources

def ask(question: str) -> Tuple[str, List[str]]:
    """Original ask function - answer user questions"""
    context, sources = retrieve_context(question)
    
    response = groq_client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[
            {"role": "system", "content": "Answer only using provided context"},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion:\n{question}"}
        ],
        temperature=0
    )

    answer = response.choices[0].message.content
    return answer, sources

# ============= TEACHER FUNCTIONS =============

def retrieve_random_content():
    """Retrieve random content from the database"""
    try:
        # Get all documents
        all_docs = collection.get()
        if not all_docs['documents']:
            return None, None
        
        # Pick a random document chunk
        random_idx = random.randint(0, len(all_docs['documents']) - 1)
        context = all_docs['documents'][random_idx]
        metadata = all_docs['metadatas'][random_idx]
        source = metadata.get('source', 'Unknown')
        
        return context, source
    except Exception as e:
        print(f"Error retrieving content: {e}")
        return None, None

def retrieve_random_content_by_source(source_filter: str):
    """Retrieve random content from documents whose source exactly matches the filter string."""
    try:
        # Use exact match on source
        results = collection.get(where={"source": {"$eq": source_filter}})
        if not results['documents']:
            return None, None
        random_idx = random.randint(0, len(results['documents']) - 1)
        context = results['documents'][random_idx]
        metadata = results['metadatas'][random_idx]
        source = metadata.get('source', 'Unknown')
        return context, source
    except Exception as e:
        print(f"Error retrieving content by source: {e}")
        return None, None

def generate_question_from_context(context: str, source: str) -> Dict:
    """Generate a question based on the context"""
    try:
        prompt = f"""You are a teacher creating a quiz question. Based on the following text, create ONE question that tests understanding of a key concept. 
        
        The question should:
        - Be clear and specific
        - Have a factual answer that can be found in the text
        - NOT be too trivial or too complex
        
        Text: {context}
        
        Generate only the question, nothing else:"""
        
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=100
        )
        
        question = response.choices[0].message.content.strip()
        question = question.strip('"\'')
        
        return {
            "question": question,
            "context": context,
            "source": source
        }
    except Exception as e:
        print(f"Error generating question: {e}")
        return None

def check_answer_and_provide_feedback(question: str, user_answer: str, context: str) -> Dict:
    """Check if answer is correct and provide feedback"""
    try:
        prompt = f"""You are a teacher evaluating a student's answer. Use ONLY the provided context to evaluate.
        
        Context: {context}
        
        Question: {question}
        
        Student's Answer: {user_answer}
        
        Provide your response in this exact format:
        
        CORRECT: [YES or NO]
        CORRECT ANSWER: [The correct answer from the context]
        FEEDBACK: [A helpful explanation - if wrong, explain why; if right, provide positive reinforcement]
        """
        
        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=200
        )
        
        evaluation = response.choices[0].message.content.strip()
        
        # Parse the response
        result = {
            "correct": False,
            "correct_answer": "Could not determine",
            "feedback": "No feedback available"
        }
        
        for line in evaluation.split('\n'):
            line = line.strip()
            if line.startswith('CORRECT:'):
                result["correct"] = 'YES' in line.upper()
            elif line.startswith('CORRECT ANSWER:'):
                result["correct_answer"] = line.replace('CORRECT ANSWER:', '').strip()
            elif line.startswith('FEEDBACK:'):
                result["feedback"] = line.replace('FEEDBACK:', '').strip()
        
        return result
    except Exception as e:
        return {
            "correct": False,
            "correct_answer": "Error in evaluation",
            "feedback": f"Sorry, there was an error: {str(e)}"
        }

def get_teacher_question() -> Dict:
    """API-friendly function to get a teacher question"""
    context, source = retrieve_random_content()
    
    if not context:
        return {"error": "No content available"}
    
    question_data = generate_question_from_context(context, source)
    
    if not question_data:
        return {"error": "Could not generate question"}
    
    return {
        "question_id": str(random.randint(1000, 9999)),
        "question": question_data["question"],
        "source": question_data["source"],
        "context": question_data["context"]
    }

def check_teacher_answer(question_id: str, question: str, user_answer: str, context: str) -> Dict:
    """API-friendly function to check a teacher question answer"""
    result = check_answer_and_provide_feedback(question, user_answer, context)
    
    return {
        "question_id": question_id,
        "correct": result["correct"],
        "correct_answer": result["correct_answer"],
        "feedback": result["feedback"]
    }

# ============= NEW FLOW FUNCTIONS =============

def start_quiz_session(session_id: str, student_id: int, num_questions: int = 5, topic: Optional[str] = None) -> Dict:
    """Initialize a new quiz session"""
    return {
        "session_id": session_id,
        "student_id": student_id,          
        "active": True,
        "total_questions": num_questions,
        "topic": topic,
        "score": 0,
        "questions_answered": 0,
        "questions": [],  # Store asked questions (for history)
        "current_question": None
    }

def get_next_question(session: Dict) -> Dict:
    """Get the next question in the session flow, optionally filtered by topic."""
    if session["questions_answered"] >= session["total_questions"]:
        return {"error": "Session complete"}
    
    topic = session.get("topic")
    if topic:
        # Map the topic (e.g., "SQL", "Python") to a source filter (filename)
        source_filter = f"{topic.lower()}.pdf"
        context, source = retrieve_random_content_by_source(source_filter)
        if not context:
            # Fallback to random if no content for that subject
            print(f"No content found for {source_filter}, falling back to random")
            context, source = retrieve_random_content()
    else:
        context, source = retrieve_random_content()
    
    if not context:
        return {"error": "No content available"}
    
    question_data = generate_question_from_context(context, source)
    
    if not question_data:
        return {"error": "Could not generate question"}
    
    session["questions_answered"] += 1
    question_number = session["questions_answered"]
    
    return {
        "question_id": str(random.randint(1000, 9999)),
        "question_number": question_number,
        "question": question_data["question"],
        "context": question_data["context"],
        "source": question_data["source"]
    }

def submit_answer_for_current(session: Dict, user_answer: str) -> Dict:
    """Submit answer for current question and get feedback"""
    if "current_question" not in session:
        return {"error": "No current question"}
    
    current_q = session["current_question"]
    
    # Check answer
    result = check_answer_and_provide_feedback(
        current_q["question"],
        user_answer,
        current_q["context"]
    )
    
    # Update score if correct
    if result["correct"]:
        session["score"] += 1
    
    # Store question and answer in history
    question_record = {
        "question_number": current_q["question_number"],
        "question": current_q["question"],
        "user_answer": user_answer,
        "correct": result["correct"],
        "correct_answer": result["correct_answer"],
        "feedback": result["feedback"],
        "source": current_q["source"]
    }
    
    if "questions" not in session:
        session["questions"] = []
    session["questions"].append(question_record)
    
    return {
        "question_number": current_q["question_number"],
        "correct": result["correct"],
        "correct_answer": result["correct_answer"],
        "feedback": result["feedback"],
        "score": session["score"],
        "questions_answered": len(session["questions"])
    }

def end_quiz_session(session: Dict) -> Dict:
    """End the quiz session and get final statistics"""
    total = session["total_questions"]
    score = session["score"]
    
    percentage = (score / total * 100) if total > 0 else 0
    
    if percentage == 100:
        encouragement = "🏆 PERFECT SCORE! You're an excellent student!"
    elif percentage >= 80:
        encouragement = "🌟 Excellent work! You really know your material!"
    elif percentage >= 60:
        encouragement = "👍 Good job! Keep practicing to improve even more!"
    elif percentage >= 40:
        encouragement = "📚 You're making progress! Keep studying!"
    else:
        encouragement = "💪 Every mistake is a learning opportunity. Keep going!"
    
    return {
        "score": score,
        "total": total,
        "percentage": round(percentage, 1),
        "encouragement": encouragement,
        "questions": session.get("questions", [])
    }

def get_quiz_statistics(score: int, total: int) -> Dict:
    """Get quiz statistics"""
    if total == 0:
        return {
            "score": 0,
            "total": 0,
            "percentage": 0,
            "message": "No questions attempted yet. Start your quiz!"
        }
    
    percentage = (score / total * 100)
    
    if percentage == 100:
        message = "🏆 PERFECT SCORE! You're an excellent student!"
    elif percentage >= 80:
        message = "🌟 Excellent work! You really know your material!"
    elif percentage >= 60:
        message = "👍 Good job! Keep practicing to improve even more!"
    elif percentage >= 40:
        message = "📚 You're making progress! Keep studying!"
    else:
        message = "💪 Every mistake is a learning opportunity. Keep going!"
    
    return {
        "score": score,
        "total": total,
        "percentage": round(percentage, 1),
        "message": message
    }