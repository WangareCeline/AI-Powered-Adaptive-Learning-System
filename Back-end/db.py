import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from contextlib import contextmanager

load_dotenv()

connection_pool = None

def init_db_pool():
    global connection_pool
    try:
        connection_pool = psycopg2.pool.SimpleConnectionPool(
            1, 20,
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT"),
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            options="-c search_path=learning_sys,public"
        )
        print("✅ Database connection pool created with schema learning_sys")
    except Exception as e:
        print(f"❌ Failed to create connection pool: {e}")
        raise

@contextmanager
def get_db_connection():
    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)

# ------------------- Students -------------------
def get_or_create_student(email, name):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM students WHERE email = %s", (email,))
            row = cur.fetchone()
            if row:
                return row[0]
            cur.execute(
                "INSERT INTO students (name, email) VALUES (%s, %s) RETURNING id",
                (name, email)
            )
            student_id = cur.fetchone()[0]
            conn.commit()
            return student_id

# ------------------- Quiz Results -------------------
def save_quiz_result(student_id, topic, question, user_answer, is_correct, time_taken, feedback):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO quiz_results
                (student_id, topic, question, user_answer, is_correct, time_taken_seconds, ai_feedback)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (student_id, topic, question, user_answer, is_correct, time_taken, feedback))
            conn.commit()

# ------------------- Performance History -------------------
def update_performance_history(student_id, topic, correct):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO performance_history (student_id, topic, total_questions, correct_answers)
                VALUES (%s, %s, 1, %s)
                ON CONFLICT (student_id, topic) DO UPDATE SET
                    total_questions = performance_history.total_questions + 1,
                    correct_answers = performance_history.correct_answers + EXCLUDED.correct_answers,
                    last_updated = CURRENT_TIMESTAMP
            """, (student_id, topic, 1 if correct else 0))
            conn.commit()

# ------------------- Student Progress -------------------
def get_student_progress(student_id: int) -> list:
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    topic,
                    total_questions,
                    correct_answers,
                    average_score
                FROM performance_history
                WHERE student_id = %s
                ORDER BY topic
            """, (student_id,))
            return cur.fetchall()

# ------------------- Teacher Login -------------------
def get_teacher_by_email(email: str):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, name, email, password FROM teachers WHERE email = %s", (email,))
            return cur.fetchone()

# ------------------- Teacher Queries -------------------
def get_struggling_students(threshold: float = 50.0):
    """Return students whose average score across all topics is below threshold."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    s.id,
                    s.name,
                    s.email,
                    COALESCE(AVG(ph.average_score), 0) as overall_avg
                FROM students s
                LEFT JOIN performance_history ph ON s.id = ph.student_id
                GROUP BY s.id, s.name, s.email
                HAVING COALESCE(AVG(ph.average_score), 0) < %s
                ORDER BY overall_avg ASC
            """, (threshold,))
            return cur.fetchall()

def get_hardest_topic():
    """Return the topic with the lowest average score across all students."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT 
                    topic,
                    AVG(average_score) as avg_score
                FROM performance_history
                WHERE topic IS NOT NULL AND topic != ''
                GROUP BY topic
                ORDER BY avg_score ASC
                LIMIT 1
            """)
            return cur.fetchone()