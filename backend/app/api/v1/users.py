"""
Self-service profile picture endpoints for platform accounts.

POST   /api/v1/users/me/avatar         Upload/replace the caller's own avatar
DELETE /api/v1/users/me/avatar         Remove the caller's own avatar
GET    /api/v1/users/{user_id}/avatar  Fetch any user's avatar (any authenticated actor)

Security: all endpoints require X-Internal-Token + X-Actor-Id (bundled into
the AnyActiveActor dependency — see app/dependencies.py). Upload/delete
always act on the calling actor's own id; there is no "act on someone
else's avatar" case to authorize.
"""

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from app.core.ratelimit import limiter
from app.dependencies import AnyActiveActor
from app.services import avatar_service

router = APIRouter()


@router.post("/me/avatar", status_code=204, summary="Upload or replace your own avatar")
@limiter.limit("10/minute")
async def upload_my_avatar(
    request: Request,
    actor: AnyActiveActor,
    file: UploadFile = File(...),
) -> None:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    await avatar_service.save_avatar(actor.id, content)


@router.delete("/me/avatar", status_code=204, summary="Remove your own avatar")
async def delete_my_avatar(actor: AnyActiveActor) -> None:
    await avatar_service.delete_avatar(actor.id)


@router.get("/{user_id}/avatar", summary="Fetch a user's avatar")
async def get_user_avatar(user_id: str, _actor: AnyActiveActor) -> Response:
    content = await avatar_service.read_avatar(user_id)
    if content is None:
        raise HTTPException(status_code=404, detail="No avatar for this user.")
    return Response(
        content=content,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=3600"},
    )
