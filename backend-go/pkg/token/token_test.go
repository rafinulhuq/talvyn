package token

import (
	"testing"
)

func TestTokenGenerationAndVerification(t *testing.T) {
	secret := "test_secret_32_bytes_super_secure_2026"

	rawToken, err := GenerateToken()
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	if len(rawToken) < 40 {
		t.Fatalf("raw token length too short: got %d, expected >= 40", len(rawToken))
	}

	hash := HashToken(rawToken, secret)
	if len(hash) != 64 {
		t.Fatalf("hash length mismatch: got %d, expected 64 hex chars", len(hash))
	}

	if !VerifyToken(rawToken, hash, secret) {
		t.Fatalf("token verification failed for valid token")
	}

	if VerifyToken("tampered_token", hash, secret) {
		t.Fatalf("token verification succeeded for tampered token")
	}

	if VerifyToken(rawToken, hash, "wrong_secret") {
		t.Fatalf("token verification succeeded for wrong secret")
	}
}

func TestCompareInternalSecret(t *testing.T) {
	secret := "my_internal_secret_key"
	if !CompareInternalSecret(secret, secret) {
		t.Fatalf("expected identical secrets to match")
	}

	if CompareInternalSecret("wrong", secret) {
		t.Fatalf("expected different secrets to not match")
	}
}
