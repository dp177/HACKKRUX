"""
PATIENT PROFILE & MEDICAL HISTORY MANAGEMENT
Stores comprehensive patient data for dashboard and doctor preview
"""

from dataclasses import dataclass, field
from datetime import datetime, date
from typing import List, Dict, Optional
from enum import Enum
import json


class BloodType(str, Enum):
    A_POSITIVE = "A+"
    A_NEGATIVE = "A-"
    B_POSITIVE = "B+"
    B_NEGATIVE = "B-"
    AB_POSITIVE = "AB+"
    AB_NEGATIVE = "AB-"
    O_POSITIVE = "O+"
    O_NEGATIVE = "O-"
    UNKNOWN = "Unknown"


class AllergyType(str, Enum):
    DRUG = "drug"
    FOOD = "food"
    ENVIRONMENTAL = "environmental"
    OTHER = "other"


class VisitStatus(str, Enum):
    SCHEDULED = "scheduled"
    CHECKED_IN = "checked_in"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


@dataclass
class Allergy:
    """Patient allergy record"""
    allergen: str
    allergy_type: AllergyType
    reaction: str  # e.g., "rash", "anaphylaxis", "hives"
    severity: str  # "mild", "moderate", "severe", "life-threatening"
    onset_date: Optional[date] = None
    notes: str = ""


@dataclass
class Medication:
    """Current medication record"""
    name: str
    dosage: str  # e.g., "500mg"
    frequency: str  # e.g., "twice daily", "as needed"
    route: str = "oral"  # oral, IV, topical, etc.
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    prescribed_by: str = ""
    reason: str = ""
    active: bool = True


@dataclass
class ChronicCondition:
    """Chronic disease record"""
    condition_name: str
    icd_code: Optional[str] = None
    diagnosed_date: Optional[date] = None
    severity: str = "moderate"  # mild, moderate, severe
    status: str = "active"  # active, controlled, resolved
    notes: str = ""


@dataclass
class PastVisit:
    """Record of past medical visit"""
    visit_id: str
    visit_date: datetime
    chief_complaint: str
    diagnosis: str
    treatment: str
    doctor_name: str
    doctor_id: str
    department: str = "general"
    duration_minutes: int = 0
    status: VisitStatus = VisitStatus.COMPLETED
    notes: str = ""
    follow_up_needed: bool = False
    follow_up_date: Optional[date] = None
    prescriptions: List[str] = field(default_factory=list)
    tests_ordered: List[str] = field(default_factory=list)


@dataclass
class VitalHistory:
    """Historical vital signs record"""
    recorded_at: datetime
    blood_pressure_systolic: Optional[int] = None
    blood_pressure_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    respiratory_rate: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    bmi: Optional[float] = None


@dataclass
class FamilyHistory:
    """Family medical history"""
    relation: str  # "father", "mother", "sibling", etc.
    condition: str
    age_at_diagnosis: Optional[int] = None
    notes: str = ""


@dataclass
class SurgicalHistory:
    """Past surgical procedures"""
    procedure_name: str
    procedure_date: date
    hospital: str = ""
    surgeon: str = ""
    complications: str = "none"
    notes: str = ""


@dataclass
class PatientProfile:
    """
    Complete patient profile with medical history
    Used for both patient dashboard and doctor preview
    """
    # Basic Demographics
    patient_id: str
    first_name: str
    last_name: str
    date_of_birth: date
    gender: str  # "M", "F", "Other", "Prefer not to say"
    blood_type: BloodType = BloodType.UNKNOWN
    
    # Contact Information
    phone: str = ""
    email: str = ""
    address: str = ""
    emergency_contact_name: str = ""
    emergency_contact_phone: str = ""
    emergency_contact_relation: str = ""
    
    # Medical Profile
    allergies: List[Allergy] = field(default_factory=list)
    current_medications: List[Medication] = field(default_factory=list)
    chronic_conditions: List[ChronicCondition] = field(default_factory=list)
    family_history: List[FamilyHistory] = field(default_factory=list)
    surgical_history: List[SurgicalHistory] = field(default_factory=list)
    
    # Visit History
    past_visits: List[PastVisit] = field(default_factory=list)
    vital_history: List[VitalHistory] = field(default_factory=list)
    
    # Additional Info
    preferred_language: str = "English"
    insurance_provider: str = ""
    insurance_id: str = ""
    primary_care_physician: str = ""
    
    # System Metadata
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_visit_date: Optional[datetime] = None
    total_visits: int = 0
    
    # Privacy flags
    consent_to_treatment: bool = True
    consent_to_share_data: bool = False
    
    def get_age(self) -> int:
        """Calculate current age"""
        today = date.today()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )
    
    def get_full_name(self) -> str:
        """Get full name"""
        return f"{self.first_name} {self.last_name}"
    
    def has_allergy_to(self, substance: str) -> bool:
        """Check if patient is allergic to substance"""
        return any(
            substance.lower() in allergy.allergen.lower() 
            for allergy in self.allergies
        )
    
    def is_on_medication(self, medication_name: str) -> bool:
        """Check if patient is currently on specific medication"""
        return any(
            medication_name.lower() in med.name.lower() and med.active
            for med in self.current_medications
        )
    
    def has_chronic_condition(self, condition_name: str) -> bool:
        """Check if patient has specific chronic condition"""
        return any(
            condition_name.lower() in cond.condition_name.lower() and cond.status == "active"
            for cond in self.chronic_conditions
        )
    
    def get_last_visit(self) -> Optional[PastVisit]:
        """Get most recent visit"""
        if not self.past_visits:
            return None
        return max(self.past_visits, key=lambda v: v.visit_date)
    
    def get_recent_visits(self, limit: int = 5) -> List[PastVisit]:
        """Get recent visits"""
        sorted_visits = sorted(self.past_visits, key=lambda v: v.visit_date, reverse=True)
        return sorted_visits[:limit]
    
    def add_visit(self, visit: PastVisit):
        """Add new visit to history"""
        self.past_visits.append(visit)
        self.last_visit_date = visit.visit_date
        self.total_visits = len(self.past_visits)
        self.updated_at = datetime.now()
    
    def add_vital_record(self, vital: VitalHistory):
        """Add vital signs record"""
        self.vital_history.append(vital)
        self.updated_at = datetime.now()
    
    def get_recent_vitals(self, limit: int = 5) -> List[VitalHistory]:
        """Get recent vital signs records"""
        sorted_vitals = sorted(self.vital_history, key=lambda v: v.recorded_at, reverse=True)
        return sorted_vitals[:limit]
    
    def get_active_medications(self) -> List[Medication]:
        """Get only active medications"""
        return [med for med in self.current_medications if med.active]
    
    def get_active_chronic_conditions(self) -> List[ChronicCondition]:
        """Get only active chronic conditions"""
        return [cond for cond in self.chronic_conditions if cond.status == "active"]
    
    def get_critical_allergies(self) -> List[Allergy]:
        """Get severe/life-threatening allergies"""
        return [
            allergy for allergy in self.allergies 
            if allergy.severity in ["severe", "life-threatening"]
        ]
    
    def to_summary_dict(self) -> Dict:
        """
        Generate concise summary for doctor preview
        Highlights critical information only
        """
        last_visit = self.get_last_visit()
        
        return {
            "patient_id": self.patient_id,
            "name": self.get_full_name(),
            "age": self.get_age(),
            "gender": self.gender,
            "blood_type": self.blood_type.value,
            
            # Critical alerts
            "critical_allergies": [
                {"allergen": a.allergen, "reaction": a.reaction, "severity": a.severity}
                for a in self.get_critical_allergies()
            ],
            
            # Current health status
            "chronic_conditions": [
                {"condition": c.condition_name, "severity": c.severity}
                for c in self.get_active_chronic_conditions()
            ],
            
            "current_medications": [
                {"name": m.name, "dosage": m.dosage, "frequency": m.frequency}
                for m in self.get_active_medications()
            ],
            
            # Recent history
            "last_visit": {
                "date": last_visit.visit_date.isoformat() if last_visit else None,
                "diagnosis": last_visit.diagnosis if last_visit else None,
                "doctor": last_visit.doctor_name if last_visit else None
            } if last_visit else None,
            
            "total_visits": self.total_visits,
            
            # Recent vitals trend
            "recent_vitals": [
                {
                    "date": v.recorded_at.isoformat(),
                    "bp": f"{v.blood_pressure_systolic}/{v.blood_pressure_diastolic}" if v.blood_pressure_systolic else None,
                    "hr": v.heart_rate,
                    "temp": v.temperature,
                    "o2": v.oxygen_saturation
                }
                for v in self.get_recent_vitals(3)
            ],
            
            # Emergency contact
            "emergency_contact": {
                "name": self.emergency_contact_name,
                "phone": self.emergency_contact_phone,
                "relation": self.emergency_contact_relation
            }
        }
    
    def to_full_dict(self) -> Dict:
        """
        Generate complete profile for patient dashboard
        Includes all historical data
        """
        return {
            "patient_id": self.patient_id,
            "personal_info": {
                "name": self.get_full_name(),
                "first_name": self.first_name,
                "last_name": self.last_name,
                "date_of_birth": self.date_of_birth.isoformat(),
                "age": self.get_age(),
                "gender": self.gender,
                "blood_type": self.blood_type.value,
                "phone": self.phone,
                "email": self.email,
                "address": self.address,
                "preferred_language": self.preferred_language
            },
            
            "emergency_contact": {
                "name": self.emergency_contact_name,
                "phone": self.emergency_contact_phone,
                "relation": self.emergency_contact_relation
            },
            
            "insurance": {
                "provider": self.insurance_provider,
                "insurance_id": self.insurance_id
            },
            
            "medical_history": {
                "allergies": [
                    {
                        "allergen": a.allergen,
                        "type": a.allergy_type.value,
                        "reaction": a.reaction,
                        "severity": a.severity,
                        "onset_date": a.onset_date.isoformat() if a.onset_date else None,
                        "notes": a.notes
                    }
                    for a in self.allergies
                ],
                
                "current_medications": [
                    {
                        "name": m.name,
                        "dosage": m.dosage,
                        "frequency": m.frequency,
                        "route": m.route,
                        "start_date": m.start_date.isoformat() if m.start_date else None,
                        "prescribed_by": m.prescribed_by,
                        "reason": m.reason,
                        "active": m.active
                    }
                    for m in self.current_medications
                ],
                
                "chronic_conditions": [
                    {
                        "condition": c.condition_name,
                        "icd_code": c.icd_code,
                        "diagnosed_date": c.diagnosed_date.isoformat() if c.diagnosed_date else None,
                        "severity": c.severity,
                        "status": c.status,
                        "notes": c.notes
                    }
                    for c in self.chronic_conditions
                ],
                
                "family_history": [
                    {
                        "relation": f.relation,
                        "condition": f.condition,
                        "age_at_diagnosis": f.age_at_diagnosis,
                        "notes": f.notes
                    }
                    for f in self.family_history
                ],
                
                "surgical_history": [
                    {
                        "procedure": s.procedure_name,
                        "date": s.procedure_date.isoformat(),
                        "hospital": s.hospital,
                        "surgeon": s.surgeon,
                        "complications": s.complications,
                        "notes": s.notes
                    }
                    for s in self.surgical_history
                ]
            },
            
            "visit_history": {
                "total_visits": self.total_visits,
                "last_visit_date": self.last_visit_date.isoformat() if self.last_visit_date else None,
                "recent_visits": [
                    {
                        "visit_id": v.visit_id,
                        "date": v.visit_date.isoformat(),
                        "chief_complaint": v.chief_complaint,
                        "diagnosis": v.diagnosis,
                        "treatment": v.treatment,
                        "doctor": v.doctor_name,
                        "department": v.department,
                        "duration_minutes": v.duration_minutes,
                        "status": v.status.value,
                        "notes": v.notes,
                        "prescriptions": v.prescriptions,
                        "tests_ordered": v.tests_ordered,
                        "follow_up_needed": v.follow_up_needed,
                        "follow_up_date": v.follow_up_date.isoformat() if v.follow_up_date else None
                    }
                    for v in self.get_recent_visits(10)
                ]
            },
            
            "vital_trends": {
                "recent_vitals": [
                    {
                        "date": v.recorded_at.isoformat(),
                        "blood_pressure": f"{v.blood_pressure_systolic}/{v.blood_pressure_diastolic}" if v.blood_pressure_systolic else None,
                        "heart_rate": v.heart_rate,
                        "temperature": v.temperature,
                        "respiratory_rate": v.respiratory_rate,
                        "oxygen_saturation": v.oxygen_saturation,
                        "weight_kg": v.weight_kg,
                        "height_cm": v.height_cm,
                        "bmi": v.bmi
                    }
                    for v in self.get_recent_vitals(10)
                ]
            },
            
            "metadata": {
                "created_at": self.created_at.isoformat(),
                "updated_at": self.updated_at.isoformat(),
                "primary_care_physician": self.primary_care_physician
            }
        }


class PatientProfileManager:
    """
    Manages patient profiles and medical records
    In-memory storage for MVP (will be replaced with database)
    """
    
    def __init__(self):
        self.profiles: Dict[str, PatientProfile] = {}
    
    def create_profile(self, profile: PatientProfile) -> str:
        """Create new patient profile"""
        self.profiles[profile.patient_id] = profile
        return profile.patient_id
    
    def get_profile(self, patient_id: str) -> Optional[PatientProfile]:
        """Get patient profile by ID"""
        return self.profiles.get(patient_id)
    
    def update_profile(self, patient_id: str, profile: PatientProfile):
        """Update existing patient profile"""
        profile.updated_at = datetime.now()
        self.profiles[patient_id] = profile
    
    def delete_profile(self, patient_id: str):
        """Delete patient profile (GDPR right to deletion)"""
        if patient_id in self.profiles:
            del self.profiles[patient_id]
    
    def search_by_name(self, name: str) -> List[PatientProfile]:
        """Search patients by name (case-insensitive)"""
        name_lower = name.lower()
        return [
            profile for profile in self.profiles.values()
            if name_lower in profile.get_full_name().lower()
        ]
    
    def search_by_phone(self, phone: str) -> Optional[PatientProfile]:
        """Find patient by phone number"""
        for profile in self.profiles.values():
            if profile.phone == phone:
                return profile
        return None
    
    def get_patients_with_condition(self, condition_name: str) -> List[PatientProfile]:
        """Find all patients with specific condition"""
        return [
            profile for profile in self.profiles.values()
            if profile.has_chronic_condition(condition_name)
        ]
    
    def get_patients_on_medication(self, medication_name: str) -> List[PatientProfile]:
        """Find all patients on specific medication"""
        return [
            profile for profile in self.profiles.values()
            if profile.is_on_medication(medication_name)
        ]
    
    def get_all_profiles(self) -> List[PatientProfile]:
        """Get all patient profiles"""
        return list(self.profiles.values())


# Global instance
patient_manager = PatientProfileManager()
