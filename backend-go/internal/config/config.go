package config

import (
	"os"
	"strings"
)

// Config holds runtime configuration loaded from environment variables.
type Config struct {
	Port              string
	DatabaseURL       string
	InternalAPISecret string
	JWTSecret         string
	AppSecret         string
	Environment       string
	OllamaBaseURL     string
	CORSOrigins       []string
}

// Load reads configuration from process environment with secure defaults.
func Load() *Config {
	port := getEnv("PORT", "8000")
	dbURL := getEnv("DATABASE_URL", "postgresql://talvyn:talvyn_secret@localhost:5432/talvyn?sslmode=disable")
	internalSecret := getEnv("INTERNAL_API_SECRET", "change_me_in_production_32_char_min")
	jwtSecret := getEnv("JWT_SECRET", "talvyn_super_secret_jwt_key_2026")
	appSecret := getEnv("APP_SECRET", internalSecret)
	env := getEnv("ENVIRONMENT", "development")
	ollamaURL := getEnv("OLLAMA_BASE_URL", "http://localhost:11434")

	corsStr := getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000")
	var origins []string
	for _, o := range strings.Split(corsStr, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins = append(origins, o)
		}
	}

	return &Config{
		Port:              port,
		DatabaseURL:       dbURL,
		InternalAPISecret: internalSecret,
		JWTSecret:         jwtSecret,
		AppSecret:         appSecret,
		Environment:       env,
		OllamaBaseURL:     ollamaURL,
		CORSOrigins:       origins,
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}
