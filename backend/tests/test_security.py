"""
Unit tests for app.core.security.
No DB required — all pure functions.
"""

import time
from datetime import datetime, timedelta, timezone

from app.core.security import (
    build_magic_link,
    generate_token,
    hash_token,
    is_expired,
    make_expiry,
    verify_token,
)


class TestGenerateToken:

    def test_returns_string(self):
        assert isinstance(generate_token(), str)

    def test_43_chars_url_safe(self):
        token = generate_token()
        # urlsafe_b64encode(32 bytes) = 44 chars; urlsafe strips padding to 43
        assert len(token) == 43

    def test_tokens_are_unique(self):
        tokens = {generate_token() for _ in range(100)}
        assert len(tokens) == 100

    def test_no_url_unsafe_chars(self):
        for _ in range(20):
            token = generate_token()
            assert "+" not in token
            assert "/" not in token
            assert "=" not in token


class TestHashToken:

    def test_returns_64_hex_chars(self):
        result = hash_token("sometoken")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_same_input_same_output(self):
        assert hash_token("abc") == hash_token("abc")

    def test_different_inputs_different_hashes(self):
        assert hash_token("token_a") != hash_token("token_b")

    def test_hash_is_not_the_raw_token(self):
        token = "myrawtoken"
        assert hash_token(token) != token


class TestVerifyToken:

    def test_correct_token_verifies(self):
        token = generate_token()
        stored = hash_token(token)
        assert verify_token(token, stored) is True

    def test_wrong_token_fails(self):
        stored = hash_token("correct_token")
        assert verify_token("wrong_token", stored) is False

    def test_tampered_hash_fails(self):
        token = generate_token()
        stored = hash_token(token)
        tampered = stored[:-4] + "ffff"
        assert verify_token(token, tampered) is False

    def test_empty_token_fails(self):
        stored = hash_token("real_token")
        assert verify_token("", stored) is False

    def test_verify_is_constant_time(self):
        """
        Verify that verify_token doesn't leak timing info.
        Both calls should take similar time regardless of match position.
        This is a basic smoke test — proper timing attack testing
        requires statistical analysis.
        """
        token = generate_token()
        stored = hash_token(token)

        t1 = time.perf_counter()
        verify_token(token, stored)
        t1_elapsed = time.perf_counter() - t1

        t2 = time.perf_counter()
        verify_token("completely_wrong_token_value_x", stored)
        t2_elapsed = time.perf_counter() - t2

        # Both should complete within 10ms — not a strict timing test,
        # just ensures we're not doing something obviously slow
        assert t1_elapsed < 0.01
        assert t2_elapsed < 0.01


class TestIsExpired:

    def test_future_datetime_not_expired(self):
        future = datetime.now(tz=timezone.utc) + timedelta(hours=1)
        assert is_expired(future) is False

    def test_past_datetime_is_expired(self):
        past = datetime.now(tz=timezone.utc) - timedelta(seconds=1)
        assert is_expired(past) is True

    def test_naive_datetime_treated_as_utc(self):
        # SQLite returns naive datetimes — ensure they're handled correctly
        past_naive = datetime.utcnow() - timedelta(minutes=1)
        assert is_expired(past_naive) is True

    def test_future_naive_datetime_not_expired(self):
        future_naive = datetime.utcnow() + timedelta(hours=2)
        assert is_expired(future_naive) is False


class TestMakeExpiry:

    def test_default_is_72_hours_in_future(self):
        before = datetime.now(tz=timezone.utc)
        expiry = make_expiry()
        after = datetime.now(tz=timezone.utc)

        # Should be ~72 hours from "now" regardless of which side of the
        # make_expiry() call "now" is measured on.
        assert timedelta(hours=71, minutes=59) < (expiry - after)
        assert (expiry - before) < timedelta(hours=72, minutes=1)

    def test_custom_hours(self):
        expiry = make_expiry(hours=24)
        delta = expiry - datetime.now(tz=timezone.utc)
        assert timedelta(hours=23, minutes=59) < delta < timedelta(hours=24, minutes=1)

    def test_returns_timezone_aware(self):
        expiry = make_expiry()
        assert expiry.tzinfo is not None


class TestBuildMagicLink:

    def test_contains_token(self):
        token = "mytoken123"
        link = build_magic_link(token)
        assert token in link

    def test_contains_test_path(self):
        link = build_magic_link("abc")
        assert "/tests/" in link

    def test_no_double_slash(self):
        link = build_magic_link("token")
        # Should not have double slash between base and path
        assert "//tests/" not in link
