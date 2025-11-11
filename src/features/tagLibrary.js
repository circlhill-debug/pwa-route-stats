export const TAG_CATEGORIES = {
  WEATHER: 'Weather',
  WORKLOAD: 'Workload',
  PERSONAL: 'Personal',
  OTHER: 'Other',
};

export const TAGS = [
  // Weather
  { id: 'weather-rain', label: 'Rain', category: TAG_CATEGORIES.WEATHER },
  { id: 'weather-snow', label: 'Snow', category: TAG_CATEGORIES.WEATHER },
  { id: 'weather-heat', label: 'Extreme Heat', category: TAG_CATEGORIES.WEATHER },
  { id: 'weather-cold', label: 'Extreme Cold', category: TAG_CATEGORIES.WEATHER },

  // Workload
  { id: 'workload-heavy-parcels', label: 'Heavy Parcels', category: TAG_CATEGORIES.WORKLOAD },
  { id: 'workload-heavy-letters', label: 'Heavy Letters', category: TAG_CATEGORIES.WORKLOAD },
  { id: 'workload-late-start', label: 'Late Start', category: TAG_CATEGORIES.WORKLOAD },
  { id: 'workload-vehicle-issue', label: 'Vehicle Issue', category: TAG_CATEGORIES.WORKLOAD },

  // Personal
  { id: 'personal-sick', label: 'Sick', category: TAG_CATEGORIES.PERSONAL },
  { id: 'personal-appointment', label: 'Appointment', category: TAG_CATEGORIES.PERSONAL },

  // Other
  { id: 'other-holiday', label: 'Holiday', category: TAG_CATEGORIES.OTHER },
];
