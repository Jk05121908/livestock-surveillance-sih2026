/**
 * Triage Engine - Rule-based livestock disease risk assessment
 * Location: /lib/triage.ts:1
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface TriageResult {
  risk_level: RiskLevel;
  confidence: number;
  reasoning: string;
}

/**
 * Normalizes symptoms array: lowercase, trim, remove empties.
 * Handles common variations like "Not Eating", "not_eating", "Fever".
 */
function normalizeSymptoms(symptoms: string[]): string[] {
  if (!Array.isArray(symptoms)) return [];
  return symptoms
    .map((s) => String(s).toLowerCase().trim())
    .map((s) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function hasSymptom(normalized: string[], target: string): boolean {
  const t = target.toLowerCase().trim();
  return normalized.some((s) => s === t || s.includes(t));
}

function hasNotEating(normalized: string[]): boolean {
  const synonyms = [
    'not eating',
    'loss of appetite',
    'anorexia',
    'off feed',
    'inappetence',
    'refusal to eat',
  ];
  return synonyms.some((syn) => hasSymptom(normalized, syn));
}

function hasFever(normalized: string[]): boolean {
  return hasSymptom(normalized, 'fever') || hasSymptom(normalized, 'high temperature') || hasSymptom(normalized, 'pyrexia');
}

function hasSwelling(normalized: string[]): boolean {
  return hasSymptom(normalized, 'swelling') || hasSymptom(normalized, 'edema') || hasSymptom(normalized, 'swollen');
}

function hasCough(normalized: string[]): boolean {
  return hasSymptom(normalized, 'cough') || hasSymptom(normalized, 'coughing');
}

function hasDischarge(normalized: string[]): boolean {
  return hasSymptom(normalized, 'discharge') || hasSymptom(normalized, 'nasal discharge') || hasSymptom(normalized, 'ocular discharge');
}

function hasBleeding(normalized: string[]): boolean {
  return hasSymptom(normalized, 'bleeding') || hasSymptom(normalized, 'blood') || hasSymptom(normalized, 'hemorrhage');
}

function hasLethargy(normalized: string[]): boolean {
  return hasSymptom(normalized, 'lethargy') || hasSymptom(normalized, 'lethargic') || hasSymptom(normalized, 'weakness') || hasSymptom(normalized, 'dullness');
}

/**
 * Rule-based triage function.
 * Input: symptoms (array), animal_type (string)
 * Output: {risk_level, confidence, reasoning}
 *
 * Priority order (HIGH > MEDIUM > LOW):
 * - HIGH: fever + (swelling OR not eating) = HIGH (0.92)
 * - HIGH: multiple symptoms (3+) = HIGH (0.85-0.90)
 * - MEDIUM: fever + cough = MEDIUM (0.65)
 * - MEDIUM: swelling + discharge = MEDIUM (0.68)
 * - LOW: bleeding alone = LOW (0.45) - possible injury
 * - LOW: single symptom (cough, lethargy) = LOW (0.55)
 * - LOW: default single/double non-matching = LOW (0.50)
 */
export function triage(symptoms: string[], animal_type: string): TriageResult {
  const normalized = normalizeSymptoms(symptoms);
  const count = normalized.length;
  const animal = (animal_type || 'animal').toLowerCase().trim() || 'animal';

  const fever = hasFever(normalized);
  const swelling = hasSwelling(normalized);
  const notEating = hasNotEating(normalized);
  const cough = hasCough(normalized);
  const discharge = hasDischarge(normalized);
  const bleeding = hasBleeding(normalized);
  const lethargy = hasLethargy(normalized);

  // ---- HIGH RISK RULES ----
  if (fever && (swelling || notEating)) {
    const trigger = swelling && notEating ? 'fever with swelling and loss of appetite' : swelling ? 'fever with swelling' : 'fever with loss of appetite/not eating';
    return {
      risk_level: 'high',
      confidence: 0.92,
      reasoning: `HIGH RISK: ${trigger} in ${animal} indicates potential systemic infection or inflammatory disease requiring urgent veterinary attention. Fever combined with ${swelling ? 'swelling' : 'anorexia'} is a red-flag combination. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count >= 3) {
    // Higher confidence if 4+ symptoms
    const confidence = count >= 4 ? 0.90 : 0.85;
    return {
      risk_level: 'high',
      confidence,
      reasoning: `HIGH RISK: Multiple symptoms (${count}) observed in ${animal} — [${normalized.join(', ')}]. Three or more concurrent clinical signs suggest high probability of infectious disease outbreak; immediate isolation and vet examination recommended.`,
    };
  }

  // ---- MEDIUM RISK RULES ----
  if (fever && cough) {
    return {
      risk_level: 'medium',
      confidence: 0.65,
      reasoning: `MEDIUM RISK: Fever with cough in ${animal} suggests respiratory infection (e.g., viral/bacterial). Monitor closely for progression to high risk. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (swelling && discharge) {
    return {
      risk_level: 'medium',
      confidence: 0.68,
      reasoning: `MEDIUM RISK: Swelling combined with discharge in ${animal} indicates localized infection or early systemic involvement. Requires veterinary follow-up within 24 hours. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  // ---- LOW RISK RULES ----
  if (bleeding && count === 1) {
    return {
      risk_level: 'low',
      confidence: 0.45,
      reasoning: `LOW RISK: Isolated bleeding in ${animal} is more consistent with mechanical injury/wound than infectious disease. Clean, observe, and provide first-aid; escalate if additional symptoms appear. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (bleeding && count <= 2) {
    // bleeding + one other non-high-risk symptom still low but slightly higher confidence
    return {
      risk_level: 'low',
      confidence: 0.50,
      reasoning: `LOW RISK: Bleeding observed in ${animal} with ${count - 1} additional symptom(s) — likely traumatic origin. Monitor for fever or systemic signs. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count === 1 && (cough || lethargy)) {
    const symptom = cough ? 'cough' : 'lethargy';
    return {
      risk_level: 'low',
      confidence: 0.55,
      reasoning: `LOW RISK: Single mild symptom (${symptom}) in ${animal}. May be environmental stress or early mild illness; observe for 24-48 hours. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  if (count === 0) {
    return {
      risk_level: 'low',
      confidence: 0.30,
      reasoning: `LOW RISK: No symptoms reported for ${animal}. No immediate concern; continue routine surveillance.`,
    };
  }

  if (count === 1) {
    return {
      risk_level: 'low',
      confidence: 0.50,
      reasoning: `LOW RISK: Single symptom (${normalized[0]}) in ${animal} without red-flag combinations. Likely mild/self-limiting; monitor for additional signs. Symptoms: [${normalized.join(', ')}].`,
    };
  }

  // Default low/medium fallback for 2 symptoms that didn't match medium/high
  return {
    risk_level: 'low',
    confidence: 0.52,
    reasoning: `LOW RISK: ${count} mild/non-specific symptom(s) in ${animal} without high/medium-risk combinations. Keep under observation and re-triage if condition worsens. Symptoms: [${normalized.join(', ')}].`,
  };
}

// Convenience default export for edge function compatibility
export default triage;
