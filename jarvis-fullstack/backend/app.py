"""JARVIS AI — FastAPI backend (Phase 1 hardened).

Provides JWT auth, conversation/message persistence (SQLite + SQLAlchemy),
and a streaming chat endpoint over WebSockets. Includes account lockout,
rate limiting, profile/avatar management, and rich conversation features
(pin, archive, search, smart auto-titles). The AI layer is fully offline.
"""
import os
import json
import logging
import sys
import uuid
import asyncio
import re
import time
import secrets
from collections import defaultdict, deque
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Generator

from fastapi import (
    FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect,
    Request, UploadFile, File, status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime, Text, ForeignKey,
    Boolean, or_,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.sql import func
import uvicorn

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


# --------------------------------------------------------------------------- #
# Structured logging
# --------------------------------------------------------------------------- #
# A per-request ID is set by middleware and accessible from anywhere in the
# request's call stack. Helps trace a single request across log lines from
# different modules.
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line. Easy to grep, easy to ship to a
    log aggregator. Includes the request ID set by middleware (when present)."""
    def format(self, record):
        out = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = request_id_ctx.get()
        if rid:
            out["request_id"] = rid
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        # Allow extra structured fields
        for k, v in record.__dict__.items():
            if k.startswith("_") or k in (
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
                "taskName",
            ):
                continue
            try:
                json.dumps(v)
                out[k] = v
            except TypeError:
                out[k] = repr(v)
        return json.dumps(out, ensure_ascii=False)


def _setup_logging() -> None:
    """Configure structured logging. LOG_FORMAT=json (default) emits one
    JSON object per line; LOG_FORMAT=text gives a friendlier console format
    for local dev. LOG_LEVEL overrides the threshold (default INFO)."""
    fmt = os.getenv("LOG_FORMAT", "json").lower()
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    if fmt == "text":
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s :: %(message)s"
        ))
    else:
        handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Quiet some chatty libs unless DEBUG is requested
    if level > logging.DEBUG:
        for noisy in ("uvicorn.access",):
            logging.getLogger(noisy).setLevel(logging.WARNING)


_setup_logging()
log = logging.getLogger("jarvis")


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./jarvis.db")
IS_SQLITE = DATABASE_URL.startswith("sqlite")
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173",
).split(",")

MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15
AVATAR_DIR = os.path.join(os.path.dirname(__file__), "uploads", "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

# Phase 3: email + token settings
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "console")  # "console" | "smtp"
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
EMAIL_FROM = os.getenv("EMAIL_FROM", "JARVIS <no-reply@jarvis.local>")
RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "30"))
VERIFY_TOKEN_TTL_HOURS = int(os.getenv("VERIFY_TOKEN_TTL_HOURS", "48"))

# When TEST_MODE=1, the last email sent is exposed via a test-only endpoint
# so end-to-end tests can fetch reset/verify tokens without parsing stdout.
TEST_MODE = os.getenv("TEST_MODE", "") in ("1", "true", "yes")

_engine_kwargs: dict = {}
if IS_SQLITE:
    # check_same_thread=False is required for SQLite + threaded WSGI servers
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Sensible pooling defaults for Postgres etc; can be overridden via env.
    _engine_kwargs["pool_pre_ping"] = True
    _engine_kwargs["pool_size"] = int(os.getenv("DB_POOL_SIZE", "10"))
    _engine_kwargs["max_overflow"] = int(os.getenv("DB_MAX_OVERFLOW", "10"))

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    avatar_url = Column(String, nullable=True)
    role = Column(String, default="user", nullable=False)  # "user" | "admin"
    email_verified = Column(Boolean, default=False, nullable=False)
    # Whether the user has already seen the animated welcome page. Set to
    # True after the page is shown so it only appears on first login.
    welcome_seen = Column(Boolean, default=False, nullable=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New chat")
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_date = Column(DateTime(timezone=True), server_default=func.now())
    updated_date = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String)
    content = Column(Text)
    created_date = Column(DateTime(timezone=True), server_default=func.now())


class ActivityLog(Base):
    """Audit trail of user-facing security events and admin actions."""
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    # Subject of the event (the user whose account this concerns). Nullable for
    # failed logins where we couldn't resolve a user.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # Actor: who performed the action (may differ from subject for admin actions)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    event_type = Column(String, nullable=False, index=True)
    description = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String, nullable=False)
    status = Column(String, default="open", nullable=False, index=True)  # open|in_progress|resolved|closed
    priority = Column(String, default="normal", nullable=False)  # low|normal|high|urgent
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"
    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_staff_reply = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Module(Base):
    """A topic / knowledge area JARVIS can answer questions about."""
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, nullable=True)
    icon = Column(String, nullable=True)  # lucide icon name, e.g. "BookOpen"
    # Optional per-module system prompt sent to the LLM when this module
    # provides context for a reply. Empty/None means use the global default.
    system_prompt = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ModuleCategory(Base):
    """Optional grouping of questions inside a module."""
    __tablename__ = "module_categories"
    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ModuleQuestion(Base):
    """A canned Q&A inside a module — prompt is the trigger, answer is what
    JARVIS says when the user's message matches the prompt."""
    __tablename__ = "module_questions"
    id = Column(Integer, primary_key=True, index=True)
    module_id = Column(Integer, ForeignKey("modules.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("module_categories.id"), nullable=True, index=True)
    prompt = Column(String, nullable=False)
    answer = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EmailVerificationToken(Base):
    """A one-use email verification token.

    `token_hash` is the SHA-256 of the actual token (we never store the
    plaintext token). `used_at` marks consumption so a leaked token can't
    be replayed. Tokens expire after `expires_at`."""
    __tablename__ = "email_verification_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    """One-use password reset token. Same hashing/expiry strategy as
    email verification."""
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """In-app notification for a user."""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # event_type: a short slug like "welcome", "password_changed", "ticket_reply",
    # "role_changed", "email_changed", "email_verified". UI can branch on this for icons.
    event_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    # Optional internal link to focus when the notification is clicked
    link = Column(String, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


Base.metadata.create_all(bind=engine)


def _migrate_add_category_id() -> None:
    """Add module_questions.category_id if it's missing. Works on SQLite +
    Postgres (Postgres has `ADD COLUMN IF NOT EXISTS`; we still introspect
    first for SQLite's sake). Idempotent and safe to call on every start.
    """
    from sqlalchemy import inspect
    insp = inspect(engine)
    if "module_questions" not in insp.get_table_names():
        return  # fresh DB — create_all already gave us the column
    cols = {c["name"] for c in insp.get_columns("module_questions")}
    if "category_id" in cols:
        return
    with engine.begin() as conn:
        if IS_SQLITE:
            conn.exec_driver_sql(
                "ALTER TABLE module_questions ADD COLUMN category_id INTEGER "
                "REFERENCES module_categories(id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_module_questions_category_id "
                "ON module_questions(category_id)"
            )
        else:
            conn.exec_driver_sql(
                "ALTER TABLE module_questions ADD COLUMN IF NOT EXISTS category_id "
                "INTEGER REFERENCES module_categories(id)"
            )
            conn.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_module_questions_category_id "
                "ON module_questions(category_id)"
            )
    log.info("migrate: added module_questions.category_id")


def _migrate_add_email_verified() -> None:
    """Add users.email_verified if missing. Idempotent."""
    from sqlalchemy import inspect
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "email_verified" in cols:
        return
    with engine.begin() as conn:
        if IS_SQLITE:
            conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 0"
            )
        else:
            conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified "
                "BOOLEAN NOT NULL DEFAULT FALSE"
            )
    log.info("migrate: added users.email_verified")


def _migrate_add_system_prompt() -> None:
    """Add modules.system_prompt if missing. Idempotent."""
    from sqlalchemy import inspect
    insp = inspect(engine)
    if "modules" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("modules")}
    if "system_prompt" in cols:
        return
    with engine.begin() as conn:
        if IS_SQLITE:
            conn.exec_driver_sql("ALTER TABLE modules ADD COLUMN system_prompt TEXT")
        else:
            conn.exec_driver_sql(
                "ALTER TABLE modules ADD COLUMN IF NOT EXISTS system_prompt TEXT"
            )
    log.info("migrate: added modules.system_prompt")


def _migrate_add_welcome_seen() -> None:
    """Add users.welcome_seen if missing. Idempotent."""
    from sqlalchemy import inspect
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    if "welcome_seen" in cols:
        return
    with engine.begin() as conn:
        if IS_SQLITE:
            conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN welcome_seen BOOLEAN NOT NULL DEFAULT 0"
            )
        else:
            conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_seen "
                "BOOLEAN NOT NULL DEFAULT FALSE"
            )
    log.info("migrate: added users.welcome_seen")


_migrate_add_category_id()
_migrate_add_email_verified()
_migrate_add_system_prompt()
_migrate_add_welcome_seen()


def _seed_admin() -> None:
    """Promote one account to admin role.

    Either:
      - Set INITIAL_ADMIN_EMAIL in env, and if that account exists it's
        promoted to admin on every startup (idempotent), OR
      - Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to *create*
        an admin account on first run if it doesn't exist.

    Existing admin status is never demoted.
    """
    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    if not email:
        return
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == email).first()
        if u is None:
            password = os.getenv("INITIAL_ADMIN_PASSWORD")
            if not password:
                return  # silent — admin email set but no password provided
            from passlib.context import CryptContext as _CC
            _h = _CC(schemes=["bcrypt"], deprecated="auto").hash(password)
            u = User(email=email, full_name="Administrator", hashed_password=_h, role="admin")
            db.add(u)
            db.commit()
            print(f"[seed] created initial admin: {email}", flush=True)
        elif u.role != "admin":
            u.role = "admin"
            db.commit()
            print(f"[seed] promoted to admin: {email}", flush=True)
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Email + tokens + notifications  (Phase 3)
# --------------------------------------------------------------------------- #
import hashlib

# Test-mode buffer: a small ring of recently sent emails. Useful for E2E
# tests that want to grab a token without reading stdout. Keyed by recipient.
_test_email_inbox: dict[str, list[dict]] = defaultdict(list)
_TEST_INBOX_MAX_PER_USER = 10


def _hash_token(plain: str) -> str:
    """SHA-256 of the plaintext token. We store only the hash so a database
    leak doesn't expose live tokens."""
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def _send_email(to: str, subject: str, body_text: str) -> None:
    """Send an email through the configured backend.

    Console backend prints to stdout (great for dev and demos).
    SMTP backend uses stdlib smtplib. Failures are logged but never raise
    — we don't want a flaky mail server to take down sign-ups or password
    resets. Tokens are still created either way.
    """
    if TEST_MODE:
        rec = {"to": to, "subject": subject, "body": body_text,
               "sent_at": datetime.now(timezone.utc).isoformat()}
        _test_email_inbox[to].append(rec)
        # Trim so the buffer stays small
        if len(_test_email_inbox[to]) > _TEST_INBOX_MAX_PER_USER:
            _test_email_inbox[to] = _test_email_inbox[to][-_TEST_INBOX_MAX_PER_USER:]

    if EMAIL_BACKEND == "console":
        print(
            f"\n[email] -------------------------------------------------\n"
            f"[email] To:      {to}\n"
            f"[email] From:    {EMAIL_FROM}\n"
            f"[email] Subject: {subject}\n"
            f"[email] -------------------------------------------------\n"
            f"{body_text}\n"
            f"[email] -------------------------------------------------",
            flush=True,
        )
        return

    if EMAIL_BACKEND == "smtp":
        try:
            import smtplib
            from email.message import EmailMessage
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = EMAIL_FROM
            msg["To"] = to
            msg.set_content(body_text)
            if SMTP_USE_TLS:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
                    s.starttls()
                    if SMTP_USERNAME:
                        s.login(SMTP_USERNAME, SMTP_PASSWORD)
                    s.send_message(msg)
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
                    if SMTP_USERNAME:
                        s.login(SMTP_USERNAME, SMTP_PASSWORD)
                    s.send_message(msg)
            print(f"[email] sent SMTP to {to}: {subject}", flush=True)
        except Exception as exc:
            print(f"[email] SMTP send failed for {to}: {exc!r}", flush=True)
        return

    print(f"[email] unknown EMAIL_BACKEND={EMAIL_BACKEND!r}, dropping email to {to}", flush=True)


def _create_email_verification_token(db: Session, user: User) -> str:
    """Generate a plaintext token, store only its hash, return the plaintext
    so the caller can email it. Invalidates any previously-issued unused
    tokens for this user."""
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user.id,
        EmailVerificationToken.used_at.is_(None),
    ).delete(synchronize_session=False)
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=VERIFY_TOKEN_TTL_HOURS)
    db.add(EmailVerificationToken(
        user_id=user.id, token_hash=_hash_token(raw), expires_at=expires,
    ))
    db.commit()
    return raw


def _create_password_reset_token(db: Session, user: User) -> str:
    """Same idea as the verification token but with a shorter TTL."""
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).delete(synchronize_session=False)
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)
    db.add(PasswordResetToken(
        user_id=user.id, token_hash=_hash_token(raw), expires_at=expires,
    ))
    db.commit()
    return raw


def _send_verification_email(user: User, raw_token: str) -> None:
    link = f"{FRONTEND_BASE_URL}/verify-email?token={raw_token}"
    body = (
        f"Hi {user.full_name or 'there'},\n\n"
        f"Welcome to JARVIS! Confirm your email so we can keep your account secure:\n\n"
        f"{link}\n\n"
        f"The link expires in {VERIFY_TOKEN_TTL_HOURS} hours. If you didn't sign "
        f"up, you can safely ignore this message.\n\n— JARVIS"
    )
    _send_email(user.email, "Confirm your JARVIS email", body)


def _send_password_reset_email(user: User, raw_token: str) -> None:
    link = f"{FRONTEND_BASE_URL}/reset-password?token={raw_token}"
    body = (
        f"Hi {user.full_name or 'there'},\n\n"
        f"Someone (hopefully you) asked to reset your JARVIS password. Open this "
        f"link to choose a new one:\n\n"
        f"{link}\n\n"
        f"The link expires in {RESET_TOKEN_TTL_MINUTES} minutes. If you didn't "
        f"request a reset, you can ignore this message — your password won't "
        f"change.\n\n— JARVIS"
    )
    _send_email(user.email, "Reset your JARVIS password", body)


def add_notification(
    db: Session, user_id: int, event_type: str, title: str,
    body: Optional[str] = None, link: Optional[str] = None,
) -> Notification:
    """Convenience helper used by other endpoints to fan out in-app
    notifications. Commits within this call so callers can fire-and-forget."""
    n = Notification(
        user_id=user_id, event_type=event_type, title=title,
        body=body, link=link,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def validate_password_strength(pw: str) -> str:
    if len(pw) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[A-Za-z]", pw):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", pw):
        raise ValueError("Password must contain at least one number")
    return pw


class UserCreate(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(default=None, max_length=80)
    username: Optional[str] = Field(default=None, max_length=32)
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("username")
    @classmethod
    def _un(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not USERNAME_RE.match(v):
            raise ValueError(
                "Username must be 3–32 chars; letters, numbers, dot, underscore, dash"
            )
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str = "user"
    email_verified: bool = False
    welcome_seen: bool = False
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=80)
    username: Optional[str] = Field(default=None, max_length=32)

    @field_validator("username")
    @classmethod
    def _un(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not USERNAME_RE.match(v):
            raise ValueError(
                "Username must be 3–32 chars; letters, numbers, dot, underscore, dash"
            )
        return v


class EmailUpdate(BaseModel):
    new_email: EmailStr
    current_password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)


class AccountDelete(BaseModel):
    current_password: str


# Phase 3 schemas
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return validate_password_strength(v)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class NotificationOut(BaseModel):
    id: int
    event_type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationListOut(BaseModel):
    items: List[NotificationOut]
    unread_count: int


class NotificationSelfCreate(BaseModel):
    """Lets the frontend post a notification to the current user's own
    notification list. Used so all UI feedback (saves, errors, etc.) flows
    through the same channel instead of fleeting on-screen toasts."""
    event_type: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    body: Optional[str] = Field(default=None, max_length=500)
    link: Optional[str] = Field(default=None, max_length=300)


class Token(BaseModel):
    access_token: str
    token_type: str


class ConversationCreate(BaseModel):
    title: Optional[str] = "New chat"


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class ConversationOut(BaseModel):
    id: int
    title: str
    is_pinned: bool = False
    is_archived: bool = False
    created_date: Optional[datetime] = None
    updated_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    conversation_id: Optional[int] = None
    message: str


class ChatResponse(BaseModel):
    conversation_id: int
    response: str


# ---- Phase 2A schemas ----------------------------------------------------- #
class ActivityLogOut(BaseModel):
    id: int
    event_type: str
    description: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: Optional[datetime] = None
    actor_id: Optional[int] = None
    user_id: Optional[int] = None

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None  # "user" | "admin"
    locked: Optional[bool] = None  # True = lock for 100 years, False = unlock

    @field_validator("role")
    @classmethod
    def _role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ("user", "admin"):
            raise ValueError("role must be 'user' or 'admin'")
        return v


class AdminUserDetail(UserOut):
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None
    is_locked: bool = False
    conversation_count: int = 0
    ticket_count: int = 0


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=5, max_length=5000)
    priority: Optional[str] = Field(default="normal")

    @field_validator("priority")
    @classmethod
    def _p(cls, v: Optional[str]) -> str:
        if v not in (None, "low", "normal", "high", "urgent"):
            raise ValueError("priority must be low, normal, high, or urgent")
        return v or "normal"


class TicketReply(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class TicketUpdate(BaseModel):
    status: Optional[str] = None  # open|in_progress|resolved|closed
    priority: Optional[str] = None
    assigned_to: Optional[int] = None

    @field_validator("status")
    @classmethod
    def _s(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ("open", "in_progress", "resolved", "closed"):
            raise ValueError("invalid status")
        return v


class TicketMessageOut(BaseModel):
    id: int
    author_id: int
    body: str
    is_staff_reply: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: int
    user_id: int
    subject: str
    status: str
    priority: str
    assigned_to: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TicketDetail(TicketOut):
    messages: List[TicketMessageOut] = []
    # For admin convenience — name of the user who opened it
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None


class AdminStats(BaseModel):
    total_users: int
    new_users_24h: int
    admin_users: int
    locked_users: int
    total_conversations: int
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    resolved_tickets: int
    failed_logins_24h: int


# ---- Phase 2B schemas: modules + questions -------------------------------- #
_SLUG_RE = re.compile(r"[^a-z0-9-]")

def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = s.replace(" ", "-")
    s = _SLUG_RE.sub("", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "untitled"


class ModuleQuestionBase(BaseModel):
    prompt: str = Field(min_length=2, max_length=300)
    answer: str = Field(min_length=1, max_length=5000)
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0
    category_id: Optional[int] = None


class ModuleQuestionCreate(ModuleQuestionBase):
    pass


class ModuleQuestionUpdate(BaseModel):
    prompt: Optional[str] = Field(default=None, min_length=2, max_length=300)
    answer: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    # Pass an integer to move; pass 0 to mean "uncategorize". (Bare None means
    # "no change" — Pydantic can't distinguish a missing field from explicit
    # null without extra plumbing, so we use 0 as the uncategorize sentinel.)
    category_id: Optional[int] = None


class ModuleQuestionOut(BaseModel):
    id: int
    module_id: int
    category_id: Optional[int] = None
    prompt: str
    answer: str
    is_active: bool
    sort_order: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ModuleCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ModuleCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    sort_order: Optional[int] = None


class ModuleCategoryOut(BaseModel):
    id: int
    module_id: int
    name: str
    slug: str
    sort_order: int
    question_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReorderPayload(BaseModel):
    """Bulk reorder: an ordered list of IDs becomes their new sort_order
    (index in the array)."""
    ids: List[int] = Field(min_length=1, max_length=500)


class ModuleBase(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=40)
    system_prompt: Optional[str] = Field(default=None, max_length=4000)
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0


class ModuleCreate(ModuleBase):
    slug: Optional[str] = Field(default=None, max_length=80)


class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    slug: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=40)
    system_prompt: Optional[str] = Field(default=None, max_length=4000)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ModuleOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    system_prompt: Optional[str] = None
    is_active: bool
    sort_order: int
    question_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ModuleDetail(ModuleOut):
    categories: List[ModuleCategoryOut] = []
    questions: List[ModuleQuestionOut] = []


# Import payload: same shape as Export (described in README).
class ModuleImportCategory(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sort_order: Optional[int] = 0


class ModuleImportQuestion(BaseModel):
    prompt: str = Field(min_length=2, max_length=300)
    answer: str = Field(min_length=1, max_length=5000)
    category_name: Optional[str] = None  # resolved against category names below
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0


class ModuleImport(BaseModel):
    """JSON shape accepted by POST /api/admin/modules/import.

    The shape is symmetric with /export: feed an exported file straight back
    in and the module reappears (with a fresh slug if there's a collision).
    """
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None, max_length=40)
    system_prompt: Optional[str] = Field(default=None, max_length=4000)
    is_active: Optional[bool] = True
    categories: List[ModuleImportCategory] = []
    questions: List[ModuleImportQuestion] = []


# --------------------------------------------------------------------------- #
# Database dependency
# --------------------------------------------------------------------------- #
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_locked(user: User) -> bool:
    if not user.locked_until:
        return False
    locked = user.locked_until
    if locked.tzinfo is None:
        locked = locked.replace(tzinfo=timezone.utc)
    return locked > _now_utc()


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    # JWT `sub` claim must be a string per RFC 7519
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])
    expire = _now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate credentials"
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


async def get_current_user_ws(websocket: WebSocket, db: Session) -> Optional[User]:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        await websocket.close(code=1008)
        return None
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        await websocket.close(code=1008)
        return None
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency that 403s any non-admin caller."""
    if current_user.role != "admin":
        raise HTTPException(403, "Administrator access required")
    return current_user


def log_activity(
    db: Session,
    *,
    user_id: Optional[int],
    event_type: str,
    description: Optional[str] = None,
    request: Optional[Request] = None,
    actor_id: Optional[int] = None,
) -> None:
    """Record a security/audit event. Failures here must never break the request."""
    try:
        ip = client_ip(request) if request is not None else None
        ua = request.headers.get("user-agent") if request is not None else None
        if ua:
            ua = ua[:200]  # cap length
        entry = ActivityLog(
            user_id=user_id,
            actor_id=actor_id if actor_id is not None else user_id,
            event_type=event_type,
            description=description,
            ip=ip,
            user_agent=ua,
        )
        db.add(entry)
        # No commit here — caller commits as part of their unit of work.
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Rate limiting (sliding-window, in-memory; suitable for single instance)
# --------------------------------------------------------------------------- #
_rate_buckets: dict = defaultdict(deque)


def rate_limit(key: str, max_calls: int, window_seconds: int) -> bool:
    """Return True if call is allowed, False if rate-limited."""
    now = time.time()
    window_start = now - window_seconds
    bucket = _rate_buckets[key]
    while bucket and bucket[0] < window_start:
        bucket.popleft()
    if len(bucket) >= max_calls:
        return False
    bucket.append(now)
    return True


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------- #
# AI engine
# --------------------------------------------------------------------------- #
from ai_engine import generate_response


# Words too common to count toward similarity (lowercase)
_STOP_WORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "of", "to", "in", "on", "at", "for", "by", "with",
    "and", "or", "but", "if", "then", "so", "as", "it", "this", "that",
    "i", "you", "he", "she", "they", "we", "me", "my", "your", "our", "us",
    "what", "how", "why", "when", "where", "who", "which",
    "can", "could", "would", "should", "may", "might", "will",
    "tell", "say", "please", "thanks", "hi", "hello",
})

_TOKEN_RE = re.compile(r"[a-z0-9']+")


def _tokens(text: str) -> set:
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOP_WORDS}


def _best_module_match(db: Session, message: str) -> Optional[ModuleQuestion]:
    """Return the best-scoring active question for `message`, or None.

    Scoring rules, in priority order:
      1. Exact case-insensitive match → win immediately.
      2. Prompt is contained in message (or vice-versa) → +0.5 boost.
      3. Jaccard similarity over content tokens, threshold 0.5.

    Ties broken by `sort_order` then `id`.
    """
    msg_lower = (message or "").strip().lower()
    if not msg_lower:
        return None
    msg_tokens = _tokens(msg_lower)
    qs = (
        db.query(ModuleQuestion)
        .join(Module, Module.id == ModuleQuestion.module_id)
        .filter(
            ModuleQuestion.is_active == True,  # noqa: E712
            Module.is_active == True,  # noqa: E712
        )
        .order_by(ModuleQuestion.sort_order, ModuleQuestion.id)
        .all()
    )
    best = None
    best_score = 0.0
    for q in qs:
        p_lower = q.prompt.strip().lower()
        if p_lower == msg_lower:
            return q  # exact match wins
        score = 0.0
        if p_lower in msg_lower or msg_lower in p_lower:
            score += 0.5
        if msg_tokens:
            p_tokens = _tokens(p_lower)
            if p_tokens:
                union = msg_tokens | p_tokens
                inter = msg_tokens & p_tokens
                score += (len(inter) / len(union)) if union else 0.0
        if score > best_score:
            best_score = score
            best = q
    return best if best_score >= 0.5 else None


def get_ai_response(message: str, history: Optional[List[dict]] = None,
                    db: Optional[Session] = None) -> str:
    """Synchronous reply path used by the REST endpoint.

    Order of preference:
      1. Exact/near-exact module match → return the module answer directly
         (fast, deterministic, costs nothing).
      2. Otherwise, ask the configured LLM provider (with any matched
         module's system prompt). Any failure falls back to the offline
         engine so the app keeps working without API keys or when an
         upstream provider is having a bad day.
    """
    matched_module = None
    if db is not None:
        match = _best_module_match(db, message)
        if match:
            # Direct hit on a canned Q/A — surface the curated answer verbatim.
            return match.answer

        # No question matched, but we may still want to use a module's system
        # prompt if any active module mentions keywords overlapping the query.
        # We keep this simple: pick the first active module whose name appears
        # in the user message (case-insensitive). Future work: a per-module
        # routing classifier.
        msg_lower = message.lower()
        for m in db.query(Module).filter(Module.is_active == True).order_by(  # noqa: E712
            Module.sort_order, Module.name
        ).all():
            if m.system_prompt and m.name.lower() in msg_lower:
                matched_module = m
                break

    # Build the message list for the provider
    msgs = list(history or [])
    msgs.append({"role": "user", "content": message})

    from llm_providers import get_provider
    provider = get_provider()
    system_prompt = matched_module.system_prompt if matched_module else None
    try:
        return provider.generate(msgs, system_prompt=system_prompt)
    except Exception as exc:
        log.warning(
            "LLM provider %s failed, falling back to offline engine",
            provider.name, extra={"err": repr(exc)},
        )
        from ai_engine import generate_response
        return generate_response(message)


# --------------------------------------------------------------------------- #
# Smart auto-title from first user message
# --------------------------------------------------------------------------- #
_FILLER_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "have", "has", "had", "can", "could", "would",
    "should", "may", "might", "must", "shall", "will", "to", "of", "in",
    "on", "at", "for", "with", "and", "or", "but", "so", "if", "as",
    "i", "me", "my", "you", "your", "we", "us", "our",
    "please", "tell", "what", "how", "why", "when", "where", "who",
}


def smart_title(message: str, max_len: int = 50) -> str:
    """Generate a concise, human-readable chat title from a message."""
    msg = (message or "").strip()
    if not msg:
        return "New chat"

    # Strip code fences and markdown noise
    msg = re.sub(r"```[\s\S]*?```", " ", msg)
    msg = re.sub(r"[#*_`>]", " ", msg)
    msg = re.sub(r"\s+", " ", msg).strip()

    # If short enough already, just capitalize first letter
    if len(msg) <= max_len:
        return msg[0].upper() + msg[1:] if msg else "New chat"

    # Otherwise extract the meaningful words from the first ~12 tokens
    tokens = msg.split()[:14]
    meaningful = [t for t in tokens if t.lower().strip(".,?!:;") not in _FILLER_WORDS]
    candidate = " ".join(meaningful or tokens)

    if len(candidate) > max_len:
        candidate = candidate[:max_len].rsplit(" ", 1)[0] + "…"
    return candidate[0].upper() + candidate[1:] if candidate else "New chat"


# --------------------------------------------------------------------------- #
# FastAPI app
# --------------------------------------------------------------------------- #
app = FastAPI(title="JARVIS AI", version="0.7.0")

# Seed an initial admin if INITIAL_ADMIN_EMAIL (and optionally PASSWORD) are set
_seed_admin()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


@app.middleware("http")
async def request_id_and_access_log(request: Request, call_next):
    """Stamp every request with an ID (use client-provided X-Request-ID if
    present, else mint one), echo it in the response, and emit a single
    structured access log line per request."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    token = request_id_ctx.set(rid)
    started = time.monotonic()
    status_code = 500
    try:
        response: Response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = rid
        return response
    finally:
        dur_ms = int((time.monotonic() - started) * 1000)
        # Skip the noisy health endpoint; otherwise log one line per request.
        if request.url.path != "/api/health":
            log.info(
                "http",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status_code,
                    "duration_ms": dur_ms,
                    "ip": (request.client.host if request.client else None),
                },
            )
        request_id_ctx.reset(token)


# Serve uploaded avatars
app.mount("/uploads", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "uploads")), name="uploads")


@app.get("/")
def root():
    return {"name": "JARVIS AI", "status": "online"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


# ---------------------------------- Auth ----------------------------------- #
@app.post("/api/auth/register", response_model=UserOut, status_code=201)
def register(user: UserCreate, request: Request, db: Session = Depends(get_db)):
    if not rate_limit(f"register:{client_ip(request)}", max_calls=10, window_seconds=600):
        raise HTTPException(429, "Too many registration attempts. Please wait.")
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(400, "Email already registered")
    if user.username and db.query(User).filter(User.username == user.username).first():
        raise HTTPException(400, "Username already taken")
    new_user = User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=get_password_hash(user.password),
    )
    db.add(new_user)
    db.flush()  # populate new_user.id
    log_activity(
        db, user_id=new_user.id, event_type="register",
        description=f"Account created for {new_user.email}",
        request=request,
    )
    db.commit()
    db.refresh(new_user)

    # Phase 3: send verification email + in-app welcome notification.
    # Both are best-effort: a failure here must not roll back registration.
    try:
        raw = _create_email_verification_token(db, new_user)
        _send_verification_email(new_user, raw)
    except Exception as exc:
        print(f"[register] verification email failed for {new_user.email}: {exc!r}", flush=True)
    try:
        add_notification(
            db, user_id=new_user.id, event_type="welcome",
            title="Welcome to JARVIS",
            body="Confirm your email to keep your account secure.",
            link="/settings",
        )
    except Exception:
        pass

    return new_user


@app.post("/api/auth/login", response_model=Token)
def login(user: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    if not rate_limit(f"login:{ip}", max_calls=10, window_seconds=60):
        raise HTTPException(429, "Too many login attempts. Please wait a moment.")
    if not rate_limit(f"login-email:{user.email.lower()}", max_calls=10, window_seconds=300):
        raise HTTPException(429, "Too many login attempts. Please wait.")

    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user:
        # Log the failed attempt without a user_id (we don't know who it was)
        log_activity(
            db, user_id=None, event_type="login_failed",
            description=f"Unknown email: {user.email}",
            request=request,
        )
        db.commit()
        raise HTTPException(401, "Invalid email or password")

    if _is_locked(db_user):
        locked_until = db_user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        mins = max(1, int((locked_until - _now_utc()).total_seconds() // 60) + 1)
        log_activity(
            db, user_id=db_user.id, event_type="login_blocked",
            description="Account is locked", request=request,
        )
        db.commit()
        raise HTTPException(
            423, f"Account temporarily locked. Try again in {mins} minute(s)."
        )

    if not verify_password(user.password, db_user.hashed_password):
        db_user.failed_login_attempts = (db_user.failed_login_attempts or 0) + 1
        if db_user.failed_login_attempts >= MAX_FAILED_LOGINS:
            db_user.locked_until = _now_utc() + timedelta(minutes=LOCKOUT_MINUTES)
            db_user.failed_login_attempts = 0
            log_activity(
                db, user_id=db_user.id, event_type="account_locked",
                description=f"Locked for {LOCKOUT_MINUTES} min after repeated failures",
                request=request,
            )
            db.commit()
            raise HTTPException(
                423,
                f"Too many failed attempts. Account locked for {LOCKOUT_MINUTES} minutes.",
            )
        log_activity(
            db, user_id=db_user.id, event_type="login_failed",
            description="Wrong password", request=request,
        )
        db.commit()
        remaining = MAX_FAILED_LOGINS - db_user.failed_login_attempts
        raise HTTPException(401, f"Invalid email or password ({remaining} attempt(s) left)")

    # Success
    db_user.failed_login_attempts = 0
    db_user.locked_until = None
    db_user.last_login_at = _now_utc()
    log_activity(
        db, user_id=db_user.id, event_type="login_success",
        description=f"Signed in from {ip}", request=request,
    )
    db.commit()
    token = create_access_token({"sub": db_user.id})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ------------------------------ User profile ------------------------------- #
@app.put("/api/users/me", response_model=UserOut)
def update_profile(
    update: ProfileUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    changes = []
    if update.username is not None and update.username != current_user.username:
        existing = (
            db.query(User)
            .filter(User.username == update.username, User.id != current_user.id)
            .first()
        )
        if existing:
            raise HTTPException(400, "Username already taken")
        changes.append(f"username → {update.username}")
        current_user.username = update.username
    if update.full_name is not None and update.full_name != current_user.full_name:
        changes.append("full name updated")
        current_user.full_name = update.full_name
    if changes:
        log_activity(
            db, user_id=current_user.id, event_type="profile_updated",
            description="; ".join(changes), request=request,
        )
    db.commit()
    db.refresh(current_user)
    return current_user


@app.put("/api/users/me/email", response_model=UserOut)
def change_email(
    update: EmailUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(update.current_password, current_user.hashed_password):
        raise HTTPException(401, "Current password is incorrect")
    if update.new_email == current_user.email:
        raise HTTPException(400, "New email is the same as the current one")
    if db.query(User).filter(User.email == update.new_email).first():
        raise HTTPException(400, "That email is already in use")
    old_email = current_user.email
    current_user.email = update.new_email
    # New email needs re-verification
    current_user.email_verified = False
    log_activity(
        db, user_id=current_user.id, event_type="email_changed",
        description=f"{old_email} → {update.new_email}", request=request,
    )
    db.commit()
    db.refresh(current_user)

    # Send a fresh verification email + notify the user
    try:
        raw = _create_email_verification_token(db, current_user)
        _send_verification_email(current_user, raw)
    except Exception as exc:
        print(f"[change_email] verification send failed: {exc!r}", flush=True)
    try:
        add_notification(
            db, user_id=current_user.id, event_type="email_changed",
            title="Email updated",
            body=f"We've sent a verification link to {current_user.email}.",
            link="/settings",
        )
    except Exception:
        pass
    return current_user


@app.put("/api/users/me/password")
def change_password(
    change: PasswordChange,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(change.current_password, current_user.hashed_password):
        raise HTTPException(401, "Current password is incorrect")
    if verify_password(change.new_password, current_user.hashed_password):
        raise HTTPException(400, "New password must be different from current")
    current_user.hashed_password = get_password_hash(change.new_password)
    log_activity(
        db, user_id=current_user.id, event_type="password_changed",
        description="Password updated via Settings", request=request,
    )
    db.commit()

    try:
        add_notification(
            db, user_id=current_user.id, event_type="password_changed",
            title="Password updated",
            body="If this wasn't you, contact support immediately.",
            link="/settings",
        )
    except Exception:
        pass
    return {"message": "Password updated successfully"}


# --------------------------------------------------------------------------- #
# Phase 3: password recovery, email verification, notifications
# --------------------------------------------------------------------------- #
@app.post("/api/auth/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a password reset link to the email (if the account exists).

    Important: we always return the same 200 response whether the email
    exists or not, to avoid leaking which addresses are registered.
    Rate-limited per IP to slow down enumeration attacks anyway."""
    if not rate_limit(f"forgot:{client_ip(request)}", max_calls=10, window_seconds=600):
        # Even on rate limit we hide the error behind the same response.
        return {"message": "If that email is registered, a reset link is on its way."}

    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        try:
            raw = _create_password_reset_token(db, user)
            _send_password_reset_email(user, raw)
            log_activity(
                db, user_id=user.id, event_type="password_reset_requested",
                description=f"Reset requested for {user.email}", request=request,
            )
            db.commit()
        except Exception as exc:
            print(f"[forgot_password] failed: {exc!r}", flush=True)
    return {"message": "If that email is registered, a reset link is on its way."}


@app.post("/api/auth/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not rate_limit(f"reset:{client_ip(request)}", max_calls=20, window_seconds=600):
        raise HTTPException(429, "Too many attempts. Please wait a few minutes.")

    th = _hash_token(payload.token)
    tok = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == th,
    ).first()
    # Generic error message — don't reveal whether token exists vs is expired/used
    err = HTTPException(400, "This reset link is invalid or has expired. Please request a new one.")
    if not tok or tok.used_at is not None:
        raise err
    # expires_at comparison: SQLAlchemy returns naive datetimes on SQLite; coerce
    exp = tok.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise err

    user = db.query(User).filter(User.id == tok.user_id).first()
    if not user:
        raise err

    # Reject re-using current password (avoids people clicking reset just to
    # bypass the "different from current" rule, which would be silly).
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(400, "New password must be different from current.")

    user.hashed_password = get_password_hash(payload.new_password)
    tok.used_at = _now_utc()
    # Unlock the account if it was locked from failed logins — they just
    # proved they own the email.
    user.failed_login_attempts = 0
    user.locked_until = None
    log_activity(
        db, user_id=user.id, event_type="password_reset_completed",
        description="Password reset via email link", request=request,
    )
    db.commit()

    try:
        add_notification(
            db, user_id=user.id, event_type="password_changed",
            title="Password was reset",
            body="If this wasn't you, contact support immediately.",
            link="/settings",
        )
    except Exception:
        pass
    return {"message": "Password updated. You can sign in now."}


@app.post("/api/auth/verify-email")
def verify_email(
    payload: VerifyEmailRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not rate_limit(f"verify:{client_ip(request)}", max_calls=30, window_seconds=600):
        raise HTTPException(429, "Too many attempts. Please wait a few minutes.")

    th = _hash_token(payload.token)
    tok = db.query(EmailVerificationToken).filter(
        EmailVerificationToken.token_hash == th,
    ).first()
    err = HTTPException(400, "This verification link is invalid or has expired.")
    if not tok or tok.used_at is not None:
        raise err
    exp = tok.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise err

    user = db.query(User).filter(User.id == tok.user_id).first()
    if not user:
        raise err

    already = user.email_verified
    user.email_verified = True
    tok.used_at = _now_utc()
    if not already:
        log_activity(
            db, user_id=user.id, event_type="email_verified",
            description=f"Email verified: {user.email}", request=request,
        )
    db.commit()

    if not already:
        try:
            add_notification(
                db, user_id=user.id, event_type="email_verified",
                title="Email verified", body=f"{user.email} is confirmed.",
            )
        except Exception:
            pass
    return {"message": "Email verified.", "email": user.email}


@app.post("/api/users/me/resend-verification")
def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.email_verified:
        return {"message": "Your email is already verified."}
    if not rate_limit(f"resend:{current_user.id}", max_calls=3, window_seconds=600):
        raise HTTPException(429, "You can request another verification email in a few minutes.")
    try:
        raw = _create_email_verification_token(db, current_user)
        _send_verification_email(current_user, raw)
    except Exception as exc:
        print(f"[resend_verification] failed: {exc!r}", flush=True)
        raise HTTPException(500, "Could not send verification email. Try again shortly.")
    return {"message": f"Verification email sent to {current_user.email}."}


# ---- Notifications ---- #
@app.get("/api/notifications", response_model=NotificationListOut)
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 20,
):
    limit = max(1, min(50, limit))
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    unread = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).count()
    return NotificationListOut(items=items, unread_count=unread)


@app.post("/api/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    if not n.is_read:
        n.is_read = True
        db.commit()
    return {"message": "Marked as read"}


@app.post("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read"}


@app.delete("/api/notifications/{notif_id}")
def delete_notification(
    notif_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id, Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(404, "Notification not found")
    db.delete(n)
    db.commit()
    return {"message": "Notification deleted"}


@app.delete("/api/notifications")
def clear_all_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete every notification for the current user. Irreversible."""
    n = db.query(Notification).filter(
        Notification.user_id == current_user.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Cleared {n} notifications"}


@app.post("/api/notifications/self", response_model=NotificationOut, status_code=201)
def post_self_notification(
    payload: NotificationSelfCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The frontend posts UI feedback (saves, errors, confirmations) here
    so it shows up in the bell dropdown instead of as a transient on-screen
    toast. Rate-limited per user to prevent runaway loops."""
    if not rate_limit(f"selfnotif:{current_user.id}", max_calls=120, window_seconds=60):
        raise HTTPException(429, "Too many notifications")
    return add_notification(
        db, user_id=current_user.id,
        event_type=payload.event_type,
        title=payload.title,
        body=payload.body,
        link=payload.link,
    )


@app.post("/api/users/me/welcome-seen", response_model=UserOut)
def mark_welcome_seen(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marks the welcome page as seen so it doesn't appear on subsequent
    logins. Idempotent — safe to call any time."""
    if not current_user.welcome_seen:
        current_user.welcome_seen = True
        db.commit()
        db.refresh(current_user)
    return current_user


# Test-only: read the latest email captured in memory. Only available when
# the backend is started with TEST_MODE=1 — production never exposes this.
@app.get("/api/_test/inbox/{email}")
def test_inbox(email: str):
    if not TEST_MODE:
        raise HTTPException(404, "Not found")
    emails = _test_email_inbox.get(email, [])
    return {"emails": emails, "latest": emails[-1] if emails else None}


# --------------------------------------------------------------------------- #
# Avatar upload (unchanged from earlier phases)
# --------------------------------------------------------------------------- #
@app.post("/api/users/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, WEBP, or GIF images are allowed")
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(400, "Image must be smaller than 2 MB")
    if len(data) < 100:
        raise HTTPException(400, "Image appears to be empty or corrupt")

    ext = {
        "image/jpeg": ".jpg", "image/png": ".png",
        "image/webp": ".webp", "image/gif": ".gif",
    }[file.content_type]
    filename = f"u{current_user.id}_{secrets.token_hex(8)}{ext}"
    path = os.path.join(AVATAR_DIR, filename)
    with open(path, "wb") as f:
        f.write(data)

    # Remove previous avatar file if any
    if current_user.avatar_url:
        old = current_user.avatar_url.rsplit("/", 1)[-1]
        old_path = os.path.join(AVATAR_DIR, old)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    current_user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@app.delete("/api/users/me/avatar", response_model=UserOut)
def remove_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.avatar_url:
        old = current_user.avatar_url.rsplit("/", 1)[-1]
        old_path = os.path.join(AVATAR_DIR, old)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
        current_user.avatar_url = None
        db.commit()
        db.refresh(current_user)
    return current_user


@app.delete("/api/users/me")
def delete_account(
    body: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(401, "Password is incorrect")
    # Cascade-delete conversations + messages owned by this user
    conv_ids = [
        c.id for c in db.query(Conversation.id)
        .filter(Conversation.user_id == current_user.id).all()
    ]
    if conv_ids:
        db.query(Message).filter(Message.conversation_id.in_(conv_ids)).delete(
            synchronize_session=False
        )
        db.query(Conversation).filter(Conversation.user_id == current_user.id).delete(
            synchronize_session=False
        )
    if current_user.avatar_url:
        old = current_user.avatar_url.rsplit("/", 1)[-1]
        old_path = os.path.join(AVATAR_DIR, old)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted"}


@app.get("/api/users/me/export")
def export_account_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a JSON snapshot of the user's account + conversations."""
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_date)
        .all()
    )
    out_convs = []
    for c in convs:
        msgs = (
            db.query(Message)
            .filter(Message.conversation_id == c.id)
            .order_by(Message.created_date)
            .all()
        )
        out_convs.append({
            "id": c.id,
            "title": c.title,
            "is_pinned": c.is_pinned,
            "is_archived": c.is_archived,
            "created_date": c.created_date.isoformat() if c.created_date else None,
            "updated_date": c.updated_date.isoformat() if c.updated_date else None,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_date": m.created_date.isoformat() if m.created_date else None,
                }
                for m in msgs
            ],
        })
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "last_login_at": current_user.last_login_at.isoformat() if current_user.last_login_at else None,
        },
        "conversations": out_convs,
        "exported_at": _now_utc().isoformat(),
    }


# -------------------------- Conversations ---------------------------------- #
@app.get("/api/conversations", response_model=List[ConversationOut])
def list_conversations(
    archived: Optional[bool] = None,
    q: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Conversation).filter(Conversation.user_id == current_user.id)
    if archived is not None:
        query = query.filter(Conversation.is_archived == archived)
    if q:
        like = f"%{q.strip()}%"
        # match conversation title OR any message body within the conversation
        matching_conv_ids = {
            cid for (cid,) in
            db.query(Message.conversation_id)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .filter(Conversation.user_id == current_user.id)
            .filter(Message.content.ilike(like))
            .distinct()
            .all()
        }
        if matching_conv_ids:
            query = query.filter(
                or_(Conversation.title.ilike(like), Conversation.id.in_(matching_conv_ids))
            )
        else:
            query = query.filter(Conversation.title.ilike(like))
    return (
        query.order_by(
            Conversation.is_pinned.desc(),
            Conversation.updated_date.desc(),
        ).all()
    )


@app.post("/api/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(
    conv: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_conv = Conversation(user_id=current_user.id, title=conv.title or "New chat")
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    return new_conv


@app.get("/api/conversations/{conv_id}/messages", response_model=List[MessageOut])
def get_messages(
    conv_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_date)
        .all()
    )


@app.patch("/api/conversations/{conv_id}", response_model=ConversationOut)
def update_conversation(
    conv_id: int,
    conv_update: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv_update.title is not None:
        title = conv_update.title.strip()[:120] or "New chat"
        conv.title = title
    if conv_update.is_pinned is not None:
        conv.is_pinned = conv_update.is_pinned
    if conv_update.is_archived is not None:
        conv.is_archived = conv_update.is_archived
    db.commit()
    db.refresh(conv)
    return conv


@app.delete("/api/conversations/{conv_id}")
def delete_conversation(
    conv_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(404, "Conversation not found")
    db.query(Message).filter(Message.conversation_id == conv_id).delete()
    db.delete(conv)
    db.commit()
    return {"message": "Deleted"}


# ---------------------------- Activity (user) ------------------------------ #
@app.get("/api/users/me/activity", response_model=List[ActivityLogOut])
def my_activity(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return this user's own recent security/audit events."""
    limit = max(1, min(limit, 200))
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == current_user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )


# ---------------------------- Support tickets (user) ----------------------- #
def _ticket_to_detail(t: SupportTicket, msgs: List[SupportMessage], user: User) -> dict:
    return {
        "id": t.id, "user_id": t.user_id, "subject": t.subject,
        "status": t.status, "priority": t.priority, "assigned_to": t.assigned_to,
        "created_at": t.created_at, "updated_at": t.updated_at,
        "messages": msgs,
        "user_email": user.email if user else None,
        "user_full_name": user.full_name if user else None,
    }


@app.get("/api/tickets", response_model=List[TicketOut])
def list_my_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(SupportTicket)
        .filter(SupportTicket.user_id == current_user.id)
        .order_by(SupportTicket.updated_at.desc())
        .all()
    )


@app.post("/api/tickets", response_model=TicketOut, status_code=201)
def create_ticket(
    payload: TicketCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not rate_limit(f"ticket:{current_user.id}", max_calls=10, window_seconds=3600):
        raise HTTPException(429, "Too many tickets opened recently. Please wait.")
    ticket = SupportTicket(
        user_id=current_user.id,
        subject=payload.subject.strip(),
        priority=payload.priority,
        status="open",
    )
    db.add(ticket)
    db.flush()
    db.add(SupportMessage(
        ticket_id=ticket.id, author_id=current_user.id,
        body=payload.body.strip(), is_staff_reply=False,
    ))
    log_activity(
        db, user_id=current_user.id, event_type="ticket_opened",
        description=f"#{ticket.id}: {ticket.subject[:80]}",
        request=request,
    )
    db.commit()
    db.refresh(ticket)
    return ticket


@app.get("/api/tickets/{ticket_id}", response_model=TicketDetail)
def get_ticket(
    ticket_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Only the owner or any admin may view it
    if ticket.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(404, "Ticket not found")
    msgs = (
        db.query(SupportMessage)
        .filter(SupportMessage.ticket_id == ticket_id)
        .order_by(SupportMessage.created_at)
        .all()
    )
    owner = db.query(User).filter(User.id == ticket.user_id).first()
    return _ticket_to_detail(ticket, msgs, owner)


@app.post("/api/tickets/{ticket_id}/reply", response_model=TicketDetail)
def reply_to_ticket(
    ticket_id: int,
    reply: TicketReply,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    is_admin = current_user.role == "admin"
    if ticket.user_id != current_user.id and not is_admin:
        raise HTTPException(404, "Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(400, "This ticket is closed")

    db.add(SupportMessage(
        ticket_id=ticket_id, author_id=current_user.id,
        body=reply.body.strip(), is_staff_reply=is_admin,
    ))
    # Auto-status transitions: staff reply on "open" -> "in_progress";
    # user reply on "resolved" -> "open" (re-opened)
    if is_admin and ticket.status == "open":
        ticket.status = "in_progress"
    elif not is_admin and ticket.status == "resolved":
        ticket.status = "open"
    ticket.updated_at = _now_utc()
    db.commit()
    db.refresh(ticket)

    # Notify the ticket owner when a staff member replies (skip if owner is
    # the one replying — that's their own message).
    if is_admin and ticket.user_id != current_user.id:
        try:
            add_notification(
                db, user_id=ticket.user_id, event_type="ticket_reply",
                title="Support replied to your ticket",
                body=f'"{ticket.subject}"',
                link=f"/support/{ticket_id}",
            )
        except Exception:
            pass

    msgs = (
        db.query(SupportMessage)
        .filter(SupportMessage.ticket_id == ticket_id)
        .order_by(SupportMessage.created_at)
        .all()
    )
    owner = db.query(User).filter(User.id == ticket.user_id).first()
    return _ticket_to_detail(ticket, msgs, owner)


# --------------------------- Admin endpoints ------------------------------- #
@app.get("/api/admin/stats", response_model=AdminStats)
def admin_stats(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    since_24h = _now_utc() - timedelta(hours=24)
    return AdminStats(
        total_users=db.query(User).count(),
        new_users_24h=db.query(User).filter(User.created_at >= since_24h).count(),
        admin_users=db.query(User).filter(User.role == "admin").count(),
        locked_users=db.query(User).filter(User.locked_until > _now_utc()).count(),
        total_conversations=db.query(Conversation).count(),
        total_tickets=db.query(SupportTicket).count(),
        open_tickets=db.query(SupportTicket).filter(SupportTicket.status == "open").count(),
        in_progress_tickets=db.query(SupportTicket).filter(SupportTicket.status == "in_progress").count(),
        resolved_tickets=db.query(SupportTicket).filter(SupportTicket.status == "resolved").count(),
        failed_logins_24h=db.query(ActivityLog).filter(
            ActivityLog.event_type == "login_failed",
            ActivityLog.created_at >= since_24h,
        ).count(),
    )


@app.get("/api/admin/users", response_model=List[AdminUserDetail])
def admin_list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 100,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    query = db.query(User)
    if role in ("user", "admin"):
        query = query.filter(User.role == role)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(User.email.ilike(like), User.username.ilike(like), User.full_name.ilike(like))
        )
    users = query.order_by(User.created_at.desc()).limit(limit).all()
    out = []
    for u in users:
        cc = db.query(Conversation).filter(Conversation.user_id == u.id).count()
        tc = db.query(SupportTicket).filter(SupportTicket.user_id == u.id).count()
        out.append(AdminUserDetail(
            id=u.id, email=u.email, username=u.username, full_name=u.full_name,
            avatar_url=u.avatar_url, role=u.role,
            last_login_at=u.last_login_at, created_at=u.created_at,
            failed_login_attempts=u.failed_login_attempts or 0,
            locked_until=u.locked_until,
            is_locked=_is_locked(u),
            conversation_count=cc, ticket_count=tc,
        ))
    return out


@app.get("/api/admin/users/{user_id}", response_model=AdminUserDetail)
def admin_get_user(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")
    cc = db.query(Conversation).filter(Conversation.user_id == u.id).count()
    tc = db.query(SupportTicket).filter(SupportTicket.user_id == u.id).count()
    return AdminUserDetail(
        id=u.id, email=u.email, username=u.username, full_name=u.full_name,
        avatar_url=u.avatar_url, role=u.role,
        last_login_at=u.last_login_at, created_at=u.created_at,
        failed_login_attempts=u.failed_login_attempts or 0,
        locked_until=u.locked_until,
        is_locked=_is_locked(u),
        conversation_count=cc, ticket_count=tc,
    )


@app.get("/api/admin/users/{user_id}/activity", response_model=List[ActivityLogOut])
def admin_user_activity(
    user_id: int,
    limit: int = 100,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )


@app.patch("/api/admin/users/{user_id}", response_model=AdminUserDetail)
def admin_update_user(
    user_id: int,
    update: AdminUserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id and update.role == "user":
        raise HTTPException(400, "You cannot demote yourself.")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")

    changes = []
    role_changed_to = None
    if update.role is not None and update.role != u.role:
        changes.append(f"role {u.role} → {update.role}")
        role_changed_to = update.role
        u.role = update.role
    if update.locked is True and not _is_locked(u):
        u.locked_until = _now_utc() + timedelta(days=365 * 100)
        changes.append("account locked")
    elif update.locked is False and _is_locked(u):
        u.locked_until = None
        u.failed_login_attempts = 0
        changes.append("account unlocked")

    if changes:
        log_activity(
            db, user_id=u.id, actor_id=admin.id, event_type="admin_user_updated",
            description="; ".join(changes), request=request,
        )
    db.commit()
    db.refresh(u)

    # Notify the user about a role change (skip notifying admin acting on self)
    if role_changed_to and u.id != admin.id:
        try:
            label = "You're now an admin." if role_changed_to == "admin" else "Your admin role was removed."
            add_notification(
                db, user_id=u.id, event_type="role_changed",
                title="Role updated", body=label,
            )
        except Exception:
            pass

    cc = db.query(Conversation).filter(Conversation.user_id == u.id).count()
    tc = db.query(SupportTicket).filter(SupportTicket.user_id == u.id).count()
    return AdminUserDetail(
        id=u.id, email=u.email, username=u.username, full_name=u.full_name,
        avatar_url=u.avatar_url, role=u.role,
        last_login_at=u.last_login_at, created_at=u.created_at,
        failed_login_attempts=u.failed_login_attempts or 0,
        locked_until=u.locked_until, is_locked=_is_locked(u),
        conversation_count=cc, ticket_count=tc,
    )


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own account here. Use Settings.")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(404, "User not found")

    conv_ids = [c.id for c in db.query(Conversation.id).filter(Conversation.user_id == u.id).all()]
    if conv_ids:
        db.query(Message).filter(Message.conversation_id.in_(conv_ids)).delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.user_id == u.id).delete(synchronize_session=False)
    # Cascade tickets + messages owned by this user
    ticket_ids = [t.id for t in db.query(SupportTicket.id).filter(SupportTicket.user_id == u.id).all()]
    if ticket_ids:
        db.query(SupportMessage).filter(SupportMessage.ticket_id.in_(ticket_ids)).delete(synchronize_session=False)
        db.query(SupportTicket).filter(SupportTicket.user_id == u.id).delete(synchronize_session=False)
    # Avatar file
    if u.avatar_url:
        old = u.avatar_url.rsplit("/", 1)[-1]
        old_path = os.path.join(AVATAR_DIR, old)
        if os.path.exists(old_path):
            try: os.remove(old_path)
            except OSError: pass
    deleted_email = u.email
    log_activity(
        db, user_id=None, actor_id=admin.id, event_type="admin_user_deleted",
        description=f"Deleted account: {deleted_email} (id {u.id})",
        request=request,
    )
    db.delete(u)
    db.commit()
    return {"message": "User deleted", "email": deleted_email}


@app.get("/api/admin/activity", response_model=List[ActivityLogOut])
def admin_recent_activity(
    limit: int = 100,
    event_type: Optional[str] = None,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 500))
    query = db.query(ActivityLog)
    if event_type:
        query = query.filter(ActivityLog.event_type == event_type)
    return query.order_by(ActivityLog.created_at.desc()).limit(limit).all()


@app.get("/api/admin/tickets", response_model=List[TicketOut])
def admin_list_tickets(
    status: Optional[str] = None,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(SupportTicket)
    if status in ("open", "in_progress", "resolved", "closed"):
        query = query.filter(SupportTicket.status == status)
    return query.order_by(SupportTicket.updated_at.desc()).all()


@app.patch("/api/admin/tickets/{ticket_id}", response_model=TicketOut)
def admin_update_ticket(
    ticket_id: int,
    update: TicketUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    changes = []
    if update.status is not None and update.status != t.status:
        changes.append(f"status {t.status} → {update.status}")
        t.status = update.status
    if update.priority is not None and update.priority != t.priority:
        if update.priority not in ("low", "normal", "high", "urgent"):
            raise HTTPException(400, "invalid priority")
        changes.append(f"priority {t.priority} → {update.priority}")
        t.priority = update.priority
    if update.assigned_to is not None and update.assigned_to != t.assigned_to:
        assignee = db.query(User).filter(User.id == update.assigned_to, User.role == "admin").first()
        if not assignee:
            raise HTTPException(400, "assignee must be an admin")
        changes.append(f"assigned to admin #{update.assigned_to}")
        t.assigned_to = update.assigned_to

    if changes:
        log_activity(
            db, user_id=t.user_id, actor_id=admin.id, event_type="admin_ticket_updated",
            description=f"Ticket #{t.id}: " + "; ".join(changes),
            request=request,
        )
    t.updated_at = _now_utc()
    db.commit()
    db.refresh(t)
    return t


# --------------------------- Module helpers -------------------------------- #
def _module_out(m: Module, q_count: int) -> ModuleOut:
    return ModuleOut(
        id=m.id, name=m.name, slug=m.slug, description=m.description,
        icon=m.icon, system_prompt=m.system_prompt,
        is_active=m.is_active, sort_order=m.sort_order,
        question_count=q_count, created_at=m.created_at, updated_at=m.updated_at,
    )


def _unique_slug(db: Session, base: str, exclude_id: Optional[int] = None) -> str:
    """Ensure slug uniqueness by appending -2, -3, ... if needed."""
    slug = base
    n = 2
    while True:
        q = db.query(Module).filter(Module.slug == slug)
        if exclude_id is not None:
            q = q.filter(Module.id != exclude_id)
        if not q.first():
            return slug
        slug = f"{base}-{n}"
        n += 1


# ----------------------------- Modules (public) ---------------------------- #
@app.get("/api/modules", response_model=List[ModuleOut])
def list_modules_public(
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List active modules (visible to any signed-in user)."""
    mods = (
        db.query(Module)
        .filter(Module.is_active == True)  # noqa: E712
        .order_by(Module.sort_order, Module.name)
        .all()
    )
    out = []
    for m in mods:
        qc = db.query(ModuleQuestion).filter(
            ModuleQuestion.module_id == m.id,
            ModuleQuestion.is_active == True,  # noqa: E712
        ).count()
        out.append(_module_out(m, qc))
    return out


def _category_out(c: ModuleCategory, q_count: int) -> ModuleCategoryOut:
    return ModuleCategoryOut(
        id=c.id, module_id=c.module_id, name=c.name, slug=c.slug,
        sort_order=c.sort_order, question_count=q_count,
        created_at=c.created_at, updated_at=c.updated_at,
    )


def _build_module_detail(m: Module, db: Session, *, active_only: bool) -> dict:
    """Return ModuleDetail-shaped dict with categories and questions ordered
    by sort_order. If active_only, hides inactive questions (categories are
    always returned but might end up empty for the user view)."""
    cats_q = db.query(ModuleCategory).filter(ModuleCategory.module_id == m.id)
    cats = cats_q.order_by(ModuleCategory.sort_order, ModuleCategory.id).all()

    qs_q = db.query(ModuleQuestion).filter(ModuleQuestion.module_id == m.id)
    if active_only:
        qs_q = qs_q.filter(ModuleQuestion.is_active == True)  # noqa: E712
    qs = qs_q.order_by(ModuleQuestion.sort_order, ModuleQuestion.id).all()

    # category question counts (active or total, matching the question filter)
    cat_counts = {c.id: 0 for c in cats}
    for q in qs:
        if q.category_id is not None and q.category_id in cat_counts:
            cat_counts[q.category_id] += 1

    base = _module_out(m, len(qs)).model_dump()
    base["categories"] = [_category_out(c, cat_counts[c.id]).model_dump() for c in cats]
    base["questions"] = [ModuleQuestionOut.model_validate(q).model_dump() for q in qs]
    return base


@app.get("/api/modules/{slug}", response_model=ModuleDetail)
def get_module_public(
    slug: str,
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.slug == slug, Module.is_active == True).first()  # noqa: E712
    if not m:
        raise HTTPException(404, "Module not found")
    return ModuleDetail.model_validate(_build_module_detail(m, db, active_only=True))


# ----------------------------- Modules (admin) ----------------------------- #
@app.get("/api/admin/modules", response_model=List[ModuleOut])
def admin_list_modules(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    mods = db.query(Module).order_by(Module.sort_order, Module.name).all()
    out = []
    for m in mods:
        qc = db.query(ModuleQuestion).filter(ModuleQuestion.module_id == m.id).count()
        out.append(_module_out(m, qc))
    return out


@app.get("/api/admin/modules/{module_id}", response_model=ModuleDetail)
def admin_get_module(
    module_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    return ModuleDetail.model_validate(_build_module_detail(m, db, active_only=False))


@app.post("/api/admin/modules", response_model=ModuleOut, status_code=201)
def admin_create_module(
    payload: ModuleCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    slug_base = _slugify(payload.slug or payload.name)
    slug = _unique_slug(db, slug_base)
    m = Module(
        name=payload.name.strip(), slug=slug,
        description=(payload.description or "").strip() or None,
        icon=(payload.icon or "").strip() or None,
        system_prompt=(payload.system_prompt or "").strip() or None,
        is_active=payload.is_active if payload.is_active is not None else True,
        sort_order=payload.sort_order or 0,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _module_out(m, 0)


@app.patch("/api/admin/modules/{module_id}", response_model=ModuleOut)
def admin_update_module(
    module_id: int,
    payload: ModuleUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    if payload.name is not None:       m.name = payload.name.strip()
    if payload.description is not None: m.description = payload.description.strip() or None
    if payload.icon is not None:       m.icon = payload.icon.strip() or None
    if payload.system_prompt is not None:
        m.system_prompt = payload.system_prompt.strip() or None
    if payload.is_active is not None:  m.is_active = payload.is_active
    if payload.sort_order is not None: m.sort_order = payload.sort_order
    if payload.slug is not None:
        new_slug = _slugify(payload.slug)
        if new_slug != m.slug:
            m.slug = _unique_slug(db, new_slug, exclude_id=m.id)
    db.commit()
    db.refresh(m)
    qc = db.query(ModuleQuestion).filter(ModuleQuestion.module_id == m.id).count()
    return _module_out(m, qc)


@app.delete("/api/admin/modules/{module_id}")
def admin_delete_module(
    module_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")
    db.query(ModuleQuestion).filter(ModuleQuestion.module_id == m.id).delete(synchronize_session=False)
    db.query(ModuleCategory).filter(ModuleCategory.module_id == m.id).delete(synchronize_session=False)
    db.delete(m)
    db.commit()
    return {"message": "Module deleted"}


# ----------------------------- Questions (admin) --------------------------- #
@app.post("/api/admin/modules/{module_id}/questions", response_model=ModuleQuestionOut, status_code=201)
def admin_create_question(
    module_id: int,
    payload: ModuleQuestionCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")

    # Validate category belongs to this module if provided
    cat_id = payload.category_id
    if cat_id:
        c = db.query(ModuleCategory).filter(
            ModuleCategory.id == cat_id, ModuleCategory.module_id == module_id
        ).first()
        if not c:
            raise HTTPException(400, "category_id does not belong to this module")

    q = ModuleQuestion(
        module_id=module_id,
        category_id=cat_id,
        prompt=payload.prompt.strip(),
        answer=payload.answer.strip(),
        is_active=payload.is_active if payload.is_active is not None else True,
        sort_order=payload.sort_order or 0,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@app.patch("/api/admin/questions/{question_id}", response_model=ModuleQuestionOut)
def admin_update_question(
    question_id: int,
    payload: ModuleQuestionUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ModuleQuestion).filter(ModuleQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")
    if payload.prompt is not None:    q.prompt = payload.prompt.strip()
    if payload.answer is not None:    q.answer = payload.answer.strip()
    if payload.is_active is not None: q.is_active = payload.is_active
    if payload.sort_order is not None: q.sort_order = payload.sort_order
    # category_id: 0 = uncategorize; >0 = move to that category (validated);
    # None (not provided) = unchanged.
    if payload.category_id is not None:
        if payload.category_id == 0:
            q.category_id = None
        else:
            c = db.query(ModuleCategory).filter(
                ModuleCategory.id == payload.category_id,
                ModuleCategory.module_id == q.module_id,
            ).first()
            if not c:
                raise HTTPException(400, "category_id does not belong to this question's module")
            q.category_id = payload.category_id
    db.commit()
    db.refresh(q)
    return q


@app.delete("/api/admin/questions/{question_id}")
def admin_delete_question(
    question_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ModuleQuestion).filter(ModuleQuestion.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")
    db.delete(q)
    db.commit()
    return {"message": "Question deleted"}


# ----------------------------- Categories (admin) -------------------------- #
@app.post("/api/admin/modules/{module_id}/categories",
          response_model=ModuleCategoryOut, status_code=201)
def admin_create_category(
    module_id: int,
    payload: ModuleCategoryCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")

    # Slug unique within module — auto-suffix on collision
    base = _slugify(payload.name)
    slug = base
    n = 2
    while db.query(ModuleCategory).filter(
        ModuleCategory.module_id == module_id, ModuleCategory.slug == slug,
    ).first():
        slug = f"{base}-{n}"
        n += 1

    # Append at end: next sort_order
    last = (
        db.query(ModuleCategory)
        .filter(ModuleCategory.module_id == module_id)
        .order_by(ModuleCategory.sort_order.desc())
        .first()
    )
    next_order = (last.sort_order + 1) if last else 0

    c = ModuleCategory(
        module_id=module_id, name=payload.name.strip(),
        slug=slug, sort_order=next_order,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _category_out(c, 0)


@app.patch("/api/admin/categories/{category_id}", response_model=ModuleCategoryOut)
def admin_update_category(
    category_id: int,
    payload: ModuleCategoryUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.query(ModuleCategory).filter(ModuleCategory.id == category_id).first()
    if not c:
        raise HTTPException(404, "Category not found")
    if payload.name is not None:
        c.name = payload.name.strip()
    if payload.sort_order is not None:
        c.sort_order = payload.sort_order
    db.commit()
    db.refresh(c)
    qc = db.query(ModuleQuestion).filter(ModuleQuestion.category_id == c.id).count()
    return _category_out(c, qc)


@app.delete("/api/admin/categories/{category_id}")
def admin_delete_category(
    category_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    c = db.query(ModuleCategory).filter(ModuleCategory.id == category_id).first()
    if not c:
        raise HTTPException(404, "Category not found")
    # Detach questions instead of deleting them — they become uncategorized.
    db.query(ModuleQuestion).filter(
        ModuleQuestion.category_id == category_id
    ).update({"category_id": None}, synchronize_session=False)
    db.delete(c)
    db.commit()
    return {"message": "Category deleted; its questions are now uncategorized."}


# ----------------------------- Reorder (admin) ----------------------------- #
def _reorder(db: Session, model, ids: List[int], scope_filter=None) -> int:
    """Rewrite sort_order for the given IDs to be 0..N-1 in the given order.

    `scope_filter` is an optional SQLAlchemy filter clause that constrains
    which rows are eligible (e.g. all categories must belong to one module).
    Returns the number of rows actually updated.
    """
    if not ids:
        return 0
    q = db.query(model).filter(model.id.in_(ids))
    if scope_filter is not None:
        q = q.filter(scope_filter)
    rows = q.all()
    by_id = {r.id: r for r in rows}
    if len(by_id) != len(set(ids)):
        # Some IDs were missing or didn't match the scope filter
        raise HTTPException(400, "Some IDs are not in the expected scope")
    for index, row_id in enumerate(ids):
        by_id[row_id].sort_order = index
    db.commit()
    return len(rows)


@app.post("/api/admin/modules/reorder")
def admin_reorder_modules(
    payload: ReorderPayload,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    n = _reorder(db, Module, payload.ids)
    return {"message": f"Reordered {n} modules"}


@app.post("/api/admin/modules/{module_id}/categories/reorder")
def admin_reorder_categories(
    module_id: int,
    payload: ReorderPayload,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.query(Module).filter(Module.id == module_id).first():
        raise HTTPException(404, "Module not found")
    n = _reorder(db, ModuleCategory, payload.ids,
                 scope_filter=(ModuleCategory.module_id == module_id))
    return {"message": f"Reordered {n} categories"}


@app.post("/api/admin/modules/{module_id}/questions/reorder")
def admin_reorder_questions(
    module_id: int,
    payload: ReorderPayload,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not db.query(Module).filter(Module.id == module_id).first():
        raise HTTPException(404, "Module not found")
    n = _reorder(db, ModuleQuestion, payload.ids,
                 scope_filter=(ModuleQuestion.module_id == module_id))
    return {"message": f"Reordered {n} questions"}


# ----------------------------- Import / Export ----------------------------- #
@app.get("/api/admin/modules/{module_id}/export")
def admin_export_module(
    module_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Serialize a module to JSON. Symmetric with the import endpoint:
    feed an exported file back in and the module reappears with a fresh
    slug.

    The shape is portable (uses category *names* rather than IDs) so an
    export from one instance can be imported into another."""
    m = db.query(Module).filter(Module.id == module_id).first()
    if not m:
        raise HTTPException(404, "Module not found")

    cats = (
        db.query(ModuleCategory)
        .filter(ModuleCategory.module_id == m.id)
        .order_by(ModuleCategory.sort_order, ModuleCategory.id)
        .all()
    )
    qs = (
        db.query(ModuleQuestion)
        .filter(ModuleQuestion.module_id == m.id)
        .order_by(ModuleQuestion.sort_order, ModuleQuestion.id)
        .all()
    )
    cat_by_id = {c.id: c for c in cats}

    return {
        "format_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "name": m.name,
        "description": m.description,
        "icon": m.icon,
        "system_prompt": m.system_prompt,
        "is_active": m.is_active,
        "categories": [
            {"name": c.name, "sort_order": c.sort_order} for c in cats
        ],
        "questions": [
            {
                "prompt": q.prompt,
                "answer": q.answer,
                "category_name": cat_by_id[q.category_id].name if q.category_id else None,
                "is_active": q.is_active,
                "sort_order": q.sort_order,
            }
            for q in qs
        ],
    }


@app.post("/api/admin/modules/import", response_model=ModuleDetail, status_code=201)
def admin_import_module(
    payload: ModuleImport,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new module from the JSON shape produced by /export.

    Always creates fresh — never overwrites an existing module. The
    user-supplied name is slugified and `-2`, `-3` etc. is appended if
    needed so two imports of the same export create siblings, not
    conflicts.

    Category references are matched by name (within the new module).
    Questions referring to a missing category land uncategorized rather
    than failing the whole import.
    """
    slug = _unique_slug(db, _slugify(payload.name))
    m = Module(
        name=payload.name.strip(), slug=slug,
        description=(payload.description or "").strip() or None,
        icon=(payload.icon or "").strip() or None,
        system_prompt=(payload.system_prompt or "").strip() or None,
        is_active=payload.is_active if payload.is_active is not None else True,
        sort_order=0,
    )
    db.add(m)
    db.flush()  # populate m.id

    cat_by_name: dict[str, ModuleCategory] = {}
    for idx, cat in enumerate(payload.categories):
        c = ModuleCategory(
            module_id=m.id,
            name=cat.name.strip(),
            slug=_slugify(cat.name),
            sort_order=cat.sort_order if cat.sort_order is not None else idx,
        )
        db.add(c)
        db.flush()
        cat_by_name[c.name] = c

    for idx, q in enumerate(payload.questions):
        cat = cat_by_name.get(q.category_name) if q.category_name else None
        db.add(ModuleQuestion(
            module_id=m.id,
            category_id=cat.id if cat else None,
            prompt=q.prompt.strip(),
            answer=q.answer.strip(),
            is_active=q.is_active if q.is_active is not None else True,
            sort_order=q.sort_order if q.sort_order is not None else idx,
        ))

    db.commit()
    db.refresh(m)
    log.info("module imported", extra={
        "module_id": m.id, "name": m.name, "slug": m.slug,
        "n_categories": len(payload.categories),
        "n_questions": len(payload.questions),
    })
    return ModuleDetail.model_validate(_build_module_detail(m, db, active_only=False))


# ----------------------------- Chat (REST) --------------------------------- #
@app.post("/api/chat/send", response_model=ChatResponse)
def send_message(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv_id = req.conversation_id
    if conv_id is None:
        conv = Conversation(user_id=current_user.id, title=smart_title(req.message))
        db.add(conv)
        db.commit()
        db.refresh(conv)
        conv_id = conv.id
    else:
        conv = (
            db.query(Conversation)
            .filter(Conversation.id == conv_id, Conversation.user_id == current_user.id)
            .first()
        )
        if not conv:
            raise HTTPException(404, "Conversation not found")

    db.add(Message(conversation_id=conv_id, role="user", content=req.message))
    ai_response = get_ai_response(req.message, db=db)
    db.add(Message(conversation_id=conv_id, role="assistant", content=ai_response))
    conv.updated_date = func.now()
    db.commit()
    return ChatResponse(conversation_id=conv_id, response=ai_response)


# --------------------------- Chat (WebSocket) ------------------------------ #
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    try:
        user = await get_current_user_ws(websocket, db)
        if not user:
            return

        while True:
            data = await websocket.receive_text()
            try:
                request = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid message format"})
                continue

            message = (request.get("message") or "").strip()
            conv_id = request.get("conversation_id")
            if not message:
                await websocket.send_json({"error": "Empty message"})
                continue

            if conv_id is None:
                conv = Conversation(user_id=user.id, title=smart_title(message))
                db.add(conv)
                db.commit()
                db.refresh(conv)
                conv_id = conv.id
                await websocket.send_json({"conversation_id": conv_id})
            else:
                conv = (
                    db.query(Conversation)
                    .filter(
                        Conversation.id == conv_id,
                        Conversation.user_id == user.id,
                    )
                    .first()
                )
                if not conv:
                    await websocket.send_json({"error": "Conversation not found"})
                    continue

            db.add(Message(conversation_id=conv_id, role="user", content=message))
            db.commit()

            # === Build the response ===
            # 1. Direct module hit? Stream the canned answer chunked (fast path).
            # 2. Else, route through the LLM provider.
            full_response = ""
            module_hit = _best_module_match(db, message)
            module_for_prompt = None
            history_msgs: List[dict] = []

            if module_hit:
                # Stream the curated answer with a small typing-feel delay so
                # the UI animation still plays. No LLM call required.
                full_response = module_hit.answer
                for i in range(0, len(full_response), 3):
                    await websocket.send_json({"chunk": full_response[i:i + 3]})
                    await asyncio.sleep(0.02)
            else:
                # Pick a module's system prompt if its name appears in the
                # user's message (cheap routing heuristic).
                msg_lower = message.lower()
                for m in db.query(Module).filter(
                    Module.is_active == True,  # noqa: E712
                ).order_by(Module.sort_order, Module.name).all():
                    if m.system_prompt and m.name.lower() in msg_lower:
                        module_for_prompt = m
                        break

                # Build short conversation history (last 10 turns) for context
                prior = (
                    db.query(Message)
                    .filter(Message.conversation_id == conv_id)
                    .order_by(Message.created_date.desc())
                    .limit(10)
                    .all()
                )
                # Exclude the user message we just inserted; we'll add it back at the end
                prior = [m for m in reversed(prior) if m.content != message or m.role != "user"]
                history_msgs = [{"role": m.role, "content": m.content} for m in prior]
                history_msgs.append({"role": "user", "content": message})

                from llm_providers import get_provider
                provider = get_provider()
                system_prompt = module_for_prompt.system_prompt if module_for_prompt else None

                try:
                    if provider.supports_streaming:
                        async for delta in provider.stream(history_msgs, system_prompt=system_prompt):
                            full_response += delta
                            await websocket.send_json({"chunk": delta})
                    else:
                        # Non-streaming provider: get the full response and chunk it
                        # in a background thread so the WS loop isn't blocked.
                        full_response = await asyncio.to_thread(
                            provider.generate, history_msgs, system_prompt,
                        )
                        for i in range(0, len(full_response), 3):
                            await websocket.send_json({"chunk": full_response[i:i + 3]})
                            await asyncio.sleep(0.02)
                except Exception as exc:
                    log.warning(
                        "LLM provider %s failed mid-stream, falling back to offline",
                        provider.name, extra={"err": repr(exc)},
                    )
                    from ai_engine import generate_response
                    full_response = generate_response(message)
                    # If we already sent partial chunks, tell the UI to reset
                    # by sending the full response as a final chunk after a
                    # newline marker. Simplest: send the remainder as one chunk.
                    await websocket.send_json({"chunk": full_response})

            db.add(
                Message(conversation_id=conv_id, role="assistant", content=full_response)
            )
            conv.updated_date = func.now()
            db.commit()
            await websocket.send_json({"done": True, "conversation_id": conv_id})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"error": str(exc)})
        except Exception:
            pass
    finally:
        db.close()


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
