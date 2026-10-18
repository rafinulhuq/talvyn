package token

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// GenerateToken generates 32 cryptographically random bytes encoded as URL-safe base64 (43 chars).
// This matches the Python secrets.token_urlsafe(32) generator.
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken computes hex-encoded HMAC-SHA256 digest of raw token using secret key.
// Compatible with Python hmac.new(secret.encode(), raw_token.encode(), hashlib.sha256).hexdigest()
func HashToken(rawToken, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(rawToken))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyToken compares rawToken against stored HMAC-SHA256 hash using constant-time comparison.
func VerifyToken(rawToken, storedHash, secret string) bool {
	computed := HashToken(rawToken, secret)
	return subtle.ConstantTimeCompare([]byte(computed), []byte(storedHash)) == 1
}

// CompareInternalSecret validates internal API token in constant time.
func CompareInternalSecret(provided, expected string) bool {
	h1 := sha256.Sum256([]byte(provided))
	h2 := sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(h1[:], h2[:]) == 1
}
