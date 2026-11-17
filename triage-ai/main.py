"""
TRIAGE AI SERVICE (restored)
Implements the HTTP contract the Node backend (src/services/triageService.js)
expects from the deployed triage AI:
  POST /api/v1/chat/next-questions   {conversation_history} -> {questions}
  POST /api/v1/analyze-triage        multipart: payload=<json>, file?  -> analysis JSON
  POST /api/v1/rescore-batch         {patients:[...]} -> {results:[...]}

Scoring core is the repository's own rule-based engine
(triage_engine/triage.py - ESI-inspired 5-phase assessment). No paid APIs.
Optional Gemini phrasing can be layered later via env, but the service is
fully functional with rules only.
"""

import json
import os
import re
import sys
import requests
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

# Import the repo's own scoring engine (pure stdlib).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO_ROOT, "triage_engine"))

from triage import (  # noqa: E402
    PatientContext,
    PriorityLevel,
    SymptomCategory,
    IntelligentTriageEngine as TriageEngine,
    VitalSigns,
)


# ═══════════════════════════════════════════════════════════════
# OPTIONAL GEMINI LAYER (same pattern as LegalSahAI: free AI Studio key,
# model gemini-2.5-flash via REST). Gemini ONLY phrases questions and
# explanations. All scores, red flags, urgency and queue logic stay
# deterministic in the rule engine. Any Gemini failure falls back to
# rule output silently.
# ═══════════════════════════════════════════════════════════════

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or ""
GOOGLE_MODEL = os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "8"))


def _gemini_generate(prompt: str) -> Optional[str]:
    if not GOOGLE_API_KEY:
        return None
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GOOGLE_MODEL}:generateContent?key={GOOGLE_API_KEY}"
    )
    try:
        resp = requests.post(
            url,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 512},
            },
            timeout=GEMINI_TIMEOUT,
        )
        if resp.status_code != 200:
            print(f"[gemini] status {resp.status_code}: using rule fallback")
            return None
        data = resp.json()
        parts = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except Exception as exc:  # noqa: BLE001
        print(f"[gemini] error {exc}: using rule fallback")
        return None


def _gemini_questions(history: List[Dict[str, Any]], rule_questions: List[str]) -> List[str]:
    """Let Gemini adapt the rule-selected follow-up questions to the
    conversation wording. Never invents new clinical scope: it can only
    rephrase/select from the rule list."""
    convo = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}"
        for m in history[-8:] if isinstance(m, dict)
    )
    prompt = (
        "You are helping a hospital triage intake. Based on this conversation, "
        "choose and lightly rephrase up to 4 follow-up questions ONLY from the "
        "approved list below. Do not add new medical questions. Return one "
        "question per line, no numbering, no commentary.\n\n"
        f"Conversation:\n{convo}\n\nApproved questions:\n"
        + "\n".join(f"- {q}" for q in rule_questions + GENERAL_QUESTIONS)
    )
    text = _gemini_generate(prompt)
    if not text:
        return rule_questions
    lines = [l.strip("- ").strip() for l in text.splitlines() if l.strip()]
    cleaned = [l for l in lines if l.endswith("?")][:4]
    return cleaned or rule_questions


def _gemini_summary(facts: str, rule_summary: str) -> str:
    prompt = (
        "Rewrite this triage decision-support summary in clear, calm plain "
        "English for a doctor's queue dashboard. Keep every fact and number "
        "exactly as given, keep it under 3 sentences, and keep the "
        "not-a-diagnosis caveat. Facts:\n" + facts
    )
    text = _gemini_generate(prompt)
    return text or rule_summary


app = FastAPI(title="Hackkrux Triage AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = TriageEngine()

CATEGORY_TO_DEPARTMENT = {
    SymptomCategory.CHEST: "Cardiology",
    SymptomCategory.ABDOMINAL: "Gastroenterology",
    SymptomCategory.NEUROLOGICAL: "Neurology",
    SymptomCategory.RESPIRATORY: "Pulmonology",
    SymptomCategory.TRAUMA: "Orthopedics",
    SymptomCategory.PSYCHIATRIC: "Psychiatry",
    SymptomCategory.INFECTIOUS: "General Medicine",
    SymptomCategory.MUSCULOSKELETAL: "Orthopedics",
    SymptomCategory.OTHER: "General Medicine",
}

GENERAL_QUESTIONS = [
    "How long have you had these symptoms?",
    "On a scale of 0 to 10, how severe is the discomfort?",
    "Do you have any ongoing conditions such as diabetes, blood pressure, asthma or heart disease?",
    "Are you currently taking any medicines?",
]

COMORBIDITY_KEYWORDS = {
    "diabet": "Diabetes",
    "sugar": "Diabetes",
    "hypertension": "Hypertension",
    "blood pressure": "Hypertension",
    "bp": "Hypertension",
    "asthma": "Asthma/COPD",
    "copd": "Asthma/COPD",
    "heart": "Heart disease",
    "cardiac": "Heart disease",
    "cancer": "Cancer",
    "pregnan": "Pregnancy",
}

SYMPTOM_WORDS = [
    "chest pain", "fever", "cough", "vomiting", "nausea", "headache",
    "dizziness", "breathlessness", "shortness of breath", "abdominal pain",
    "stomach pain", "back pain", "weakness", "fatigue", "rash",
    "sore throat", "diarrhea", "bleeding", "swelling", "injury",
]


def _history_text(history: List[Dict[str, Any]]) -> str:
    parts = [str(m.get("content", "")) for m in history if isinstance(m, dict)]
    return "\n".join(p for p in parts if p.strip())


def _user_text(history: List[Dict[str, Any]]) -> str:
    parts = [
        str(m.get("content", ""))
        for m in history
        if isinstance(m, dict) and str(m.get("role", "user")).lower() != "assistant"
    ]
    return "\n".join(p for p in parts if p.strip())


def _infer_chief_complaint(history: List[Dict[str, Any]], context: Dict[str, Any]) -> str:
    for key in ("chief_complaint", "chiefComplaint", "complaint", "symptoms"):
        val = context.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    first_user = next(
        (str(m.get("content", "")).strip() for m in history
         if isinstance(m, dict) and str(m.get("role", "user")).lower() == "user"
         and str(m.get("content", "")).strip()),
        "",
    )
    return first_user[:160] if first_user else "General consultation"


def _extract_symptoms(text: str) -> List[str]:
    low = text.lower()
    found = [s for s in SYMPTOM_WORDS if s in low]
    return sorted(set(found))


def _extract_comorbidities(text: str, context: Dict[str, Any]) -> List[str]:
    low = text.lower()
    found = set()
    for needle, label in COMORBIDITY_KEYWORDS.items():
        if needle in low:
            found.add(label)
    for key in ("comorbidities", "conditions", "medical_history", "medicalHistory"):
        val = context.get(key)
        if isinstance(val, list):
            for item in val:
                if str(item).strip():
                    found.add(str(item).strip().title())
        elif isinstance(val, str) and val.strip():
            found.add(val.strip().title())
    return sorted(found)


def _build_patient_context(context: Dict[str, Any], comorbidities: List[str]) -> PatientContext:
    age_raw = context.get("age") or context.get("patient_age") or 30
    try:
        age = int(float(age_raw))
    except (TypeError, ValueError):
        age = 30
    labels = {c.lower() for c in comorbidities}
    return PatientContext(
        age=age,
        gender=context.get("gender"),
        has_diabetes=any("diabet" in c for c in labels),
        has_hypertension=any("hypertension" in c or "blood pressure" in c for c in labels),
        has_heart_disease=any("heart" in c or "cardiac" in c for c in labels),
        has_asthma_copd=any("asthma" in c or "copd" in c for c in labels),
        has_cancer=any("cancer" in c for c in labels),
        is_pregnant=any("pregnan" in c for c in labels),
        is_immunocompromised=bool(context.get("immunocompromised")),
        on_blood_thinners=bool(context.get("on_blood_thinners")),
        on_antibiotics=bool(context.get("on_antibiotics")),
        on_pain_meds=bool(context.get("on_pain_meds")),
    )


def _num(v: Any) -> Optional[float]:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _build_vitals(vitals: Dict[str, Any]) -> VitalSigns:
    if not isinstance(vitals, dict):
        vitals = {}
    def g(*names):
        for n in names:
            if n in vitals and vitals[n] not in (None, ""):
                return vitals[n]
        return None
    hr = _num(g("heart_rate", "heartRate", "pulse"))
    sys_bp = _num(g("blood_pressure_systolic", "systolic", "bp_systolic", "bpSystolic"))
    dia_bp = _num(g("blood_pressure_diastolic", "diastolic", "bp_diastolic", "bpDiastolic"))
    temp = _num(g("temperature", "temp"))
    rr = _num(g("respiratory_rate", "respiratoryRate"))
    spo2 = _num(g("oxygen_saturation", "oxygenSaturation", "spo2", "SpO2"))
    pain = _num(g("pain_level", "painLevel", "pain"))
    return VitalSigns(
        heart_rate=int(hr) if hr is not None else None,
        blood_pressure_systolic=int(sys_bp) if sys_bp is not None else None,
        blood_pressure_diastolic=int(dia_bp) if dia_bp is not None else None,
        temperature=temp,
        respiratory_rate=int(rr) if rr is not None else None,
        oxygen_saturation=spo2,
        pain_level=int(pain) if pain is not None else None,
    )


def _infer_onset(text: str, context: Dict[str, Any]) -> str:
    for key in ("onset_type", "onset", "onsetType"):
        val = context.get(key)
        if isinstance(val, str) and val.strip().lower() in ("sudden", "gradual", "recurring"):
            return val.strip().lower()
    low = text.lower()
    if re.search(r"\b(sudden|suddenly|all of a sudden|acute)\b", low):
        return "sudden"
    if re.search(r"\b(recurring|recurrent|comes and goes|again)\b", low):
        return "recurring"
    return "gradual"


def _duration_hours(text: str, context: Dict[str, Any]) -> Optional[float]:
    for key in ("duration_hours", "durationHours"):
        val = _num(context.get(key))
        if val is not None:
            return val
    low = text.lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hour|hr|hrs|hours)\b", low)
    if m:
        return float(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(day|days)\b", low)
    if m:
        return float(m.group(1)) * 24.0
    m = re.search(r"(\d+(?:\.\d+)?)\s*(week|weeks)\b", low)
    if m:
        return float(m.group(1)) * 24.0 * 7.0
    if re.search(r"\b(today|this morning|just now)\b", low):
        return 2.0
    if re.search(r"\byesterday\b", low):
        return 24.0
    return None


def _pick_department(
    category: SymptomCategory,
    chosen: Optional[str],
    available: List[str],
) -> str:
    mapped = CATEGORY_TO_DEPARTMENT.get(category, "General Medicine")
    if chosen:
        chosen_clean = str(chosen).strip()
        if chosen_clean and category is SymptomCategory.OTHER:
            return chosen_clean
    if available:
        low_avail = {a.lower(): a for a in available if isinstance(a, str)}
        if mapped.lower() in low_avail:
            return low_avail[mapped.lower()]
        for a in available:
            if isinstance(a, str) and "general" in a.lower():
                return a
    if chosen and category is SymptomCategory.OTHER:
        return str(chosen).strip()
    return mapped


def _next_questions_rule(history: List[Dict[str, Any]]) -> List[str]:
    text = _user_text(history)
    if not text.strip():
        return [
            "What is the main problem you are facing today?",
            *GENERAL_QUESTIONS[:2],
        ]
    asked = _history_text([m for m in history if str(m.get("role", "")).lower() == "assistant"]).lower()
    _score, category, adaptive = engine.assess_symptoms(text)
    questions: List[str] = []
    for q in adaptive:
        key = q.split("?")[0][:30].lower()
        if key and key not in asked:
            questions.append(q)
    for q in GENERAL_QUESTIONS:
        key = q.split("?")[0][:30].lower()
        if key not in asked:
            questions.append(q)
    seen = set()
    deduped = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            deduped.append(q)
    return deduped[:4]


@app.get("/")
async def root():
    return {"service": "hackkrux-triage-ai", "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy", "engine": "rule-based-esi-v1"}


@app.post("/api/v1/chat/next-questions")
@app.post("/chat/next-questions")
async def chat_next_questions(body: Dict[str, Any]):
    history = body.get("conversation_history") or body.get("conversationHistory") or []
    if not isinstance(history, list):
        history = []
    rule_questions = _next_questions_rule(history)
    questions = _gemini_questions(history, rule_questions)
    return {"questions": questions, "source": "gemini" if GOOGLE_API_KEY else "rules"}


@app.post("/api/v1/analyze-triage")
async def analyze_triage(payload: str = Form(...), file: Optional[UploadFile] = File(None)):
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}

    history = data.get("conversation_history") or []
    if not isinstance(history, list):
        history = []
    context = data.get("context") or {}
    if not isinstance(context, dict):
        context = {}
    vitals_raw = data.get("vitals") or {}
    chosen_department = data.get("choosen_department") or data.get("chosen_department")
    available_raw = data.get("available_departments") or context.get("available_departments") or []
    available = [
        (d.get("name") if isinstance(d, dict) else str(d))
        for d in available_raw
        if (d.get("name") if isinstance(d, dict) else d)
    ]

    all_text = _history_text(history)
    user_text = _user_text(history)
    chief = _infer_chief_complaint(history, context)

    audio_note = None
    if file is not None:
        raw = await file.read()
        audio_note = (
            f"Audio attachment received ({len(raw)} bytes); transcription is handled "
            "by the backend speech service, so scoring used the text conversation."
        )

    # Phase 1: critical factors from free text
    critical_score, red_flags = engine.assess_critical_factors(
        is_conscious=True,
        can_speak=True,
        can_ambulate=True,
        breathing_difficulty=(
            "severe" if re.search(r"(can't breathe|cannot breathe|gasping)", user_text.lower())
            else ("moderate" if re.search(r"(breathless|shortness of breath|difficulty breathing)", user_text.lower()) else None)
        ),
        red_flag_text=all_text,
    )

    # Phase 2: symptoms
    symptom_score, category, _adaptive = engine.assess_symptoms(
        symptom_description=user_text or chief,
        symptom_duration=context.get("duration"),
        associated_symptoms=context.get("associated_symptoms") if isinstance(context.get("associated_symptoms"), list) else None,
    )

    # Phase 3: context
    comorbidities = _extract_comorbidities(all_text, context)
    patient_ctx = _build_patient_context(context, comorbidities)
    context_score = engine.assess_context(patient_ctx)

    # Phase 4: vitals
    vitals = _build_vitals(vitals_raw)
    vital_score, vital_alerts = engine.assess_vitals(vitals)

    # Phase 5: timeline
    onset = _infer_onset(all_text, context)
    duration_hours = _duration_hours(all_text, context)
    if onset == "gradual" and duration_hours is not None and duration_hours <= 6:
        onset = "sudden"
    timeline_score = engine.assess_timeline(
        onset_type=onset,
        duration_hours=duration_hours,
        is_recurring=(onset == "recurring"),
        recent_surgery=bool(context.get("recent_surgery")),
        recent_trauma=bool(context.get("recent_trauma")) or category is SymptomCategory.TRAUMA,
    )

    risk_score, priority = engine.calculate_total_risk(
        critical_score=critical_score,
        symptom_score=symptom_score,
        context_score=context_score,
        vital_score=vital_score,
        timeline_score=timeline_score,
        red_flags=red_flags,
    )

    department = _pick_department(category, chosen_department, available)
    symptoms_found = _extract_symptoms(user_text or chief)
    wait_estimate = engine.get_wait_estimate(priority)

    summary_bits = [
        f"Risk {risk_score:.0f}/100 ({priority.value}).",
        f"Primary category: {category.value}.",
    ]
    if red_flags:
        summary_bits.append("Red flags: " + "; ".join(red_flags) + ".")
    if vital_alerts:
        summary_bits.append("Vital alerts: " + "; ".join(vital_alerts) + ".")
    if comorbidities:
        summary_bits.append("Context: " + ", ".join(comorbidities) + ".")
    if audio_note:
        summary_bits.append(audio_note)

    rule_summary = " ".join(summary_bits)
    final_summary = _gemini_summary(rule_summary, rule_summary)

    return {
        "patient_id": data.get("patient_id"),
        "risk_score": round(risk_score, 1),
        "urgency_level": priority.value,
        "department": department,
        "recommended_department": department,
        "explainability_summary": final_summary,
        "estimated_wait_minutes": wait_estimate,
        "chief_complaint": chief,
        "symptom_category": category.value,
        "red_flags": red_flags,
        "ai_analysis": {
            "chief_complaint": chief,
            "symptom_category": category.value,
            "detected_red_flags": red_flags,
            "extracted_symptoms": symptoms_found,
            "extracted_comorbidities": comorbidities,
            "severity": priority.value,
            "department": department,
            "onset_type": onset,
            "phase_scores": {
                "critical": round(critical_score, 1),
                "symptom": round(symptom_score, 1),
                "context": round(context_score, 1),
                "vitals": round(vital_score, 1),
                "timeline": round(timeline_score, 1),
            },
            "vital_alerts": vital_alerts,
            "engine": "rule-based-esi-v1",
            "disclaimer": "Decision-support estimate only; not a medical diagnosis.",
        },
    }


URGENCY_ORDER = ["ROUTINE", "LOW", "MODERATE", "HIGH", "CRITICAL"]


def _escalate(score: float, urgency: str, wait_minutes: float) -> (float, str):
    """Wait-adjusted re-scoring: the longer a patient waits, the higher the
    effective priority, with faster growth for already-urgent cases."""
    urgency = (urgency or "ROUTINE").upper()
    if urgency not in URGENCY_ORDER:
        urgency = "ROUTINE"
    growth_per_15min = {
        "CRITICAL": 0.0,   # already maximum; stays at top
        "HIGH": 3.0,
        "MODERATE": 2.0,
        "LOW": 1.0,
        "ROUTINE": 0.5,
    }[urgency]
    bump = (max(wait_minutes, 0.0) / 15.0) * growth_per_15min
    new_score = min(100.0, score + bump)
    # Never decay: waiting cannot make a patient safer.
    new_score = max(new_score, score)
    if new_score >= 90:
        new_urgency = "CRITICAL"
    elif new_score >= 70:
        new_urgency = "HIGH"
    elif new_score >= 50:
        new_urgency = "MODERATE"
    elif new_score >= 30:
        new_urgency = "LOW"
    else:
        new_urgency = "ROUTINE"
    if URGENCY_ORDER.index(new_urgency) < URGENCY_ORDER.index(urgency):
        new_urgency = urgency
    return round(new_score, 1), new_urgency


@app.post("/api/v1/rescore-batch")
@app.post("/rescore-batch")
async def rescore_batch(body: Dict[str, Any]):
    patients = body.get("patients") or []
    if not isinstance(patients, list):
        patients = []
    results = []
    for p in patients:
        if not isinstance(p, dict):
            continue
        pid = p.get("patient_id") or p.get("patientId")
        if not pid:
            continue
        try:
            score = float(p.get("risk_score") or 0)
        except (TypeError, ValueError):
            score = 0.0
        try:
            wait = float(p.get("wait_time_minutes") or 0)
        except (TypeError, ValueError):
            wait = 0.0
        urgency = str(p.get("urgency_level") or "ROUTINE")
        new_score, new_urgency = _escalate(score, urgency, wait)
        results.append({
            "patient_id": str(pid),
            "risk_score": new_score,
            "urgency_level": new_urgency,
        })
    return {"results": results, "rescored": len(results)}


# ═══════════════════════════════════════════════════════════════
# LEGACY CONTRACT (used by backend walk-ins and phased triage flow)
# Endpoints under /api/triage/* and /api/queue/* mirror what the old
# Python engine served, but stateless per-process (in-memory), backed by
# the same rule engine. Restores behavior without Postgres/Redis/Ollama.
# ═══════════════════════════════════════════════════════════════

import uuid
import time

SESSIONS: Dict[str, Dict[str, Any]] = {}
QUEUE_CLINIC: List[Dict[str, Any]] = []
QUEUE_HOSPITAL: Dict[str, List[Dict[str, Any]]] = {}

SPECIALTY_BY_CATEGORY = {
    "chest": "Cardiology",
    "abdominal": "Gastroenterology",
    "neurological": "Neurology",
    "respiratory": "Pulmonology",
    "trauma": "Orthopedics",
    "psychiatric": "Psychiatry",
    "infectious": "General Medicine",
    "musculoskeletal": "Orthopedics",
    "other": "General Medicine",
}

PHASE_ORDER = ["critical", "symptom", "context", "vitals", "timeline"]


def _bool(v: Any, default=True) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("yes", "true", "1", "y")
    return default


def _phase_questions(phase: str, complaint: str = "") -> List[str]:
    if phase == "critical":
        return [
            "Is the patient conscious and able to speak?",
            "Is there any difficulty breathing? (none / moderate / severe)",
            "Can the patient walk without assistance?",
        ]
    if phase == "symptom":
        _s, cat, adaptive = engine.assess_symptoms(complaint or "")
        qs = list(adaptive) if adaptive else []
        qs += ["How severe are the symptoms? (mild / moderate / severe)",
               "How long have the symptoms been present?"]
        seen, out = set(), []
        for q in qs:
            if q not in seen:
                seen.add(q)
                out.append(q)
        return out[:4]
    if phase == "context":
        return [
            "What is the patient's age?",
            "Any ongoing conditions (diabetes, blood pressure, asthma, heart disease)?",
            "Any regular medicines being taken?",
        ]
    if phase == "vitals":
        return [
            "Temperature (C), if measured?",
            "Heart rate (bpm), if measured?",
            "Oxygen saturation (SpO2 %), if measured?",
            "Pain level 0-10?",
        ]
    if phase == "timeline":
        return [
            "Did it start suddenly or gradually?",
            "Is it recurring or the first time?",
            "Any recent surgery or injury?",
        ]
    return []


def _score_session(sess: Dict[str, Any]) -> Dict[str, Any]:
    a = sess.get("answers", {})
    crit = a.get("critical", {}) or {}
    symp = a.get("symptom", {}) or {}
    ctx_a = a.get("context", {}) or {}
    vit_a = a.get("vitals", {}) or {}
    tl_a = a.get("timeline", {}) or {}

    complaint = sess.get("chief_complaint", "")
    desc = str(symp.get("description") or symp.get("symptoms") or complaint)

    critical_score, red_flags = engine.assess_critical_factors(
        is_conscious=_bool(crit.get("is_conscious", crit.get("conscious", True))),
        can_speak=_bool(crit.get("can_speak", crit.get("speaking", True))),
        can_ambulate=_bool(crit.get("can_ambulate", crit.get("walking", True))),
        breathing_difficulty=crit.get("breathing_difficulty") or crit.get("breathing"),
        red_flag_text=" ".join([complaint, desc, str(crit.get("notes") or "")]),
    )

    symptom_score, category, _ = engine.assess_symptoms(
        symptom_description=desc,
        symptom_severity=symp.get("severity"),
        symptom_duration=str(symp.get("duration")) if symp.get("duration") is not None else None,
        associated_symptoms=symp.get("associated_symptoms") if isinstance(symp.get("associated_symptoms"), list) else None,
    )

    conditions = list(sess.get("chronic_conditions") or [])
    extra = ctx_a.get("conditions") or ctx_a.get("comorbidities")
    if isinstance(extra, list):
        conditions += extra
    elif isinstance(extra, str) and extra.strip():
        conditions.append(extra.strip())
    comorbidities = _extract_comorbidities(" ".join(map(str, conditions)) + " " + desc, {})
    age = ctx_a.get("age") or sess.get("patient_age") or 30
    try:
        age = int(float(age))
    except (TypeError, ValueError):
        age = 30
    patient_ctx = _build_patient_context({"age": age, "gender": sess.get("patient_gender")}, comorbidities)
    context_score = engine.assess_context(patient_ctx)

    vitals = _build_vitals(vit_a if isinstance(vit_a, dict) else {})
    vital_score, vital_alerts = engine.assess_vitals(vitals)

    onset = str(tl_a.get("onset_type") or tl_a.get("onset") or "gradual").lower()
    dur = _num(tl_a.get("duration_hours") or tl_a.get("duration"))
    timeline_score = engine.assess_timeline(
        onset_type=onset if onset in ("sudden", "gradual", "recurring") else "gradual",
        duration_hours=dur,
        is_recurring=_bool(tl_a.get("is_recurring", False), default=False),
        recent_surgery=_bool(tl_a.get("recent_surgery", False), default=False),
        recent_trauma=_bool(tl_a.get("recent_trauma", False), default=False),
    )

    risk, priority = engine.calculate_total_risk(
        critical_score, symptom_score, context_score, vital_score, timeline_score, red_flags,
    )
    wait = engine.get_wait_estimate(priority)
    specialty = SPECIALTY_BY_CATEGORY.get(category.value, "General Medicine")
    summary = (
        f"Risk {risk:.0f}/100 ({priority.value}). Category: {category.value}. "
        + (f"Red flags: {'; '.join(red_flags)}. " if red_flags else "")
        + (f"Vital alerts: {'; '.join(vital_alerts)}. " if vital_alerts else "")
        + "Decision-support estimate only; not a medical diagnosis."
    )
    return {
        "chief_complaint": complaint,
        "symptom_category": category.value,
        "scores": {
            "critical": round(critical_score, 1),
            "symptom": round(symptom_score, 1),
            "context": round(context_score, 1),
            "vital": round(vital_score, 1),
            "timeline": round(timeline_score, 1),
        },
        "final_risk_score": round(risk, 1),
        "priority_level": priority.value,
        "estimated_wait_minutes": wait,
        "red_flags": red_flags,
        "vital_signs": vit_a if isinstance(vit_a, dict) else {},
        "recommended_specialty": specialty,
        "summary": summary,
    }


def _queue_add(entries: List[Dict[str, Any]], entry: Dict[str, Any]) -> int:
    entries[:] = [e for e in entries if e["patient_id"] != entry["patient_id"]]
    entries.append(entry)
    ordered = sorted(entries, key=lambda e: (-e["risk_score"], e["arrival"]))
    for i, e in enumerate(ordered):
        e["position"] = i + 1
    return next(e["position"] for e in ordered if e["patient_id"] == entry["patient_id"])


@app.post("/api/triage/init")
async def legacy_init(body: Dict[str, Any]):
    session_id = uuid.uuid4().hex
    complaint = str(body.get("chief_complaint") or "")
    SESSIONS[session_id] = {
        "patient_id": str(body.get("patient_id") or ""),
        "chief_complaint": complaint,
        "patient_age": body.get("patient_age"),
        "patient_gender": body.get("patient_gender"),
        "chronic_conditions": body.get("chronic_conditions") or [],
        "current_medications": body.get("current_medications") or [],
        "answers": {},
        "phase_idx": 0,
        "created": time.time(),
    }
    return {
        "session_id": session_id,
        "initial_questions": _phase_questions("critical", complaint),
    }


@app.post("/api/triage/{phase}-assessment")
async def legacy_assess(phase: str, body: Dict[str, Any]):
    phase = phase.strip().lower()
    if phase not in PHASE_ORDER:
        raise HTTPException(status_code=400, detail=f"unknown phase {phase}")
    session_id = str(body.get("session_id") or "")
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    answers = body.get("answers") or {}
    if not isinstance(answers, dict):
        answers = {}
    sess["answers"][phase] = answers
    result = _score_session(sess)
    idx = PHASE_ORDER.index(phase)
    if idx + 1 < len(PHASE_ORDER):
        nxt = PHASE_ORDER[idx + 1]
        return {
            "next_phase": nxt,
            "questions": _phase_questions(nxt, sess.get("chief_complaint", "")),
            "score": result["scores"].get(phase if phase != "vitals" else "vital", 0),
            "completed": False,
        }
    return {
        "next_phase": None,
        "questions": [],
        "score": result["scores"]["timeline"],
        "completed": True,
    }


@app.get("/api/triage/{session_id}/results")
async def legacy_results(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return _score_session(sess)


@app.post("/api/triage/complete")
async def legacy_complete_single(body: Dict[str, Any]):
    complaint = str(body.get("chief_complaint") or "")
    symptoms = body.get("symptoms") or []
    desc = "; ".join([complaint] + [str(s) for s in symptoms])
    session = {
        "chief_complaint": complaint,
        "patient_age": body.get("patient_age"),
        "patient_gender": body.get("patient_gender"),
        "chronic_conditions": body.get("chronic_conditions") or [],
        "answers": {
            "critical": {},
            "symptom": {
                "description": desc,
                "severity": body.get("symptom_severity"),
                "duration": body.get("symptom_duration_hours"),
            },
            "context": {},
            "vitals": body.get("vital_signs") or {},
            "timeline": {"duration_hours": body.get("symptom_duration_hours")},
        },
    }
    return _score_session(session)


@app.post("/api/queue/add-clinic")
async def legacy_queue_add_clinic(body: Dict[str, Any]):
    entry = {
        "patient_id": str(body.get("patient_id") or ""),
        "triage_record_id": str(body.get("triage_record_id") or ""),
        "risk_score": float(body.get("risk_score") or 0),
        "chief_complaint": str(body.get("chief_complaint") or ""),
        "arrival": time.time(),
    }
    position = _queue_add(QUEUE_CLINIC, entry)
    return {"queue_position": position, "queue_size": len(QUEUE_CLINIC)}


@app.post("/api/queue/add-hospital")
async def legacy_queue_add_hospital(body: Dict[str, Any]):
    dept = str(body.get("department_id") or body.get("recommended_specialty") or "general")
    entries = QUEUE_HOSPITAL.setdefault(dept, [])
    entry = {
        "patient_id": str(body.get("patient_id") or ""),
        "triage_record_id": str(body.get("triage_record_id") or ""),
        "risk_score": float(body.get("risk_score") or 0),
        "chief_complaint": str(body.get("chief_complaint") or ""),
        "department_id": dept,
        "arrival": time.time(),
    }
    position = _queue_add(entries, entry)
    return {"queue_position": position, "queue_size": len(entries), "department_id": dept}
