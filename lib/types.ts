export type AnimalType = "cow" | "buffalo" | "goat" | "sheep";

export type Symptom =
  | "fever"
  | "swelling"
  | "not_eating"
  | "cough"
  | "diarrhea"
  | "discharge"
  | "lethargy"
  | "bleeding";

export const ANIMAL_TYPES: AnimalType[] = ["cow", "buffalo", "goat", "sheep"];

export const SYMPTOMS: { value: Symptom; labelEn: string; labelHi: string }[] = [
  { value: "fever", labelEn: "Fever", labelHi: "बुखार" },
  { value: "swelling", labelEn: "Swelling", labelHi: "सूजन" },
  { value: "not_eating", labelEn: "Not eating", labelHi: "न खाना" },
  { value: "cough", labelEn: "Cough", labelHi: "खांसी" },
  { value: "diarrhea", labelEn: "Diarrhea", labelHi: "दस्त" },
  { value: "discharge", labelEn: "Discharge", labelHi: "स्राव" },
  { value: "lethargy", labelEn: "Lethargy", labelHi: "सुस्ती" },
  { value: "bleeding", labelEn: "Bleeding", labelHi: "खून बहना" },
];

export interface Farmer {
  id: string;
  name: string;
  phone: string;
  village: string;
  block: string;
  herdSize: number;
}

export interface Report {
  id?: string;
  farmer_id: string;
  animal_type: AnimalType;
  symptoms: Symptom[];
  notes: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at?: string;
}

export interface QueuedReport {
  id: string;
  payload: Omit<Report, "id">;
  photoBase64?: string | null;
  photoFileName?: string | null;
  timestamp: string;
  attempts: number;
}

export type Language = "en" | "hi";
