package domain

import "errors"

var (
	ErrNotFound          = errors.New("requested resource not found")
	ErrUnauthorized      = errors.New("authentication required or invalid credentials")
	ErrForbidden         = errors.New("insufficient privileges for operation")
	ErrConflict          = errors.New("resource conflict or invalid state transition")
	ErrBadRequest        = errors.New("invalid request parameters or payload")
	ErrInternal          = errors.New("internal server error")
	ErrAttemptTerminated = errors.New("attempt terminated due to integrity violation")
	ErrTokenExpired      = errors.New("invitation token has expired")
)
