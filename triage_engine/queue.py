"""
INTELLIGENT QUEUE MANAGEMENT SYSTEM
Handles dynamic prioritization, re-scoring, and department-specific queues
"""

import heapq
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from enum import Enum
import uuid


class PatientType(str, Enum):
    WALK_IN = "walk_in"
    BOOKED = "booked"


@dataclass(order=True)
class QueuedPatient:
    """
    Represents a patient in queue with dynamic priority calculation
    Uses negative score for max-heap (heapq default is min-heap)
    """
    # Primary sort key (negative for max-heap)
    neg_priority_score: float = field(init=False, compare=True)
    
    # Patient info
    patient_id: str = field(default="", compare=False)
    name: str = field(default="", compare=False)
    age: int = field(default=0, compare=False)
    phone: str = field(default="", compare=False)
    
    # Queue info
    patient_type: PatientType = field(default=PatientType.WALK_IN, compare=False)
    arrival_time: datetime = field(default_factory=datetime.now, compare=False)
    
    # Clinical info
    risk_score: float = field(default=0.0, compare=False)
    priority_level: str = field(default="LOW", compare=False)
    symptom_category: str = field(default="OTHER", compare=False)
    chief_complaint: str = field(default="", compare=False)
    
    # Department routing
    department_id: str = field(default="general", compare=False)
    recommended_specialty: str = field(default="", compare=False)
    
    # Status tracking
    status: str = field(default="waiting", compare=False)  # waiting, called, in_progress, completed
    seen_time: Optional[datetime] = field(default=None, compare=False)
    duration_minutes: int = field(default=0, compare=False)
    
    # For booked appointments
    appointment_id: Optional[str] = field(default=None, compare=False)
    scheduled_time: Optional[datetime] = field(default=None, compare=False)
    doctor_id: Optional[str] = field(default=None, compare=False)
    
    # Metadata
    notes: str = field(default="", compare=False)
    queue_position: int = field(default=0, compare=False)
    
    def __post_init__(self):
        """Calculate priority score for heap ordering"""
        # Higher risk + longer wait = higher priority
        self.neg_priority_score = -self._calculate_priority_score()
    
    def _calculate_priority_score(self) -> float:
        """
        Dynamic priority calculation
        Considers: Risk score, wait time, patient type
        """
        base_score = self.risk_score * 100  # Risk is 0-100
        
        # Wait time bonus (increases with time)
        wait_time = datetime.now() - self.arrival_time
        wait_minutes = wait_time.total_seconds() / 60
        wait_bonus = wait_minutes * 0.5  # +0.5 points per minute waited
        
        # Patient type modifier
        type_modifier = 0
        if self.patient_type == PatientType.BOOKED:
            type_modifier = -20  # Booked patients have slightly lower urgent priority
                                  # but still maintain their position
        elif self.patient_type == PatientType.WALK_IN:
            type_modifier = 0    # Standard calculation
        
        total = base_score + wait_bonus + type_modifier
        return total
    
    def update_priority(self):
        """Recalculate priority (call periodically as patient waits)"""
        self.__post_init__()


class DepartmentQueue:
    """
    Manages queue for a specific department
    Maintains sorted order by priority with periodic re-scoring
    """
    
    def __init__(self, department_id: str, department_name: str):
        self.department_id = department_id
        self.department_name = department_name
        self.heap: List[QueuedPatient] = []
        self.patients_dict: Dict[str, QueuedPatient] = {}  # For quick lookup
        self.completed_count = 0
        self.last_rescore_time = datetime.now()
    
    def add_patient(self, patient: QueuedPatient) -> str:
        """Add patient to queue, return queue position"""
        patient.patient_id = patient.patient_id or str(uuid.uuid4())
        patient.department_id = self.department_id
        patient.queue_position = len(self.heap) + 1
        
        # Add to heap
        heapq.heappush(self.heap, patient)
        self.patients_dict[patient.patient_id] = patient
        
        return patient.patient_id
    
    def get_next_patient(self) -> Optional[QueuedPatient]:
        """
        Get next patient to be seen
        Removes from queue and marks as called
        """
        # Rescore queue every 5 minutes to account for wait time
        self._rescore_if_needed()
        
        while self.heap:
            # Pop next highest priority
            patient = heapq.heappop(self.heap)
            
            # Skip if already completed
            if patient.status == "completed":
                continue
            
            # Mark as called
            patient.status = "called"
            patient.seen_time = datetime.now()
            
            return patient
        
        return None
    
    def get_current_queue(self, limit: int = 10) -> List[QueuedPatient]:
        """Get current queue (top N patients)"""
        # Rescore before returning
        self._rescore_if_needed()
        
        # Sort heap and return top N
        sorted_queue = sorted(self.heap, key=lambda p: p.neg_priority_score)[:limit]
        return sorted_queue
    
    def get_patient_position(self, patient_id: str) -> Optional[int]:
        """Get current queue position of patient"""
        if patient_id not in self.patients_dict:
            return None
        
        patient = self.patients_dict[patient_id]
        
        # Count how many patients are ahead
        position = 1
        for p in sorted(self.heap, key=lambda x: x.neg_priority_score):
            if p.patient_id == patient_id:
                return position
            if p.status == "waiting":
                position += 1
        
        return None
    
    def update_patient_status(self, patient_id: str, new_status: str, duration: int = 0):
        """Update patient status and optionally duration"""
        if patient_id in self.patients_dict:
            patient = self.patients_dict[patient_id]
            patient.status = new_status
            
            if new_status == "completed":
                self.completed_count += 1
                if duration > 0:
                    patient.duration_minutes = duration
                # Remove from heap
                self.heap = [p for p in self.heap if p.patient_id != patient_id]
                heapq.heapify(self.heap)
    
    def mark_patient_completed(self, patient_id: str, duration_minutes: int):
        """Mark patient as seen and completed"""
        self.update_patient_status(patient_id, "completed", duration_minutes)
    
    def remove_patient(self, patient_id: str):
        """Remove patient from queue (e.g., no-show)"""
        if patient_id in self.patients_dict:
            del self.patients_dict[patient_id]
            self.heap = [p for p in self.heap if p.patient_id != patient_id]
            heapq.heapify(self.heap)
    
    def _rescore_if_needed(self):
        """Rescore queue every 5 minutes (wait time increases priority)"""
        now = datetime.now()
        if (now - self.last_rescore_time).total_seconds() > 300:  # 5 minutes
            for patient in self.heap:
                patient.update_priority()
            heapq.heapify(self.heap)
            self.last_rescore_time = now
    
    def get_statistics(self) -> Dict:
        """Queue statistics"""
        waiting = len([p for p in self.heap if p.status == "waiting"])
        being_seen = len([p for p in self.heap if p.status == "called"])
        
        wait_times = []
        for p in self.heap:
            if p.status == "waiting" and p.seen_time is None:
                wait_minutes = (datetime.now() - p.arrival_time).total_seconds() / 60
                wait_times.append(wait_minutes)
        
        avg_wait = sum(wait_times) / len(wait_times) if wait_times else 0
        max_wait = max(wait_times) if wait_times else 0
        
        return {
            "department": self.department_name,
            "waiting_count": waiting,
            "being_seen": being_seen,
            "completed_today": self.completed_count,
            "avg_wait_minutes": round(avg_wait, 1),
            "max_wait_minutes": round(max_wait, 1),
            "total_in_queue": len(self.heap)
        }


class HospitalQueueSystem:
    """
    Master queue system for multi-department hospital
    Manages routing and cross-department visibility
    """
    
    def __init__(self):
        self.departments: Dict[str, DepartmentQueue] = {}
        self.all_patients: Dict[str, QueuedPatient] = {}  # Global patient tracker
    
    def create_department(self, department_id: str, department_name: str):
        """Create a new department queue"""
        self.departments[department_id] = DepartmentQueue(department_id, department_name)
    
    def add_patient_to_department(self, patient: QueuedPatient, department_id: str):
        """Add patient to specific department queue"""
        if department_id not in self.departments:
            self.create_department(department_id, department_id.title())
        
        patient_id = self.departments[department_id].add_patient(patient)
        self.all_patients[patient_id] = patient
        
        return patient_id
    
    def get_department_queue(self, department_id: str) -> Optional[DepartmentQueue]:
        """Get queue for specific department"""
        return self.departments.get(department_id)
    
    def get_all_queues_summary(self) -> Dict:
        """Get summary of all department queues"""
        summary = {}
        for dept_id, queue in self.departments.items():
            summary[dept_id] = queue.get_statistics()
        return summary
    
    def route_patient_to_department(
        self,
        patient: QueuedPatient,
        recommended_specialty: str
    ) -> str:
        """
        Route patient based on symptoms/specialty
        Maps to most appropriate department
        """
        # Simple routing logic (can be enhanced)
        specialty_map = {
            'cardiology': 'cardio',
            'cardiac': 'cardio',
            'chest': 'cardio',
            'orthopedics': 'ortho',
            'bone': 'ortho',
            'joint': 'ortho',
            'neurology': 'neuro',
            'head': 'neuro',
            'stroke': 'neuro',
            'pulmonary': 'respiratory',
            'respiratory': 'respiratory',
            'breath': 'respiratory',
        }
        
        # Default to general if no specific match
        target_dept = 'general'
        for key, dept in specialty_map.items():
            if key in recommended_specialty.lower():
                target_dept = dept
                break
        
        return self.add_patient_to_department(patient, target_dept)


class ClinicQueueSystem:
    """
    Simplified queue system for single-doctor clinic
    Single queue with walk-ins and booked appointments
    """
    
    def __init__(self, doctor_id: str):
        self.doctor_id = doctor_id
        self.queue = DepartmentQueue("clinic", "Main Clinic")
        self.booked_appointments: Dict[str, QueuedPatient] = {}
    
    def add_walkin(self, patient: QueuedPatient) -> str:
        """Add walk-in patient to queue"""
        patient.patient_type = PatientType.WALK_IN
        return self.queue.add_patient(patient)
    
    def add_booked_appointment(self, patient: QueuedPatient, appointment_id: str) -> str:
        """Register booked appointment"""
        patient.patient_type = PatientType.BOOKED
        patient.appointment_id = appointment_id
        patient_id = self.queue.add_patient(patient)
        self.booked_appointments[appointment_id] = patient
        return patient_id
    
    def get_next_patient(self) -> Optional[QueuedPatient]:
        """Get next patient (booked + walk-ins sorted by priority)"""
        return self.queue.get_next_patient()
    
    def get_current_queue(self) -> List[QueuedPatient]:
        """Get current queue view for doctor dashboard"""
        return self.queue.get_current_queue()
    
    def get_queue_stats(self) -> Dict:
        """Queue statistics for clinic"""
        return self.queue.get_statistics()


# Global instances
hospital_system = HospitalQueueSystem()
