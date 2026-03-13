import { create } from 'zustand';

export const usePatientFlowStore = create((set) => ({
  selectedHospital: null,
  selectedDepartment: null,
  selectedDoctor: null,
  selectedDate: '',
  selectedSlot: '',
  flowMode: 'queue',
  activeQueue: null,

  setSelectedHospital: (hospital) => set({ selectedHospital: hospital }),
  setSelectedDepartment: (department) => set({ selectedDepartment: department }),
  setSelectedDoctor: (doctor) => set({ selectedDoctor: doctor }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedSlot: (selectedSlot) => set({ selectedSlot }),
  setFlowMode: (flowMode) => set({ flowMode }),
  setActiveQueue: (activeQueue) => set({ activeQueue }),

  resetFlow: () =>
    set({
      selectedDepartment: null,
      selectedDoctor: null,
      selectedDate: '',
      selectedSlot: '',
      flowMode: 'queue'
    })
}));
