/**
 * CSI MasterFormat 2020 — reference taxonomy for trade classification.
 *
 * Used by:
 *   - subcontractor catalog (subcontractors.csi_division / csi_section)
 *   - HERBIE recommendation engine (rank subs per trade for a bid project)
 *   - bid project trade picker (UI dropdown)
 *
 * Only the divisions actually used in commercial GC bidding are listed.
 * The omitted ones (industrial process equipment 40–46, etc.) can be added
 * later if needed.
 */

export interface CsiDivision {
  code: string;     // "03", "22", etc.
  name: string;
  shortName?: string;
  industryUse: "core" | "common" | "specialty";
}

export interface CsiSection {
  code: string;     // "03 30 00" or "033000" — we store hyphenless
  divisionCode: string;
  name: string;
}

export const CSI_DIVISIONS: CsiDivision[] = [
  { code: "00", name: "Procurement and Contracting Requirements", shortName: "Procurement",       industryUse: "common" },
  { code: "01", name: "General Requirements",                     shortName: "General Reqs",     industryUse: "core" },
  { code: "02", name: "Existing Conditions",                      shortName: "Demo / Existing", industryUse: "core" },
  { code: "03", name: "Concrete",                                  industryUse: "core" },
  { code: "04", name: "Masonry",                                   industryUse: "core" },
  { code: "05", name: "Metals",                                    industryUse: "core" },
  { code: "06", name: "Wood, Plastics, and Composites",            shortName: "Wood / Carpentry", industryUse: "core" },
  { code: "07", name: "Thermal and Moisture Protection",           shortName: "Roofing / Waterproofing", industryUse: "core" },
  { code: "08", name: "Openings",                                  shortName: "Doors / Windows", industryUse: "core" },
  { code: "09", name: "Finishes",                                  industryUse: "core" },
  { code: "10", name: "Specialties",                               industryUse: "common" },
  { code: "11", name: "Equipment",                                 industryUse: "common" },
  { code: "12", name: "Furnishings",                               industryUse: "common" },
  { code: "13", name: "Special Construction",                      industryUse: "specialty" },
  { code: "14", name: "Conveying Equipment",                       shortName: "Elevators / Conveyance", industryUse: "common" },
  { code: "21", name: "Fire Suppression",                          industryUse: "core" },
  { code: "22", name: "Plumbing",                                  industryUse: "core" },
  { code: "23", name: "Heating, Ventilating, and Air Conditioning", shortName: "HVAC",            industryUse: "core" },
  { code: "25", name: "Integrated Automation",                     industryUse: "specialty" },
  { code: "26", name: "Electrical",                                industryUse: "core" },
  { code: "27", name: "Communications",                            shortName: "Low-Voltage / Comm", industryUse: "core" },
  { code: "28", name: "Electronic Safety and Security",            shortName: "Security / AV",   industryUse: "core" },
  { code: "31", name: "Earthwork",                                 shortName: "Excavation",       industryUse: "core" },
  { code: "32", name: "Exterior Improvements",                     shortName: "Sitework / Landscape", industryUse: "core" },
  { code: "33", name: "Utilities",                                 industryUse: "core" },
  { code: "34", name: "Transportation",                            industryUse: "specialty" },
  { code: "35", name: "Waterway and Marine Construction",          industryUse: "specialty" },
  { code: "48", name: "Electrical Power Generation",               industryUse: "specialty" },
];

/**
 * Curated set of 4-digit sections that HERBIE will commonly need to drill into.
 * Not exhaustive — add as needed. Hyphenless format: "072100" not "07 21 00".
 */
export const CSI_SECTIONS: CsiSection[] = [
  { code: "021000", divisionCode: "02", name: "Subsurface Investigation" },
  { code: "024100", divisionCode: "02", name: "Demolition" },
  { code: "033000", divisionCode: "03", name: "Cast-in-Place Concrete" },
  { code: "034500", divisionCode: "03", name: "Precast Architectural Concrete" },
  { code: "042000", divisionCode: "04", name: "Unit Masonry" },
  { code: "051200", divisionCode: "05", name: "Structural Steel" },
  { code: "055000", divisionCode: "05", name: "Metal Fabrications" },
  { code: "061000", divisionCode: "06", name: "Rough Carpentry" },
  { code: "064000", divisionCode: "06", name: "Architectural Woodwork (Millwork)" },
  { code: "071000", divisionCode: "07", name: "Dampproofing and Waterproofing" },
  { code: "072100", divisionCode: "07", name: "Thermal Insulation" },
  { code: "074000", divisionCode: "07", name: "Roofing and Siding Panels" },
  { code: "075000", divisionCode: "07", name: "Membrane Roofing" },
  { code: "076000", divisionCode: "07", name: "Flashing and Sheet Metal" },
  { code: "081100", divisionCode: "08", name: "Metal Doors and Frames" },
  { code: "081400", divisionCode: "08", name: "Wood Doors" },
  { code: "083600", divisionCode: "08", name: "Garage / Overhead Coiling Doors" },
  { code: "085000", divisionCode: "08", name: "Windows" },
  { code: "088000", divisionCode: "08", name: "Glazing" },
  { code: "092100", divisionCode: "09", name: "Plaster and Gypsum Board (Drywall)" },
  { code: "095100", divisionCode: "09", name: "Acoustical Ceilings" },
  { code: "096000", divisionCode: "09", name: "Flooring" },
  { code: "099100", divisionCode: "09", name: "Painting" },
  { code: "142000", divisionCode: "14", name: "Elevators" },
  { code: "211000", divisionCode: "21", name: "Water-Based Fire-Suppression Systems" },
  { code: "232000", divisionCode: "23", name: "HVAC Piping and Pumps" },
  { code: "260000", divisionCode: "26", name: "General Electrical" },
  { code: "262700", divisionCode: "26", name: "Low-Voltage Distribution" },
  { code: "271500", divisionCode: "27", name: "Communications Horizontal Cabling" },
  { code: "274100", divisionCode: "27", name: "Audio-Video Systems" },
  { code: "281600", divisionCode: "28", name: "Intrusion Detection / Security" },
  { code: "310000", divisionCode: "31", name: "General Earthwork / Excavation" },
  { code: "311000", divisionCode: "31", name: "Site Clearing" },
  { code: "312000", divisionCode: "31", name: "Earth Moving / Grading" },
  { code: "329000", divisionCode: "32", name: "Planting (Landscaping)" },
  { code: "331000", divisionCode: "33", name: "Water Utilities" },
  { code: "333000", divisionCode: "33", name: "Sanitary Sewerage Utilities" },
];

/**
 * Map of incoming trade strings (case-insensitive, normalized) to CSI codes.
 * Reflects the actual values present in the DB as of the migration.
 */
export const TRADE_TO_CSI: Record<string, { division: string; section?: string }> = {
  // Top hits (capitalized and lowercase variants both handled by normalization)
  "general construction":   { division: "01" },
  "electrical":             { division: "26", section: "260000" },
  "plumbing":               { division: "22" },
  "concrete/masonry":       { division: "03" }, // primary; HERBIE can split out 04 later
  "concrete":               { division: "03", section: "033000" },
  "masonry":                { division: "04", section: "042000" },
  "mason":                  { division: "04", section: "042000" },
  "engineering":            { division: "01" }, // service category
  "architecture":           { division: "01" }, // service category
  "painting":               { division: "09", section: "099100" },
  "roofing":                { division: "07", section: "075000" },
  "steel/metal":            { division: "05", section: "051200" },
  "steel":                  { division: "05", section: "051200" },
  "welding":                { division: "05", section: "055000" },
  "hvac":                   { division: "23" },
  "excavation":             { division: "31", section: "310000" },
  "excavating":             { division: "31", section: "310000" },
  "glass/windows":          { division: "08", section: "088000" },
  "glass":                  { division: "08", section: "088000" },
  "flooring":               { division: "09", section: "096000" },
  "fire protection":        { division: "21", section: "211000" },
  "fire_protection":        { division: "21", section: "211000" },
  "drywall":                { division: "09", section: "092100" },
  "doors":                  { division: "08", section: "081100" },
  "garage doors":           { division: "08", section: "083600" },
  "insulation":             { division: "07", section: "072100" },
  "millwork":               { division: "06", section: "064000" },
  "carpentry":              { division: "06", section: "061000" },
  "landscaping":            { division: "32", section: "329000" },
  "landscape":              { division: "32", section: "329000" },
  "elevators":              { division: "14", section: "142000" },
  "security systems":       { division: "28", section: "281600" },
  "demolition":             { division: "02", section: "024100" },
  "waterproofing":          { division: "07", section: "071000" },
  "siding":                 { division: "07", section: "074000" },
  "a/v":                    { division: "27", section: "274100" },
  "utilities":              { division: "33" },
  "gutters":                { division: "07", section: "076000" },
};

export function normalizeTrade(t: string | null | undefined): string {
  return (t || "").trim().toLowerCase();
}

export function tradeToCsi(t: string | null | undefined) {
  const key = normalizeTrade(t);
  return TRADE_TO_CSI[key] || null;
}
