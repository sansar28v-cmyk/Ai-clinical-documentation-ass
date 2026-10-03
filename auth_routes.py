import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from auth_and_db import (
    create_access_token,
    create_consultation,
    create_user,
    get_consultation_by_id,
    get_consultation_by_share_token,
    get_consultations_for_user,
    get_current_user,
    get_user_by_username,
    verify_password,
)

logger = logging.getLogger("auth-routes")

router = APIRouter(tags=["auth"])


class SignupRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=3)
    full_name: str = Field(..., min_length=2, max_length=100)


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateConsultationRequest(BaseModel):
    patient_name: str
    transcript: str
    speaker_turns: List[Dict[str, Any]] = Field(default_factory=list)
    note: Dict[str, Any] = Field(default_factory=dict)
    translated_plan: Optional[str] = None


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(req: SignupRequest):
    clean_username = req.username.strip()
    existing = get_user_by_username(clean_username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken. Please choose another.",
        )

    try:
        user = create_user(
            username=clean_username,
            password=req.password,
            full_name=req.full_name,
            role="doctor",
        )
        token = create_access_token({
            "sub": user["username"],
            "user_id": user["id"],
            "role": "doctor",
            "full_name": user["full_name"],
        })
        return {
            "message": "Doctor registered successfully",
            "access_token": token,
            "token_type": "bearer",
            "role": "doctor",
            "full_name": user["full_name"],
            "username": user["username"],
            "user_id": user["id"],
            "user": {
                "id": user["id"],
                "username": user["username"],
                "full_name": user["full_name"],
                "role": "doctor",
            },
        }
    except Exception as e:
        logger.error("Signup failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register user.",
        )


@router.post("/login")
async def login(req: LoginRequest):
    clean_username = req.username.strip()
    user = get_user_by_username(clean_username)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_access_token({
        "sub": user["username"],
        "user_id": user["id"],
        "role": "doctor",
        "full_name": user["full_name"],
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "doctor",
        "full_name": user["full_name"],
        "username": user["username"],
        "user_id": user["id"],
    }


@router.get("/consultations")
async def get_consultations(current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        consultations = get_consultations_for_user(current_user)
        return consultations
    except Exception as e:
        logger.error("Error fetching consultations: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve consultations.",
        )


@router.get("/consultations/{consultation_id}")
async def get_consultation(
    consultation_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    consultation = get_consultation_by_id(consultation_id)
    if not consultation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultation not found.",
        )

    # Only the doctor who created the consultation can view it
    if consultation.get("doctor_id") != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this consultation.",
        )

    return consultation


@router.post("/consultations", status_code=status.HTTP_201_CREATED)
async def create_new_consultation(
    req: CreateConsultationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        cons_id, share_token, share_token_expires_at = create_consultation(
            doctor_id=current_user["id"],
            patient_name=req.patient_name,
            transcript=req.transcript,
            turns=req.speaker_turns,
            note=req.note,
            translated_plan=req.translated_plan,
        )
        return {
            "id": cons_id,
            "share_token": share_token,
            "share_token_expires_at": share_token_expires_at,
            "message": "Consultation saved successfully",
        }
    except Exception as e:
        logger.error("Failed to save consultation: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save consultation.",
        )


@router.get("/public/report/{share_token}")
async def get_public_report(share_token: str):
    """
    Public, unauthenticated endpoint to view a finalized consultation note.
    Uses only unguessable share_token, never exposes internal database IDs,
    and enforces a 7-day expiration limit.
    """
    res = get_consultation_by_share_token(share_token)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultation report not found or link is invalid.",
        )
    cons, is_expired = res
    if is_expired:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Consultation report link expired (7-day validity).",
        )

    # Return sanitized data only — NEVER expose internal database IDs
    return {
        "share_token": cons.get("share_token"),
        "patient_name": cons.get("patient_name"),
        "doctor_name": cons.get("doctor_name", "Attending Physician"),
        "created_at": cons.get("created_at"),
        "expires_at": cons.get("share_token_expires_at"),
        "detected_language": cons.get("detected_language", "en-IN"),
        "note": cons.get("note", {}),
        "translated_plan": cons.get("translated_plan"),
    }

