"""
INTELLIGENT ADAPTIVE TRIAGE SCORING ENGINE
Core medical decision-making logic based on ESI (Emergency Severity Index) principles
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import json


class PriorityLevel(str, Enum):
    CRITICAL = "CRITICAL"      # ESI-1: Immediate threat to life
    HIGH = "HIGH"              # ESI-2: High risk, needs rapid evaluation
    MODERATE = "MODERATE"      # ESI-3: Stable, moderate complexity
    LOW = "LOW"                # ESI-4: Minor, simple problem
    ROUTINE = "ROUTINE"        # ESI-5: Minimal acuity, can wait


class SymptomCategory(str, Enum):
    CHEST = "chest"
    ABDOMINAL = "abdominal"
    NEUROLOGICAL = "neurological"
    RESPIRATORY = "respiratory"
    TRAUMA = "trauma"
    PSYCHIATRIC = "psychiatric"
    INFECTIOUS = "infectious"
    MUSCULOSKELETAL = "musculoskeletal"
    OTHER = "other"


@dataclass
class VitalSigns:
    """Objective vital measurements"""
    heart_rate: Optional[int] = None          # bpm
    blood_pressure_systolic: Optional[int] = None  # mmHg
    blood_pressure_diastolic: Optional[int] = None
    temperature: Optional[float] = None        # Celsius
    respiratory_rate: Optional[int] = None     # breaths/min
    oxygen_saturation: Optional[float] = None  # % (SpO2)
    pain_level: Optional[int] = None          # 0-10


@dataclass
class PatientContext:
    """Demographics and comorbidities"""
    age: int
    gender: Optional[str] = None
    
    # Comorbidities
    has_diabetes: bool = False
    has_hypertension: bool = False
    has_heart_disease: bool = False
    has_asthma_copd: bool = False
    has_cancer: bool = False
    is_pregnant: bool = False
    is_immunocompromised: bool = False
    
    # Medications
    on_blood_thinners: bool = False
    on_antibiotics: bool = False
    on_pain_meds: bool = False


@dataclass
class TriageAssessment:
    """Complete triage result"""
    patient_id: str
    timestamp: datetime
    
    # Scores from each phase
    critical_score: float  # Phase 1: 0-100
    symptom_score: float   # Phase 2: 0-50
    context_score: float   # Phase 3: 0-40
    vital_score: float     # Phase 4: 0-50
    timeline_score: float  # Phase 5: 0-20
    
    # Final calculation
    total_risk_score: float  # 0-100 (weighted sum)
    priority_level: PriorityLevel
    
    # Clinical details
    symptom_category: SymptomCategory
    red_flags: List[str]
    recommended_specialty: str
    triage_notes: str
    
    # Wait time estimate
    estimated_wait_minutes: int


class IntelligentTriageEngine:
    """
    Smart triage system based on:
    - ESI (Emergency Severity Index)
    - CTAS (Canadian Triage Acuity Scale)
    - Clinical decision rules
    - Multi-factor risk weighting
    """
    
    # Weight configuration (sums to 1.0)
    WEIGHTS = {
        'critical': 0.40,      # Immediate safety
        'symptom': 0.30,       # What's wrong
        'context': 0.15,       # Age/comorbidities
        'vitals': 0.10,        # Objective data
        'timeline': 0.05       # Time progression
    }
    
    # Red flag triggers (automatic HIGH or CRITICAL minimum)
    RED_FLAGS = {
        'chest_pain': {'keywords': ['chest pain', 'pressure', 'tightness'], 'base_score': 50},
        'severe_breathing': {'keywords': ['can\'t breathe', 'severe difficulty', 'gasping'], 'base_score': 50},
        'altered_consciousness': {'keywords': ['unconscious', 'faint', 'confused', 'disoriented'], 'base_score': 100},
        'severe_bleeding': {'keywords': ['severe bleeding', 'hemorrhage', 'won\'t stop'], 'base_score': 60},
        'seizure': {'keywords': ['seizure', 'convulsion', 'shaking'], 'base_score': 70},
        'vision_loss': {'keywords': ['vision loss', 'blind', 'can\'t see'], 'base_score': 40},
        'stroke_signs': {'keywords': ['facial droop', 'arm weakness', 'speech difficulty'], 'base_score': 70},
        'severe_allergy': {'keywords': ['anaphylaxis', 'severe allergy', 'swelling throat'], 'base_score': 80},
        'severe_burn': {'keywords': ['severe burn', 'large burn'], 'base_score': 70},
        'self_harm': {'keywords': ['suicide', 'self-harm', 'want to die'], 'base_score': 60},
        'severe_trauma': {'keywords': ['hit head', 'major trauma', 'accident'], 'base_score': 60},
    }
    
    def __init__(self):
        self.assessments: Dict[str, TriageAssessment] = {}
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 1: CRITICAL ASSESSMENT (Immediate Safety Check)
    # ═══════════════════════════════════════════════════════════════
    
    def assess_critical_factors(
        self,
        is_conscious: bool,
        can_speak: bool,
        can_ambulate: bool,
        breathing_difficulty: Optional[str] = None,
        red_flag_text: Optional[str] = None
    ) -> Tuple[float, List[str]]:
        """
        Phase 1: Quick safety assessment
        Returns: (critical_score, red_flag_list)
        """
        critical_score = 0.0
        red_flags = []
        
        # Rule 1: Consciousness
        if not is_conscious:
            critical_score = 100.0
            red_flags.append("UNCONSCIOUS - IMMEDIATE ESCALATION")
            return critical_score, red_flags
        
        # Rule 2: Breathing
        if breathing_difficulty == "severe":
            critical_score += 40
            red_flags.append("Severe respiratory distress")
        elif breathing_difficulty == "moderate":
            critical_score += 20
            red_flags.append("Moderate respiratory difficulty")
        
        # Rule 3: Red flag text detection
        if red_flag_text:
            detected_flags = self._detect_red_flags(red_flag_text)
            for flag_name, flag_data in detected_flags.items():
                critical_score = max(critical_score, flag_data['base_score'])
                red_flags.append(flag_name.replace('_', ' ').title())
        
        # Rule 4: Mobility status (lower mobility = higher risk)
        if not can_ambulate:
            critical_score += 15
            red_flags.append("Cannot ambulate - requires assistance")
        
        if not can_speak:
            critical_score += 20
            red_flags.append("Speech difficulty - neurological concern")
        
        return min(critical_score, 100.0), red_flags
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 2: SYMPTOM ANALYSIS (AI-Powered Adaptive Assessment)
    # ═══════════════════════════════════════════════════════════════
    
    def assess_symptoms(
        self,
        symptom_description: str,
        symptom_severity: Optional[str] = None,
        symptom_duration: Optional[str] = None,
        associated_symptoms: Optional[List[str]] = None
    ) -> Tuple[float, SymptomCategory, List[str]]:
        """
        Phase 2: Symptom analysis and categorization
        Adaptive: Detects primary symptom and asks follow-ups
        Returns: (symptom_score, category, adaptive_questions)
        """
        symptom_score = 0.0
        category = SymptomCategory.OTHER
        adaptive_questions = []
        
        desc_lower = symptom_description.lower()
        
        # Categorize symptom
        if any(word in desc_lower for word in ['chest', 'heart', 'pressure', 'cardiac']):
            category = SymptomCategory.CHEST
            symptom_score += 30
            adaptive_questions = self._get_chest_follow_ups()
            
            # Severity modifier
            if 'severe' in desc_lower or 'worst' in desc_lower:
                symptom_score += 15
                
        elif any(word in desc_lower for word in ['abdominal', 'belly', 'stomach', 'pain']):
            category = SymptomCategory.ABDOMINAL
            symptom_score += 20
            adaptive_questions = self._get_abdominal_follow_ups()
            
        elif any(word in desc_lower for word in ['head', 'neurological', 'dizzy', 'weakness', 'stroke']):
            category = SymptomCategory.NEUROLOGICAL
            symptom_score += 25
            adaptive_questions = self._get_neurological_follow_ups()
            
        elif any(word in desc_lower for word in ['breath', 'respiratory', 'cough', 'asthma', 'pneumonia']):
            category = SymptomCategory.RESPIRATORY
            symptom_score += 25
            adaptive_questions = self._get_respiratory_follow_ups()
            
        elif any(word in desc_lower for word in ['trauma', 'injury', 'accident', 'fall', 'hit']):
            category = SymptomCategory.TRAUMA
            symptom_score += 20
            adaptive_questions = self._get_trauma_follow_ups()
            
        elif any(word in desc_lower for word in ['fever', 'infection', 'bacterial', 'viral', 'flu', 'covid']):
            category = SymptomCategory.INFECTIOUS
            symptom_score += 15
            adaptive_questions = self._get_infectious_follow_ups()
            
        # Duration modifier
        if symptom_duration:
            if 'sudden' in symptom_duration.lower():
                symptom_score += 10  # Acute onset = more urgent
            elif 'weeks' in symptom_duration.lower() or 'months' in symptom_duration.lower():
                symptom_score -= 5   # Chronic issues less urgent
        
        # Associated symptoms (comorbidity effect)
        if associated_symptoms:
            for assoc in associated_symptoms:
                if 'vomit' in assoc.lower() or 'nausea' in assoc.lower():
                    symptom_score += 5
                if 'fever' in assoc.lower():
                    symptom_score += 5
                if 'chest' in assoc.lower():
                    symptom_score += 10
        
        return min(symptom_score, 50.0), category, adaptive_questions
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 3: PATIENT CONTEXT (Comorbidities & Demographics)
    # ═══════════════════════════════════════════════════════════════
    
    def assess_context(self, context: PatientContext) -> float:
        """
        Phase 3: Age and comorbidity weighting
        Vulnerable populations get higher risk
        Returns: context_score (0-40)
        """
        context_score = 0.0
        
        # AGE WEIGHTING
        if context.age < 5 or context.age > 75:
            context_score += 15  # Very young or very old
        elif context.age < 18 or context.age > 65:
            context_score += 10  # Young or senior
        
        # COMORBIDITIES (additive effect with multiplier)
        comorbidity_count = sum([
            context.has_diabetes,
            context.has_hypertension,
            context.has_heart_disease,
            context.has_asthma_copd,
            context.has_cancer,
            context.is_immunocompromised,
        ])
        
        # Base points per condition
        if context.has_heart_disease:
            context_score += 25  # Cardiac history = major risk
        if context.has_diabetes:
            context_score += 10
        if context.has_asthma_copd:
            context_score += 15
        if context.has_cancer:
            context_score += 12
        if context.has_hypertension:
            context_score += 8
        if context.is_immunocompromised:
            context_score += 10
        
        # Pregnancy consideration
        if context.is_pregnant:
            context_score += 20  # Pregnancy = special concern
        
        # Medications affecting risk
        if context.on_blood_thinners:
            context_score += 10  # Bleeding risk
        if context.on_pain_meds:
            context_score += 5   # May mask severity
        
        return min(context_score, 40.0)
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 4: VITAL SIGNS & OBJECTIVE DATA
    # ═══════════════════════════════════════════════════════════════
    
    def assess_vitals(self, vitals: VitalSigns) -> Tuple[float, List[str]]:
        """
        Phase 4: Objective vital sign assessment
        Returns: (vital_score, alert_list)
        """
        vital_score = 0.0
        alerts = []
        
        # Oxygen saturation (most critical)
        if vitals.oxygen_saturation is not None:
            if vitals.oxygen_saturation < 94:
                vital_score += 25
                alerts.append(f"HYPOXIA: O2 Sat {vitals.oxygen_saturation}%")
            elif vitals.oxygen_saturation < 96:
                vital_score += 15
                alerts.append(f"Low O2: {vitals.oxygen_saturation}%")
        
        # Heart rate
        if vitals.heart_rate is not None:
            if vitals.heart_rate > 120:
                vital_score += 15
                alerts.append(f"Tachycardia: HR {vitals.heart_rate} bpm")
            elif vitals.heart_rate < 50:
                vital_score += 15
                alerts.append(f"Bradycardia: HR {vitals.heart_rate} bpm")
        
        # Blood pressure (systolic focus)
        if vitals.blood_pressure_systolic is not None:
            if vitals.blood_pressure_systolic > 180:
                vital_score += 20
                alerts.append(f"HYPERTENSIVE CRISIS: {vitals.blood_pressure_systolic}/{vitals.blood_pressure_diastolic} mmHg")
            elif vitals.blood_pressure_systolic < 90:
                vital_score += 20
                alerts.append(f"Hypotensive: {vitals.blood_pressure_systolic}/{vitals.blood_pressure_diastolic} mmHg")
        
        # Temperature
        if vitals.temperature is not None:
            if vitals.temperature > 40:  # 104F
                vital_score += 15
                alerts.append(f"HIGH FEVER: {vitals.temperature}°C")
            elif vitals.temperature < 35:
                vital_score += 15
                alerts.append(f"Hypothermia: {vitals.temperature}°C")
            elif vitals.temperature > 38.5:
                vital_score += 8
                alerts.append(f"Fever: {vitals.temperature}°C")
        
        # Respiratory rate
        if vitals.respiratory_rate is not None:
            if vitals.respiratory_rate > 30:
                vital_score += 20
                alerts.append(f"Tachypnea: RR {vitals.respiratory_rate} breaths/min")
            elif vitals.respiratory_rate < 10:
                vital_score += 20
                alerts.append(f"Bradypnea: RR {vitals.respiratory_rate} breaths/min")
        
        # Pain level
        if vitals.pain_level is not None and vitals.pain_level >= 8:
            vital_score += 10
            alerts.append(f"Severe pain: {vitals.pain_level}/10")
        
        return min(vital_score, 50.0), alerts
    
    # ═══════════════════════════════════════════════════════════════
    # PHASE 5: TIMELINE & CONTEXT FACTORS
    # ═══════════════════════════════════════════════════════════════
    
    def assess_timeline(
        self,
        onset_type: str,  # 'sudden', 'gradual', 'recurring'
        duration_hours: Optional[float] = None,
        is_recurring: bool = False,
        recent_surgery: bool = False,
        recent_trauma: bool = False
    ) -> float:
        """
        Phase 5: Timeline and progression assessment
        Returns: timeline_score (0-20)
        """
        timeline_score = 0.0
        
        # Onset type
        if onset_type.lower() == 'sudden':
            timeline_score += 10  # Acute = urgent
        elif onset_type.lower() == 'recurring':
            timeline_score += 0   # Known pattern
        else:
            timeline_score += 5   # Gradual = moderate concern
        
        # Duration consideration
        if duration_hours and duration_hours < 1:
            timeline_score += 5   # Very recent = acute
        elif duration_hours and duration_hours > 48:
            timeline_score -= 3   # Ongoing for days = less acute
        
        # Medical events
        if recent_surgery:
            timeline_score += 15  # Post-op complications possible
        if recent_trauma:
            timeline_score += 10  # Trauma effects may develop
        
        return min(timeline_score, 20.0)
    
    # ═══════════════════════════════════════════════════════════════
    # FINAL CALCULATION
    # ═══════════════════════════════════════════════════════════════
    
    def calculate_total_risk(
        self,
        critical_score: float,
        symptom_score: float,
        context_score: float,
        vital_score: float,
        timeline_score: float,
        red_flags: List[str]
    ) -> Tuple[float, PriorityLevel]:
        """
        Final weighted calculation
        Includes red flag override logic
        Returns: (final_risk_score, priority_level)
        """
        
        total = (
            critical_score * self.WEIGHTS['critical'] +
            symptom_score * self.WEIGHTS['symptom'] +
            context_score * self.WEIGHTS['context'] +
            vital_score * self.WEIGHTS['vitals'] +
            timeline_score * self.WEIGHTS['timeline']
        )
        
        # RED FLAG OVERRIDE: If any red flag present, minimum = HIGH (70)
        if red_flags:
            total = max(total, 70.0)
        
        # Assign priority level
        if total >= 90:
            priority = PriorityLevel.CRITICAL
        elif total >= 70:
            priority = PriorityLevel.HIGH
        elif total >= 50:
            priority = PriorityLevel.MODERATE
        elif total >= 30:
            priority = PriorityLevel.LOW
        else:
            priority = PriorityLevel.ROUTINE
        
        return min(total, 100.0), priority
    
    def get_wait_estimate(self, priority_level: PriorityLevel) -> int:
        """Estimated wait time in minutes"""
        estimates = {
            PriorityLevel.CRITICAL: 5,
            PriorityLevel.HIGH: 15,
            PriorityLevel.MODERATE: 45,
            PriorityLevel.LOW: 60,
            PriorityLevel.ROUTINE: 120
        }
        return estimates.get(priority_level, 120)
    
    # ═══════════════════════════════════════════════════════════════
    # HELPER METHODS: ADAPTIVE QUESTIONS & RED FLAG DETECTION
    # ═══════════════════════════════════════════════════════════════
    
    def _detect_red_flags(self, text: str) -> Dict:
        """Scan text for known red flag keywords"""
        detected = {}
        text_lower = text.lower()
        
        for flag_name, flag_data in self.RED_FLAGS.items():
            for keyword in flag_data['keywords']:
                if keyword in text_lower:
                    detected[flag_name] = flag_data
                    break
        
        return detected
    
    def _get_chest_follow_ups(self) -> List[str]:
        """Adaptive questions for chest pain"""
        return [
            "Is the pain pressure, sharp, or burning?",
            "Did it start suddenly or gradually?",
            "Does it radiate to your arm, jaw, or back?",
            "Are you experiencing sweating or nausea?",
            "Any shortness of breath?",
        ]
    
    def _get_abdominal_follow_ups(self) -> List[str]:
        """Adaptive questions for abdominal pain"""
        return [
            "Is the pain localized or spread across your abdomen?",
            "Is it constant or coming and going?",
            "Any vomiting or fever?",
            "Any recent trauma or accidents?",
            "When did this pain start?",
        ]
    
    def _get_neurological_follow_ups(self) -> List[str]:
        """Adaptive questions for neurological symptoms"""
        return [
            "Is this the worst headache of your life?",
            "Any vision changes or weakness?",
            "Can you move all your limbs normally?",
            "Is your speech clear?",
            "Any facial drooping?",
        ]
    
    def _get_respiratory_follow_ups(self) -> List[str]:
        """Adaptive questions for respiratory symptoms"""
        return [
            "How severe is the shortness of breath?",
            "When did the cough start?",
            "Any fever or chills?",
            "Coughing up any blood or colored phlegm?",
            "History of asthma or pneumonia?",
        ]
    
    def _get_trauma_follow_ups(self) -> List[str]:
        """Adaptive questions for trauma"""
        return [
            "Where is the injury located?",
            "Can you move that area normally?",
            "Any loss of consciousness?",
            "Severe bleeding or visible deformity?",
            "Hit your head during the injury?",
        ]
    
    def _get_infectious_follow_ups(self) -> List[str]:
        """Adaptive questions for infections"""
        return [
            "When did the fever start?",
            "Any sore throat, cough, or body aches?",
            "Recent exposure to sick people?",
            "Any rash?",
            "Difficulty swallowing?",
        ]


# Initialize global engine
triage_engine = IntelligentTriageEngine()
