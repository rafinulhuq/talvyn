"""
Security utilities for magic link tokens.

Design:
  - Tokens are 32 random bytes encoded as URL-safe base64 (43 chars)
  - Tokens are NEVER stored raw — only their HMAC-SHA256 hash is persisted
  - Verification uses hmac.compare_digest() to prevent timing attacks
  - Each token is bound to the invitation ID to prevent substitution attacks

Token format (URL):
  /tests/<raw_token>

Storage:
  invitations.token_hash = HMAC-SHA256(raw_token, secret)

Verification flow:
  1. Receive raw_token from URL
  2. Compute HMAC-SHA256(raw_token, secret)
  3. Compare to stored hash using constant-time comparison
  4. Check invitation.expires_at > now()
  5. Check invitation.status is usable (not expired/revoked, and not
     completed unless there are still approved tests left to take)
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from app.config import get_settings

# ── Token generation ──────────────────────────────────────────

def generate_token() -> str:
    """
    Generate a cryptographically secure random token.

    Uses 32 bytes of entropy from os.urandom (via secrets module).
    Encoded as URL-safe base64 → 43 characters, no padding issues.

    Returns:
        Raw token string (43 chars). Never store this directly.
        Pass to hash_token() before saving to the database.
    """
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    """
    Compute an HMAC-SHA256 hash of the raw token using the app secret.

    This is what gets stored in the database. The raw token is only
    ever sent to the candidate's email and never persisted.

    Args:
        raw_token: The plaintext token from generate_token()

    Returns:
        Hex-encoded HMAC-SHA256 digest (64 characters).
    """
    settings = get_settings()
    secret = settings.magic_link_secret.encode("utf-8")
    return hmac.new(
        key=secret,
        msg=raw_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def verify_token(raw_token: str, stored_hash: str) -> bool:
    """
    Verify a candidate-provided token against the stored hash.

    Uses constant-time comparison to prevent timing attacks.

    Args:
        raw_token:   Token from the URL path parameter
        stored_hash: HMAC hash from the database

    Returns:
        True if the token matches the stored hash, False otherwise.
    """
    computed = hash_token(raw_token)
    return hmac.compare_digest(computed, stored_hash)


# ── Expiry helpers ────────────────────────────────────────────

def make_expiry(hours: int | None = None) -> datetime:
    """
    Return a timezone-aware UTC datetime for token expiry.

    Args:
        hours: Expiry window in hours. Defaults to MAGIC_LINK_EXPIRY_HOURS from settings.

    Returns:
        UTC datetime N hours from now.
    """
    settings = get_settings()
    expiry_hours = hours if hours is not None else settings.magic_link_expiry_hours
    return datetime.now(tz=UTC) + timedelta(hours=expiry_hours)


def is_expired(expires_at: datetime) -> bool:
    """
    Check whether a token has passed its expiry time.

    Handles both timezone-aware and naive datetimes safely.
    """
    now = datetime.now(tz=UTC)
    # Normalise naive datetimes (SQLite returns them without tz info)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return now > expires_at


# ── Magic link URL builder ────────────────────────────────────

def build_magic_link(raw_token: str, *, path_prefix: str = "tests") -> str:
    """
    Build the full magic link URL to send in the email.

    Args:
        raw_token:   The plaintext token (NOT the hash)
        path_prefix: "tests" (default, legacy single-test flow) or "exam"
                     (Master Prompt 2/3 sectioned question-bank flow — see
                     invitation_service.py, which picks this based on
                     whether the JD's approved tests are bank-mode).

    Returns:
        Full URL, e.g. https://app.example.com/tests/<token>
        or            https://app.example.com/exam/<token>
    """
    settings = get_settings()
    base = settings.magic_link_base_url.rstrip("/")
    return f"{base}/{path_prefix}/{raw_token}"


# ── Webhook signing ───────────────────────────────────────────
# Unlike magic-link tokens, each webhook subscription has its OWN secret
# (shown to the admin once at creation) rather than the shared app secret —
# so a leaked endpoint secret can't be used to forge other admins' deliveries.

def generate_webhook_secret() -> str:
    """Generate a 64-char hex secret for a new webhook subscription."""
    return secrets.token_hex(32)


def sign_webhook_payload(secret: str, body: bytes) -> str:
    """
    HMAC-SHA256 sign a webhook's raw JSON body with its subscription secret.

    Returns the hex digest. Receivers verify by recomputing this over the
    raw bytes they received and comparing with hmac.compare_digest.
    """
    return hmac.new(
        key=secret.encode("utf-8"),
        msg=body,
        digestmod=hashlib.sha256,
    ).hexdigest()


def build_public_link(public_slug: str) -> str:
    """
    Build the shareable public assessment link URL.

    Unlike build_magic_link(), this identifies the assessment only — not a
    candidate. Anyone with this URL can open the registration page; each
    submission mints its own private magic link via build_magic_link().

    Args:
        public_slug: The PublicAssessmentLink.public_slug (not a secret).

    Returns:
        Full URL, e.g. https://app.example.com/apply/<slug>
    """
    settings = get_settings()
    base = settings.magic_link_base_url.rstrip("/")
    return f"{base}/apply/{public_slug}"
